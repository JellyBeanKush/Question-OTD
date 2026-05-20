import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    DISCORD_URL: process.env.DISCORD_WEBHOOK_URL,
    MODEL_NAME: "gemini-3.1-flash-lite-preview",
    HISTORY_FILE: path.join(process.cwd(), 'qotd_history.json')
};

const dayVibes = {
    0: "Sleepy Sunday",
    1: "Moody Monday",
    2: "Tasty Tuesday",
    3: "Would You Wednesday",
    4: "Thirsty Thursday",
    5: "Fave Friday",
    6: "Silly Saturday"
};

const unofficialHolidays = {
    "February 27": "Pokémon Day",
    "March 10": "Mario Day",
    "May 4": "Star Wars Day",
    "May 9": "Goku Day",
    "November 14": "Fallout Reclamation Day",
    "September 19": "Talk Like a Pirate Day"
};

async function postToDiscord(dateTitle, questionText) {
    if (!CONFIG.DISCORD_URL) throw new Error("Missing DISCORD_WEBHOOK_URL environment variable.");
    
    const payload = {
        embeds: [{
            title: `📅 Question of the Day — ${dateTitle}`,
            color: 0x3498db,
            description: `**${questionText}**`,
            footer: { text: "Reply to this message to answer!" }
        }]
    };

    const response = await fetch(CONFIG.DISCORD_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error(`Discord Error: ${await response.text()}`);
}

async function main() {
    const now = new Date();
    const dateKey = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' });
    const fullDate = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' });
    const dayName = dayVibes[now.getDay()];
    
    const specialEvent = unofficialHolidays[dateKey] || null;

    // 1. Load history to find out what we've already asked
    let historyData = [];
    if (fs.existsSync(CONFIG.HISTORY_FILE)) {
        try {
            historyData = JSON.parse(fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8'));
        } catch {
            console.warn("[History] Resetting file.");
        }
    }

    // Extract past questions and general topics for the exclusion filter
    const recentQuestions = historyData.slice(0, 100).map(h => h.question);
    const recentTopics = historyData.slice(0, 10).map(h => h.specificTopic);

    const prompt = `Today is ${dateKey}. 
    Daily Vibe: ${dayName}.
    Special Event: ${specialEvent ? specialEvent : "None"}.

    Task: Generate ONE highly engaging, completely unique "Question of the Day" for an adult Discord community of gamers and tech/internet culture nerds.
    
    STRICT COMPLIANCE RULES:
    1. If there is a Special Event, the question MUST be about that.
    2. If no Special Event, the question MUST match the vibe of "${dayName}".
    3. NO LIFE-AS-A-GAME METAPHORS: Absolutely no "buffs," "XP," "leveling up," or "stats" talk.
    4. Topic Variety: Rotate between Gaming, Tech, Internet Culture, Movies/Media, and LGBT topics. 
    5. No spoilers for any story endings.
    6. TONE & COMPLEXITY: Keep it simple, fun, punchy, and conversational. Avoid massive, complex "would you rather" conditions. Make it easy to read and instantly answerable.
    7. MATURITY LEVEL: This is a community of grown adults. You are encouraged to be mature, cheeky, a little risqué, or slightly provocative where appropriate. Do not make it corporate, sanitized, or squeaky clean.
    8. ANTI-REPETITION CRITERIA: 
       - DO NOT use or rephrase any of these recent questions: ${recentQuestions.join(" | ")}
       - DO NOT focus on these specific angles or core subjects: ${recentTopics.join(", ")}

    Return ONLY a raw JSON object matching this schema:
    {
      "question": "The actual question text here. No intro text, no vibe titles.",
      "specificTopic": "A 1-2 word description of the exact core subject or item asked about to help filter future runs"
    }`;

    try {
        console.log(`Generating: ${specialEvent || dayName}...`);
        const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
        // Using stable generation config for reliable structured JSON output
        const model = genAI.getGenerativeModel({ 
            model: CONFIG.MODEL_NAME,
            generationConfig: { responseMimeType: "application/json" }
        });
        
        const result = await model.generateContent(prompt);
        const data = JSON.parse(result.response.text());
        
        const question = data.question.trim().replace(/["']/g, "");

        // 3. Save new entry to history file
        const historyEntry = {
            date: fullDate,
            vibe: dayName,
            specialEvent: specialEvent,
            specificTopic: data.specificTopic.toLowerCase().trim(),
            question: question
        };
        
        historyData.unshift(historyEntry);
        fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(historyData.slice(0, 200), null, 2), 'utf8');

        // Post to Discord
        await postToDiscord(fullDate, question);
        console.log("Successfully posted and saved history!");

    } catch (err) {
        console.error("💥 Execution Failed:", err.message);
        process.exit(1);
    }
}

main();
