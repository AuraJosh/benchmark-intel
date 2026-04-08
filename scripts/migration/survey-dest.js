const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const destKey = require('./destination-key.json');

const destApp = admin.initializeApp({
    credential: admin.credential.cert(destKey)
}, 'dest');

const db = destApp.firestore();

async function survey() {
    console.log('--- DESTINATION SURVEY ---');
    const collections = await db.listCollections();
    for (const c of collections) {
        const snap = await c.limit(1).get();
        console.log(`- ${c.id}: ${snap.size > 0 ? 'HAS DATA' : 'EMPTY'}`);
    }
    process.exit(0);
}

survey().catch(err => {
    console.error('Dest survey failed:', err);
    process.exit(1);
});
