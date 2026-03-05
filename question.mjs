import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import fs from 'fs';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    DISCORD_URL: process.env.DISCORD_QUESTION_WEBHOOK, 
    SAVE_FILE: 'current_question.txt',
    HISTORY_FILE: 'question_history.json',
    MODELS: ["gemini-flash-latest", "gemini-pro-latest", "gemini-2.5-flash", "gemini-1.5-flash"]
};

const today = new Date();
const todayFormatted = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' });

async function getNaturalContext() {
    const month = today.getMonth() + 1;
    const day = today.getDate();
    const year = today.getFullYear();
    const dayOfWeek = today.getDay();

    let officialHoliday = "";
    try {
        const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/US`);
        const holidays = await res.json();
        const found = holidays.find(h => h.date === today.toISOString().split('T')[0]);
        if (found) officialHoliday = found.name;
    } catch (e) {}

    const funHolidays = {
        "1-2": "Science Fiction Day", "3-10": "Mario Day", "3-14": "Pi Day", 
        "4-22": "Jelly Bean Day", "5-4": "Star Wars Day", "8-8": "International Cat Day", 
        "9-12": "Video Games Day", "10-31": "Halloween", "12-15": "Ugly Sweater Day"
    };

    const currentFunDay = funHolidays[`${month}-${day}`];
    if (officialHoliday) return { theme: officialHoliday };
    if (currentFunDay) return { theme: currentFunDay };
    
    const vibes = ["Silly Sunday", "Motivation Monday", "Taco Tuesday", "Would You Rather Wednesday", "Throwback Thursday", "Friday Feeling", "Gaming Saturday"];
    return { theme: vibes[dayOfWeek] };
}

async function main() {
    let history = [];
    if (fs.existsSync(CONFIG.HISTORY_FILE)) {
        try { history = JSON.parse(fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8')); } catch (e) { history = []; }
    }

    if (history.length > 0 && history[0].date === todayFormatted) return;

    const context = await getNaturalContext();
    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
    
    const prompt = `Generate one "Question of the Day."
    Current Theme: ${context.theme}
    Style: Keep it casual for a Twitch gaming community. No corporate sounding stuff. 
    DO NOT REPEAT: ${history.slice(0, 40).map(h => h.question).join(" | ")}
    Return ONLY the question text.`;

    for (const modelName of CONFIG.MODELS) {
        try {
            console.log(`Attempting Question with ${modelName}...`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            const questionText = result.response.text().trim().replace(/["']/g, "");

            // Infinite History Update
            fs.writeFileSync(CONFIG.SAVE_FILE, questionText);
            history.unshift({ date: todayFormatted, question: questionText });
            fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(history, null, 2));

            if (CONFIG.DISCORD_URL) {
                const payload = {
                    embeds: [{
                        title: `📅 Question of the Day — ${todayFormatted}`,
                        color: 0x3498db,
                        fields: [{ name: "\u200B", value: `**${questionText}**` }],
                        footer: { text: "Reply to this message to answer!" }
                    }]
                };
                await fetch(CONFIG.DISCORD_URL, { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify(payload) 
                });
            }
            console.log("Question Successful!");
            return;
        } catch (err) {
            console.warn(`Fail: ${err.message}`);
            if (err.status === 429) await new Promise(r => setTimeout(r, 10000));
        }
    }
}
main();
