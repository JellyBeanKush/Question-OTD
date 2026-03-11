import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import fs from 'fs';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    DISCORD_URL: process.env.DISCORD_WEBHOOK_URL,
    SAVE_FILE: 'current_fact.txt',
    HISTORY_FILE: 'used_facts.json',
    // 2026 Active Models - Ordered by Priority
    MODELS: [
        "gemini-3.1-flash-lite-preview", 
        "gemini-3-flash-preview",      
        "gemini-2.5-flash"             
    ]
};

const options = { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' };
const displayDate = new Date().toLocaleDateString('en-US', options);
const todayISO = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Los_Angeles' });

// Fetches a truly random topic to ensure we never run out of variety
async function getRandomTopic() {
    try {
        const response = await fetch("https://en.wikipedia.org/api/rest_v1/page/random/summary");
        const data = await response.json();
        return { title: data.title, url: data.content_urls.desktop.page };
    } catch (e) {
        console.error("Wiki Random Fetch Failed:", e);
        return { title: "Surprise me", url: "https://en.wikipedia.org" };
    }
}

async function postToDiscord(factData) {
    // DRY_RUN check for testing: Run with "DRY_RUN=true node bot.mjs"
    if (process.env.DRY_RUN === 'true') {
        console.log("\n--- DRY RUN: WOULD POST TO DISCORD ---");
        console.log(`Title: ${factData.eventTitle}\nFact: ${factData.description}\nSource: ${factData.sourceUrl}\n`);
        return;
    }

    const discordPayload = {
        embeds: [{
            title: `🧠 Fact of the Day : ${displayDate}`,
            description: `${factData.description}\n\n[SOURCE](${factData.sourceUrl})`,
            color: 0x3498db, 
            image: { url: factData.imageUrl }
        }]
    };
    
    const response = await fetch(CONFIG.DISCORD_URL, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(discordPayload) 
    });

    if (!response.ok) console.error("Discord Post Failed:", await response.text());
}

async function main() {
    // Skip if already posted today
    if (fs.existsSync(CONFIG.SAVE_FILE)) {
        try {
            const saved = JSON.parse(fs.readFileSync(CONFIG.SAVE_FILE, 'utf8'));
            if (saved.generatedDate === todayISO) {
                console.log("Already posted today. Skipping.");
                return;
            }
        } catch (e) {}
    }

    let historyData = [];
    if (fs.existsSync(CONFIG.HISTORY_FILE)) {
        try { historyData = JSON.parse(fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8')); } catch (e) {}
    }

    const usedTitles = historyData.slice(0, 100).map(h => h.eventTitle.toLowerCase());
    const wikiTopic = await getRandomTopic();

    const prompt = `Task: Provide a mind-blowing fact about: "${wikiTopic.title}".
    Tone: Conversational ("Did you know..."). Under 40 words.
    
    JSON ONLY: {
      "eventTitle": "${wikiTopic.title}",
      "description": "The fact", 
      "sourceUrl": "${wikiTopic.url}",
      "imageUrl": "A relevant .jpg/.png image link related to this specific topic"
    }`;
    
    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);

    for (const modelName of CONFIG.MODELS) {
        try {
            console.log(`Attempting with ${modelName}...`);
            const model = genAI.getGenerativeModel({ 
                model: modelName,
                generationConfig: { responseMimeType: "application/json" }
            });

            const result = await model.generateContent(prompt);
            const rawText = result.response.text().match(/\{[\s\S]*\}/)[0];
            const factData = JSON.parse(rawText);

            // Logic gate for duplicates
            if (usedTitles.includes(factData.eventTitle.toLowerCase())) {
                throw new Error(`Duplicate topic: ${factData.eventTitle}`);
            }
            
            factData.generatedDate = todayISO;
            fs.writeFileSync(CONFIG.SAVE_FILE, JSON.stringify(factData, null, 2));
            historyData.unshift(factData);
            fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(historyData, null, 2));
            
            await postToDiscord(factData);
            console.log(`Success! Posted fact about ${factData.eventTitle}.`);
            return; 
        } catch (err) {
            console.warn(`⚠️ ${modelName} failed: ${err.message}`);
            // Wait 3 seconds before trying the next model to avoid spamming the API
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
}

main().catch(err => {
    console.error("\n💥 Bot crashed:", err.message);
    process.exit(1);
});
