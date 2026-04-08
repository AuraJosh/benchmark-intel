const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const destKey = JSON.parse(fs.readFileSync(path.join(__dirname, 'destination-key.json'), 'utf8'));
if (destKey.private_key) destKey.private_key = destKey.private_key.replace(/\\n/g, '\n');

const destApp = admin.initializeApp({ credential: admin.credential.cert(destKey) }, 'dest_restore');
const db = destApp.firestore();

// Helper to convert Firestore REST format to native JS objects
function fromRest(fields) {
    const result = {};
    if (!fields) return result;
    for (const [key, value] of Object.entries(fields)) {
        if (value.stringValue !== undefined) result[key] = value.stringValue;
        else if (value.integerValue !== undefined) result[key] = parseInt(value.integerValue);
        else if (value.doubleValue !== undefined) result[key] = parseFloat(value.doubleValue);
        else if (value.booleanValue !== undefined) result[key] = value.booleanValue;
        else if (value.timestampValue !== undefined) result[key] = new Date(value.timestampValue);
        else if (value.mapValue !== undefined) result[key] = fromRest(value.mapValue.fields);
        else if (value.arrayValue !== undefined) {
            result[key] = (value.arrayValue.values || []).map(v => fromRest({ temp: v }).temp);
        } else if (value.nullValue !== undefined) result[key] = null;
        else if (value.geoPointValue !== undefined) result[key] = value.geoPointValue;
        else if (value.referenceValue !== undefined) result[key] = value.referenceValue;
    }
    return result;
}

async function restore() {
    console.log('--- PHASE 3.2: RESTORE TO DESTINATION ---');
    const backupDir = path.join(__dirname, 'backup');
    const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.json'));

    for (const file of files) {
        const collectionId = file.replace('.json', '');
        console.log(`\nImporting collection: ${collectionId}...`);
        const documents = JSON.parse(fs.readFileSync(path.join(backupDir, file), 'utf8'));
        
        let count = 0;
        for (const rawDoc of documents) {
            try {
                // Extract document ID from the REST name field
                const docId = rawDoc.name.split('/').pop();
                const data = fromRest(rawDoc.fields);
                
                await db.collection(collectionId).doc(docId).set(data);
                count++;
                if (count % 10 === 0) process.stdout.write('.');
            } catch (err) {
                console.error(`\n❌ Failed doc in ${collectionId}:`, err.message);
            }
        }
        console.log(`\n✅ Finished ${count} documents in ${collectionId}.`);
    }

    console.log('\n--- FINAL SYNC COMPLETE ---');
    process.exit(0);
}

restore();
