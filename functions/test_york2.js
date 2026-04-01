import axios from 'axios';
import * as cheerio from 'cheerio';

async function test() {
    const url = 'https://planningaccess.york.gov.uk/online-applications/applicationDetails.do?activeTab=contacts&keyVal=T961M7SJIOW00';
    console.log("Navigating to", url);
    const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    
    const $ = cheerio.load(data);
    const textOut = [];
    $('.tabcontainer').each((i, el) => {
        textOut.push($(el).text().replace(/\s+/g, ' ').trim());
    });
    console.log("Extracted HTML from tabcontainer:");
    console.log($('.tabcontainer').html());
}

test().catch(console.error);
