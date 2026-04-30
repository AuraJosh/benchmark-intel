import fs from "fs";
import os from "os";
import path from "path";
import axios from "axios";
import admin from "firebase-admin";
import { VertexAI } from "@google-cloud/vertexai";

export const handleTranscription = async (event) => {
    // Support both onCreate (data()) and onUpdate (after.data())
    const data = event.data.after ? event.data.after.data() : event.data.data();
    const docId = event.params.docId;
    const db = admin.firestore();

    // 1. Validation
    if (!data.recordingUrl || data.transcriptionStatus === "completed" || data.category !== 'Call') {
        return null;
    }

    try {
        // Update status to processing
        await db.collection("correspondence").doc(docId).update({
            transcriptionStatus: "processing",
        });

        // 2. Initialize Gemini 1.5 Flash
        // We will try europe-west2 first as it's your primary region
        const project = process.env.GCLOUD_PROJECT || admin.instanceId().app.options.projectId;
        console.log(`Using Project: ${project} in europe-west2`);
        
        const vertexAI = new VertexAI({ project: project, location: 'us-central1' });
        const generativeModel = vertexAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
        });

        // 3. Download the audio file
        const response = await axios({
            method: "GET",
            url: data.recordingUrl,
            responseType: "arraybuffer",
            timeout: 15000
        });

        const audioBuffer = Buffer.from(response.data);
        const base64Audio = audioBuffer.toString("base64");

        // 4. Send to Gemini
        const request = {
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: "Transcribe this audio recording accurately. Only output the spoken text." },
                        {
                            inlineData: {
                                data: base64Audio,
                                mimeType: 'audio/webm',
                            },
                        },
                    ],
                },
            ],
        };

        const result = await generativeModel.generateContent(request);
        
        if (!result.response || !result.response.candidates || result.response.candidates.length === 0) {
            throw new Error("Gemini returned an empty response.");
        }

        const transcription = result.response.candidates[0].content.parts[0].text;

        // 5. Generate Summary
        const summaryRequest = {
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: "Please provide a concise, high-level summary of the following call transcript. Focus on key decisions, important updates, and actionable items.\n\nCRITICAL FORMATTING RULES:\n1. DO NOT use Markdown formatting.\n2. DO NOT use asterisks (*) for bolding or bullet points.\n3. Use strictly ALL CAPS for headers (e.g., SUMMARY:, KEY UPDATES:, ACTION ITEMS:).\n4. Use standard hyphens (-) for bullet points.\n5. Keep it clean plain text only.\n\nTranscript:\n" + transcription },
                    ],
                },
            ],
        };
        const summaryResult = await generativeModel.generateContent(summaryRequest);
        
        let summary = "Summary unavailable.";
        if (summaryResult.response && summaryResult.response.candidates && summaryResult.response.candidates.length > 0) {
            summary = summaryResult.response.candidates[0].content.parts[0].text;
        }

        // 6. Success Update
        await db.collection("correspondence").doc(docId).update({
            transcriptionStatus: "completed",
            transcription: transcription.trim(),
            notes: summary.trim(),
            transcriptionError: admin.firestore.FieldValue.delete()
        });

    } catch (error) {
        console.error("RAW ERROR:", error);
        
        // NO MORE GUESSING - show the raw error from Google
        let errorMessage = error.message;
        if (error.response && error.response.data) {
            errorMessage += " - " + JSON.stringify(error.response.data);
        }

        await db.collection("correspondence").doc(docId).update({
            transcriptionStatus: "error",
            transcriptionError: "AI Error: " + errorMessage
        });
    }
};
