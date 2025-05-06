require('dotenv').config();
const axios = require('axios');
const XLSX = require('xlsx');

function decodeHtml(html) {
    return html
        .replace(/&#60;/g, '<')
        .replace(/&#62;/g, '>')
        .replace(/&amp;/g, '&') 
        .replace(/&quot;/g, '"') 
        .replace(/&apos;/g, "'");
}

const url = process.env.SERVER_URL;
const appToken = process.env.APP_TOKEN;

async function initSession() {
    try {
        const response = await axios.get(`${url}/initSession`, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'user_token' + ' ' + process.env.USER_TOKEN,
                'App-Token': appToken
            }
        });
        const sessionToken = response.data.session_token;
        if (!sessionToken) {
            console.error("Не удалось получить session_token");
            return;
        }
        return sessionToken;
    } catch (error) {
        console.error("Ошибка при инициализации сессии:", error.message);
    }
}

async function getTickets(sessionToken) {
    try {
        const response = await axios.get(`${url}/Ticket/`, {
            headers: {
                'Content-Type': 'application/json',
                'Session-Token': sessionToken,
                'App-Token': appToken
            }
        });
        return response.data;
    } catch (error) {
        console.error("Ошибка при получении тикетов:", error.message);
    }
}

function createExcel(tickets) {
    const data = tickets.map(ticket => ({
        'Номер задачи': ticket.id,
        'Тема, название': ticket.name,
        'Дата открытия': ticket.date,
        'Дата закрытия': ticket.closedate || 'Не закрыта',
        'Обратившийся': ticket.users_id_recipient,
        'Ответственный': ticket.users_id_lastupdater,
        'Списанные трудозатраты': ticket.actiontime,
        'Дата списания': ticket.takeintoaccountdate,
        'Комментарии': decodeHtml(ticket.content)
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Tickets');

    const fileName = 'tickets.xlsx';
    XLSX.writeFile(workbook, fileName);
}

(async () => {
    const sessionToken = await initSession();
    if (!sessionToken) {
        console.log("Failed to get the session token.");
        return;
    }
    const tickets = await getTickets(sessionToken);
    createExcel(tickets);
})();
