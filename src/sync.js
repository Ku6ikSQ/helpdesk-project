import { getJiraIssues } from "./jira.js"
import { getGLPITickets, createGLPITicket } from "./glpi.js"
import { config } from "./config/index.js"
import { log } from "./logger.js"
import { userMap } from "./utils/mapping.js"
import axios from "axios"

const auth = Buffer.from(
  `${config.jira.username}:${config.jira.password}`
).toString("base64")
const jiraHeaders = {
  Authorization: `Basic ${auth}`,
  "Content-Type": "application/json",
  Accept: "application/json",
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

    const userId = userMap["glpi"] // Адаптируй маппинг под нужного пользователя
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
    // Безопасное получение summary из тикета
    const summary =
      (ticket.name && ticket.name.trim()) ||
      (ticket.title && ticket.title.trim()) ||
      `GLPI Ticket ${ticket.id}`

    const description = ticket.content || "No description"

    if (existingSummaries.has(summary)) {
      log(`🟡 Jira issue already exists for GLPI ticket "${summary}", skipping`)
      continue
    }

    const issuePayload = {
      fields: {
        project: { key: config.jira.projectKey },
        summary,
        description,
        issuetype: { name: "Task" },
      },
    }

    try {
      await axios.post(
        `${config.jira.baseUrl}/rest/api/2/issue`,
        issuePayload,
        { headers: jiraHeaders }
      )

      log(`✅ Created Jira issue for GLPI ticket ${ticket.id}`)
    } catch (err) {
      log(
        `❌ Failed to create Jira issue for GLPI ticket ${ticket.id}: ${
          err.response?.status
        } – ${JSON.stringify(err.response?.data) || err.message}`,
        "error"
      )
    }
  }
}
