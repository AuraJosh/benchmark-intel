import { google } from "googleapis";
import admin from "firebase-admin";
import { VertexAI } from "@google-cloud/vertexai";

// Use environment variables for OAuth Client ID and Secret
const OAUTH_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const OAUTH_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const OAUTH_REDIRECT_URI = "https://europe-west2-benchmark-intel-3ea4a.cloudfunctions.net/handleGmailCallback";

const getOAuthClient = () => {
    return new google.auth.OAuth2(
        OAUTH_CLIENT_ID,
        OAUTH_CLIENT_SECRET,
        OAUTH_REDIRECT_URI
    );
};

export const getGmailAuthUrl = async () => {
    const oauth2Client = getOAuthClient();
    const scopes = [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.modify'
    ];
    
    return oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: scopes
    });
};

export const handleCallback = async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send("No code provided.");
    try {
        const oauth2Client = getOAuthClient();
        const { tokens } = await oauth2Client.getToken(code);
        await admin.firestore().collection('systemSettings').doc('gmailAuth').set({
            tokens,
            updatedAt: new Date().toISOString()
        });
        res.send("Gmail authentication successful! You can close this window. Please set up the watch function next.");
    } catch (error) {
        console.error("Error retrieving access token", error);
        res.status(500).send("Authentication failed.");
    }
};

export const getGmailClient = async () => {
    const doc = await admin.firestore().collection('systemSettings').doc('gmailAuth').get();
    if (!doc.exists) throw new Error("Gmail Auth settings not found.");
    const data = doc.data();
    const oauth2Client = getOAuthClient();
    oauth2Client.setCredentials(data.tokens);
    return google.gmail({ version: 'v1', auth: oauth2Client });
};

export const setupGmailWatch = async (topicName) => {
    const gmail = await getGmailClient();
    const res = await gmail.users.watch({
        userId: 'me',
        requestBody: {
            topicName: topicName,
            labelIds: ['INBOX', 'SENT']
        }
    });
    await admin.firestore().collection('systemSettings').doc('gmailAuth').update({
        historyId: res.data.historyId,
        watchExpiration: res.data.expiration
    });
    return res.data;
};

const summarizeEmail = async (texto) => {
    if (!texto || texto.trim().length < 10) return "No content to summarize.";
    try {
        const project = process.env.GCLOUD_PROJECT || admin.instanceId().app.options.projectId;
        const vertexAI = new VertexAI({ project: project, location: 'us-central1' });
        const generativeModel = vertexAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const request = {
            contents: [{
                role: 'user',
                parts: [{ text: "Please provide a simple, very concise summary of ONLY the most recent message in this email thread. Ignore any quoted previous emails or reply chains below it.\n\nCRITICAL FORMATTING RULES:\n1. DO NOT use Markdown formatting.\n2. DO NOT use asterisks (*) for bolding or bullet points.\n3. Use strictly ALL CAPS for headers (e.g., SUMMARY:, ACTION ITEMS:).\n4. Use standard hyphens (-) for bullet points.\n5. Keep it clean plain text only.\n6. Focus EXCLUSIVELY on the newest reply. If it's a direct reply, just summarize that specific new response. Do not summarize the previous emails in the chain.\n\nEmail Content:\n" + texto }],
            }],
        };
        const result = await generativeModel.generateContent(request);
        if (result.response?.candidates?.[0]?.content?.parts?.[0]?.text) {
            return result.response.candidates[0].content.parts[0].text;
        }
    } catch (e) {
        console.error("Summarization error", e);
    }
    return "Summary unavailable.";
};

const extractTextFromPayload = (payload) => {
    let text = '';
    const decode = (data) => Buffer.from(data, 'base64url').toString('utf8');

    const traverse = (part) => {
        if (part.mimeType === 'text/plain' && part.body?.data) {
            text += decode(part.body.data) + '\n';
        } else if (part.mimeType === 'text/html' && part.body?.data && !text) {
            const html = decode(part.body.data);
            text += html.replace(/<[^>]*>?/gm, '') + '\n'; 
        }
        if (part.parts) part.parts.forEach(traverse);
    };

    if (payload.parts) payload.parts.forEach(traverse);
    else if (payload.body?.data) text = decode(payload.body.data);
    
    return text.trim();
};

