import axios from "axios"
import { config } from "./config/index.js"
import { log } from "./logger.js"

const authHeader = {
  Authorization: `Basic ${Buffer.from(
    `${config.jira.email}:${config.jira.token}`
  ).toString("base64")}`,
}

export async function getJiraIssues() {
  try {
    const response = await axios.get(
      `${config.jira.baseUrl}/rest/api/3/search?jql=project=TEST`,
      { headers: authHeader }
    )
    return response.data.issues || []
  } catch (error) {
    log(`Jira get issues error: ${error.message}`, "error")
    return []
  }
}
