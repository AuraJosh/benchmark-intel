const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const destKeyPath = path.join(__dirname, 'destination-key.json');
const destKey = JSON.parse(fs.readFileSync(destKeyPath, 'utf8'));

if (destKey.private_key) {
    destKey.private_key = destKey.private_key.replace(/\\n/g, '\n');
}

const app = admin.initializeApp({
    credential: admin.credential.cert(destKey)
});

const db = app.firestore();

async function backfillContracts() {
    console.log('--- BACKFILL SIGNED CONTRACTS CORRESPONDENCE ---');
    
    const agreementsSnap = await db.collection('agreements').where('status', '==', 'Signed').get();
    console.log(`Found ${agreementsSnap.size} signed agreements.`);
    
    let processed = 0;
    
    for (const docSnap of agreementsSnap.docs) {
        const agreement = docSnap.data();
        const agreementId = docSnap.id;
        
        let title = 'Agreement';
        if (agreement.versionId) {
            const versionSnap = await db.collection('contractVersions').doc(agreement.versionId).get();
            if (versionSnap.exists) {
                title = versionSnap.data().title || 'Agreement';
            }
        }
        
        let companyName = 'the builder';
        if (agreement.builderId) {
            const builderSnap = await db.collection('builders').doc(agreement.builderId).get();
            if (builderSnap.exists) {
                companyName = builderSnap.data().companyName || 'the builder';
            }
        }
        
        // Ensure dateSigned exists, otherwise use timestamp, otherwise use now.
        let timestamp = agreement.dateSigned || agreement.timestamp || admin.firestore.Timestamp.now();
        
        // Log to correspondence
        const logData = {
            category: 'Contract',
            subject: 'Contract Finalized',
            notes: `The ${title} has been signed and finalized by ${companyName}. This interaction was automatically captured by the signature portal.`,
            timestamp: timestamp,
            direction: 'Inbound',
            staff: 'System',
            mode: agreement.projectId ? 'homeowner' : 'builder'
        };
        
        if (agreement.projectId) logData.projectId = agreement.projectId;
        if (agreement.builderId) logData.builderId = agreement.builderId;
        
        // Check if existing correspondence exists to prevent duplication
        const existingSnap = await db.collection('correspondence')
            .where('category', '==', 'Contract')
            .where('subject', '==', 'Contract Finalized')
            .where(agreement.projectId ? 'projectId' : 'builderId', '==', agreement.projectId || agreement.builderId)
            .get();
        
        if (existingSnap.empty) {
            await db.collection('correspondence').add(logData);
            console.log(`- Created correspondence for agreement ${agreementId}`);
            processed++;
        } else {
            console.log(`- Correspondence already exists for agreement ${agreementId}, skipping.`);
        }
    }
    
    console.log(`Finished. Processed ${processed} entries.`);
    process.exit(0);
}

backfillContracts().catch(err => {
    console.error('Error backfilling contracts:', err);
    process.exit(1);
});
