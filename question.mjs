import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import fs from 'fs';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    DISCORD_URL: process.env.DISCORD_QUESTION_WEBHOOK, 
    SAVE_FILE: 'current_question.txt',
    HISTORY_FILE: 'question_history.json',
    // Prioritizing the latest stable models
    MODELS: ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro-latest"]
};

const today = new Date();
const todayFormatted = today.toLocaleDateString('en-US', { 
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' 
});

async function getNaturalContext() {
    const month = today.getMonth() + 1;
    const day = today.getDate();
    const year = today.getFullYear();
    const dateKey = `${month}-${day}`;

    // 1. Check for Official Federal Holidays
    let officialHoliday = "";
    try {
        const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/US`);
        const holidays = await res.json();
        const found = holidays.find(h => h.date === today.toISOString().split('T')[0]);
        if (found) officialHoliday = found.name;
    } catch (e) {}

    if (officialHoliday) return { theme: officialHoliday };

    // 2. Unofficial, Geek, and "National Day" Overrides
    const funHolidays = {
        "1-2": "Science Fiction Day",
        "1-25": "Opposite Day",
        "2-13": "Galentine's Day",
        "2-27": "Pokémon Day",
        "3-10": "Mario Day",
        "3-14": "Pi Day",
        "3-17": "St. Patrick's Day",
        "3-31": "Transgender Day of Visibility",
        "4-1": "April Fools' Day",
        "4-20": "4/20",
        "4-22": "Jelly Bean Day",
        "4-26": "Alien Day (LV-426)",
        "5-4": "Star Wars Day (May the 4th)",
        "5-9": "Goku Day",
        "6-1": "Start of Pride Month",
        "6-19": "Juneteenth",
        "7-13": "Embrace Your Geekness Day",
        "8-8": "International Cat Day",
        "9-12": "Video Games Day",
        "9-19": "Talk Like a Pirate Day",
        "9-29": "National Coffee Day",
        "10-4": "National Taco Day",
        "10-23": "Fallout Reclamation Day",
        "10-31": "Halloween",
        "11-7": "N7 Day (Mass Effect)",
        "12-15": "Cat Herders Day"
    };

    if (funHolidays[dateKey]) return { theme: funHolidays[dateKey] };
    
    // 3. Weekly Vibes Fallback (0 = Sunday)
    const vibes = [
        "Sleepy Sunday",       // Low-energy, cozy, routines
        "Moody Monday",        // Vibe checks, comfort media, venting
        "Tasty Tuesday",       // Food crimes, snacks, kitchen debates
        "Would You Wednesday", // Grounded "This or That" choices
        "Throwback Thursday",  // Nostalgia, old tech, childhood memories
        "Fave Friday",         // Recommendations, hype, weekend plans
        "Silly Saturday"       // Absurd debates, chaos, funny stories
    ];

    return { theme: vibes[today.getDay()] };
}

async function main() {
    let history = [];
    if (fs.existsSync(CONFIG.HISTORY_FILE)) {
        try { 
            history = JSON.parse(fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8')); 
        } catch (e) { history = []; }
    }

    if (history.length > 0 && history[0].date === todayFormatted) {
        console.log("Question already generated for today.");
        return;
    }

    const context = await getNaturalContext();
    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
    
    // Pass recent history to avoid topic repetition
    const recentQuestions = history.slice(0, 30).map(h => h.question).join(" | ");

    const prompt = `Generate one "Question of the Day" for a Twitch/Discord community (Techies, Gamers, LGBTQ+ friendly, Internet culture fans).

    Current Theme: ${context.theme}

    STRICT STYLE RULES:
    1. NO "LIFE-IS-A-GAME" METAPHORS: Do not use terms like "buffs," "XP," "boss fights," or "leveling up." 
    2. BE GROUNDED: Ask about real experiences, preferences, or opinions (e.g., tech habits, food takes, media nostalgia).
    3. NO CORPORATE CHEESE: Do not start with "Happy [Theme]!" or use preachy self-help language. Keep it casual, like a friend in a group chat.
    4. VARIETY: Ensure the topic rotates between: Tech, Internet Culture, Food, Media (Movies/TV/Music), and Lifestyle.
    5. QUANTIFIABLE: Make it easy for people to answer with 1-2 sentences.

    THEME GUIDELINES:
    - Sleepy Sunday: Focus on comfort and slow routines.
    - Moody Monday: Focus on "vibe" and comfort media.
    - Tasty Tuesday: Focus on controversial or specific food opinions.
    - Would You Wednesday: Focus on real-world "This or That" (e.g., tech trade-offs).
    - Fave Friday: Focus on recommending hidden gems or weekend plans.
    - Silly Saturday: Focus on absurd, funny, but grounded debates.
    - Holidays: Focus on the culture/fandom of that specific holiday.

    PREVIOUS QUESTIONS (DO NOT REPEAT): ${recentQuestions}

    Return ONLY the question text.`;

    for (const modelName of CONFIG.MODELS) {
        try {
            console.log(`Attempting Question with ${modelName}...`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            let questionText = result.response.text().trim().replace(/["']/g, "");

            if (!questionText || questionText.length < 5) throw new Error("Invalid response from AI");

            // Save to history and local file
            fs.writeFileSync(CONFIG.SAVE_FILE, questionText);
            history.unshift({ date: todayFormatted, question: questionText });
            fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(history, null, 2));

            if (!CONFIG.DISCORD_URL) {
                console.warn("No Discord URL found. Skipping post.");
                return;
            }

            const payload = {
                embeds: [{
                    title: `📅 Question of the Day — ${todayFormatted}`,
                    color: 0x3498db,
                    fields: [{ name: "\u200B", value: `**${questionText}**`, inline: false }],
                    footer: { text: "Reply to this message to answer!" }
                }]
            };

            await fetch(CONFIG.DISCORD_URL, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify(payload) 
            });

            console.log("Success! Posted to Discord.");
            return; 
        } catch (err) {
            console.warn(`⚠️ ${modelName} failed: ${err.message}`);
            // Wait 10s if rate limited
            if (err.message.includes("429")) await new Promise(r => setTimeout(r, 10000));
        }
    }
}

main().catch(err => {
    console.error("Critical Failure:", err);
    process.exit(1);
});
