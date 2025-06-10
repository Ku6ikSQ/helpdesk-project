import fs from "fs"
const path = "./src/utils/jiraGlpiMap.json"

export function loadMap() {
  try {
    const raw = fs.readFileSync(path, "utf8")
    return JSON.parse(raw)
  } catch (e) {
    return {}
  }
}

export function saveMap(map) {
  fs.writeFileSync(path, JSON.stringify(map, null, 2), "utf8")
}
