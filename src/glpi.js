import axios from "axios"
import { config } from "./config/index.js"
import { log } from "./logger.js"

let sessionToken = null

export async function initGLPISession() {
  try {
    const response = await axios.get(`${config.glpi.baseUrl}/initSession`, {
      headers: {
        Authorization: `user_token ${config.glpi.userToken}`,
        "App-Token": config.glpi.appToken,
      },
    })
    sessionToken = response.data.session_token
    log("GLPI session started")
  } catch (error) {
    log(`GLPI session error: ${error.message}`, "error")
  }
}

export async function killGLPISession() {
  if (!sessionToken) return
  await axios.get(`${config.glpi.baseUrl}/killSession`, {
    headers: {
      "Session-Token": sessionToken,
      "App-Token": config.glpi.appToken,
    },
  })
  log("GLPI session ended")
  sessionToken = null
}

export async function getGLPITickets() {
  try {
    const response = await axios.get(`${config.glpi.baseUrl}/Ticket/`, {
      headers: {
        "Session-Token": sessionToken,
        "App-Token": config.glpi.appToken,
      },
    })
    return response.data
  } catch (error) {
    log(`GLPI get tickets error: ${error.message}`, "error")
    return []
  }
}
export async function createGLPITicket({ name, content, users_id_recipient }) {
  try {
    const response = await axios.post(
      `${config.glpi.baseUrl}/Ticket`,
      {
        input: {
          name,
          content,
          users_id_recipient,
        },
      },
      {
        headers: {
          "Session-Token": sessionToken,
          "App-Token": config.glpi.appToken,
        },
      }
    )

    return response.data
  } catch (error) {
    log(`GLPI create ticket error: ${error.message}`, "error")
    return null
  }
}
