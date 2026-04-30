import { db } from './admin.js';

async function backfill() {
    console.log("Fetching recordings for backfill...");
    const snap = await db.collection("correspondence")
        .where("recordingUrl", ">", "")
        .get();

    console.log(`Found ${snap.docs.length} total recordings.`);
    let count = 0;

    for (const d of snap.docs) {
        const data = d.data();
        if (!data.transcriptionStatus || data.transcriptionStatus === 'error') {
            console.log(`Triggering backfill for ${d.id}...`);
            // Updating a dummy field or re-writing transcriptionStatus to 'pending' 
            // will trigger transcribeAudioUpdated cloud function
            await db.collection("correspondence").doc(d.id).update({
                transcriptionStatus: 'pending_backfill'
            });
            count++;
        }
    }

    console.log(`Successfully triggered ${count} backfills. They will process in the background.`);
    process.exit(0);
}

backfill().catch(err => {
    console.error(err);
    process.exit(1);
});
