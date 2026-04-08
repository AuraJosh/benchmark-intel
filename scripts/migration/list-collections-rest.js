const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const sourceKey = JSON.parse(fs.readFileSync(path.join(__dirname, 'source-key.json'), 'utf8'));
if (sourceKey.private_key) sourceKey.private_key = sourceKey.private_key.replace(/\\n/g, '\n');

async function listCollections() {
    console.log('--- SCANNING ALL COLLECTIONS (REST) ---');
    const auth = new google.auth.GoogleAuth({
        credentials: { client_email: sourceKey.client_email, private_key: sourceKey.private_key },
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });

    const firestore = google.firestore({ version: 'v1', auth: auth });

    try {
        const res = await firestore.projects.databases.documents.listCollectionIds({
            parent: `projects/${sourceKey.project_id}/databases/benchmark-db/documents`
        });

        const collectionIds = res.data.collectionIds || [];
        console.log(`\nFound ${collectionIds.length} top-level collections:`);
        collectionIds.forEach(id => console.log(`- ${id}`));

        // For each collection, export its documents to a local file
        for (const id of collectionIds) {
            console.log(`\nExporting ${id}...`);
            const docsRes = await firestore.projects.databases.documents.list({
                parent: `projects/${sourceKey.project_id}/databases/benchmark-db/documents`,
                collectionId: id
            });
            
            const documents = docsRes.data.documents || [];
            console.log(`  - Saved ${documents.length} documents.`);
            fs.writeFileSync(path.join(__dirname, 'backup', `${id}.json`), JSON.stringify(documents, null, 2));
        }

        console.log('\n✅ LOCAL BACKUP COMPLETE!');

    } catch (e) {
        console.error('❌ DISCOVERY FAILED:', e.message);
        if (e.stack) console.log(e.stack);
    }
    process.exit(0);
}

listCollections();
