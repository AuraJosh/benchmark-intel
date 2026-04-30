import admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

async function cleanup() {
    console.log("Starting duplicate cleanup...");
    const snapshot = await db.collection("correspondence").where("messageId", "!=", "").get();
    
    // Group by messageId
    const groups = {};
    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.messageId) {
            if (!groups[data.messageId]) groups[data.messageId] = [];
            groups[data.messageId].push(doc);
        }
    });

    let deleted = 0;
    for (const [msgId, docs] of Object.entries(groups)) {
        if (docs.length > 1) {
            // Sort by creation time (keep the first one)
            docs.sort((a, b) => {
                const ta = a.data().createdAt?.toMillis() || Date.now();
                const tb = b.data().createdAt?.toMillis() || Date.now();
                return ta - tb;
            });
            // Keep the first one, delete the rest
            for (let i = 1; i < docs.length; i++) {
                await docs[i].ref.delete();
                deleted++;
            }
        }
    }
    
    console.log(`Cleanup complete! Deleted ${deleted} duplicate records.`);
    process.exit(0);
}

cleanup().catch(console.error);
