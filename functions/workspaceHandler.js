import admin from 'firebase-admin';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import * as cheerio from 'cheerio';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import './admin.js';

const BASE_URL = 'https://planningaccess.york.gov.uk/online-applications';

export const createProjectWorkspace = async (projectId, reference) => {
    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    const docRef = db.collection('projects').doc(projectId);
    const projSnap = await docRef.get();
    
    if (!projSnap.exists) throw new Error("Project not found");
    const project = projSnap.data();
    
    console.log(`[Workspace] Initializing for ${projectId} (Ref: ${reference})`);
    
    let browser = null;
    try {
        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        });

        const page = await browser.newPage();
        
        // Step 1: Find the keyVal by searching for the reference
        console.log(`[Workspace] Searching for reference: ${reference}`);
        await page.goto(`${BASE_URL}/search.do?action=simple&searchType=Application`, { waitUntil: 'networkidle2' });
        await page.type('#caseNo', reference);
        await Promise.all([
            page.click('input[type="submit"].button.primary'),
            page.waitForNavigation({ waitUntil: 'networkidle2' })
        ]);

        // If multiple results, click the first one. If one result, we are already there.
        const title = await page.title();
        if (title.includes('Search Results')) {
            await Promise.all([
                page.click('#searchresults a'),
                page.waitForNavigation({ waitUntil: 'networkidle2' })
            ]);
        }

        // Step 2: Navigate to Documents tab
        console.log(`[Workspace] Navigating to Documents tab...`);
        const docsTabSelector = '#subtab_documents';
        await page.waitForSelector(docsTabSelector);
        await Promise.all([
            page.click(docsTabSelector),
            page.waitForNavigation({ waitUntil: 'networkidle2' })
        ]);

        // Step 3: Scrape documents table
        const content = await page.content();
        const $ = cheerio.load(content);
        const rows = $('#Documents tr').slice(1); // Skip header
        const scrapedDocs = [];

        console.log(`[Workspace] Found ${rows.length} document rows.`);

        for (let i = 0; i < rows.length; i++) {
            const row = rows.eq(i);
            const cells = row.find('td');
            if (cells.length < 4) continue;

            const datePublished = cells.eq(0).text().trim();
            const documentType = cells.eq(1).text().trim();
            const description = cells.eq(2).text().trim();
            const viewLink = cells.eq(3).find('a').attr('href');

            if (viewLink) {
                scrapedDocs.push({
                    name: `${documentType} - ${description}`.replace(/[/\\?%*:|"<>]/g, '-'),
                    url: `${BASE_URL}/${viewLink}`,
                    type: documentType
                });
            }
        }

        // Step 4: Process into Cloud Storage
        const finalFiles = project.projectFiles || [];
        const slug = (project.address || 'project').toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30);
        const baseFolder = `projects/${slug}_${projectId}/documents/`;

        for (const doc of scrapedDocs) {
            try {
                console.log(`[Workspace] Scraping ${doc.name}...`);
                // Note: The portal usually serves a page that has the PDF embedded, or a direct PDF
                // We'll follow the link and try to find the actual PDF stream
                const docPage = await browser.newPage();
                await docPage.goto(doc.url, { waitUntil: 'networkidle2' });
                
                // Inspect for the PDF link
                const docContent = await docPage.content();
                const $d = cheerio.load(docContent);
                const pdfHref = $d('a[href$=".pdf"]').attr('href') || viewLink; // Fallback
                
                const response = await axios.get(`${BASE_URL}/${pdfHref}`, { responseType: 'arraybuffer' });
                const buffer = Buffer.from(response.data, 'binary');
                
                const safeName = `${doc.name.replace(/\s+/g, '_')}_${uuidv4().slice(0,8)}.pdf`;
                const destPath = `${baseFolder}${safeName}`;
                const remoteFile = bucket.file(destPath);
                const downloadToken = uuidv4();

                await remoteFile.save(buffer, {
                    metadata: {
                        contentType: 'application/pdf',
                        metadata: { firebaseStorageDownloadTokens: downloadToken }
                    }
                });

                const encodedPath = encodeURIComponent(destPath);
                const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${downloadToken}`;

                finalFiles.push({
                    name: doc.name + ".pdf",
                    url: downloadUrl,
                    fullPath: destPath,
                    contentType: 'application/pdf'
                });

                await docPage.close();
            } catch (err) {
                console.warn(`[Workspace] Failed to download document ${doc.name}: ${err.message}`);
            }
        }

        // Update Firestore
        await docRef.update({ projectFiles: finalFiles });
        console.log(`[Workspace] Successfully synchronized ${scrapedDocs.length} documents.`);

        return { success: true, count: scrapedDocs.length };

    } catch (error) {
        console.error("[Workspace ERROR]", error);
        throw error;
    } finally {
        if (browser) await browser.close();
    }
};
