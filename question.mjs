import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import fs from 'fs';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    DISCORD_URL: process.env.DISCORD_QUESTION_WEBHOOK, // Ensure this URL includes the ?thread_id=
    HISTORY_FILE: 'question_history.json',
    PRIMARY_MODEL: "gemini-2.5-flash"
};

const options = { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' };
const todayFormatted = new Date().toLocaleDateString('en-US', options);

async function postToDiscord(question) {
    const payload = {
        embeds: [{
            title: `❓ ?OTD — ${todayFormatted}`,
            description: `### ${question}`,
            color: 0x3498db // Blue
        }]
    };

    const response = await fetch(CONFIG.DISCORD_URL, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(payload) 
    });

    if (!response.ok) {
        console.error("Discord Error:", await response.text());
    }
}

async function main() {
    let history = [];
    if (fs.existsSync(CONFIG.HISTORY_FILE)) {
        try { history = JSON.parse(fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8')); } catch (e) {}
    }

    if (history.length > 0 && history[0].date === todayFormatted) {
        console.log("Already asked today.");
        return;
    }

    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
    const model = genAI.getGenerativeModel({ model: CONFIG.PRIMARY_MODEL });

    // Custom prompt for your streaming community
    const prompt = `Generate one fun, engaging "Question of the Day" for a Discord community of gamers and Twitch viewers. 
    Focus on gaming memories, streaming "hot takes," or tech preferences. 
    Make it conversational and open-ended. Return ONLY the question text.`;

    try {
        const result = await model.generateContent(prompt);
        const questionText = result.response.text().trim();

        history.unshift({ date: todayFormatted, question: questionText });
        fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(history.slice(0, 30), null, 2));

        await postToDiscord(questionText);
        console.log("Question posted to thread successfully.");
    } catch (err) {
        console.error("Critical Failure:", err);
        process.exit(1);
    }
}
main();
