export function log(message, level = "info") {
  const timestamp = new Date().toISOString()
  const formattedMessage = `[${timestamp}] [${level.toUpperCase()}]: ${message}`
  console.log(formattedMessage)
}
