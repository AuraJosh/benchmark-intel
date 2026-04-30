const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Load keys
const sourceKeyPath = path.join(__dirname, 'source-key.json');
const destKeyPath = path.join(__dirname, 'destination-key.json');

if (!fs.existsSync(sourceKeyPath) || !fs.existsSync(destKeyPath)) {
    console.error('Error: source-key.json and destination-key.json must exist in the migration directory.');
    process.exit(1);
}

const sourceKey = JSON.parse(fs.readFileSync(sourceKeyPath, 'utf8'));
const destKey = JSON.parse(fs.readFileSync(destKeyPath, 'utf8'));

// Sanitize keys
[sourceKey, destKey].forEach(k => {
    if (k.private_key) k.private_key = k.private_key.replace(/\\n/g, '\n');
});

const sourceApp = admin.initializeApp({ credential: admin.credential.cert(sourceKey) }, 'source_app');
const destApp = admin.initializeApp({ credential: admin.credential.cert(destKey) }, 'dest_app');

// Database detection
let sourceDb;
const dbNames = ['benchmark-db', '(default)'];

async function initSourceDb() {
    for (const name of dbNames) {
        try {
            const db = sourceApp.firestore(name);
            const colls = await db.listCollections();
            if (colls.length > 0) {
                console.log(`Using source database: [${name}]`);
                return db;
            }
        } catch (e) {
            // continue
        }
    }
    console.log('Falling back to default source database.');
    return sourceApp.firestore();
}

const destDb = destApp.firestore();

async function migrateSingleContract(agreementId) {
    sourceDb = await initSourceDb();
    console.log(`--- MIGRATING CONTRACT: ${agreementId} ---`);

    try {
        // 1. Fetch Agreement
        const agreementSnap = await sourceDb.collection('agreements').doc(agreementId).get();
        if (!agreementSnap.exists) {
            console.error(`Error: Agreement ${agreementId} not found in source.`);
            
            // Try searching by status if ID was meant to be a hint
            console.log('Searching for recent signed agreements...');
            const recent = await sourceDb.collection('agreements').where('status', '==', 'Signed').orderBy('dateSigned', 'desc').limit(5).get();
            if (recent.empty) {
                console.log('No signed agreements found in source.');
            } else {
                console.log('Recent signed agreements in source:');
                recent.forEach(d => console.log(`- ID: ${d.id} | Signed: ${d.data().dateSigned?.toDate().toLocaleString()}`));
            }
            return;
        }

        const agreement = agreementSnap.data();
        console.log(`Found agreement for builder: ${agreement.builderId}`);

        // 2. Fetch Builder
        if (agreement.builderId) {
            const builderSnap = await sourceDb.collection('builders').doc(agreement.builderId).get();
            if (builderSnap.exists) {
                await destDb.collection('builders').doc(agreement.builderId).set(builderSnap.data());
                console.log(`- Builder ${agreement.builderId} migrated.`);
            }
        }

        // 3. Fetch Version
        if (agreement.versionId) {
            const versionSnap = await sourceDb.collection('contractVersions').doc(agreement.versionId).get();
            if (versionSnap.exists) {
                await destDb.collection('contractVersions').doc(agreement.versionId).set(versionSnap.data());
                console.log(`- Contract Version ${agreement.versionId} migrated.`);
            }
        }

        // 4. Fetch Project (if linked)
        if (agreement.projectId) {
            const projectSnap = await sourceDb.collection('projects').doc(agreement.projectId).get();
            if (projectSnap.exists) {
                await destDb.collection('projects').doc(agreement.projectId).set(projectSnap.data());
                console.log(`- Project ${agreement.projectId} migrated.`);
            }
        }

        // 5. Save Agreement
        await destDb.collection('agreements').doc(agreementId).set(agreement);
        console.log(`✅ Agreement ${agreementId} migrated successfully!`);

        // 6. Check for correspondence in source and migrate if it exists
        const corrSnap = await sourceDb.collection('correspondence')
            .where('category', '==', 'Contract')
            .where(agreement.projectId ? 'projectId' : 'builderId', '==', agreement.projectId || agreement.builderId)
            .get();
        
        for (const corrDoc of corrSnap.docs) {
            await destDb.collection('correspondence').doc(corrDoc.id).set(corrDoc.data());
            console.log(`- Correspondence ${corrDoc.id} migrated.`);
        }

    } catch (err) {
        console.error('❌ Migration Failed:', err);
    } finally {
        process.exit(0);
    }
}

// Get ID from command line
const agreementId = process.argv[2];
if (!agreementId) {
    console.log('Usage: node migrate-contract.js <AGREEMENT_ID>');
    console.log('Executing search for recent signed contracts instead...');
    migrateSingleContract('LIST_ONLY');
} else {
    migrateSingleContract(agreementId);
}
