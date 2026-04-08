const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const sourceKey = JSON.parse(fs.readFileSync(path.join(__dirname, 'source-key.json'), 'utf8'));
if (sourceKey.private_key) sourceKey.private_key = sourceKey.private_key.replace(/\\n/g, '\n');

// THE TRICK: We don't initialize firestore() empty.
// We provide the databaseId during the call.
const sourceApp = admin.initializeApp({
    credential: admin.credential.cert(sourceKey)
}, 'source_direct');

async function discovery() {
    const dbId = 'benchmark-db';
    console.log(`--- Explicit Database Search ---`);
    console.log(`Target: ${dbId}`);
    
    try {
        const db = sourceApp.firestore(dbId);
        
        // Let's try to get a single known collection or list all
        console.log('Listing collections...');
        const collections = await db.listCollections();
        
        if (collections.length === 0) {
            console.log('! Connection made but NO collections found.');
        } else {
            console.log(`✅ SUCCESS! Found ${collections.length} collections.`);
            collections.forEach(c => console.log(`   - ${c.id}`));
        }
    } catch (e) {
        console.error('❌ FAILED:', e.message);
        if (e.stack) console.log(e.stack);
    }
    process.exit(0);
}

discovery();
