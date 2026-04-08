const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const destKey = JSON.parse(fs.readFileSync(path.join(__dirname, 'destination-key.json'), 'utf8'));
if (destKey.private_key) {
    destKey.private_key = destKey.private_key.replace(/\\n/g, '\n');
}

const destApp = admin.initializeApp({
    credential: admin.credential.cert(destKey)
}, 'dest');

const auth = destApp.auth();

async function checkAuth() {
    console.log('--- AUTH PING (DESTINATION) ---');
    try {
        const users = await auth.listUsers(10);
        console.log(`- Destination Successful! Found ${users.users.length} sample users.`);
        process.exit(0);
    } catch (err) {
        console.error('Destination Auth Failed:', err.message);
        process.exit(1);
    }
}

checkAuth();
