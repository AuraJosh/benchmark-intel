import admin from 'firebase-admin';
import fs from 'fs';

// Initialize with destination-key
const serviceAccount = JSON.parse(fs.readFileSync('./scripts/migration/destination-key.json', 'utf8'));

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function checkTokens() {
    console.log('--- STAFF TOKENS CHECK ---');
    const snap = await db.collection('staff_profiles').get();
    if (snap.empty) {
        console.log('No staff profiles found.');
    } else {
        snap.forEach(doc => {
            const data = doc.data();
            console.log(`User ID: ${doc.id}`);
            console.log(`Enabled: ${data.notificationsEnabled}`);
            console.log(`Tokens: ${data.fcmTokens ? data.fcmTokens.length : 0}`);
            if (data.fcmTokens) {
                data.fcmTokens.forEach(t => console.log(` - ${t.substring(0, 20)}...`));
            }
            console.log('-------------------------');
        });
    }
}

checkTokens().catch(console.error);