export const handleGmailPush = async (req, res) => {
    const message = req.body.message;
    if (!message || !message.data) return res.status(400).send("Bad Request");

    try {
        const dataStr = Buffer.from(message.data, 'base64').toString('utf8');
        const eventData = JSON.parse(dataStr);
        const newHistoryId = eventData.historyId;

        const db = admin.firestore();
        const settingsDoc = await db.collection('systemSettings').doc('gmailAuth').get();
        if (!settingsDoc.exists) return res.status(200).send("No Auth");
        const settings = settingsDoc.data();
        
        let startHistoryId = settings.historyId;
        if (!startHistoryId) {
            await db.collection('systemSettings').doc('gmailAuth').update({ historyId: newHistoryId });
            return res.status(200).send("Initialized historyId");
        }

        const gmail = await getGmailClient();
        let historyResponse;
        try {
            historyResponse = await gmail.users.history.list({
                userId: 'me',
                startHistoryId: startHistoryId,
                historyTypes: ['messageAdded']
            });
        } catch (e) {
            if (e.code === 404) {
               await db.collection('systemSettings').doc('gmailAuth').update({ historyId: newHistoryId });
               return res.status(200).send("History reset");
            }
            throw e;
        }

        const history = historyResponse.data.history || [];
        const processedMessages = new Set();
        
        const buildersRef = await db.collection('builders').get();
        const buildersMap = {};
        buildersRef.forEach(doc => {
            const data = doc.data();
            if (data.email) buildersMap[data.email.toLowerCase().trim()] = { id: doc.id, name: data.companyName || data.firstName || 'Unknown' };
        });

        for (const item of history) {
            if (!item.messagesAdded) continue;
            for (const msgAdded of item.messagesAdded) {
                const msgId = msgAdded.message.id;
                if (processedMessages.has(msgId)) continue;
                processedMessages.add(msgId);

                let msgDetail;
                try {
                    msgDetail = await gmail.users.messages.get({ userId: 'me', id: msgId, format: 'full' });
                } catch (e) {
                    if (e.code === 404) continue;
                    throw e;
                }

                const headers = msgDetail.data.payload.headers;
                const rfcMessageId = headers.find(h => h.name.toLowerCase() === 'message-id')?.value || msgId;
                
                // Safe string for Firestore document ID
                const safeLockId = rfcMessageId.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 100);

                // ULTRA STRICT ATOMIC LOCK
                const msgLockRef = db.collection('processedEmails').doc(safeLockId);
                let alreadyProcessed = true;
                try {
                    await db.runTransaction(async (t) => {
                        const lockDoc = await t.get(msgLockRef);
                        if (!lockDoc.exists) {
                            t.set(msgLockRef, { timestamp: admin.firestore.FieldValue.serverTimestamp() });
                            alreadyProcessed = false;
                        }
                    });
                } catch (err) {
                    console.error("Transaction failed", err);
                    continue;
                }

                if (alreadyProcessed) {
                    console.log(`Message ${safeLockId} is already locked. Skipping duplicate copy.`);
                    continue;
                }
                
                const fromHeader = headers.find(h => h.name.toLowerCase() === 'from')?.value || '';
                const toHeader = headers.find(h => h.name.toLowerCase() === 'to')?.value || '';
                const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || 'No Subject';
                const dateHeader = headers.find(h => h.name.toLowerCase() === 'date')?.value;
                
                let msgDate = new Date();
                if (dateHeader) {
                    const parsed = new Date(dateHeader);
                    if (!isNaN(parsed.getTime())) msgDate = parsed;
                }

                const fromEmail = (fromHeader.match(/<([^>]+)>/)?.[1] || fromHeader).toLowerCase().trim();
                const toEmail = (toHeader.match(/<([^>]+)>/)?.[1] || toHeader).toLowerCase().trim();

                let builderMatch = buildersMap[fromEmail];
                let isIncoming = true;
                if (!builderMatch) {
                    builderMatch = buildersMap[toEmail];
                    isIncoming = false;
                }

                if (builderMatch) {
                    const plainText = extractTextFromPayload(msgDetail.data.payload);
                    const summary = await summarizeEmail(plainText);
                    
                    // MATCHING THE FRONTEND'S EXPECTED FORMAT EXACTLY
                    const correspondenceData = {
                        category: 'Email', 
                        timestamp: admin.firestore.Timestamp.fromDate(msgDate),
                        notes: summary,
                        subject: subject,
                        direction: isIncoming ? 'Inbound' : 'Outbound', // Toggles "They contacted us" vs "We contacted them"
                        staff: 'JW', // Default staff
                        mode: 'builder',
                        builderId: builderMatch.id,
                        builderName: builderMatch.name,
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        messageId: msgId,
                        fullEmail: plainText // Store full email just in case
                    };
                    
                    await db.collection("correspondence").add(correspondenceData);
                }
            }
        }

        await db.collection('systemSettings').doc('gmailAuth').update({ historyId: newHistoryId });
        res.status(200).send("OK");
    } catch (error) {
        console.error("Gmail Webhook Error", error);
        res.status(500).send("Error");
    }
};
