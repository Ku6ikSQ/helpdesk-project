import dotenv from "dotenv"
dotenv.config()

export const config = {
  jira: {
    baseUrl: process.env.JIRA_BASE_URL,
    username: process.env.JIRA_USERNAME,
    password: process.env.JIRA_PASSWORD,
    projectKey: process.env.JIRA_KEY_PROJECT,
  },
  glpi: {
    baseUrl: process.env.GLPI_BASE_URL,
    userToken: process.env.GLPI_USER_TOKEN,
    appToken: process.env.GLPI_APP_TOKEN,
  },
  statusMapping: {
    jiraToGlpi: {
      "To Do": 1,
      "In Progress": 2,
      Done: 5,
    },
    glpiToJira: {
      1: "To Do",
      2: "In Progress",
      5: "Done",
    },
  },
  dryRun: false,
  // allowDeletion: process.env.ALLOW_DELETION === "true" || false,
  allowDeletion: true,
}
