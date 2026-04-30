const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Load destination key
const destKeyPath = path.join(__dirname, 'destination-key.json');
if (!fs.existsSync(destKeyPath)) {
    console.error('Error: destination-key.json must exist in the migration directory.');
    process.exit(1);
}

const destKey = JSON.parse(fs.readFileSync(destKeyPath, 'utf8'));
if (destKey.private_key) destKey.private_key = destKey.private_key.replace(/\\n/g, '\n');

const destApp = admin.initializeApp({ credential: admin.credential.cert(destKey) }, 'dest_app');
const destDb = destApp.firestore();

const backupDir = path.join(__dirname, 'backup');

function loadBackup(name) {
    const filePath = path.join(backupDir, `${name}.json`);
    if (!fs.existsSync(filePath)) return [];
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// Convert Firestore REST format to simple JSON (recursive)
function transformFields(fields) {
    const data = {};
    for (const [key, value] of Object.entries(fields)) {
        if (value.stringValue !== undefined) data[key] = value.stringValue;
        else if (value.timestampValue !== undefined) data[key] = admin.firestore.Timestamp.fromDate(new Date(value.timestampValue));
        else if (value.booleanValue !== undefined) data[key] = value.booleanValue;
        else if (value.integerValue !== undefined) data[key] = parseInt(value.integerValue);
        else if (value.doubleValue !== undefined) data[key] = parseFloat(value.doubleValue);
        else if (value.nullValue !== undefined) data[key] = null;
        else if (value.mapValue !== undefined) data[key] = transformFields(value.mapValue.fields || {});
        else if (value.arrayValue !== undefined) {
            data[key] = (value.arrayValue.values || []).map(v => {
                const temp = transformFields({ item: v });
                return temp.item;
            });
        }
    }
    return data;
}

async function importContract(agreementId) {
    console.log(`--- IMPORTING CONTRACT: ${agreementId} ---`);

    const agreements = loadBackup('agreements');
    const builders = loadBackup('builders');
    const versions = loadBackup('contractVersions');
    const projects = loadBackup('projects');

    const agreementRaw = agreements.find(a => a.name.endsWith(`/${agreementId}`));
    if (!agreementRaw) {
        console.error(`Error: Agreement ${agreementId} not found in backup.`);
        return;
    }

    const agreement = transformFields(agreementRaw.fields);
    
    // 1. Import Builder
    if (agreement.builderId) {
        const builderRaw = builders.find(b => b.name.endsWith(`/${agreement.builderId}`));
        if (builderRaw) {
            await destDb.collection('builders').doc(agreement.builderId).set(transformFields(builderRaw.fields));
            console.log(`- Builder ${agreement.builderId} imported.`);
        }
    }

    // 2. Import Version
    if (agreement.versionId) {
        const versionRaw = versions.find(v => v.name.endsWith(`/${agreement.versionId}`));
        if (versionRaw) {
            await destDb.collection('contractVersions').doc(agreement.versionId).set(transformFields(versionRaw.fields));
            console.log(`- Version ${agreement.versionId} imported.`);
        }
    }

    // 3. Import Project
    if (agreement.projectId) {
        const projectRaw = projects.find(p => p.name.endsWith(`/${agreement.projectId}`));
        if (projectRaw) {
            await destDb.collection('projects').doc(agreement.projectId).set(transformFields(projectRaw.fields));
            console.log(`- Project ${agreement.projectId} imported.`);
        }
    }

    // 4. Import Agreement
    await destDb.collection('agreements').doc(agreementId).set(agreement);
    console.log(`✅ Agreement ${agreementId} imported successfully!`);

    // 5. Correspondence check
    // Since correspondence wasn't backed up by the previous script in detail, 
    // we assume the user just wants the contract. 
    // If they want correspondence too, we'd need another backup step.
}

const argId = process.argv[2];
if (!argId) {
    console.log('Usage: node import-backed-up-contract.js <AGREEMENT_ID>');
    const agreements = loadBackup('agreements');
    const signed = agreements.filter(a => a.fields.status?.stringValue === 'Signed');
    console.log('\nAvailable Signed Contracts in backup:');
    signed.forEach(a => {
        const id = a.name.split('/').pop();
        const date = a.fields.dateSigned?.timestampValue || 'Unknown Date';
        console.log(`- ID: ${id} | Signed: ${date}`);
    });
} else {
    importContract(argId).then(() => process.exit(0)).catch(err => {
        console.error(err);
        process.exit(1);
    });
}
