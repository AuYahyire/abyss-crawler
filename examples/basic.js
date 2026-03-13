import Abyss from '../index.js';

// 1. Initialize the engine
const crawler = new Abyss({
    maxConcurrency: 20, // Max concurrent requests
    adaptive: true,     // Automatically slow down if the server struggles
    dashboard: true     // Show the CLI UI
});

// 2. Define what to do with each page found
crawler.onPage(async ({ url, html, $ }) => {
    // This function is called for every unique page the crawler discovers.
    // '$' is Cheerio, ready to be used like jQuery.
    
    const title = $('title').text() || 'No Title';
    const textLength = $('body').text().length;

    // Here you would typically save to a database, file, etc.
    // For this basic example, we do nothing to let the dashboard render cleanly.
});

// 3. Start crawling
const targetUrl = process.argv[2] || 'https://example.com';

crawler.start(targetUrl)
    .then(() => console.log('Crawling finished successfully!'))
    .catch(err => console.error('Crawler failed:', err));
