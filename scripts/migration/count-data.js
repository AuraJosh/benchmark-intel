const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const sourceKey = JSON.parse(fs.readFileSync(path.join(__dirname, 'source-key.json'), 'utf8'));

if (sourceKey.private_key) {
    sourceKey.private_key = sourceKey.private_key.replace(/\\n/g, '\n');
}

const sourceApp = admin.initializeApp({
    credential: admin.credential.cert(sourceKey)
}, 'source');

const db = sourceApp.firestore();
const auth = sourceApp.auth();

async function survey() {
    console.log('--- FIRESTORE SURVEY (SOURCE) ---');
    const collections = await db.listCollections();
    const manifest = {};

    for (const collection of collections) {
        const snapshot = await collection.get();
        console.log(`- ${collection.id}: ${snapshot.size} documents`);
        manifest[collection.id] = snapshot.size;
    }

    console.log('\n--- AUTH SURVEY (SOURCE) ---');
    const users = await auth.listUsers();
    console.log(`- Total Users: ${users.users.length}`);

    fs.writeFileSync('survey_results.json', JSON.stringify({
        timestamp: new Date().toISOString(),
        collections: manifest,
        authCount: users.users.length
    }, null, 2));

    console.log('\nResults saved to survey_results.json');
    process.exit(0);
}

survey().catch(err => {
    console.error('Survey failed:', err);
    process.exit(1);
});
