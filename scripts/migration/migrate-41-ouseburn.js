const { google } = require('googleapis');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const sourceKeyLocal = JSON.parse(fs.readFileSync(path.join(__dirname, 'source-key.json'), 'utf8'));
if (sourceKeyLocal.private_key) sourceKeyLocal.private_key = sourceKeyLocal.private_key.replace(/\\n/g, '\n');

const destKey = JSON.parse(fs.readFileSync(path.join(__dirname, 'destination-key.json'), 'utf8'));
if (destKey.private_key) destKey.private_key = destKey.private_key.replace(/\\n/g, '\n');

const destApp = admin.initializeApp({ credential: admin.credential.cert(destKey) });
const destDb = destApp.firestore();

function parseRestDoc(fields) {
    if (!fields) return {};
    const result = {};
    for (const [key, value] of Object.entries(fields)) {
        if (value.stringValue !== undefined) result[key] = value.stringValue;
        else if (value.integerValue !== undefined) result[key] = parseInt(value.integerValue, 10);
        else if (value.doubleValue !== undefined) result[key] = value.doubleValue;
        else if (value.booleanValue !== undefined) result[key] = value.booleanValue;
        else if (value.timestampValue !== undefined) result[key] = admin.firestore.Timestamp.fromDate(new Date(value.timestampValue));
        else if (value.mapValue !== undefined) result[key] = parseRestDoc(value.mapValue.fields);
        else if (value.arrayValue !== undefined) {
             const elems = value.arrayValue.values || [];
             result[key] = elems.map(e => parseRestDoc({ temp: e }).temp);
        }
        else if (value.nullValue !== undefined) result[key] = null;
    }
    return result;
}

async function migrate() {
    const auth = new google.auth.GoogleAuth({
        credentials: { client_email: sourceKeyLocal.client_email, private_key: sourceKeyLocal.private_key },
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });

    const firestore = google.firestore({ version: 'v1', auth: auth });
    
    // Assignment Document
    const assignmentId = 'zZCDo1CYOoqhZCQwql4I';
    console.log(`Fetching assignment ${assignmentId}...`);
    try {
        const aReq = await firestore.projects.databases.documents.get({
            name: `projects/${sourceKeyLocal.project_id}/databases/benchmark-db/documents/assignments/${assignmentId}`
        });
        
        const assignmentData = parseRestDoc(aReq.data.fields);
        console.log('Assignment parsed successfully:', JSON.stringify(assignmentData));
        await destDb.collection('assignments').doc(assignmentId).set(assignmentData);
        console.log('Saved assignment to new DB.');

    } catch (e) {
        console.error('Error with assignment:', e.message);
    }
}

migrate().then(() => process.exit(0)).catch(console.error);
