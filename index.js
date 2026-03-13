import * as cheerio from 'cheerio';
import logUpdate from 'log-update';

export default class Abyss {
    constructor(options = {}) {
        this.maxConcurrency = options.maxConcurrency || 40;
        this.adaptive = options.adaptive !== false; // Default: true
        this.respectRobots = options.robots !== false; // Default: true
        this.showDashboard = options.dashboard !== false; // Default: true
        this.ignorePatterns = options.ignorePatterns || [
            ".pdf", ".jpg", ".png", ".jpeg", ".gif", ".svg", ".css", ".js", ".mp4",
            "wp-content", "wp-includes", "#", "?v="
        ];
        
        this.onPageHandler = null;
        
        // Internal State
        this.discoveredUrls = new Set();
        this.urlsToVisit = [];
        this.activeWorkers = 0;
        this.pagesProcessed = 0;
        this.errorCount = 0;
        
        // Adaptive Engine State
        this.currentConcurrency = 3;
        this.recentLatencies = [];
        this.avgLatency = 0;
        this.isPaused = false;
        this.serverStatus = "✅ Stable";
        this.lastUrl = "Initializing...";
        this.baseUrl = null;
        this.disallows = [];
        this.crawlDelay = 0;
    }

    /**
     * Register a callback to process each discovered page.
     * @param {Function} handler async ({ url, html, $ }) => {}
     */
    onPage(handler) {
        this.onPageHandler = handler;
    }

    normalizeUrl(urlStr, baseStr) {
        try {
            const urlObj = new URL(urlStr, baseStr);
            urlObj.hash = ''; 
            return urlObj.href.replace(/\/$/, ''); 
        } catch (e) {
            return null;
        }
    }

    shouldIgnore(urlStr) {
        try {
            const path = new URL(urlStr).pathname;
            const matchesDisallow = this.disallows.some(d => path.startsWith(d));
            const matchesBase = this.ignorePatterns.some(pattern => urlStr.includes(pattern));
            return matchesDisallow || matchesBase;
        } catch { return true; }
    }

    async parseRobotsTxt(baseUrl) {
        if (!this.respectRobots) return;
        try {
            const robotsUrl = `${baseUrl}/robots.txt`;
            const res = await fetch(robotsUrl, { 
                headers: { 'User-Agent': 'AbyssBot/1.0' },
                signal: AbortSignal.timeout(5000)
            });
            
            if (res.ok) {
                const text = await res.text();
                const lines = text.split('\n');
                let isUserAgentStar = false;

                for (let line of lines) {
                    line = line.trim().toLowerCase();
                    if (line.startsWith('user-agent:')) {
                        isUserAgentStar = line.includes('*') || line.includes('abyssbot');
                    } else if (isUserAgentStar) {
                        if (line.startsWith('disallow:')) {
                            const path = line.split(':')[1].trim();
                            if (path) this.disallows.push(path);
                        } else if (line.startsWith('crawl-delay:')) {
                            this.crawlDelay = parseFloat(line.split(':')[1].trim()) * 1000;
                        }
                    }
                }
            }
        } catch (e) {
            // Silently ignore robots.txt errors
        }
    }

