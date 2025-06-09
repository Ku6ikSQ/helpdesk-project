import { getJiraIssues, deleteJiraIssue, updateJiraIssue } from "./jira.js"
import {
  getGLPITickets,
  createGLPITicket,
  deleteGLPITicket,
  updateGLPITicket,
} from "./glpi.js"
import { config } from "./config/index.js"
import { log } from "./logger.js"
import { userMap } from "./utils/mapping.js"
import axios from "axios"

function safeDate(value) {
  if (!value || typeof value !== "string") return null
  const iso = value.replace(" ", "T")
  const date = new Date(iso)
  return isNaN(date.getTime()) ? null : date
}

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

    // Обработка описания: либо строка, либо JSON stringify (если объект)
    const descriptionRaw =
      typeof issue.fields.description === "string"
        ? issue.fields.description
        : JSON.stringify(issue.fields.description || "")

    const existingTicket = ticketsByJiraId.get(issueKey)

    const reporterName = issue.fields.reporter?.displayName || "glpi"
    const userId = userMap[reporterName] || userMap["glpi"]

    const jiraUpdated = safeDate(issue.fields.updated)
    const glpiUpdated = existingTicket
      ? safeDate(existingTicket.date_mod)
      : null

    const isFromGLPI = /GLPI-ID: \d+/.test(descriptionRaw)

    log(
      `🔍 Jira issue ${issueKey} updated: ${
        jiraUpdated?.toISOString() || "?"
      }, GLPI ticket updated: ${glpiUpdated?.toISOString() || "?"}`
    )

    if (!existingTicket) {
      if (isFromGLPI) {
        log(
          `🟡 Jira issue ${issueKey} изначально из GLPI, не создаём новый тикет`
        )
        continue
      }

      const newContent = `Jira-ID: ${issueKey}\n\n${descriptionRaw}`
      const result = await createGLPITicket({
        name: summary,
        content: newContent,
        users_id_recipient: userId,
      })

      if (result) {
        log(`✅ Создан тикет в GLPI для Jira issue ${issueKey}`)
      }
      continue
    }

    if (
      jiraUpdated &&
      (!glpiUpdated || jiraUpdated.getTime() > glpiUpdated.getTime())
    ) {
      const newContent = `Jira-ID: ${issueKey}\n\n${descriptionRaw}`
      const updated = await updateGLPITicket(existingTicket.id, {
        name: summary,
        content: newContent,
        users_id_recipient: userId,
      })
      if (updated) {
        log(`🔄 Обновлён GLPI тикет для Jira issue ${issueKey}`)
      }
    } else {
      log(
        `🟡 GLPI тикет для Jira issue ${issueKey} новее, пропускаем обновление`
      )
    }
  }
}

export async function syncGLPIToJira() {
  const tickets = await getGLPITickets()
  log(`Получено ${tickets.length} тикетов из GLPI`)

  const existingIssues = await getJiraIssues()

  const issuesByGlpiId = new Map()
  for (const issue of existingIssues) {
    const descriptionStr = issue.fields.description || ""
    if (!descriptionStr) {
      log(
        `⚠️ Jira issue ${issue.key} не содержит описание, пропускаем поиск GLPI-ID`,
        "warn"
      )
      continue
    }
    const glpiIdMatch = descriptionStr.match(/GLPI-ID: (\d+)/)
    if (glpiIdMatch) {
      issuesByGlpiId.set(parseInt(glpiIdMatch[1]), issue)
    }
  }

  for (const ticket of tickets) {
    const ticketId = ticket.id
    const rawSummary =
      (ticket.name && ticket.name.trim()) ||
      (ticket.title && ticket.title.trim()) ||
      `GLPI Ticket ${ticketId}`

    const summary = rawSummary.replace(/^GLPI-\d+:\s*/, "")
    const descriptionRaw = ticket.content || "No description"

    const existingIssue = issuesByGlpiId.get(ticketId)
    const glpiUpdated = safeDate(ticket.date_mod)
    const jiraUpdated =
      existingIssue && existingIssue.fields.updated
        ? safeDate(existingIssue.fields.updated)
        : null

    const isFromJira = /Jira-ID: [A-Z]+-\d+/.test(descriptionRaw)

    log(
      `🔍 GLPI тикет ${ticketId} updated: ${
        glpiUpdated?.toISOString() || "?"
      }, Jira issue updated: ${jiraUpdated?.toISOString() || "?"}`
    )

    if (!existingIssue) {
      if (isFromJira) {
        log(
          `🟡 GLPI тикет ${ticketId} изначально из Jira, не создаём новый issue`
        )
        continue
      }

      const descriptionToSend =
        ticket.content && ticket.content.trim() !== ""
          ? ticket.content
          : `GLPI-ID: ${ticketId}\n\nNo description provided`

      const issuePayloadFields = {
        project: { key: config.jira.projectKey },
        summary,
        description: descriptionToSend, // plain text
        issuetype: { name: "Task" },
      }

      try {
        await axios.post(
          `${config.jira.baseUrl}/rest/api/2/issue`,
          { fields: issuePayloadFields },
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
      continue
    }

    if (
      glpiUpdated &&
      (!jiraUpdated || glpiUpdated.getTime() > jiraUpdated.getTime())
    ) {
      const updatedDescription = `GLPI-ID: ${ticketId}\n\n${descriptionRaw}`

      const updateFields = {
        summary,
        description: updatedDescription, // plain text
      }

      const updated = await updateJiraIssue(existingIssue.key, updateFields)
      if (updated) {
        log(`🔄 Обновлён Jira issue для GLPI тикета ${ticketId}`)
      }
    } else {
      log(
        `🟡 Jira issue для GLPI тикета ${ticketId} новее, пропускаем обновление`
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
        log(`🗑️ Jira issue ${jiraKey} удалена, удаляем GLPI тикет ${ticket.id}`)
        await deleteGLPITicket(ticket.id)
      }
    }
  }

  for (const issue of jiraIssues) {
    const descriptionStr = issue.fields.description || ""
    const glpiIdMatch = descriptionStr.match(/GLPI-ID: (\d+)/)
    if (glpiIdMatch) {
      const glpiId = parseInt(glpiIdMatch[1])
      if (!glpiMap.has(glpiId)) {
        log(`🗑️ GLPI тикет ${glpiId} удалён, удаляем Jira issue ${issue.key}`)
        await deleteJiraIssue(issue.key)
      }
    }
  }
}
