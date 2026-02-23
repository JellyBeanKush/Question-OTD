import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import fs from 'fs';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    DISCORD_URL: process.env.DISCORD_QUESTION_WEBHOOK, 
    SAVE_FILE: 'current_question.txt',
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
            color: 0x3498db,
            footer: { text: "Reply in this thread to join the conversation!" }
        }]
    };

    await fetch(CONFIG.DISCORD_URL, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(payload) 
    });
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

    // Passing the entire history to Gemini so it knows what to avoid
    const prompt = `Generate one engaging Question of the Day for a gaming and Twitch community. 
    Focus on gaming memories, streaming "hot takes," or tech. 
    AVOID these previous questions: ${history.map(h => h.question).join(", ")}.
    Return ONLY the question text.`;

    try {
        const result = await model.generateContent(prompt);
        const questionText = result.response.text().trim();

        fs.writeFileSync(CONFIG.SAVE_FILE, questionText);

        history.unshift({ date: todayFormatted, question: questionText });
        // REMOVED .slice(0, 30) to keep history infinite
        fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(history, null, 2));

        await postToDiscord(questionText);
        console.log("?OTD posted with infinite history tracking.");
    } catch (err) {
        console.error("Critical Failure:", err);
        process.exit(1);
    }
}
main();
