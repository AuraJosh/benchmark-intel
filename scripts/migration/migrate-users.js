const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const sourceKey = JSON.parse(fs.readFileSync(path.join(__dirname, 'source-key.json'), 'utf8'));
const destKey = JSON.parse(fs.readFileSync(path.join(__dirname, 'destination-key.json'), 'utf8'));

// Sanitize keys
[sourceKey, destKey].forEach(k => {
    if (k.private_key) k.private_key = k.private_key.replace(/\\n/g, '\n');
});

const sourceApp = admin.initializeApp({ credential: admin.credential.cert(sourceKey) }, 'source');
const destApp = admin.initializeApp({ credential: admin.credential.cert(destKey) }, 'dest');

const sourceAuth = sourceApp.auth();
const destAuth = destApp.auth();

async function migrateUsers() {
    console.log('--- PHASE 2: AUTH MIGRATION ---');

    console.log('Fetching users from source...');
    const usersResult = await sourceAuth.listUsers();
    const users = usersResult.users;

    console.log(`Found ${users.length} users to migrate.`);

    let successCount = 0;
    let skipCount = 0;

    for (const user of users) {
        try {
            console.log(`- Migrating user: ${user.email} (${user.uid})...`);
            
            // For simple migration, we import without password hashing parameters (reset required if not using CLI export/import)
            // BUT to keep passwords, we'd need CLI. 
            // Here, we create as a new user with same UID/Email.
            await destAuth.importUsers([{
                uid: user.uid,
                email: user.email,
                emailVerified: user.emailVerified,
                displayName: user.displayName,
                photoURL: user.photoURL,
                phoneNumber: user.phoneNumber,
                disabled: user.disabled,
                metadata: user.metadata,
                customClaims: user.customClaims,
                // Password hash migration is complex via Admin SDK without hashing configs,
                // so we will just create them to keep UIDs linked.
            }]);
            
            successCount++;
        } catch (err) {
            if (err.code === 'auth/uid-already-exists' || err.code === 'auth/email-already-exists') {
                console.warn(`  ! User ${user.email} already exists in destination. Skipping.`);
                skipCount++;
            } else {
                console.error(`  ! Failed to migrate ${user.email}:`, err.message);
            }
        }
    }

    console.log(`\n--- AUTH MIGRATION COMPLETE ---`);
    console.log(`Migrated: ${successCount} | Skipped/Existing: ${skipCount}`);
    process.exit(0);
}

migrateUsers().catch(console.error);
