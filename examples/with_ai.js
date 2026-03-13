import Abyss from '../index.js';
import fs from 'fs';

// To run this example you need OpenAI installed: npm install openai dotenv
// import OpenAI from 'openai';
// import dotenv from 'dotenv';
// dotenv.config();

/**
 * This example shows how to combine Abyss with an external AI API (like OpenAI)
 * while maintaining safe concurrency limits.
 */

// 1. Initialize the engine with STRICT concurrency to protect the AI API limits
const crawler = new Abyss({
    maxConcurrency: 4, // Important: OpenAI and ElevenLabs usually cap at 3-5 concurrent requests per tier
    adaptive: false,   // Turn off adaptive latency, we want strict 4-thread processing
    dashboard: true
});

// 2. Define the Hook
crawler.onPage(async ({ url, html, $ }) => {
    // Remove useless parts of the DOM
    ['nav', 'footer', 'script', 'style'].forEach(sel => $(sel).remove());
    
    const textContent = $('body').text().replace(/\s+/g, ' ').trim();
    
    // Skip if page is too short
    if (textContent.length < 500) return;

    /*
    // --- Mock AI processing ---
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "Summarize this page content for a knowledge base." },
                { role: "user", content: textContent.substring(0, 10000) }
            ]
        });
        
        const markdown = response.choices[0].message.content;
        fs.writeFileSync(`./dataset/${encodeURIComponent(url)}.md`, markdown);
        
    } catch (error) {
        // If we get an API Rate Limit (429), we throw it.
        // Abyss Engine will catch 'HTTP_429', pause the whole system for 5 seconds, 
        // and put the URL back in the queue automatically!
        if (error.status === 429) {
            throw new Error('HTTP_429'); 
        }
    }
    */
});

// 3. Run
const targetUrl = process.argv[2] || 'https://example.com';
console.log('Running AI integration example...');
crawler.start(targetUrl);
