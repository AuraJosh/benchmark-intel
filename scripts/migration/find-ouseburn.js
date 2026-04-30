const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const sourceKey = JSON.parse(fs.readFileSync(path.join(__dirname, 'source-key.json'), 'utf8'));

// Sanitize keys
if (sourceKey.private_key) sourceKey.private_key = sourceKey.private_key.replace(/\\n/g, '\n');

const sourceApp = admin.initializeApp({ credential: admin.credential.cert(sourceKey) }, 'source_final');

async function searchInDb(dbName) {
    let db;
    if (dbName === '(default)') {
        db = sourceApp.firestore();
    } else {
        db = sourceApp.firestore(dbName);
    }
    
    console.log(`\nSearching in ${dbName}...`);
    try {
        const snapshot = await db.collection('projects').get();
        console.log(`Loaded ${snapshot.size} projects from ${dbName}`);
        const projects = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            const address = String(data.address || data.projectAddress || data.name || '').toLowerCase();
            const id = doc.id.toLowerCase();
            if (address.includes('41') || address.includes('ouse') || id.includes('ouse') || id.includes('41')) {
                projects.push({ id: doc.id, text: `ID: ${doc.id}, Address: ${data.address}, Name: ${data.projectAddress || data.name}` });
            }
        });

        console.log(`Found ${projects.length} matching projects in ${dbName}.`);
        projects.forEach(p => console.log('  ' + p.text));
    } catch (err) {
        console.log(`Error reading from ${dbName}: ${err.message}`);
    }
}

async function start() {
    await searchInDb('(default)');
    await searchInDb('benchmark-db');
}

start().then(() => process.exit(0)).catch(console.error);
