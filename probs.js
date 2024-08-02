const puppeteer = require('puppeteer');

async function getPlayerProbs(url) {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    await page.goto(url);
    await page.waitForSelector('.pct');

    const divContent = await page.$eval('.pct', div => div.innerText);
    await browser.close();

    return divContent;
}

module.exports = getPlayerProbs;
