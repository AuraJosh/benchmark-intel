const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const sourceKey = JSON.parse(fs.readFileSync(path.join(__dirname, 'source-key.json'), 'utf8'));
const destKey = JSON.parse(fs.readFileSync(path.join(__dirname, 'destination-key.json'), 'utf8'));

// Sanitize keys
[sourceKey, destKey].forEach(k => {
    if (k.private_key) k.private_key = k.private_key.replace(/\\n/g, '\n');
});

const sourceApp = admin.initializeApp({ credential: admin.credential.cert(sourceKey) }, 'source_final');
const destApp = admin.initializeApp({ credential: admin.credential.cert(destKey) }, 'dest_final');

// CRITICAL: We pass the DATABASE ID directly.
const sourceDb = sourceApp.firestore('benchmark-db');
const destDb = destApp.firestore(); // Assuming Destination is default

async function migrateCollections() {
    console.log('--- PHASE 3: FINAL FIRESTORE MIGRATION ---');
    console.log(`Source: [benchmark-intelligence-a5b7c / benchmark-db]`);
    console.log(`Dest:   [${destKey.project_id} / (default)]`);

    try {
        const collections = await sourceDb.listCollections();
        console.log(`\nFound ${collections.length} top-level collections.`);

        for (const collection of collections) {
            console.log(`\n> Migrating collection: ${collection.id}...`);
            await copyCollection(collection, destDb.collection(collection.id));
        }

        console.log('\n✅ FIRESTORE MIGRATION COMPLETE!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration Failed:', err.message);
        process.exit(1);
    }
}

async function copyCollection(srcCol, destCol) {
    const snapshot = await srcCol.get();
    console.log(`  - Found ${snapshot.size} documents in ${srcCol.id}`);

    let count = 0;
    for (const doc of snapshot.docs) {
        const data = doc.data();
        await destCol.doc(doc.id).set(data);
        
        // Check for subcollections
        const subCollections = await doc.ref.listCollections();
        for (const subCol of subCollections) {
            await copyCollection(subCol, destCol.doc(doc.id).collection(subCol.id));
        }
        
        count++;
        if (count % 10 === 0) process.stdout.write('.');
    }
    console.log(`\n  - Finished ${count} documents.`);
}

migrateCollections();
