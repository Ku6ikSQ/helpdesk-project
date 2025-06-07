import { getJiraIssues } from "./jira.js"
import { getGLPITickets } from "./glpi.js"
import { config } from "./config/index.js"
import { log } from "./logger.js"
import { userMap } from "./utils/mapping.js"
import { createGLPITicket } from "./glpi.js"
import axios from "axios"

// Заголовки для Jira API
const jiraHeaders = {
  Authorization: `Basic ${Buffer.from(
    `${config.jira.email}:${config.jira.token}`
  ).toString("base64")}`,
  "Content-Type": "application/json",
}

export async function syncJiraToGLPI() {
  const issues = await getJiraIssues()
  const existingTickets = await getGLPITickets()
  const existingNames = new Set(existingTickets.map((t) => t.name))

  for (const issue of issues) {
    const summary = issue.fields.summary
    const description =
      issue.fields.description?.content?.[0]?.content?.[0]?.text ||
      "No description"

    if (existingNames.has(summary)) {
      log(`🟡 GLPI ticket already exists for Jira issue "${summary}", skipping`)
      continue
    }

    const userId = userMap["glpi"] // Можно адаптировать под маппинг по email

    const result = await createGLPITicket({
      name: summary,
      content: description,
      users_id_recipient: userId,
    })

    if (result) {
      log(`✅ Created GLPI ticket for Jira issue ${issue.key}`)
    }
  }
}

export async function syncGLPIToJira() {
  const tickets = await getGLPITickets()
  log(`Fetched ${tickets.length} tickets from GLPI`)

  const existingIssues = await getJiraIssues()
  const existingSummaries = new Set(existingIssues.map((i) => i.fields.summary))

  for (const ticket of tickets) {
    const summary = ticket.name || `GLPI Ticket ${ticket.id}`
    const description = ticket.content || `Ticket ID: ${ticket.id}`
    const reporterId = ticket.users_id_recipient
    const reporterEmail = Object.keys(userMap).find(
      (key) => userMap[key] === reporterId
    )

    if (existingSummaries.has(summary)) {
      log(`🟡 Jira issue already exists for GLPI ticket "${summary}", skipping`)
      continue
    }

    const issuePayload = {
      fields: {
        project: { key: process.env.JIRA_KEY_PROJECT },
        summary: summary,
        description: description,
        issuetype: { name: "Task" },
        // reporter: { id: 'some-accountId' },
      },
    }

    try {
      await axios.post(
        `${config.jira.baseUrl}/rest/api/3/issue`,
        issuePayload,
        {
          headers: jiraHeaders,
        }
      )

      log(`✅ Created Jira issue for GLPI ticket ${ticket.id}`)
    } catch (err) {
      log(
        `❌ Failed to create Jira issue for GLPI ticket ${ticket.id}: ${err.message}`,
        "error"
      )
    }
  }
}
