import axios from "axios"
import { config } from "./config/index.js"
import { log } from "./logger.js"

const auth = Buffer.from(
  `${config.jira.username}:${config.jira.password}`
).toString("base64")
const jiraHeaders = {
  Authorization: `Basic ${auth}`,
  Accept: "application/json",
}

export async function getJiraIssues() {
  try {
    const response = await axios.get(
      `${config.jira.baseUrl}/rest/api/2/search`,
      {
        headers: jiraHeaders,
        params: {
          jql: `project=${config.jira.projectKey}`,
          maxResults: 100,
          fields: "summary,description",
        },
      }
    )
    return response.data.issues || []
  } catch (error) {
    log(
      `Jira get issues error: ${error.response?.status} – ${
        JSON.stringify(error.response?.data) || error.message
      }`,
      "error"
    )
    return []
  }
}

export async function deleteJiraIssue(issueIdOrKey) {
  if (!config.allowDeletion) {
    log(
      `⚠️ Deletion disabled - skipping deletion of Jira issue ${issueIdOrKey}`
    )
    return false
  }
  try {
    await axios.delete(
      `${config.jira.baseUrl}/rest/api/2/issue/${issueIdOrKey}`,
      {
        headers: jiraHeaders,
      }
    )
    return true
  } catch (error) {
    log(`Jira delete issue error: ${error.message}`, "error")
    return false
  }
}

export async function updateJiraIssue(issueIdOrKey, fields) {
  try {
    await axios.put(
      `${config.jira.baseUrl}/rest/api/2/issue/${issueIdOrKey}`,
      { fields },
      { headers: jiraHeaders }
    )
    return true
  } catch (error) {
    log(`Jira update issue error: ${error.message}`, "error")
    return false
  }
}
