import { getJiraIssues } from "./jira.js"
import { getGLPITickets, createGLPITicket, deleteGLPITicket } from "./glpi.js"
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

  // Собираем все Jira-ключи, которые уже есть в GLPI (по name)
  const existingJiraKeys = new Set()
  for (const ticket of existingTickets) {
    const match = ticket.name.match(/^([A-Z]+-\d+):/)
    if (match) {
      existingJiraKeys.add(match[1])
    }
  }

  for (const issue of issues) {
    const issueKey = issue.key
    const summary = issue.fields.summary
    const description =
      issue.fields.description?.content?.[0]?.content?.[0]?.text ||
      "No description"

    // Пропускаем, если задача была создана из GLPI
    if (/GLPI-ID: \d+/.test(issue.fields.description)) {
      log(`🟡 Jira issue ${issueKey} was created from GLPI, skipping`)
      continue
    }

    // Пропускаем, если такой Jira issue уже есть в GLPI
    if (existingJiraKeys.has(issueKey)) {
      log(`🟡 GLPI ticket already exists for Jira issue ${issueKey}, skipping`)
      continue
    }

    const userId = userMap["glpi"] // Маппинг пользователя
    const result = await createGLPITicket({
      name: `${issueKey}: ${summary}`,
      content: `Jira-ID: ${issueKey}\n\n${description}`,
      users_id_recipient: userId,
    })

    if (result) {
      log(`✅ Created GLPI ticket for Jira issue ${issueKey}`)
    }
  }
}

export async function syncGLPIToJira() {
  const tickets = await getGLPITickets()
  log(`Fetched ${tickets.length} tickets from GLPI`)

  const existingIssues = await getJiraIssues()

  // Собираем GLPI-идентификаторы, которые уже синхронизированы в Jira
  const existingGLPIIds = new Set()
  for (const issue of existingIssues) {
    const match = issue.fields.description?.match(/GLPI-ID: (\d+)/)
    if (match) {
      existingGLPIIds.add(parseInt(match[1]))
    }
  }

  for (const ticket of tickets) {
    const ticketId = ticket.id
    const summary =
      (ticket.name && ticket.name.trim()) ||
      (ticket.title && ticket.title.trim()) ||
      `GLPI Ticket ${ticketId}`
    const description = ticket.content || "No description"

    // Пропускаем, если задача уже была синхронизирована в Jira
    if (existingGLPIIds.has(ticketId)) {
      log(`🟡 Jira issue already exists for GLPI ticket ${ticketId}, skipping`)
      continue
    }

    const issuePayload = {
      fields: {
        project: { key: config.jira.projectKey },
        summary: `GLPI-${ticketId}: ${summary}`,
        description: `GLPI-ID: ${ticketId}\n\n${description}`,
        issuetype: { name: "Task" },
      },
    }

    try {
      await axios.post(
        `${config.jira.baseUrl}/rest/api/2/issue`,
        issuePayload,
        { headers: jiraHeaders }
      )

      log(`✅ Created Jira issue for GLPI ticket ${ticketId}`)
    } catch (err) {
      log(
        `❌ Failed to create Jira issue for GLPI ticket ${ticketId}: ${
          err.response?.status
        } – ${JSON.stringify(err.response?.data) || err.message}`,
        "error"
      )
    }
  }
}

export async function syncDeletedItems() {
  const jiraIssues = await getJiraIssues()
  const glpiTickets = await getGLPITickets()

  const jiraMap = new Map(jiraIssues.map((issue) => [issue.key, issue]))
  const glpiMap = new Map(glpiTickets.map((ticket) => [ticket.id, ticket]))

  for (const ticket of glpiTickets) {
    const jiraKeyMatch = ticket.content?.match(/Jira-ID: ([A-Z]+-\d+)/)
    if (jiraKeyMatch) {
      const jiraKey = jiraKeyMatch[1]
      if (!jiraMap.has(jiraKey)) {
        log(
          `🗑️ Jira issue ${jiraKey} was deleted, deleting GLPI ticket ${ticket.id}`
        )
        await deleteGLPITicket(ticket.id)
      }
    }
  }

  for (const issue of jiraIssues) {
    const glpiIdMatch = issue.fields.description?.match(/GLPI-ID: (\d+)/)
    if (glpiIdMatch) {
      const glpiId = parseInt(glpiIdMatch[1])
      if (!glpiMap.has(glpiId)) {
        log(
          `🗑️ GLPI ticket ${glpiId} was deleted, deleting Jira issue ${issue.key}`
        )
        await deleteJiraIssue(issue.key)
      }
    }
  }
}
