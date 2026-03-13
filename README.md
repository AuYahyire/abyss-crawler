# 🕷️ Abyss Crawler Engine

An ultra-fast, zero-browser-footprint web crawler for Node.js, designed with a built-in Adaptive Latency Engine to prevent server overload and a stunning CLI dashboard.

## 📊 Live Dashboard Preview

Abyss comes with a built-in, non-scrolling terminal UI that updates at 15 FPS, allowing you to monitor the health of your crawl in real-time.

```text
🚀 Starting Abyss Crawler at: https://example.com

📡 Target:         https://example.com
🛑 Robots.txt:     33 rules | Delay: No
--------------------------------------------------
📈 Server Health:  🟢 Fast (Accelerating)
⚡ Active Threads: 24 / 40 (Max: 40)
⏱️  Avg Latency:    142ms
--------------------------------------------------
📊 Processed:      1248
🔍 Discovered:     3102
⏳ Queue (BFS):    1854
❌ Errors:         2
--------------------------------------------------
🌐 Fetching:       https://example.com/products/electronics/smartphones...
```

> **Pro Tip:** If you take a real screenshot, you can replace this block with:
> `![Abyss Dashboard](path/to/your/screenshot.png)`

## 🚀 Why Abyss?

Unlike standard crawling libraries, **Abyss does not use Puppeteer or Playwright**. It relies purely on the native Node.js 18+ `fetch` API with `keep-alive` TCP connections. This results in **zero RAM bloating** and instant network responses.

**Key Features:**
*   **🏎️ Blazing Fast (Zero-Browser):** Pure HTTP GET requests parsed instantly via Cheerio.
*   **🧠 Adaptive Congestion Engine:** Abyss "feels" the target server. If the server responds in <800ms, it accelerates (up to your max concurrency). If the server struggles (>2000ms), it automatically brakes and halves the concurrency to avoid causing a DoS.
*   **🤖 Smart API Rate Limiting Hook:** Designed to work flawlessly with OpenAI or ElevenLabs. If you throw an `HTTP_429` error inside your processing hook, Abyss pauses the entire fleet for 5 seconds and queues the URL back.
*   **📊 15-FPS CLI Dashboard:** A beautiful, non-scrolling terminal UI built with `log-update` to monitor your crawler's health in real-time.
*   **🛑 Native robots.txt support:** Automatically parses and respects `Disallow` and `Crawl-delay` rules before starting.

## 📦 Installation

```bash
npm install abyss-crawler
```
*(Requires Node.js 18+)*

## 🛠️ Usage

### Basic Example (Data Scraping)

```javascript
import Abyss from 'abyss-crawler';

const crawler = new Abyss({
    maxConcurrency: 20, 
    adaptive: true,     // Let the engine accelerate/brake automatically
    dashboard: true     // Show the CLI Dashboard
});

crawler.onPage(async ({ url, html, $ }) => {
    // Write your logic here!
    const title = $('title').text();
    console.log(`Found: ${title} at ${url}`);
});

crawler.start('https://example.com');
```

### Advanced Example (AI Knowledge Base - Strict Limits)

When sending scraped data to OpenAI or ElevenLabs APIs, you don't want adaptive speed; you want **strict** low concurrency to avoid API bans.

```javascript
const crawler = new Abyss({
    maxConcurrency: 4,  // Strict limit for ElevenLabs/OpenAI 
    adaptive: false,    // Turn off auto-acceleration
});

crawler.onPage(async ({ url, html, $ }) => {
    const text = $('body').text();
    
    try {
        await myAiApi.process(text);
    } catch (error) {
        // If the AI API rate limits you, just throw HTTP_429.
        // Abyss will automatically pause all threads for 5 seconds, 
        // put this URL back in the queue, and resume safely!
        if (error.status === 429) throw new Error('HTTP_429'); 
    }
});
```

## ⚙️ Configuration Options

When instantiating `new Abyss(options)`, you can pass:

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `maxConcurrency` | Integer | `40` | Maximum simultaneous connections allowed. |
| `adaptive` | Boolean | `true` | Enables the latency-based speed control. |
| `robots` | Boolean | `true` | Fetches and respects `robots.txt` rules. |
| `dashboard` | Boolean | `true` | Shows the live UI. Set to `false` for silent cronjobs. |
| `ignorePatterns`| Array | `['.pdf', '.jpg'...]`| Array of strings. URLs containing these will be skipped. |

## License
MIT
