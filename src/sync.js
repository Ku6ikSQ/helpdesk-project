import {
  getJiraIssues,
  createJiraIssue,
  deleteJiraIssue,
  updateJiraIssue,
} from "./jira.js"
import {
  getGLPITickets,
  createGLPITicket,
  deleteGLPITicket,
  updateGLPITicket,
} from "./glpi.js"
import { userMap } from "./utils/mapping.js"
import { loadMap, saveMap } from "./utils/jiraGlpiMapUtils.js"
import { log } from "./logger.js"
import { DateTime } from "luxon"

function parseGLPIDate(dateStr) {
  if (!dateStr) return null
  return DateTime.fromFormat(dateStr, "yyyy-MM-dd HH:mm:ss", {
    zone: "utc",
  }).setZone("Asia/Yekaterinburg")
}

function parseJiraDate(dateStr) {
  if (!dateStr) return null
  return DateTime.fromISO(dateStr, { zone: "utc" }).setZone(
    "Asia/Yekaterinburg"
  )
}

function isNewer(glpiTicket, jiraIssue) {
  const glpiDate = parseGLPIDate(glpiTicket.date_mod || glpiTicket.date)
  const jiraDate = parseJiraDate(jiraIssue.fields.updated)

  if (!glpiDate || !jiraDate) {
    log(`⚠️ Невозможно сравнить даты: GLPI: ${glpiDate}, Jira: ${jiraDate}`)
    return false
  }

  return glpiDate > jiraDate
}

// Проверка, изменились ли данные между Jira и GLPI тикетом
function changed(jiraIssue, glpiTicket) {
  if (!jiraIssue || !glpiTicket) return true

  const jiraName = jiraIssue.fields.summary || ""
  const jiraDesc = jiraIssue.fields.description || ""
  const glpiName = glpiTicket.name || ""
  const glpiContent = glpiTicket.content || ""
  const glpiUser = glpiTicket.users_id_recipient
  const jiraReporterName = jiraIssue.fields.reporter?.displayName || ""

  if (jiraName !== glpiName) return true
  if (jiraDesc !== glpiContent) return true
  if (glpiUser !== (userMap[jiraReporterName] || userMap["glpi"])) return true

  return false
}

// Создание и обновление GLPI из Jira
export async function syncJiraToGLPI() {
  const jiraIssues = await getJiraIssues()
  const glpiTickets = await getGLPITickets()
  const map = loadMap()

  for (const issue of jiraIssues) {
    const linkedGlpiId = map[issue.id]
    const matchingTicket = glpiTickets.find((t) => t.id === linkedGlpiId)

    if (matchingTicket) {
      if (!isNewer(matchingTicket, issue)) {
        if (changed(issue, matchingTicket)) {
          await updateGLPITicket(matchingTicket.id, {
            name: issue.fields.summary,
            content: issue.fields.description || "",
            users_id_recipient:
              userMap[issue.fields.reporter?.displayName] || userMap["glpi"],
          })
          log(`✅ Обновлён GLPI тикет: ${issue.fields.summary}`)
        }
      }
    } else {
      const created = await createGLPITicket({
        name: issue.fields.summary,
        content: issue.fields.description || "",
        users_id_recipient:
          userMap[issue.fields.reporter?.displayName] || userMap["glpi"],
      })
      if (created?.id) {
        map[issue.id] = created.id
        saveMap(map)
        log(`➕ Создан GLPI тикет из Jira: ${issue.fields.summary}`)
      }
    }
  }
}

// Создание и обновление Jira из GLPI
export async function syncGLPIToJira() {
  const jiraIssues = await getJiraIssues()
  const glpiTickets = await getGLPITickets()
  const map = loadMap()

  for (const ticket of glpiTickets) {
    const linkedJiraId = Object.entries(map).find(
      ([_, glpiId]) => glpiId === ticket.id
    )?.[0]
    const matchingIssue = jiraIssues.find((i) => i.id === linkedJiraId)

    if (matchingIssue) {
      if (isNewer(ticket, matchingIssue)) {
        if (changed(matchingIssue, ticket)) {
          const updates = {}
          if (matchingIssue.fields.description !== ticket.content) {
            updates.description = ticket.content
          }
          if (matchingIssue.fields.summary !== ticket.name) {
            updates.summary = ticket.name
          }

          if (Object.keys(updates).length > 0) {
            await updateJiraIssue(matchingIssue.id, updates)
            log(
              `✅ Обновлена Jira задача: ${ticket.name} (${Object.keys(
                updates
              ).join(", ")})`
            )
          }
        }
      }
    } else {
      const created = await createJiraIssue({
        summary: ticket.name,
        description: ticket.content || "",
      })
      if (created?.id) {
        map[created.id] = ticket.id
        saveMap(map)
        log(`➕ Создана Jira задача из GLPI: ${ticket.name}`)
      }
    }
  }
}

// Удаление задач/тикетов без парных соответствий
export async function syncDeletedItems() {
  const jiraIssues = await getJiraIssues()
  const glpiTickets = await getGLPITickets()
  const map = loadMap()

  const jiraIds = new Set(jiraIssues.map((i) => i.id))
  const glpiIds = new Set(glpiTickets.map((t) => t.id))

  // Удаление Jira задач без GLPI тикета
  for (const [jiraId, glpiId] of Object.entries(map)) {
    if (!glpiIds.has(glpiId)) {
      const success = await deleteJiraIssue(jiraId)
      if (success) {
        delete map[jiraId]
        saveMap(map)
        log(`🗑️ Удалена Jira задача: ${jiraId}`)
      }
    }
  }

  // Удаление GLPI тикетов без Jira задачи
  for (const [jiraId, glpiId] of Object.entries(map)) {
    if (!jiraIds.has(jiraId)) {
      const success = await deleteGLPITicket(glpiId)
      if (success) {
        delete map[jiraId]
        saveMap(map)
        log(`🗑️ Удалён GLPI тикет: ${glpiId}`)
      }
    }
  }
}
