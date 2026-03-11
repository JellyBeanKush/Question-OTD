import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import fs from 'fs';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    DISCORD_URL: process.env.DISCORD_WEBHOOK_URL,
    SAVE_FILE: 'current_fact.txt',
    HISTORY_FILE: 'used_facts.json',
    MODELS: [
        "gemini-3.1-flash-lite-preview", 
        "gemini-3-flash-preview", 
        "gemini-2.5-flash"
    ]
};

const options = { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' };
const displayDate = new Date().toLocaleDateString('en-US', options);
const todayISO = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Los_Angeles' });

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
    if (!CONFIG.DISCORD_URL) {
        throw new Error("Discord Webhook URL is missing. Check your GitHub Actions Secrets and ENV block.");
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

    if (!response.ok) throw new Error(`Discord rejected the post: ${await response.text()}`);
}

async function main() {
    if (fs.existsSync(CONFIG.SAVE_FILE)) {
        try {
            const saved = JSON.parse(fs.readFileSync(CONFIG.SAVE_FILE, 'utf8'));
            if (saved.generatedDate === todayISO) return;
        } catch (e) {}
    }

    let historyData = [];
    if (fs.existsSync(CONFIG.HISTORY_FILE)) {
        try { historyData = JSON.parse(fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8')); } catch (e) {}
    }

    const usedTitles = historyData.slice(0, 100).map(h => h.eventTitle.toLowerCase());
    const wikiTopic = await getRandomTopic();

    const prompt = `Task: Give a mind-blowing, short fact about: "${wikiTopic.title}".
    Tone: Fun, conversational. Under 40 words.
    JSON ONLY: {
      "eventTitle": "${wikiTopic.title}",
      "description": "The fact", 
      "sourceUrl": "${wikiTopic.url}",
      "imageUrl": "Direct .jpg/.png link from Wikipedia related to this topic"
    }`;
    
    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
    let factData = null;

    // STEP 1: Generate the Fact (Isolating the AI call)
    for (const modelName of CONFIG.MODELS) {
        try {
            console.log(`Attempting to generate with ${modelName}...`);
            const model = genAI.getGenerativeModel({ model: modelName }, { apiVersion: 'v1beta' });
            const result = await model.generateContent(prompt);
            const rawText = result.response.text().match(/\{[\s\S]*\}/)[0];
            factData = JSON.parse(rawText);

            if (usedTitles.includes(factData.eventTitle.toLowerCase())) {
                throw new Error(`Duplicate: ${factData.eventTitle}`);
            }
            
            console.log(`Success! Generated fact about ${factData.eventTitle}.`);
            break; // Exit the loop on success
        } catch (err) {
            console.warn(`⚠️ ${modelName} AI generation failed: ${err.message}`);
            factData = null; 
            await new Promise(res => setTimeout(res, 2000));
        }
    }

    if (!factData) {
        console.error("💥 All Gemini models failed. Aborting.");
        process.exit(1);
    }

    // STEP 2: Save the Fact
    factData.generatedDate = todayISO;
    fs.writeFileSync(CONFIG.SAVE_FILE, JSON.stringify(factData, null, 2));
    historyData.unshift(factData);
    fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(historyData, null, 2));

    // STEP 3: Post to Discord (Isolating the webhook call)
    try {
        console.log("Attempting to post to Discord...");
        await postToDiscord(factData);
        console.log("Success! Posted to Discord.");
    } catch (discordErr) {
        console.error(`💥 Discord Post Failed: ${discordErr.message}`);
        process.exit(1);
    }
}

main().catch(err => {
    console.error("\n💥 Uncaught Error:", err.message);
    process.exit(1);
});
