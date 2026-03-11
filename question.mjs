import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    DISCORD_URL: process.env.DISCORD_WEBHOOK_URL,
    MODEL_NAME: "gemini-3.1-flash-lite-preview"
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

// Fixed to send a Rich Embed instead of raw text
async function postToDiscord(dateTitle, questionText) {
    if (!CONFIG.DISCORD_URL) throw new Error("Missing DISCORD_WEBHOOK_URL environment variable.");
    
    const payload = {
        embeds: [{
            title: `📅 Question of the Day — ${dateTitle}`,
            color: 0x3498db, // That specific blue color
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

    const prompt = `Today is ${dateKey}. 
    Daily Vibe: ${dayName}.
    Special Event: ${specialEvent ? specialEvent : "None"}.

    Task: Generate ONE engaging "Question of the Day" for a Discord community.
    
    STRICT RULES:
    1. If there is a Special Event, the question MUST be about that.
    2. If no Special Event, the question MUST match the vibe of "${dayName}".
    3. NO LIFE-AS-A-GAME METAPHORS: No "buffs," "XP," or "leveling up" talk.
    4. Topic Variety: Rotate between Gaming, Tech, Internet Culture, Movies/Media, and LGBT topics.
    5. Format: Return ONLY the question. No intros, no "Would You Wednesday!" prefix.
    6. No spoilers for any story endings.`;

    try {
        console.log(`Generating: ${specialEvent || dayName}...`);
        const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
        const model = genAI.getGenerativeModel({ model: CONFIG.MODEL_NAME }, { apiVersion: 'v1beta' });
        
        const result = await model.generateContent(prompt);
        const question = result.response.text().trim().replace(/["']/g, "");

        // Pass the date and the question separately to the new function
        await postToDiscord(fullDate, question);
        console.log("Successfully posted!");

    } catch (err) {
        console.error("💥 Execution Failed:", err.message);
        process.exit(1);
    }
}

main();
