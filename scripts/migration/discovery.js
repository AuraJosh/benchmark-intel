const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const sourceKey = JSON.parse(fs.readFileSync(path.join(__dirname, 'source-key.json'), 'utf8'));
if (sourceKey.private_key) sourceKey.private_key = sourceKey.private_key.replace(/\\n/g, '\n');

const sourceApp = admin.initializeApp({ 
    credential: admin.credential.cert(sourceKey),
    databaseURL: `https://${sourceKey.project_id}-default-rtdb.firebaseio.com` // Common default for RTDB
}, 'source_discovery');

async function discovery() {
    console.log('--- PHASE 3-A: FIRESTORE SEARCH ---');
    try {
        const collections = await sourceApp.firestore().listCollections();
        if (collections.length === 0) {
            console.log('! Firestore is accessible but EMPTY.');
        } else {
            console.log(`- Found ${collections.length} Firestore collections.`);
        }
    } catch (e) {
        console.warn('! Firestore Search Error:', e.message);
    }

    console.log('\n--- PHASE 3-B: REALTIME DB SEARCH ---');
    try {
        const rootRef = sourceApp.database().ref('/');
        const snapshot = await rootRef.limitToFirst(5).get();
        if (snapshot.exists()) {
            console.log('- Found data in the Realtime Database!');
            console.log('  Keys at root:', Object.keys(snapshot.val()));
        } else {
            console.log('! Realtime Database is EMPTY.');
        }
    } catch (e) {
        console.warn('! Realtime DB Search Error:', e.message);
        console.warn('  (This might mean RTDB is not enabled or its using a custom URL)');
    }

    process.exit(0);
}

discovery().catch(console.error);
