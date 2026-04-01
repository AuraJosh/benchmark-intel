import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import * as cheerio from 'cheerio';

async function test() {
    console.log("Launching...");
    const executablePath = await chromium.executablePath();
    const browser = await puppeteer.launch({
        args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
        defaultViewport: chromium.defaultViewport,
        executablePath,
        headless: 'new',
    });
    
    const page = await browser.newPage();
    const url = 'https://planningaccess.york.gov.uk/online-applications/applicationDetails.do?activeTab=contacts&keyVal=T961M7SJIOW00';
    console.log("Navigating to", url);
    await page.goto(url, { waitUntil: 'networkidle2' });
    
    const html = await page.content();
    console.log("HTML length:", html.length);
    
    const $ = cheerio.load(html);
    const textOut = [];
    $('table, .tabcontainer').each((i, el) => {
        textOut.push($(el).text().replace(/\s+/g, ' ').trim());
    });
    console.log("Extracted text:");
    console.log(textOut.join('\n---\n'));
    
    await browser.close();
}

test().catch(console.error);