    async fetchHtml(url) {
        const startTime = Date.now();
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 AbyssBot/1.0',
                'Accept': 'text/html,application/xhtml+xml',
                'Connection': 'keep-alive'
            },
            signal: AbortSignal.timeout(15000) 
        });

        const latency = Date.now() - startTime;

        if (response.status === 429) throw new Error(`HTTP_429`);
        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('text/html')) throw new Error(`Not HTML content-type`);

        const html = await response.text();
        return { html, latency };
    }

    updateUI() {
        if (!this.showDashboard) return;
        const frame = [
            `📡 Target:         ${this.baseUrl}`,
            `🛑 Robots.txt:     ${this.disallows.length} rules | Delay: ${this.crawlDelay ? (this.crawlDelay/1000)+'s' : 'No'}`,
            `--------------------------------------------------`,
            `📈 Server Health:  ${this.serverStatus}`,
            `⚡ Active Threads: ${this.activeWorkers} / ${this.currentConcurrency} (Max: ${this.maxConcurrency})`,
            `⏱️  Avg Latency:    ${Math.round(this.avgLatency)}ms`,
            `--------------------------------------------------`,
            `📊 Processed:      ${this.pagesProcessed}`,
            `🔍 Discovered:     ${this.discoveredUrls.size}`,
            `⏳ Queue (BFS):    ${this.urlsToVisit.length}`,
            `❌ Errors:         ${this.errorCount}`,
            `--------------------------------------------------`,
            `🌐 Fetching:       ${this.lastUrl}`
        ];
        logUpdate(frame.join('\n'));
    }

    adjustConcurrency() {
        if (!this.adaptive || this.crawlDelay > 0 || this.recentLatencies.length < 5) return;

        this.avgLatency = this.recentLatencies.reduce((a, b) => a + b, 0) / this.recentLatencies.length;
        this.recentLatencies = [];

        if (this.avgLatency < 800 && this.currentConcurrency < this.maxConcurrency) {
            this.currentConcurrency = Math.min(this.currentConcurrency + 2, this.maxConcurrency);
            this.serverStatus = `🟢 Fast (Accelerating)`;
        } else if (this.avgLatency > 2000) {
            this.currentConcurrency = Math.max(Math.floor(this.currentConcurrency / 2), 2);
            this.serverStatus = `⚠️ Struggling (Braking)`;
        } else {
            this.serverStatus = `✅ Stable`;
        }
    }

    /**
     * Start the crawling process
     * @param {string} startUrl The entry point URL
     */
    async start(startUrl) {
        try {
            this.baseUrl = new URL(startUrl).origin;
        } catch (e) {
            throw new Error('Invalid Starting URL.');
        }

        if (this.showDashboard) {
            console.log(`🚀 Starting Abyss Crawler at: ${startUrl}\n`);
        }
        
        await this.parseRobotsTxt(this.baseUrl);
        
        const normalizedStartUrl = this.normalizeUrl(startUrl, this.baseUrl);
        if (!normalizedStartUrl || this.shouldIgnore(normalizedStartUrl)) {
            throw new Error('Starting URL is invalid or blocked by robots.txt.');
        }

        this.discoveredUrls.add(normalizedStartUrl);
        this.urlsToVisit.push(normalizedStartUrl);
        
        if (this.crawlDelay > 0) {
            this.currentConcurrency = 1; // Strict compliance
        } else {
            this.currentConcurrency = Math.min(3, this.maxConcurrency); // Soft start
        }

        let uiInterval;
        if (this.showDashboard) {
            uiInterval = setInterval(() => this.updateUI(), 1000 / 15); // 15 FPS
        }

        await new Promise((resolve) => {
            const processNext = async () => {
                if (this.urlsToVisit.length === 0 && this.activeWorkers === 0) {
                    resolve();
                    return;
                }

                if (this.urlsToVisit.length === 0 || this.activeWorkers >= this.currentConcurrency || this.isPaused) {
                    return;
                }

                const currentUrl = this.urlsToVisit.shift();
                this.activeWorkers++;
                
                this.lastUrl = currentUrl.length > 60 ? currentUrl.substring(0, 57) + '...' : currentUrl;

                try {
                    const { html, latency } = await this.fetchHtml(currentUrl);
                    this.pagesProcessed++;
                    
                    this.recentLatencies.push(latency);
                    if (this.recentLatencies.length >= 10) this.adjustConcurrency();

                    const $ = cheerio.load(html);
                    
                    // Fire User Hook
                    if (this.onPageHandler) {
                        try {
                            await this.onPageHandler({ url: currentUrl, html, $ });
                        } catch (handlerErr) {
                            // Ignore user-level errors so they don't crash the crawler
                        }
                    }

                    // Deep link extraction (BFS)
                    const links = [];
                    $('a').each((i, el) => {
                        const href = $(el).attr('href');
                        if (href) links.push(href);
                    });

                    for (const href of links) {
                        const nextUrl = this.normalizeUrl(href, currentUrl);
                        if (nextUrl && nextUrl.startsWith(this.baseUrl)) {
                            if (!this.discoveredUrls.has(nextUrl) && !this.shouldIgnore(nextUrl)) {
                                this.discoveredUrls.add(nextUrl);
                                this.urlsToVisit.push(nextUrl);
                            }
                        }
                    }
                } catch (error) {
                    if (error.message === 'HTTP_429') {
                        this.serverStatus = `🛑 ERROR 429: SPAM DETECTED (Pausing 5s)`;
                        this.isPaused = true;
                        this.urlsToVisit.unshift(currentUrl); // Re-queue
                        this.currentConcurrency = Math.max(Math.floor(this.currentConcurrency / 3), 1);
                        setTimeout(() => { this.isPaused = false; }, 5000);
                    } else {
                        this.errorCount++;
                    }
                } finally {
                    this.activeWorkers--;
                    
                    if (this.crawlDelay > 0) {
                        setTimeout(processNext, this.crawlDelay);
                    } else {
                        processNext();
                    }
                }
            };

            // Dispatcher Loop
            const dispatcher = setInterval(() => {
                if (this.urlsToVisit.length === 0 && this.activeWorkers === 0) {
                    clearInterval(dispatcher);
                    resolve();
                }
                while (!this.isPaused && this.activeWorkers < this.currentConcurrency && this.urlsToVisit.length > 0) {
                    processNext();
                }
            }, 50);
        });

        if (this.showDashboard) {
            clearInterval(uiInterval);
            this.updateUI(); // Final render
            console.log(`\n\n✅ Crawl Completed. Total unique pages processed: ${this.pagesProcessed}`);
        }
    }
}
