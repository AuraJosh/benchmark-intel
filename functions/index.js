import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentUpdated, onDocumentCreated } from "firebase-functions/v2/firestore";
import { runScraper } from "./scraper.js";
import { finalizeContract } from "./contractHandler.js";
import { processUpload } from "./uploadHandler.js";
import { createProjectWorkspace } from "./workspaceHandler.js";
import { handleTranscription } from "./transcribeHandler.js";
import { 
    getGmailAuthUrl, 
    handleCallback, 
    setupGmailWatch, 
    handleGmailPush 
} from "./gmailHandler.js";

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
    memory: "4GiB",
    cpu: 2, // Explicitly requesting more CPU to prevent launch crashes
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
    memory: "1GiB",
    secrets: ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"]
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

export const transcribeAudio = onDocumentCreated({
    document: "correspondence/{docId}",
    region: "europe-west2",
    timeoutSeconds: 300,
    memory: "512MiB"
}, async (event) => {
    try {
        await handleTranscription(event);
    } catch (error) {
        console.error("Transcribe process failed:", error);
    }
});

export const transcribeAudioUpdated = onDocumentUpdated({
    document: "correspondence/{docId}",
    region: "europe-west2",
    timeoutSeconds: 300,
    memory: "512MiB"
}, async (event) => {
    try {
        // Only run if the recordingUrl is present and transcription hasn't been completed yet
        const after = event.data.after.data();
        const before = event.data.before.data();
        
        // Trigger if summary was requested or if it's a new recordingUrl update
        if (after.recordingUrl && after.transcriptionStatus !== 'completed' && after.transcriptionStatus !== 'processing') {
             await handleTranscription(event);
        }
    } catch (error) {
        console.error("Transcribe update process failed:", error);
    }
});

export const backfillTranscriptions = onRequest({
    region: "europe-west2",
    timeoutSeconds: 300,
}, async (req, res) => {
    const db = admin.firestore();
    const snap = await db.collection("correspondence").get();
    let count = 0;
    for (const d of snap.docs) {
        const data = d.data();
        if (data.recordingUrl && (!data.transcriptionStatus || data.transcriptionStatus === 'error')) {
            await db.collection("correspondence").doc(d.id).update({
                transcriptionStatus: 'pending_backfill'
            });
            count++;
        }
    }
    res.send({
        total: snap.docs.length,
        triggered: count,
        details: snap.docs.map(d => ({
            id: d.id,
            hasUrl: !!d.data().recordingUrl,
            status: d.data().transcriptionStatus || 'none'
        }))
    });
});

// ==========================================
// 1.5 GMAIL WEBHOOK & OAUTH ENDPOINTS
// ==========================================

export const gmailAuthUrl = onRequest({
    region: "europe-west2",
    cors: true,
    timeoutSeconds: 30
}, async (req, res) => {
    try {
        const url = await getGmailAuthUrl();
        res.status(200).send({ url });
    } catch (e) {
        res.status(500).send({ error: e.message });
    }
});

export const handleGmailCallback = onRequest({
    region: "europe-west2",
    cors: true,
    timeoutSeconds: 30
}, async (req, res) => {
    await handleCallback(req, res);
});

export const startGmailWatch = onRequest({
    region: "europe-west2",
    cors: true,
    timeoutSeconds: 30
}, async (req, res) => {
    try {
        const { topicName } = req.body;
        if (!topicName) return res.status(400).send({ error: "Missing topicName. Example: projects/YOUR_PROJECT/topics/your-topic" });
        const result = await setupGmailWatch(topicName);
        res.status(200).send(result);
    } catch (e) {
        res.status(500).send({ error: e.message });
    }
});

