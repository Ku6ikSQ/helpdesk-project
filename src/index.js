import { initGLPISession, killGLPISession } from "./glpi.js"
import { syncJiraToGLPI, syncGLPIToJira } from "./sync.js"
import { log } from "./logger.js"

async function main() {
  const mode = process.argv[2] || "both"
  await initGLPISession()

  try {
    if (mode === "jira2glpi" || mode === "both") await syncJiraToGLPI()
    if (mode === "glpi2jira" || mode === "both") await syncGLPIToJira()
  } catch (error) {
    log(`Main error: ${error.message}`, "error")
  } finally {
    await killGLPISession()
  }
}

main()
