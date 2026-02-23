import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import fs from 'fs';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    DISCORD_URL: process.env.DISCORD_QUESTION_WEBHOOK, 
    SAVE_FILE: 'current_question.txt',
    HISTORY_FILE: 'question_history.json',
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
        "1-2": "Science Fiction Day", "1-25": "Opposite Day",
        "2-9": "National Pizza Day", "2-24": "National Tortilla Chip Day", "2-26": "National Toast Day",
        "3-10": "Mario Day", "3-14": "Pi Day", "3-20": "First Day of Spring",
        "4-1": "April Fools' Day", "4-22": "Jelly Bean Day", "4-28": "Superhero Day",
        "5-4": "Star Wars Day", "5-21": "Talk Like Yoda Day", "5-24": "Scavenger Hunt Day",
        "6-21": "First Day of Summer", "6-24": "Food Truck Day", "6-30": "Social Media Day",
        "7-2": "World UFO Day", "7-13": "Embrace Your Geekness Day", "7-17": "World Emoji Day",
        "8-8": "International Cat Day", "8-13": "Lefthanders Day", "8-24": "Strange Music Day",
        "9-12": "Video Games Day", "9-19": "Talk Like a Pirate Day", "9-22": "First Day of Fall",
        "10-1": "International Coffee Day", "10-20": "Sloth Day", "10-31": "Halloween",
        "11-4": "National Candy Day", "11-14": "Pickle Day", "11-17": "Take a Hike Day", "11-21": "False Confession Day",
        "12-5": "Day of the Ninja", "12-15": "Ugly Sweater Day", "12-21": "First Day of Winter"
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
    - If it's a major Food/Gamer/Holiday (like Taco Tuesday or Mario Day), mention it. 
    - Otherwise, do NOT mention the day's name (like Sloth Day). Just ask a question inspired by it.
    - Grounded in reality. No abstract scenarios.
    - DO NOT repeat themes or questions similar to: ${history.map(h => h.question).slice(0, 30).join(" | ")}
    Return ONLY the question text.`;

    let questionText = null;

    for (const modelName of CONFIG.MODELS) {
        try {
            console.log(`Attempting with ${modelName}...`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            questionText = result.response.text().trim().replace(/["']/g, "");
            console.log(`Success using ${modelName}`);
            break; 
        } catch (err) {
            if ((err.status === 429 || err.status === 503) && modelName !== CONFIG.MODELS[CONFIG.MODELS.length - 1]) {
                console.warn(`${modelName} quota hit. Falling back...`);
                continue; 
            }
            throw err; 
        }
    }

    if (!questionText) throw new Error("All models failed.");

    // Save for Mix It Up
    fs.writeFileSync(CONFIG.SAVE_FILE, questionText);
    history.unshift({ date: todayFormatted, question: questionText });
    fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(history, null, 2));

    // Discord Logic with URL Guard
    if (!CONFIG.DISCORD_URL || CONFIG.DISCORD_URL.trim() === "") {
        console.warn("⚠️ DISCORD_QUESTION_WEBHOOK is empty. Skipping Discord post.");
        return;
    }

    // ... (Everything above this in main() stays the same) ...

    const payload = {
        embeds: [{
            title: `📅 Question of the Day — ${todayFormatted}`,
            color: 0x3498db,
            fields: [
                {
                    name: "\u200B", // Invisible character to create spacing
                    value: `## ${questionText}`, // Large header style for the question box
                    inline: false
                }
            ],
            footer: { text: "Reply to this message to answer!" }
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
