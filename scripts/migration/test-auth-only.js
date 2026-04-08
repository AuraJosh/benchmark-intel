const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const sourceKey = JSON.parse(fs.readFileSync(path.join(__dirname, 'source-key.json'), 'utf8'));
if (sourceKey.private_key) {
    sourceKey.private_key = sourceKey.private_key.replace(/\\n/g, '\n');
}

const sourceApp = admin.initializeApp({
    credential: admin.credential.cert(sourceKey)
}, 'source');

const auth = sourceApp.auth();

async function checkAuth() {
    console.log('--- AUTH PING (SOURCE) ---');
    try {
        const users = await auth.listUsers(10);
        console.log(`- Connection Successful! Found ${users.users.length} sample users.`);
        process.exit(0);
    } catch (err) {
        console.error('Auth Ping Failed:', err.message);
        process.exit(1);
    }
}

checkAuth();
