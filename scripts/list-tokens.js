import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./scripts/migration/destination-key.json', 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function run() {
  const snap = await db.collection('staff_profiles').get();
  console.log(`Found ${snap.size} profiles`);
  snap.forEach(d => {
    console.log(`- ${d.id}: ${JSON.stringify(d.data())}`);
  });
}

run();
