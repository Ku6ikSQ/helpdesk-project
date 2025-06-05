import { getJiraIssues } from "./jira.js"
import { getGLPITickets } from "./glpi.js"
import { log } from "./logger.js"

export async function syncJiraToGLPI() {
  const issues = await getJiraIssues()
  log(`Fetched ${issues.length} issues from Jira`)
  // TODO: сравнить, создать в GLPI
}

export async function syncGLPIToJira() {
  const tickets = await getGLPITickets()
  log(`Fetched ${tickets.length} tickets from GLPI`)
  // TODO: сравнить, создать в Jira
}
