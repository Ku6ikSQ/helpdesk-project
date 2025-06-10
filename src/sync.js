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
      // Обновить при необходимости
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
    } else {
      // Создать новый
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
      if (matchingIssue.fields.description !== content) {
        await updateJiraIssue(matchingIssue.id, { description: content })
        log(`✅ Обновлена Jira задача: ${name}`)
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
