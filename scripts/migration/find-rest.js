const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const sourceKeyLocal = JSON.parse(fs.readFileSync(path.join(__dirname, 'source-key.json'), 'utf8'));
if (sourceKeyLocal.private_key) sourceKeyLocal.private_key = sourceKeyLocal.private_key.replace(/\\n/g, '\n');

async function listDocsInDb(dbId) {
    console.log(`\n--- SCANNING DB: ${dbId} FOR projectId ---`);
    const auth = new google.auth.GoogleAuth({
        credentials: { client_email: sourceKeyLocal.client_email, private_key: sourceKeyLocal.private_key },
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });

    const firestore = google.firestore({ version: 'v1', auth: auth });

    try {
        const res = await firestore.projects.databases.documents.listCollectionIds({
            parent: `projects/${sourceKeyLocal.project_id}/databases/${dbId}/documents`
        });

        const collectionIds = res.data.collectionIds || [];
        
        for (const col of collectionIds) {
            console.log(`Searching in collection: ${col}...`);
            const docsRes = await firestore.projects.databases.documents.list({
                parent: `projects/${sourceKeyLocal.project_id}/databases/${dbId}/documents`,
                collectionId: col,
                pageSize: 1000
            });
            const documents = docsRes.data.documents || [];
            for (const doc of documents) {
                const docStr = JSON.stringify(doc).toLowerCase();
                if (docStr.includes('t9j09xsjisv00'.toLowerCase())) {
                    console.log(`MATCH found in ${col}:`, doc.name);
                }
            }
        }

    } catch (e) {
        console.error(`❌ DB: ${dbId} FAILED:`, e.message);
    }
}

async function start() {
    await listDocsInDb('benchmark-db');
}

start();
