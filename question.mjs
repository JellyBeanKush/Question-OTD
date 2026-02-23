import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import fs from 'fs';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    DISCORD_URL: process.env.DISCORD_QUESTION_WEBHOOK, 
    SAVE_FILE: 'current_question.txt',
    HISTORY_FILE: 'question_history.json',
    PRIMARY_MODEL: "gemini-2.0-flash" // Optimized for reasoning and variety
};

const today = new Date();
const options = { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' };
const todayFormatted = today.toLocaleDateString('en-US', options);

async function getNaturalContext() {
    const month = today.getMonth() + 1;
    const day = today.getDate();
    const year = today.getFullYear();
    const dayOfWeek = today.getDay();

    // 1. Fetch Moveable Public Holidays (Thanksgiving, etc.)
    let officialHoliday = "";
    try {
        const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/US`);
        const holidays = await res.json();
        const found = holidays.find(h => h.date === today.toISOString().split('T')[0]);
        if (found) officialHoliday = found.name;
    } catch (e) { console.log("Holiday API unavailable, using fallback."); }

    // 2. Wacky Calendar (3-4 per month)
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
        "11-4": "National Candy Day", "11-14": "Pickle Day", "11-21": "False Confession Day",
        "12-5": "Day of the Ninja", "12-15": "Ugly Sweater Day", "12-21": "First Day of Winter"
    };

    const currentFunDay = funHolidays[`${month}-${day}`];

    // Priority 1: Official Holidays
    if (officialHoliday) return { theme: officialHoliday, isMajor: true };
    // Priority 2: Our Wacky Calendar
    if (currentFunDay) return { theme: currentFunDay, isMajor: true };
    
    // Priority 3: Weekly Vibes (No holiday today)
    const vibes = [
        "Silly Sunday", 
        "Motivation Monday", 
        "Taco Tuesday", 
        "Would You Rather Wednesday", 
        "Throwback Thursday", 
        "Friday Feeling", 
        "Gaming Saturday"
    ];
    return { theme: vibes[dayOfWeek], isMajor: false };
}

async function main() {
    // Load History
    let history = [];
    if (fs.existsSync(CONFIG.HISTORY_FILE)) {
        try { history = JSON.parse(fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8')); } catch (e) {}
    }

    // Prevent double-running
    if (history.length > 0 && history[0].date === todayFormatted) return;

    const context = await getNaturalContext();
    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
    const model = genAI.getGenerativeModel({ model: CONFIG.PRIMARY_MODEL });

    const prompt = `Generate one "Question of the Day."
    Current Theme: ${context.theme}
    
    STYLE RULES:
    1. If the theme is a Major Holiday or Food Day (e.g. Taco Tuesday, Mario Day, Pizza Day), you may mention it: "It's Taco Tuesday! What's your..."
    2. If the theme is general (e.g. Motivation Monday, Sloth Day), do NOT mention the day's name. Just ask a grounded question inspired by that vibe.
    3. NO WEIRD STUFF: Keep it grounded in reality. No "living in a bread house." Ask about preferences, habits, or memories.
    4. NO REPEATS: Do not ask anything similar in theme or wording to these recent questions:
    ${history.map(h => h.question).slice(0, 30).join(" | ")}
    
    Return ONLY the question text.`;

    try {
        const result = await model.generateContent(prompt);
        const questionText = result.response.text().trim().replace(/["']/g, ""); // Clean quotes

        // Save for Mix It Up
        fs.writeFileSync(CONFIG.SAVE_FILE, questionText);

        // Update History
        history.unshift({ date: todayFormatted, question: questionText });
        fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(history, null, 2));

        // Post to Discord
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

        console.log("Success:", questionText);
    } catch (err) {
        console.error("Critical Error:", err);
        process.exit(1);
    }
}

main();
