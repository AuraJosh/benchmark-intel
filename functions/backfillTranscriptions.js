import admin from "firebase-admin";
import axios from "axios";
import { VertexAI } from "@google-cloud/vertexai";

// Initialize Admin
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'benchmark-intel-3ea4a'
    });
}

const db = admin.firestore();

async function backfill() {
    console.log("Checking for recordings that need transcription...");
    
    // Find all correspondence with a recordingUrl but no transcriptionStatus
    const snap = await db.collection("correspondence")
        .where("recordingUrl", ">", "")
        .get();

    const pending = snap.docs.filter(doc => !doc.data().transcriptionStatus);
    console.log(`Found ${pending.length} recordings to process.`);

    const project = 'benchmark-intel-3ea4a';
    const vertexAI = new VertexAI({ project: project, location: 'us-central1' });
    const generativeModel = vertexAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
    });

    for (const doc of pending) {
        const data = doc.data();
        const docId = doc.id;
        
        console.log(`Processing ${docId}...`);

        try {
            // Update status to processing
            await db.collection("correspondence").doc(docId).update({
                transcriptionStatus: "processing",
            });

            // 1. Download
            const response = await axios({
                method: "GET",
                url: data.recordingUrl,
                responseType: "arraybuffer",
                timeout: 15000
            });
            const audioBuffer = Buffer.from(response.data);
            const base64Audio = audioBuffer.toString("base64");

            // 2. Transcribe
            const transcribeRequest = {
                contents: [{
                    role: 'user',
                    parts: [
                        { text: "Transcribe this audio recording accurately. Only output the spoken text." },
                        { inlineData: { data: base64Audio, mimeType: 'audio/webm' } },
                    ],
                }],
            };
            const tResult = await generativeModel.generateContent(transcribeRequest);
            const transcription = tResult.response.candidates[0].content.parts[0].text;

            // 3. Summarize
            const summaryRequest = {
                contents: [{
                    role: 'user',
                    parts: [
                        { text: "Please provide a concise, high-level summary of the following call transcript. Focus on key decisions, important updates, and actionable items.\n\nCRITICAL FORMATTING RULES:\n1. DO NOT use Markdown formatting.\n2. DO NOT use asterisks (*) for bolding or bullet points.\n3. Use strictly ALL CAPS for headers (e.g., SUMMARY:, KEY UPDATES:, ACTION ITEMS:).\n4. Use standard hyphens (-) for bullet points.\n5. Keep it clean plain text only.\n\nTranscript:\n" + transcription },
                    ],
                }],
            };
            const sResult = await generativeModel.generateContent(summaryRequest);
            const summary = sResult.response.candidates[0].content.parts[0].text;

            // 4. Save
            await db.collection("correspondence").doc(docId).update({
                transcriptionStatus: "completed",
                transcription: transcription.trim(),
                notes: summary.trim(),
            });

            console.log(`Done with ${docId}`);

        } catch (err) {
            console.error(`Failed ${docId}:`, err.message);
            await db.collection("correspondence").doc(docId).update({
                transcriptionStatus: "error",
                transcriptionError: err.message
            });
        }
    }

    console.log("Backfill complete!");
    process.exit(0);
}

backfill();
