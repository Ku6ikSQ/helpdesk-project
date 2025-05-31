require("dotenv").config()
const axios = require("axios")
const XLSX = require("xlsx")

const jiraUrl = process.env.JIRA_BASE_URL
const headers = {
  Authorization: `Bearer ${process.env.JIRA_API_TOKEN}`,
  Accept: "application/json",
}

async function getIssuesFromKanbanBoard(boardId = 414) {
  try {
    const response = await axios.get(
      `${jiraUrl}/rest/agile/1.0/board/${boardId}/issue`,
      {
        headers: headers,
        params: {
          maxResults: 100,
          fields: "summary,status,assignee,creator,created,updated,comment",
        },
      }
    )
    return response.data.issues
  } catch (error) {
    console.error("Ошибка:", error.response?.data || error.message)
    return []
  }
}

;(async () => {
  const issues = await getIssuesFromKanbanBoard()
  if (issues.length > 0) {
    const data = issues.map((issue) => ({
      Ключ: issue.key,
      Название: issue.fields.summary,
      Статус: issue.fields.status.name,
      Исполнитель: issue.fields.assignee?.displayName || "Не назначен",
      Создатель: issue.fields.creator?.displayName || "Не указан",
      Создано: issue.fields.created,
      Обновлено: issue.fields.updated,
      Комментарии:
        (issue.fields.comment.comments || [])
          .map((comment) => comment.body)
          .join("\n") || "Нет комментариев",
    }))
    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.json_to_sheet(data)
    XLSX.utils.book_append_sheet(workbook, worksheet, "Issues")
    XLSX.writeFile(workbook, "jira_issues.xlsx")
    console.log("Экспортировано задач:", issues.length)
  } else {
    console.log("Нет задач для экспорта.")
  }
})()
