const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const sourceKey = JSON.parse(fs.readFileSync(path.join(__dirname, 'source-key.json'), 'utf8'));
if (sourceKey.private_key) sourceKey.private_key = sourceKey.private_key.replace(/\\n/g, '\n');

const sourceApp = admin.initializeApp({ credential: admin.credential.cert(sourceKey) }, 'scanner');

async function scan() {
    const dbs = ['(default)', 'benchmark-db'];
    
    for (const dbName of dbs) {
        console.log(`\nScanning Database ID: [${dbName}]...`);
        try {
            const db = sourceApp.firestore(dbName);
            const collections = await db.listCollections();
            if (collections.length > 0) {
                console.log(`✅ SUCCESS! Found data in [${dbName}]`);
                collections.forEach(c => console.log(`   - ${c.id}`));
                return;
            } else {
                console.log(`! No collections found in [${dbName}].`);
            }
        } catch (e) {
            console.error(`! Failed database [${dbName}]:`, e.message);
        }
    }
    
    console.log('\n--- SCAN FAILED ---');
    console.log('Project ID checked:', sourceKey.project_id);
    process.exit(1);
}

scan().catch(console.error);
