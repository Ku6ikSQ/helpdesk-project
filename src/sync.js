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
import { config } from "./config/index.js"
import { userMap } from "./utils/mapping.js"
import { loadMap, saveMap } from "./utils/jiraGlpiMapUtils.js"
import { log } from "./logger.js"
import { DateTime } from "luxon"

function parseGLPIDate(dateStr) {
  if (!dateStr) return null
  // Парсим как UTC, потом переводим в Asia/Yekaterinburg
  return DateTime.fromFormat(dateStr, "yyyy-MM-dd HH:mm:ss", {
    zone: "utc",
  }).setZone("Asia/Yekaterinburg")
}

function parseJiraDate(dateStr) {
  if (!dateStr) return null
  // Jira обычно возвращает ISO строку с UTC, Luxon корректно её распарсит
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

  // log(
  //   `JIRA: ${jiraDate.toISO()} ::: GLPI: ${glpiDate.toISO()} ::: RESULT: ${
  //     glpiDate > jiraDate
  //   }`
  // )

  return glpiDate > jiraDate
}

function normalizeName(name = "") {
  return name.trim().toLowerCase()
}

// Создание и обновление GLPI из Jira
export async function syncJiraToGLPI() {
  const jiraIssues = await getJiraIssues()
  const glpiTickets = await getGLPITickets()
  const map = loadMap()

  for (const issue of jiraIssues) {
    const name = issue.fields.summary
    const content = issue.fields.description || ""
    const reporter = issue.fields.reporter?.displayName || "glpi"
    const linkedGlpiId = map[issue.id]
    const matchingTicket = glpiTickets.find((t) => t.id === linkedGlpiId)

    if (matchingTicket) {
      // const jiraUpdated = new Date(issue.fields.updated)
      // const glpiUpdated = new Date(matchingTicket.date_mod)

      if (!isNewer(matchingTicket, issue)) {
        if (
          matchingTicket.content !== content ||
          matchingTicket.users_id_recipient !== userMap[reporter]
        ) {
          await updateGLPITicket(matchingTicket.id, {
            name,
            content,
            users_id_recipient: userMap[reporter] || userMap["glpi"],
          })
          log(`✅ Обновлён GLPI тикет: ${name}`)
        }
      }
    } else {
      const created = await createGLPITicket({
        name,
        content,
        users_id_recipient: userMap[reporter] || userMap["glpi"],
      })
      if (created?.id) {
        map[issue.id] = created.id
        saveMap(map)
        log(`➕ Создан GLPI тикет из Jira: ${name}`)
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
    const name = ticket.name
    const content = ticket.content || ""
    const linkedJiraId = Object.entries(map).find(
      ([_, glpiId]) => glpiId === ticket.id
    )?.[0]
    const matchingIssue = jiraIssues.find((i) => i.id === linkedJiraId)

    if (matchingIssue) {
      // const jiraUpdated = new Date(matchingIssue.fields.updated)
      // const glpiUpdated = new Date(ticket.date_mod)

      if (isNewer(ticket, matchingIssue)) {
        const updates = {}
        if (matchingIssue.fields.description !== content) {
          updates.description = content
        }
        if (matchingIssue.fields.summary !== name) {
          updates.summary = name
        }

        if (Object.keys(updates).length > 0) {
          await updateJiraIssue(matchingIssue.id, updates)
          log(
            `✅ Обновлена Jira задача: ${name} (${Object.keys(updates).join(
              ", "
            )})`
          )
        }
      }
    } else {
      const created = await createJiraIssue({
        summary: name,
        description: content,
      })
      if (created?.id) {
        map[created.id] = ticket.id
        saveMap(map)
        log(`➕ Создана Jira задача из GLPI: ${name}`)
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
