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

    Task: Generate ONE highly engaging, conversational "Question of the Day" for a lively adult Discord community. 
    
    HIGH-ENGAGEMENT COMMANDMENTS:
    1. LOW FRICTION: Keep it under 20 words. No long setups, no complicated conditions, and absolutely no textbook or essay-like phrasing. It must be readable in 2 seconds.
    2. SPARK DEBATES & LAUGHTER: Ask about petty arguments, hilarious red flags, embarrassing adult realities, or playful "call outs." 
    3. MATURITY LEVEL: This is a community of grown adults. You are fully encouraged to be cheeky, a little risqué, edgy, or slightly provocative. Drop the sanitized corporate filter completely.
    4. VARIETY: Rotate between Gaming, Tech, Internet Culture, Movies, and LGBT topics.
    5. NO METAPHORS: No "buffs," "XP," "leveling up," or "stats" talk. No spoilers for story endings.

    EXAMPLES OF THE EXACT STYLE DESIRED:
    - "What's a minor red flag in a person that you secretly find kind of hot?"
    - "What is your absolute most toxic, gatekeep-y video game opinion?"
    - "Would you rather your entire group chat see your camera roll, or your banking app?"
    - "What is something that is completely legal, but feels illegal to do?"

    Return ONLY a raw JSON object matching this schema:
    {
      "question": "The snappy, risqué question here.",
      "specificTopic": "A 1-2 word description of the exact core subject to prevent future duplicates"
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
