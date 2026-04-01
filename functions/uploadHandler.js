import admin from 'firebase-admin';
import busboy from 'busboy';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import AdmZip from 'adm-zip';
import './admin.js'; // Ensure initialized

export const processUpload = async (req, res) => {
    return new Promise((resolve, reject) => {
        const bb = busboy({ headers: req.headers });
        const tmpFiles = [];
        const results = [];
        let projectId = '';
        let address = '';

        bb.on('field', (name, val) => {
            console.log(`[Busboy] Field: ${name}`);
            if (name === 'projectId') projectId = val;
            if (name === 'address') address = val;
        });

        const uploadPromises = [];

        bb.on('file', (name, file, info) => {
            const { filename, mimeType } = info;
            console.log(`[Busboy] File detected: ${filename} (${mimeType})`);
            
            const filePath = path.join(os.tmpdir(), `${uuidv4()}_${filename}`);
            const writeStream = fs.createWriteStream(filePath);
            
            const promise = new Promise((res, rej) => {
                writeStream.on('finish', () => {
                    tmpFiles.push({
                        path: filePath,
                        name: filename,
                        mime: mimeType
                    });
                    res();
                });
                writeStream.on('error', rej);
                file.on('error', rej);
            });
            
            file.pipe(writeStream);
            uploadPromises.push(promise);
        });

        bb.on('finish', async () => {
            console.log(`[Busboy] Finished parsing. Waiting for writes...`);
            await Promise.all(uploadPromises);
            console.log(`[Busboy] Writes complete. Files found: ${tmpFiles.length}`);
            try {
                if (!projectId) throw new Error("Missing Project ID");
                
                const bucket = admin.storage().bucket();
                const baseFolder = `projects/${projectId}/documents/`;

                for (const tmpFile of tmpFiles) {
                    console.log(`[Upload] Processing ${tmpFile.name}...`);
                    if (tmpFile.mime === 'application/zip' || tmpFile.mime === 'application/x-zip-compressed' || tmpFile.name.toLowerCase().endsWith('.zip')) {
                        // Extraction Logic
                        console.log(`[Unzip] Extracting ${tmpFile.name}`);
                        const zip = new AdmZip(tmpFile.path);
                        const zipEntries = zip.getEntries();

                        for (const entry of zipEntries) {
                            if (entry.isDirectory) continue;
                            const internalName = entry.entryName.split('/').pop();
                            if (!internalName || internalName.startsWith('.') || internalName === '__MACOSX') continue;
                            
                            const isPdf = internalName.toLowerCase().endsWith('.pdf');
                            const isImg = /\.(jpe?g|png|webp)$/i.test(internalName);

                            if (isPdf || isImg) {
                                console.log(`[Unzip] Found target: ${internalName}`);
                                const buffer = entry.getData();
                                const safeName = internalName.replace(/[^a-zA-Z0-9.-]/g, '_');
                                const destPath = `${baseFolder}${safeName}`;
                                
                                const remoteFile = bucket.file(destPath);
                                const downloadToken = uuidv4();

                                await remoteFile.save(buffer, {
                                    metadata: {
                                        contentType: isPdf ? 'application/pdf' : 'image/jpeg',
                                        metadata: {
                                            firebaseStorageDownloadTokens: downloadToken
                                        }
                                    }
                                });

                                const encodedPath = encodeURIComponent(destPath);
                                const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${downloadToken}`;

                                results.push({ name: internalName, url: downloadUrl, fullPath: destPath, contentType: isPdf ? 'application/pdf' : 'image/jpeg' });
                            }
                        }
                    } else {
                        // Direct upload logic
                        console.log(`[Direct] Pitching ${tmpFile.name} to storage...`);
                        const isPdf = tmpFile.name.toLowerCase().endsWith('.pdf');
                        const isImg = /\.(jpe?g|png|webp)$/i.test(tmpFile.name);
                        
                        if (isPdf || isImg) {
                            const safeName = tmpFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
                            const destPath = `${baseFolder}${safeName}`;
                            const remoteFile = bucket.file(destPath);
                            const downloadToken = uuidv4();

                            await bucket.upload(tmpFile.path, {
                                destination: destPath,
                                metadata: {
                                    contentType: tmpFile.mime,
                                    metadata: {
                                        firebaseStorageDownloadTokens: downloadToken
                                    }
                                }
                            });

                            const encodedPath = encodeURIComponent(destPath);
                            const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${downloadToken}`;

                            results.push({ name: tmpFile.name, url: downloadUrl, fullPath: destPath, contentType: tmpFile.mime });
                        }
                    }

                    if (fs.existsSync(tmpFile.path)) fs.unlinkSync(tmpFile.path);
                }

                console.log(`[Success] Processed ${results.length} valid items.`);
                res.status(200).json({ success: true, files: results });
                resolve();
            } catch (error) {
                console.error("[Upload Error]", error);
                res.status(500).json({ success: false, error: error.message });
                tmpFiles.forEach(f => { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); });
                resolve();
            }
        });

        bb.on('error', (err) => {
            console.error("[Busboy Fatal Error]", err);
            res.status(500).json({ error: "Stream parsing failed: " + err.message });
            resolve();
        });

        if (req.rawBody) {
            console.log("[Busboy] Processing via rawBody buffer...");
            bb.end(req.rawBody);
        } else {
            console.log("[Busboy] Falling back to request pipe...");
            req.pipe(bb);
        }
    });
};
