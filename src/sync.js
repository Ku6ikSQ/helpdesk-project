import { getJiraIssues, deleteJiraIssue } from "./jira.js"
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

/**
 * Синхронизация Jira → GLPI
 * Пропускает задачи, которые были созданы из GLPI (с меткой GLPI-ID)
 * Пропускает уже синхронизированные задачи (по метке Jira-ID в GLPI)
 * Создаёт новые задачи в GLPI с меткой Jira-ID
 */
export async function syncJiraToGLPI() {
  const issues = await getJiraIssues()
  const existingTickets = await getGLPITickets()

  // Индекс для быстрого поиска тикетов по Jira-ID из content
  const ticketsByJiraId = new Map()
  for (const ticket of existingTickets) {
    const jiraIdMatch = ticket.content?.match(/Jira-ID: ([A-Z]+-\d+)/)
    if (jiraIdMatch) {
      ticketsByJiraId.set(jiraIdMatch[1], ticket)
    }
  }

  for (const issue of issues) {
    const issueKey = issue.key
    const summary = issue.fields.summary
    const description =
      typeof issue.fields.description === "string"
        ? issue.fields.description
        : JSON.stringify(issue.fields.description)

    // Пропускаем задачи, созданные из GLPI (с меткой GLPI-ID в описании Jira)
    if (/GLPI-ID: \d+/.test(description)) {
      log(`🟡 Jira issue ${issueKey} был создан из GLPI, пропускаем`)
      continue
    }

    // Если задача уже синхронизирована (есть тикет с Jira-ID)
    if (ticketsByJiraId.has(issueKey)) {
      log(`🟡 GLPI тикет уже существует для Jira issue ${issueKey}, пропускаем`)
      continue
    }

    const userId = userMap["glpi"] // Можно кастомизировать по необходимости
    const result = await createGLPITicket({
      name: `${issueKey}: ${summary}`,
      content: `Jira-ID: ${issueKey}\n\n${description}`,
      users_id_recipient: userId,
    })

    if (result) {
      log(`✅ Создан тикет в GLPI для Jira issue ${issueKey}`)
    }
  }
}

/**
 * Синхронизация GLPI → Jira
 * Пропускает задачи, которые были созданы из Jira (с меткой Jira-ID в описании GLPI)
 * Пропускает уже синхронизированные задачи (по метке GLPI-ID в описании Jira)
 * Создаёт новые задачи в Jira с меткой GLPI-ID
 */
export async function syncGLPIToJira() {
  const tickets = await getGLPITickets()
  log(`Получено ${tickets.length} тикетов из GLPI`)

  const existingIssues = await getJiraIssues()

  // Индекс для быстрого поиска Jira issue по GLPI-ID из описания
  const issuesByGlpiId = new Map()
  for (const issue of existingIssues) {
    const glpiIdMatch = issue.fields.description?.match(/GLPI-ID: (\d+)/)
    if (glpiIdMatch) {
      issuesByGlpiId.set(parseInt(glpiIdMatch[1]), issue)
    }
  }

  for (const ticket of tickets) {
    const ticketId = ticket.id
    const summary =
      (ticket.name && ticket.name.trim()) ||
      (ticket.title && ticket.title.trim()) ||
      `GLPI Ticket ${ticketId}`
    const description = ticket.content || "No description"

    // Пропускаем задачи, созданные из Jira (с меткой Jira-ID в содержимом)
    if (/Jira-ID: [A-Z]+-\d+/.test(description)) {
      log(`🟡 GLPI тикет ${ticketId} был создан из Jira, пропускаем`)
      continue
    }

    // Если задача уже синхронизирована (есть Jira issue с GLPI-ID)
    if (issuesByGlpiId.has(ticketId)) {
      log(
        `🟡 Jira issue уже существует для GLPI тикета ${ticketId}, пропускаем`
      )
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

      log(`✅ Создан Jira issue для GLPI тикета ${ticketId}`)
    } catch (err) {
      log(
        `❌ Ошибка создания Jira issue для GLPI тикета ${ticketId}: ${
          err.response?.status
        } – ${JSON.stringify(err.response?.data) || err.message}`,
        "error"
      )
    }
  }
}

/**
 * Синхронизация удаления
 * Если удалена задача в Jira — удаляем связанный тикет в GLPI
 * Если удалён тикет в GLPI — удаляем связанный issue в Jira
 */
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
        log(`🗑️ Jira issue ${jiraKey} удалена, удаляем GLPI тикет ${ticket.id}`)
        await deleteGLPITicket(ticket.id)
      }
    }
  }

  for (const issue of jiraIssues) {
    const glpiIdMatch = issue.fields.description?.match(/GLPI-ID: (\d+)/)
    if (glpiIdMatch) {
      const glpiId = parseInt(glpiIdMatch[1])
      if (!glpiMap.has(glpiId)) {
        log(`🗑️ GLPI тикет ${glpiId} удалён, удаляем Jira issue ${issue.key}`)
        await deleteJiraIssue(issue.key)
      }
    }
  }
}
