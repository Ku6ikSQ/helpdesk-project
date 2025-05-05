require('dotenv').config();
const axios = require('axios');

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

function printTicket(ticket) {
    const ticketNumber = ticket.id;
    const subject = ticket.name;
    const openingDate = ticket.date;
    const closingDate = ticket.closedate || 'Не закрыта';
    const requester = ticket.users_id_recipient;
    const responsible = ticket.users_id_lastupdater;
    const laborCosts = ticket.actiontime;
    const writeOffDate = ticket.takeintoaccountdate;
    const comments = ticket.content;

    console.log(`Номер задачи: ${ticketNumber}`);
    console.log(`Тема, название: ${subject}`);
    console.log(`Дата открытия: ${openingDate}`);
    console.log(`Дата закрытия: ${closingDate}`);
    console.log(`Обратившийся: ${requester}`);
    console.log(`Ответственный: ${responsible}`);
    console.log(`Списанные трудозатраты: ${laborCosts}`);
    console.log(`Дата списания: ${writeOffDate}`);
    console.log(`Комментарии: ${decodeHtml(comments)}`);
    console.log('\n');
}

(async () => {
    const sessionToken = await initSession();
    if(!sessionToken) {
        console.log("Failed to get the session token.");
        return;
    }
    const tickets = await getTickets(sessionToken);
    tickets.forEach(printTicket);
})();