export const gmailWebhook = onRequest({
    region: "europe-west2",
    cors: true,
    timeoutSeconds: 300,
    memory: "1GiB"
}, async (req, res) => {
    await handleGmailPush(req, res);
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

// ==========================================
// 3. PUSH NOTIFICATION TRIGGERS
// ==========================================

const sendToAllStaff = async (payload) => {
    try {
        const profilesSnap = await admin.firestore().collection('staff_profiles').get();
        const allTokens = [];
        profilesSnap.forEach(doc => {
            const profile = doc.data();
            if (profile.notificationsEnabled && profile.fcmTokens && Array.isArray(profile.fcmTokens)) {
                allTokens.push(...profile.fcmTokens);
            }
        });
        if (allTokens.length > 0) {
            await admin.messaging().sendEachForMulticast({
                tokens: [...new Set(allTokens)],
                notification: payload.notification,
                data: payload.data || {},
                webpush: { fcmOptions: { link: payload.data?.clickAction || '/' } }
            });
        }
    } catch (err) {
        console.error("Error in sendToAllStaff:", err);
    }
};

// --- A. REAL-TIME CONFIRMATIONS ---
export const notifyOnFollowUpSet = onDocumentUpdated({
    document: "{collection}/{docId}",
    database: "(default)",
    region: "europe-west2"
}, async (event) => {
    if (event.params.collection !== 'projects' && event.params.collection !== 'builders') return;

    const before = event.data.before.data();
    const after = event.data.after.data();

    // Trigger ONLY if corrFollowUp was added or changed
    if (after.corrFollowUp && after.corrFollowUp !== before.corrFollowUp) {
        const name = event.params.collection === 'projects' ? (after.address || 'Project') : (after.companyName || 'Builder');
        const date = new Date(after.corrFollowUp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

        await sendToAllStaff({
            notification: {
                title: "📅 Follow-up Set",
                body: `Follow-up confirmed for ${name} on ${date}.`,
            },
            data: { clickAction: `https://app.benchmarkintelligence.co.uk/#/correspondence?type=${event.params.collection === 'projects' ? 'homeowner' : 'builder'}&id=${event.params.docId}` }
        });
    }
});

// --- B. SCHEDULED DAILY SUMMARIES (9 AM & 11 AM) ---
const sendDailySummary = async (label) => {
    const db = admin.firestore();
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    let overdueInvoices = 0;
    let dueFollowUps = 0;
    let pendingTodos = 0;

    // 1. Check Projects for Follow-ups
    const projects = await db.collection('projects').get();
    projects.forEach(p => {
        const data = p.data();
        if (data.status === 'Archive' || data.status === 'Dead') return;
        if (data.corrFollowUp) {
            const fu = new Date(data.corrFollowUp);
            fu.setHours(0,0,0,0);
            if (fu <= now) dueFollowUps++;
        }
    });

    // 2. Chaser Invoices
    const invoices = await db.collection('invoices').get();
    invoices.forEach(inv => {
        const data = inv.data();
        if ((data.status || '').toLowerCase() === 'paid') return;
        if (data.payments) {
            ['p1','p2','p3'].forEach(k => {
                const p = data.payments[k];
                if (p && (p.status||'').toLowerCase() !== 'paid' && p.dueDate) {
                    const d = p.dueDate.toDate ? p.dueDate.toDate() : new Date(p.dueDate);
                    d.setHours(0,0,0,0);
                    if (d <= now) overdueInvoices++;
                }
            });
        }
    });

    // 3. Custom To-Dos
    const todos = await db.collection('customReminders').get();
    todos.forEach(t => {
        const data = t.data();
        if (!data.completed) pendingTodos++;
    });

    const total = overdueInvoices + dueFollowUps + pendingTodos;

    if (total > 0) {
        await sendToAllStaff({
            notification: {
                title: `🔔 ${label}: ${total} Items`,
                body: `${dueFollowUps} follow-ups, ${overdueInvoices} invoices, and ${pendingTodos} to-dos need your attention.`,
            },
            data: { clickAction: 'https://app.benchmarkintelligence.co.uk/#/' }
        });
    }
};

export const dailySummary9am = onSchedule({
    region: "europe-west2",
    schedule: "0 9 * * *",
    timeZone: "Europe/London"
}, () => sendDailySummary("Morning Summary"));

export const dailySummary11am = onSchedule({
    region: "europe-west2",
    schedule: "0 11 * * *",
    timeZone: "Europe/London"
}, () => sendDailySummary("11 AM Update"));

// --- C. REAL-TIME FINANCE & TASK TRIGGERS ---

// 1. Notify on New Expense
export const notifyOnNewExpense = onDocumentCreated({
    document: "fin_expenses/{docId}",
    region: "europe-west2"
}, async (event) => {
    const data = event.data.data();
    await sendToAllStaff({
        notification: {
            title: "💸 Expense Logged",
            body: `New £${data.amount.toFixed(2)} expense: ${data.description}`,
        },
        data: { clickAction: 'https://app.benchmarkintelligence.co.uk/#/finance' }
    });
});

// 2. Notify on New Revenue
export const notifyOnNewRevenue = onDocumentCreated({
    document: "fin_revenue/{docId}",
    region: "europe-west2"
}, async (event) => {
    const data = event.data.data();
    await sendToAllStaff({
        notification: {
            title: "💰 Revenue Received",
            body: `Incoming payment of £${data.amount.toFixed(2)}: ${data.description}`,
        },
        data: { clickAction: 'https://app.benchmarkintelligence.co.uk/#/finance' }
    });
});

// 3. Notify on New To-Do Task
export const notifyOnNewTodo = onDocumentCreated({
    document: "customReminders/{docId}",
    region: "europe-west2"
}, async (event) => {
    const data = event.data.data();
    await sendToAllStaff({
        notification: {
            title: "📝 New Task Added",
            body: data.text,
        },
        data: { clickAction: 'https://app.benchmarkintelligence.co.uk/#/' }
    });
});

// 4. Notify on Invoice Payment Progress
export const notifyOnInvoicePayment = onDocumentUpdated({
    document: "invoices/{docId}",
    region: "europe-west2"
}, async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();

    // Check if any payment part was marked as 'Paid'
    let newlyPaidPart = null;
    ['p1', 'p2', 'p3'].forEach(k => {
        const b = before.payments?.[k];
        const a = after.payments?.[k];
        if (a && a.status === 'Paid' && (!b || b.status !== 'Paid')) {
            newlyPaidPart = k.toUpperCase();
        }
    });

    if (newlyPaidPart) {
        const builderSnap = await admin.firestore().collection('builders').doc(after.builderId).get();
        const builderName = builderSnap.exists ? (builderSnap.data().companyName || 'Builder') : 'Builder';
        
        await sendToAllStaff({
            notification: {
                title: "✅ Invoice Part Paid",
                body: `Payment ${newlyPaidPart} for ${builderName} confirmed.`,
            },
            data: { clickAction: `https://app.benchmarkintelligence.co.uk/#/invoices?id=${event.params.docId}` }
        });
    }
});

// 5. Notify on Contract Signed
export const notifyOnContractSigned = onDocumentCreated({
    document: "signedContracts/{docId}",
    region: "europe-west2"
}, async (event) => {
    const data = event.data.data();
    await sendToAllStaff({
        notification: {
            title: "✍️ Contract Signed",
            body: `${data.builderName || 'A builder'} has signed their contract.`,
        },
        data: { clickAction: 'https://app.benchmarkintelligence.co.uk/#/contracts' }
    });
});

export const testPushNotification = onRequest({
    region: "europe-west2",
    cors: [/app\.benchmarkintelligence\.co\.uk$/, /localhost:5173$/],
    invoker: "public"
}, async (req, res) => {
    // Manually handle preflight if needed
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        res.status(204).send('');
        return;
    }

    const { uid } = req.body;
    if (!uid) return res.status(400).send({ success: false, error: "Missing UID" });

    try {
        const userRef = admin.firestore().collection('staff_profiles').doc(uid);
        const doc = await userRef.get();
        if (!doc.exists || !doc.data().fcmTokens) {
            console.log(`No tokens for user: ${uid}`);
            return res.status(200).send({ success: false, error: "No registered tokens found." });
        }

        const tokens = [...new Set(doc.data().fcmTokens)];
        const response = await admin.messaging().sendEachForMulticast({
            tokens: tokens,
            notification: {
                title: "🚀 Test Successful!",
                body: "Your notifications are now fully connected to Benchmark Intelligence.",
            },
            webpush: { 
                fcmOptions: { link: 'https://app.benchmarkintelligence.co.uk/' } 
            }
        });

        // Clean up invalid tokens automatically
        if (response.failureCount > 0) {
            const validTokens = tokens.filter((_, i) => response.responses[i].success);
            await userRef.update({ fcmTokens: validTokens });
        }

        console.log(`Sent ${response.successCount} messages for user ${uid}`);
        res.status(200).send({ success: true, tokenCount: tokens.length, sentCount: response.successCount });
    } catch (err) {
        console.error("Test push failed:", err);
        res.status(500).send({ success: false, error: err.message });
    }
});