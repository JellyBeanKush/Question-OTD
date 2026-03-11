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

// Add any custom community holidays here
const unofficialHolidays = {
    "February 27": "Pokémon Day",
    "March 10": "Mario Day",
    "May 4": "Star Wars Day",
    "May 9": "Goku Day",
    "November 14": "Fallout Reclamation Day",
    "September 19": "Talk Like a Pirate Day"
};

async function postToDiscord(content) {
    if (!CONFIG.DISCORD_URL) throw new Error("Missing DISCORD_WEBHOOK_URL environment variable.");
    
    const response = await fetch(CONFIG.DISCORD_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
    });

    if (!response.ok) throw new Error(`Discord Error: ${await response.text()}`);
}

async function main() {
    const now = new Date();
    const dateKey = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' });
    const dayName = dayVibes[now.getDay()];
    
    // Check if today is a listed unofficial holiday
    const specialEvent = unofficialHolidays[dateKey] || null;

    const prompt = `Today is ${dateKey}. 
    Daily Vibe: ${dayName}.
    Special Event: ${specialEvent ? specialEvent : "None"}.

    Task: Generate ONE engaging "Question of the Day" for a Discord community.
    
    STRICT RULES:
    1. If there is a Special Event (like ${specialEvent}), the question MUST be about that.
    2. If no Special Event, the question MUST match the vibe of "${dayName}".
    3. Topic Variety: Rotate between Gaming, Tech, Internet Culture, Movies/Media, and LGBT topics.
    4. Format: No intro text, just the question. Keep it under 50 words.
    5. No spoilers for any story endings.`;

    try {
        console.log(`Generating: ${specialEvent || dayName}...`);
        const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
        const model = genAI.getGenerativeModel({ model: CONFIG.MODEL_NAME }, { apiVersion: 'v1beta' });
        
        const result = await model.generateContent(prompt);
        const question = result.response.text().trim();

        const header = specialEvent ? `🎉 **${specialEvent} Special!**` : `**${dayName} | ${dateKey}**`;
        await postToDiscord(`${header}\n${question}`);
        console.log("Successfully posted!");

    } catch (err) {
        console.error("💥 Execution Failed:", err.message);
        process.exit(1);
    }
}

main();
