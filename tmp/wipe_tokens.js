import admin from "firebase-admin";
import fs from "fs";

// Load service account from the migration folder since it's already there
const serviceAccount = JSON.parse(fs.readFileSync('scripts/migration/destination-key.json', 'utf8'));

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function wipeAllTokens() {
    try {
        const snapshot = await db.collection('staff_profiles').get();
        console.log(`Found ${snapshot.size} profiles. Wiping tokens...`);
        
        const batch = db.batch();
        snapshot.forEach(doc => {
            batch.update(doc.ref, { fcmTokens: [] });
        });
        
        await batch.commit();
        console.log("✅ Success! All notification tokens have been wiped. Please reopen the app on your phone to re-register.");
        process.exit(0);
    } catch (err) {
        console.error("Error wiping tokens:", err);
        process.exit(1);
    }
}

wipeAllTokens();
