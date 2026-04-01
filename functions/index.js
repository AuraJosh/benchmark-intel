import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { runScraper } from "./scraper.js";
import { finalizeContract } from "./contractHandler.js";
import { processUpload } from "./uploadHandler.js";
import { createProjectWorkspace } from "./workspaceHandler.js";

// --- NEW IMPORTS FOR THE OLD UPLOAD PIPELINE ---
import Busboy from "busboy";
import path from "path";
import os from "os";
import fs from "fs";
import AdmZip from "adm-zip";
import crypto from "crypto";
import admin from "firebase-admin";

// Initialize Firebase Admin if it hasn't been already
if (!admin.apps.length) {
    admin.initializeApp();
}

// ==========================================
// 1. BENCHMARK INTELLIGENCE FUNCTIONS
// ==========================================

export const scraper = onRequest({
    region: "europe-west2",
    cors: true,
    timeoutSeconds: 540,
    memory: "2GiB"
}, async (req, res) => {
    console.log("ScraperSync - RECEIVED:", req.method, JSON.stringify(req.body));
    try {
        const targetWeek = req.query.targetWeek || req.body.targetWeek || req.body.week || null;
        const results = await runScraper(targetWeek);
        res.status(200).json({ success: true, message: "Sync complete.", data: results });
    } catch (error) {
        console.error("ScraperSync - FATAL ERROR:", error);
        res.status(500).json({ success: false, error: error.message, stack: error.stack });
    }
});

export const scheduledSync = onSchedule({
    region: "europe-west2",
    schedule: "0 17 * * 5",
    timeoutSeconds: 540,
    memory: "2GiB",
    timeZone: "Europe/London"
}, async (event) => {
    try {
        await runScraper();
    } catch (error) {
        console.error("Scheduled sync failed:", error);
    }
});

export const signContract = onRequest({
    region: "europe-west2",
    cors: true,
    timeoutSeconds: 120,
    memory: "1GiB"
}, async (req, res) => {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    const { agreementId, signatureData } = req.body;
    if (!agreementId || !signatureData) return res.status(400).json({ error: "Missing agreementId or signatureData" });

    try {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
        const userAgent = req.headers['user-agent'] || 'unknown';
        const result = await finalizeContract({ agreementId, signatureData, ip, userAgent });
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Your new upload pipeline (Kept intact so we don't break your app)
export const uploadFiles = onRequest({
    region: "europe-west2",
    cors: true,
    invoker: "public",
    timeoutSeconds: 300,
    memory: "1GiB"
}, async (req, res) => {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    try {
        await processUpload(req, res);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export const initializeWorkspace = onRequest({
    region: "europe-west2",
    cors: true,
    timeoutSeconds: 540,
    memory: "2GiB"
}, async (req, res) => {
    if (req.method !== 'POST') return res.status(405).send('Not Allowed');
    const { projectId, reference } = req.body;
    if (!projectId || !reference) return res.status(400).json({ error: "Missing projectId or reference" });
    try {
        const result = await createProjectWorkspace(projectId, reference);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 2. PROJECT PACK LEGACY UPLOAD PIPELINE
// ==========================================

export const uploadToDrive = onRequest({
    region: "europe-west2",
    cors: true,
    invoker: "public",
    timeoutSeconds: 300,
    memory: "1GiB"
}, async (req, res) => {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    return new Promise((resolve) => {
        const busboy = Busboy({ headers: req.headers });
        const fileUploads = [];
        let projectId = null;
        let address = null;
        let documentContext = null;

        busboy.on("field", (fieldname, val) => {
            if (fieldname === "projectId" || fieldname === "folderId") projectId = val;
            if (fieldname === "address") address = val;
            if (fieldname === "documentContext") {
                try {
                    documentContext = JSON.parse(val);
                } catch (e) {
                    console.error("Failed to parse documentContext", e);
                }
            }
        });

        busboy.on("file", (fieldname, file, info) => {
            const { filename, mimeType } = info;
            const filepath = path.join(os.tmpdir(), filename);
            const writeStream = fs.createWriteStream(filepath);

            const filePromise = new Promise((resolve, reject) => {
                writeStream.on('finish', resolve);
                writeStream.on('error', reject);
            });

            fileUploads.push({ file: filepath, name: filename, type: mimeType, promise: filePromise });
            file.pipe(writeStream);
        });

        busboy.on("finish", async () => {
            try {
                await Promise.all(fileUploads.map(f => f.promise));
                if (!projectId) throw new Error("Missing projectId in request");

                const bucket = admin.storage().bucket();
                const uploadedFiles = [];

                const slug = address ? address.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '_').substring(0, 30) : '';
                let folderPath = address ? `projects/${slug}_${projectId}` : `projects/${projectId}`;

                for (const up of fileUploads) {
                    const isZip = up.type === 'application/zip' || up.name.toLowerCase().endsWith('.zip');

                    if (isZip) {
                        const zip = new AdmZip(up.file);
                        const zipEntries = zip.getEntries();

                        for (const entry of zipEntries) {
                            if (!entry.isDirectory && entry.entryName.toLowerCase().endsWith('.pdf')) {
                                const entryBuffer = entry.getData();
                                const entryName = path.basename(entry.entryName);
                                const dest = `${folderPath}/documents/${entryName}`;

                                const token = crypto.randomUUID();
                                const fileRef = bucket.file(dest);
                                await fileRef.save(entryBuffer, {
                                    metadata: { contentType: 'application/pdf', metadata: { firebaseStorageDownloadTokens: token } }
                                });

                                const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(dest)}?alt=media&token=${token}`;
                                uploadedFiles.push({ name: entryName, url });
                            }
                        }
                    } else {
                        const dest = `${folderPath}/documents/${up.name}`;
                        const token = crypto.randomUUID();
                        await bucket.upload(up.file, {
                            destination: dest,
                            metadata: { contentType: up.type, metadata: { firebaseStorageDownloadTokens: token } }
                        });

                        const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(dest)}?alt=media&token=${token}`;
                        uploadedFiles.push({ name: up.name, url });
                    }
                    if (fs.existsSync(up.file)) fs.unlinkSync(up.file);
                }

                if (uploadedFiles.length > 0) {
                    const docRef = admin.firestore().collection('projects').doc(projectId);
                    
                    const updateData = {
                        projectFiles: admin.firestore.FieldValue.arrayUnion(...uploadedFiles),
                        lastUpdated: new Date().toISOString()
                    };

                    if (documentContext) {
                        updateData.documentDescriptions = documentContext;
                    }

                    await docRef.set(updateData, { merge: true });
                }

                res.json({ success: true, files: uploadedFiles });
                resolve();
            } catch (error) {
                console.error("Firebase Storage Upload Error", error);
                res.status(500).json({ error: error.message });
                resolve();
            }
        });

        if (req.rawBody) busboy.end(req.rawBody);
        else req.pipe(busboy);
    });
});