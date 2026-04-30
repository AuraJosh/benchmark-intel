const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Load destination key
const destKeyPath = path.join(__dirname, 'destination-key.json');
if (!fs.existsSync(destKeyPath)) {
    console.error('Error: destination-key.json must exist in the migration directory.');
    process.exit(1);
}

const destKey = JSON.parse(fs.readFileSync(destKeyPath, 'utf8'));
if (destKey.private_key) destKey.private_key = destKey.private_key.replace(/\\n/g, '\n');

const destApp = admin.initializeApp({ credential: admin.credential.cert(destKey) }, 'dest_cleanup');
const db = destApp.firestore();

async function cleanupBrokenContract() {
    console.log('--- CLEANUP BROKEN CONTRACT ---');

    // User's timestamp: 16/04/2026, 14:08:45
    // Firestore stores UTC. 14:08:45 in local (likely +1 based on metadata 16:12:30+01:00) 
    // would be around 13:08:45 UTC.
    
    console.log('Searching for agreements signed around that time...');
    const agreementsSnap = await db.collection('agreements').get();
    
    let targetId = null;
    
    for (const doc of agreementsSnap.docs) {
        const data = doc.data();
        const dateSigned = data.dateSigned ? data.dateSigned.toDate() : null;
        
        if (dateSigned) {
            const localStr = dateSigned.toLocaleString('en-GB'); // Match user's format
            console.log(`- ID: ${doc.id} | Signed: ${localStr} | Builder: ${data.builderId}`);
            
            // Check if it matches the specific time (ignoring exact day/month if we want to be safe, but user gave full date)
            if (localStr.includes('14:08:45') && localStr.includes('16/04/2026')) {
                console.log(`>>> MATCH FOUND: ${doc.id}`);
                targetId = doc.id;
            }
        }
    }

    if (targetId) {
        console.log(`\nDeleting agreement ${targetId}...`);
        await db.collection('agreements').doc(targetId).delete();
        console.log('✅ Successfully deleted the broken contract.');
    } else {
        console.log('\n- No matching agreement document found (already deleted).');
    }

    // Independent correspondence cleanup
    const allCorrSnap = await db.collection('correspondence').get();
    console.log(`Checking ${allCorrSnap.size} correspondence entries for broken logs...`);
        
    for (const corrDoc of allCorrSnap.docs) {
            const cData = corrDoc.data();
            
            // Specifically target the correspondence linked to the deleted "Test Builder" ID
            if (cData.builderId === 'uZ6hE7f9hWQSinHccpOn' || (cData.notes && cData.notes.includes('Test Builder'))) {
                console.log(`- Deleting broken correspondence log ${corrDoc.id}...`);
                await db.collection('correspondence').doc(corrDoc.id).delete();
            }
    }
    
    console.log('--- CLEANUP COMPLETE ---');
    process.exit(0);
}

cleanupBrokenContract().catch(err => {
    console.error(err);
    process.exit(1);
});
