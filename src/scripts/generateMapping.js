import axios from "axios"
import fs from "fs"
import dotenv from "dotenv"
dotenv.config()

const { GLPI_API_URL, GLPI_APP_TOKEN, GLPI_USERNAME, GLPI_PASSWORD } =
  process.env

const mappingFilePath = "./utils/mapping.js"

async function getSessionToken() {
  const response = await axios.get(`${GLPI_API_URL}/initSession`, {
    headers: {
      "App-Token": GLPI_APP_TOKEN,
    },
    auth: {
      username: GLPI_USERNAME,
      password: GLPI_PASSWORD,
    },
  })
  return response.data.session_token
}

async function getUsers(sessionToken) {
  const response = await axios.get(`${GLPI_API_URL}/User`, {
    headers: {
      "Session-Token": sessionToken,
      "App-Token": GLPI_APP_TOKEN,
    },
    params: {
      range: "0-999",
    },
  })

  return response.data
}

function buildUserMap(users) {
  const map = {}
  users.forEach((user) => {
    if (user.email) {
      map[user.email] = user.id
    }
  })
  return map
}

function saveMappingToFile(map) {
  const entries = Object.entries(map)
    .map(([email, id]) => `  "${email}": ${id},`)
    .join("\n")

  const content = `export const userMap = {\n${entries}\n};\n`

  fs.writeFileSync(mappingFilePath, content, "utf8")
  console.log(`mapping.js updated with ${Object.keys(map).length} users.`)
}

async function main() {
  try {
    const token = await getSessionToken()
    const users = await getUsers(token)
    const userMap = buildUserMap(users)
    saveMappingToFile(userMap)
  } catch (err) {
    console.error("Error:", err.message)
  }
}

main()
