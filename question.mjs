import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import fs from 'fs';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    DISCORD_URL: process.env.DISCORD_QUESTION_WEBHOOK, 
    SAVE_FILE: 'current_question.txt',
    HISTORY_FILE: 'question_history.json',
    // 2.5 is the priority, 1.5 is the reliable backup
    MODELS: ["gemini-2.5-flash", "gemini-1.5-flash"] 
};

const today = new Date();
const options = { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' };
const todayFormatted = today.toLocaleDateString('en-US', options);

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
        "2-24": "National Tortilla Chip Day", "2-26": "National Toast Day",
        "3-10": "Mario Day", "3-14": "Pi Day", "3-20": "First Day of Spring",
        "5-4": "Star Wars Day", "9-19": "Talk Like a Pirate Day", "10-31": "Halloween"
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
        try { history = JSON.parse(fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8')); } catch (e) {}
    }

    if (history.length > 0 && history[0].date === todayFormatted) return;

    const context = await getNaturalContext();
    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
    
    const prompt = `Generate one "Question of the Day."
    Current Theme: ${context.theme}
    Style:
    - If it's a major Food/Gamer/Holiday, mention it. Otherwise, just ask a question inspired by the theme.
    - Grounded in reality. No abstract scenarios.
    - DO NOT repeat themes or questions similar to: ${history.map(h => h.question).slice(0, 30).join(" | ")}
    Return ONLY the question text.`;

    let questionText = null;

    // TRY MODELS IN ORDER
    for (const modelName of CONFIG.MODELS) {
        try {
            console.log(`Attempting with ${modelName}...`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            questionText = result.response.text().trim().replace(/["']/g, "");
            console.log(`Successfully generated using ${modelName}`);
            break; 
        } catch (err) {
            // Check for rate limits (429) or overloaded models (503)
            if ((err.status === 429 || err.status === 503) && modelName !== CONFIG.MODELS[CONFIG.MODELS.length - 1]) {
                console.warn(`${modelName} unavailable/quota hit. Falling back...`);
                continue; 
            }
            throw err; 
        }
    }

    if (!questionText) throw new Error("Could not generate content from any available model.");

    fs.writeFileSync(CONFIG.SAVE_FILE, questionText);
    history.unshift({ date: todayFormatted, question: questionText });
    fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(history, null, 2));

    const payload = {
        embeds: [{
            title: `❓ ?OTD — ${todayFormatted}`,
            description: `### ${questionText}`,
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

main().catch(err => {
    console.error("Critical Failure:", err);
    process.exit(1);
});
