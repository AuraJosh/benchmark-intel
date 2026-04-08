const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const sourceKey = JSON.parse(fs.readFileSync(path.join(__dirname, 'source-key.json'), 'utf8'));
if (sourceKey.private_key) sourceKey.private_key = sourceKey.private_key.replace(/\\n/g, '\n');

async function listDatabases() {
    console.log('--- PROJECT-WIDE DATABASE SCAN ---');
    console.log('Project ID:', sourceKey.project_id);

    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: sourceKey.client_email,
            private_key: sourceKey.private_key,
        },
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });

    const firestore = google.firestore({
        version: 'v1',
        auth: auth
    });

    try {
        const res = await firestore.projects.databases.list({
            parent: `projects/${sourceKey.project_id}`
        });

        const databases = res.data.databases || [];
        console.log(`\nFound ${databases.length} database(s):`);
        
        databases.forEach(db => {
            console.log(`- ID: ${db.name.split('/').pop()}`);
            console.log(`  State: ${db.state}`);
            console.log(`  Location: ${db.locationId}`);
            console.log(`  Type: ${db.type}`);
        });

    } catch (e) {
        console.error('❌ LIST FAILED:', e.message);
        if (e.message.includes('not been used in project')) {
            console.log('! Firestore API might not be enabled for this service account.');
        }
    }
    process.exit(0);
}

listDatabases();
