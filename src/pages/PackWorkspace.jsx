import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { db, storage, vertexAI } from '../firebase';
import { doc, getDoc, updateDoc, arrayRemove } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject, uploadBytesResumable, listAll } from 'firebase/storage';
import { getGenerativeModel } from "@firebase/vertexai";
import { UploadCloud, File as FileIcon, Eye, Bot, RefreshCcw, Loader2, ArrowLeft, Download, CheckCircle2, Trash2, Copy, Ban, Maximize2, X, Link, ExternalLink, Package } from 'lucide-react';
import JSZip from 'jszip';
import * as pdfjsLib from 'pdfjs-dist';
import PDFPreviewModal from '../components/PDFPreviewModal';
import ConfirmationModal from '../components/ConfirmationModal';
import { generateCustomProjectId } from '../utils/projectIds';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const PackWorkspace = ({ id: propId, onClose: propOnClose }) => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const projectId = propId || searchParams.get('id');
    const handleClose = propOnClose || (() => navigate(-1));

    const [project, setProject] = useState(null);
    const [loading, setLoading] = useState(true);
    const [confirmation, setConfirmation] = useState({ isOpen: false, title: '', message: '', confirmText: '', type: 'warning', onConfirm: null });
    const [projectFiles, setProjectFiles] = useState([]);
    
    // UI states
    const [previewModalOpen, setPreviewModalOpen] = useState(false);
    const [isScraping, setIsScraping] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [isGeneratingAI, setIsGeneratingAI] = useState(false);
    const [isSummaryMaximized, setIsSummaryMaximized] = useState(false);
    const [isCopyingFigma, setIsCopyingFigma] = useState(false);
    const [isCleaningFigma, setIsCleaningFigma] = useState(false);
    const [hasCopiedFigma, setHasCopiedFigma] = useState(false);
    
    // Finished Pack state
    const [isUploadingPack, setIsUploadingPack] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const packInputRef = useRef(null);
    
    // Drag & Drop refs
    const fileInputRef = useRef(null);
    const [dragActive, setDragActive] = useState(false);

    useEffect(() => {
        if (!projectId) return;

        const fetchProject = async () => {
            try {
                const docRef = doc(db, 'projects', projectId);
                const snapshot = await getDoc(docRef);
                if (snapshot.exists()) {
                    const data = snapshot.data();
                    const currentCustomId = data.customId;
                    const calculatedId = (data.address && data.reference) 
                        ? generateCustomProjectId(data.address, data.reference, data.coordinates || null)
                        : null;
                    
                    // Auto-sync Custom ID if it's missing or was based on incomplete data (containing "UKN" or double hyphens)
                    if (calculatedId && (!currentCustomId || currentCustomId !== calculatedId)) {
                        await updateDoc(docRef, { customId: calculatedId });
                        data.customId = calculatedId;
                    }

                    setProject({ id: snapshot.id, ...data });
                    setProjectFiles(data.projectFiles || []);
                }
            } catch (error) {
                console.error("Error fetching workspace project:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchProject();
    }, [projectId]);

    const handleStartWorkspace = async () => {
        setConfirmation({
            isOpen: true,
            title: 'Auto-Scrape York Portal',
            message: 'Initialize auto-scrape from the York Portal? This will fetch all related documents and update active plans.',
            confirmText: 'Start Scrape',
            type: 'info',
            onConfirm: async () => {
                setConfirmation({ ...confirmation, isOpen: false });
                setIsScraping(true);
                try {
                    const response = await fetch('https://europe-west2-benchmark-intel-3ea4a.cloudfunctions.net/initializeWorkspace', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ projectId, address: project.address, reference: project.reference })
                    });
                    const data = await response.json();
                    if (data.success) {
                        alert(`Synchronization started! Scraped ${data.count || 0} documents successfully.`);
                    } else {
                        throw new Error(data.error || "Initialization failed");
                    }
                } catch (error) {
                    console.error("Workspace init error:", error);
                    alert("Scraper failed: " + error.message);
                } finally {
                    setIsScraping(false);
                }
            }
        });
    };

    const handleUploadFiles = async (files) => {
        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append('projectId', projectId);
            formData.append('address', project.address);
            
            for (const file of files) {
                formData.append('files', file);
            }

            // Call the backend Cloud Function
            const response = await fetch('https://europe-west2-benchmark-intel-3ea4a.cloudfunctions.net/uploadFiles', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Upload failed");
            }

            const data = await response.json();
            const uploadedFiles = data.files || [];

            const updatedList = [...projectFiles, ...uploadedFiles];
            await updateDoc(doc(db, 'projects', projectId), { projectFiles: updatedList });
            setProjectFiles(updatedList);
            
            if (uploadedFiles.length > 0) alert(`${uploadedFiles.length} file(s) processed and secured in the vault.`);
        } catch (error) {
            console.error("Upload error:", error);
            alert("Upload failed: " + error.message);
        } finally {
            setIsUploading(false);
        }
    };

    const handleUploadProjectPack = async (e) => {
        const file = e.target.files[0];
        if (!file || !projectId) return;

        setIsUploadingPack(true);
        setUploadProgress(0);

        try {
            const timestamp = Date.now();
            const storagePath = `projects/${projectId}/finished_pack/${timestamp}_${file.name}`;
            const storageRef = ref(storage, storagePath);
            const uploadTask = uploadBytesResumable(storageRef, file);

            uploadTask.on('state_changed', 
                (snapshot) => {
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    setUploadProgress(progress);
                }, 
                (error) => {
                    console.error("Upload error:", error);
                    alert("Upload failed.");
                    setIsUploadingPack(false);
                }, 
                async () => {
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    const packData = {
                        url: downloadURL,
                        name: file.name,
                        uploadedAt: new Date().toISOString(),
                        fullPath: storagePath
                    };

                    await updateDoc(doc(db, 'projects', projectId), {
                        finishedProjectPack: packData
                    });

                    setProject(prev => ({ ...prev, finishedProjectPack: packData }));
                    setIsUploadingPack(false);
                    setUploadProgress(0);
                    if (packInputRef.current) packInputRef.current.value = '';
                }
            );
        } catch (error) {
            console.error("Error setting up upload:", error);
            setIsUploadingPack(false);
        }
    };

    const handleDeleteProjectPack = async (e) => {
        e.stopPropagation();
        if (!project?.finishedProjectPack) return;
        
        setConfirmation({
            isOpen: true,
            title: 'Delete Project Pack',
            message: 'Are you sure you want to delete the finished project pack? This will remove the document from Firebase Storage.',
            confirmText: 'Delete Pack',
            type: 'danger',
            onConfirm: async () => {
                try {
                    const packRef = ref(storage, project.finishedProjectPack.fullPath);
                    await deleteObject(packRef);
                    await updateDoc(doc(db, 'projects', projectId), {
                        finishedProjectPack: null
                    });
                    setProject(prev => ({ ...prev, finishedProjectPack: null }));
                    setConfirmation({ ...confirmation, isOpen: false });
                } catch (error) {
                    console.error("Delete error:", error);
                    alert("Failed to delete project pack.");
                }
            }
        });
    };

    const handleDeleteFile = async (fileObj) => {
        setConfirmation({
            isOpen: true,
            title: 'Delete File',
            message: `Are you sure you want to delete ${fileObj.name}? This will permanently remove it from storage.`,
            confirmText: 'Remove File',
            type: 'danger',
            onConfirm: async () => {
                try {
                    const fileRef = ref(storage, fileObj.fullPath);
                    await deleteObject(fileRef);
                    await updateDoc(doc(db, 'projects', projectId), {
                        projectFiles: arrayRemove(fileObj)
                    });
                    setProjectFiles(prev => prev.filter(f => f.fullPath !== fileObj.fullPath));
                    setConfirmation({ ...confirmation, isOpen: false });
                } catch (error) {
                    console.error("Delete error:", error);
                    alert("Failed to delete file.");
                }
            }
        });
    };

    // Drag events
    const handleDrag = (e) => { e.preventDefault(); e.stopPropagation(); if (e.type === "dragenter" || e.type === "dragover") setDragActive(true); else if (e.type === "dragleave") setDragActive(false); };
    const handleDrop = (e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); if (e.dataTransfer.files && e.dataTransfer.files[0]) handleUploadFiles(Array.from(e.dataTransfer.files)); };

    const handleGenerateAI = async () => {
        setIsGeneratingAI(true);
        try {
            // 1. Fetch Master Prompt from the server/repo
            const promptRes = await fetch('/benchmark-intel/ai_prompt.txt');
            let masterPrompt = "";
            if (promptRes.ok) {
                masterPrompt = await promptRes.text();
            } else {
                // Fallback if the file isn't reachable
                masterPrompt = "Analyze these architectural plans and provide a technical construction summary floor-by-floor. Focus on structural requirements and builder challenges.";
            }

            const validFiles = (projectFiles || []).filter(f => {
                const isDoc = f && (f.fullPath || f.url);
                if (!isDoc) return false;
                if (f.isSuperseded) return false; // Explicitly excluded by user
                const lowerName = (f.name || '').toLowerCase();
                // Backup filter for automatically known superseded versions from portal
                return !lowerName.includes('superseded') && !lowerName.includes('old version');
            });

            if (validFiles.length === 0) {
                alert("No active architectural plans found. Everything is marked as superseded or invalid.");
                setIsGeneratingAI(false);
                return;
            }

            // Priority: Plans > Elevations > Everything else
            let sortedFiles = [...validFiles].sort((a, b) => {
                const aName = (a.name || '').toLowerCase();
                const bName = (b.name || '').toLowerCase();
                const aPriority = (aName.includes('plan') || aName.includes('elevation')) ? 2 : 1;
                const bPriority = (bName.includes('plan') || bName.includes('elevation')) ? 2 : 1;
                return bPriority - aPriority;
            });

            const topFiles = sortedFiles.slice(0, 30); // Support up to 30 files for deep analysis

            const model = getGenerativeModel(vertexAI, { model: 'gemini-2.5-flash' });

            const finalPrompt = `
### SYSTEM INSTRUCTIONS:
${masterPrompt}

### PROJECT DATA FOR CONTEXT:
- Site Address: ${project.address}
- Portal Classification: ${project.description || 'Unknown'}
- Project Reference: ${project.reference || 'N/A'}

IMPORTANT: You have been provided with BOTH the raw PDFs and high-resolution visual snapshots (PNGs) of the drawings. Prioritize the visual detail in the PNG snapshots for spatial layout and floor-by-floor descriptions.
            `;

            console.log("AI Generation - DEBUG - Processing top valid files:", topFiles);

            // Transform topFiles into Vertex parts
            const parts = [];
            
            // 1. Add PDFs for deep text/data extraction (via GS URI)
            topFiles.forEach(file => {
                const filePath = file.fullPath || decodeURIComponent(file.url.split('/o/')[1].split('?')[0]);
                parts.push({
                    fileData: {
                        fileUri: `gs://benchmark-intel-3ea4a.firebasestorage.app/${filePath}`,
                        mimeType: file.contentType || 'application/pdf'
                    }
                });
            });

            // 2. Performance-safe Visual Snapshotting
            // We'll attempt to generate a visual "screenshot" of the first page of the top 10 files
            // to give Gemini specific "Image" parts which usually trigger better OCR/Spatial vision.
            for (let i = 0; i < Math.min(topFiles.length, 10); i++) {
                const file = topFiles[i];
                if (file.contentType === 'application/pdf' && file.url) {
                    try {
                        const imgBase64 = await renderFirstPageToDataUrl(file.url);
                        if (imgBase64) {
                            parts.push({
                                inlineData: {
                                    data: imgBase64.split(',')[1],
                                    mimeType: 'image/png'
                                }
                            });
                        }
                    } catch (e) {
                        console.warn("Failed to generate visual snapshot for:", file.name, e);
                    }
                }
            }
            
            parts.push({ text: finalPrompt });

            if (parts.length === 1) { // Only prompt, no files
                throw new Error("No valid file paths found in Firestore for these documents. Please re-upload them.");
            }

            console.log("AI Generation - DEBUG - Final Parts Structure:", JSON.stringify(parts, null, 2));

            const result = await model.generateContent({ contents: [{ role: 'user', parts }] });
            const response = await result.response;
            const responseText = response.text();

            // Save to DB
            await updateDoc(doc(db, 'projects', projectId), { aiDescription: responseText });
            setProject(prev => ({ ...prev, aiDescription: responseText }));
            
        } catch (error) {
            console.error("AI Generation Error:", error);
            alert("AI analysis failed: " + error.message);
        } finally {
            setIsGeneratingAI(false);
        }
    };

    /**
     * Helper to render the first page of a PDF to a PNG DataURL using pdfjsLib
     */
    async function renderFirstPageToDataUrl(url) {
        let localUrl = null;
        try {
            const burstUrl = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
            const response = await fetch(burstUrl);
            const blob = await response.blob();
            localUrl = URL.createObjectURL(blob);

            const loadingTask = pdfjsLib.getDocument({ url: localUrl, disableAutoFetch: true });
            const pdf = await loadingTask.promise;
            const page = await pdf.getPage(1);
            
            const viewport = page.getViewport({ scale: 2.0 }); 
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: context, viewport: viewport }).promise;
            URL.revokeObjectURL(localUrl);
            return canvas.toDataURL('image/png');
        } catch (error) {
            console.error("PDF Rendering Error:", error);
            if (localUrl) URL.revokeObjectURL(localUrl);
            return null;
        }
    }

    const handleToggleSuperseded = async (fileObj) => {
        try {
            const updated = projectFiles.map(f => {
                const isMatch = (f.fullPath && f.fullPath === fileObj.fullPath) || (f.url && f.url === fileObj.url);
                return isMatch ? { ...f, isSuperseded: !f.isSuperseded } : f;
            });
            await updateDoc(doc(db, 'projects', projectId), { projectFiles: updated });
            setProjectFiles(updated);
        } catch (error) {
            console.error("Error toggling superseded status:", error);
        }
    };

    const handleCopySummary = () => {
        if (!project.aiDescription) return;
        navigator.clipboard.writeText(project.aiDescription);
        alert("Summary copied to clipboard!");
    };

    const generateFigmaPayload = async () => {
        let aiData = {};
        if (project.aiDescription) {
            try {
                const cleaned = project.aiDescription.replace(/```(json)?|```/g, '').trim();
                aiData = JSON.parse(cleaned);
            } catch (e) {
                console.warn("Could not parse aiDescription as JSON", e);
                aiData = { projectDescription: project.aiDescription };
            }
        }

        const formatDate = (dateString) => {
            if (!dateString) return "";
            return new Date(dateString).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
        };

        const statusStr = `${project.applicationStatus || 'Unknown'}, As of: ${formatDate(project.dateDecided) || 'N/A'}`;

        const resolveImage = async (file) => {
            if (!file || !file.url) return { png: '', link: '' };
            const isPdf = file.contentType === 'application/pdf' || (file.name && file.name.toLowerCase().endsWith('.pdf'));
            if (isPdf) {
                try {
                    const pngData = await renderFirstPageToDataUrl(file.url);
                    if (!pngData) return { png: '', link: file.url };

                    const res = await fetch(pngData);
                    const blob = await res.blob();
                    
                    const safeName = file.name ? file.name.replace(/[^a-zA-Z0-9]/g, '_') : 'unnamed';
                    const tempRef = ref(storage, `projects/${projectId}/figma-temp/${Date.now()}_${safeName}.png`);
                    
                    await uploadBytes(tempRef, blob, { contentType: 'image/png' });
                    const publicUrl = await getDownloadURL(tempRef);
                    
                    return { png: publicUrl, link: file.url };
                } catch (e) {
                    console.error('Figma Temp Upload Error:', e);
                    return { png: '', link: file.url };
                }
            }
            return { png: file.url, link: file.url };
        };


        let elevFile = null;
        let planFile = null;
        let locationFile = null;

        const validFiles = projectFiles.filter(f => !f.isSuperseded && f.url);

        // 1. Try to match using the exact Portal Descriptions from the Extension
        if (project.documentDescriptions && Array.isArray(project.documentDescriptions)) {
            validFiles.forEach((f, idx) => {
                const descVal = project.documentDescriptions[idx];
                let descText = "";
                if (typeof descVal === 'string') descText = descVal.toLowerCase();
                else if (descVal && typeof descVal === 'object') {
                    descText = (descVal.description || descVal.title || descVal.name || "").toLowerCase();
                }

                if (descText) {
                    if (!elevFile && descText.includes('elev')) elevFile = f;
                    if (descText.includes('plan')) {
                        // Prioritize "proposed" plans over "existing"
                        if (descText.includes('proposed')) planFile = f;
                        else if (!planFile) planFile = f;
                    }
                    if (!locationFile && (descText.includes('location') || descText.includes('site'))) locationFile = f;
                }
            });
        }

        // 2. Fallback to basic filename search if descriptions missed anything
        if (!elevFile) elevFile = validFiles.find(f => f.name?.toLowerCase().includes('elev'));
        if (!planFile) planFile = validFiles.find(f => f.name?.toLowerCase().includes('plan') && f.name?.toLowerCase().includes('proposed')) || validFiles.find(f => f.name?.toLowerCase().includes('plan'));
        if (!locationFile) locationFile = validFiles.find(f => f.name?.toLowerCase().includes('location') || f.name?.toLowerCase().includes('site'));

        // 3. Last Resort Fallback: Just grab remaining valid files so the fields aren't completely empty
        const usedUrls = new Set([elevFile?.url, planFile?.url, locationFile?.url].filter(Boolean));
        const remainingFiles = validFiles.filter(f => !usedUrls.has(f.url));
        
        if (!elevFile && remainingFiles.length > 0) elevFile = remainingFiles.shift();
        if (!planFile && remainingFiles.length > 0) planFile = remainingFiles.shift();
        if (!locationFile && remainingFiles.length > 0) locationFile = remainingFiles.shift();

        const coverData = await resolveImage(elevFile);
        const planData = await resolveImage(planFile);
        const aerialData = await resolveImage(locationFile);

        // All project files become document pages. Superseded ones route to MasterSuperseededPage.
        // Build a URL → portal description lookup for clean titles
        const toTitleCase = (str) =>
            str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

        const descriptionByUrl = {};
        if (project.documentDescriptions && Array.isArray(project.documentDescriptions)) {
            // documentDescriptions aligns with ALL projectFiles (not just validFiles)
            projectFiles.forEach((f, idx) => {
                const descVal = project.documentDescriptions[idx];
                let descText = '';
                if (typeof descVal === 'string') descText = descVal.trim();
                else if (descVal && typeof descVal === 'object') {
                    descText = (descVal.description || descVal.title || descVal.name || '').trim();
                }
                if (descText && f.url) descriptionByUrl[f.url] = descText;
            });
        }

        const getDocTitle = (file) => {
            // 1. Use portal description if available
            const desc = file.url && descriptionByUrl[file.url];
            if (desc) return toTitleCase(desc);
            // 2. Fallback: clean up the filename
            const name = (file.name || 'Unnamed Document')
                .replace(/\.pdf$/i, '')                // remove extension
                .replace(/^\d{2}_[A-Za-z]{3}_\d{4}_/, '') // remove date prefix
                .replace(/_/g, ' ')                    // underscores → spaces
                .trim();
            return toTitleCase(name);
        };

        const documentListData = [];
        for (const file of projectFiles.filter(f => f.url)) {
            const docData = await resolveImage(file);
            documentListData.push({
                docTitle: getDocTitle(file),
                docLink: docData.link || '',   // URL for hyperlink
                docPreview: docData.png || '',
                isSuperseded: !!file.isSuperseded
            });
        }

        const payload = {
            projectId: project.customId || project.id,
            projectAddress: project.address || '',
            projectDescription: aiData.projectDescription || '',
            floors: aiData.floors || [], // Now a dynamic array
            extras: aiData.extras || '',
            planningStatus: statusStr,
            homeOwnerName: project.homeownerName || '',
            homeOwnerPhone: project.homeownerPhone || '',
            homeOwnerEmail: project.homeownerEmail || '',
            
            imageCover: coverData.png || '',
            coverLink: coverData.link || '',
            
            imageProposedPlan: planData.png || '',
            proposedPlanLink: planData.link || '',
            
            imageAerial: aerialData.png || '',
            aerialLink: aerialData.link || '',
            
            documentList: documentListData
        };

        return JSON.stringify(payload, null, 2);
    };

    const handleCopyFigmaPayload = async () => {
        setIsCopyingFigma(true);
        try {
            const payload = await generateFigmaPayload();
            navigator.clipboard.writeText(payload);
            setHasCopiedFigma(true);
            alert("Figma JSON generated and copied to clipboard!");
        } catch (error) {
            console.error("Payload Generation Error:", error);
            alert("Failed to build Figma payload.");
        } finally {
            setIsCopyingFigma(false);
        }
    };

    const handleCleanUpFigmaTemp = async () => {
        setIsCleaningFigma(true);
        try {
            const tempFolderRef = ref(storage, `projects/${projectId}/figma-temp`);
            const res = await listAll(tempFolderRef);
            
            if (res.items.length === 0) {
                alert("No temp previews found to clean up.");
                return;
            }
            
            const deletePromises = res.items.map(itemRef => deleteObject(itemRef));
            await Promise.all(deletePromises);
            
            alert(`Successfully cleaned up ${res.items.length} temp preview files!`);
        } catch (error) {
            console.error("Cleanup Error:", error);
            alert("Failed to clean up temp previews. (Folder may already be deleted)");
        } finally {
            setIsCleaningFigma(false);
        }
    };

    const renderAIDescription = () => {
        if (!project.aiDescription) return null;
        try {
            const cleaned = project.aiDescription.replace(/```(json)?|```/g, '').trim();
            const aiData = JSON.parse(cleaned);
            return (
                <div className="space-y-6">
                    {aiData.projectDescription && (
                        <div>
                            <h4 className="text-sm font-bold text-gray-900 mb-2">Project Description</h4>
                            <p className="text-gray-700 leading-relaxed text-base">{aiData.projectDescription}</p>
                        </div>
                    )}
                    {aiData.floors && Array.isArray(aiData.floors) && aiData.floors.map((floor, idx) => (
                        <div key={idx}>
                            <h4 className="text-sm font-bold text-gray-900 mb-2">{floor.floorLevel || 'Floor'}</h4>
                            <p className="text-gray-700 leading-relaxed text-base">{floor.floorSummary}</p>
                        </div>
                    ))}
                    {aiData.extras && (
                        <div>
                            <h4 className="text-sm font-bold text-gray-900 mb-2">Extras / External Materials</h4>
                            <p className="text-gray-700 leading-relaxed text-base">{aiData.extras}</p>
                        </div>
                    )}
                </div>
            );
        } catch (e) {
            return <div className="text-gray-800 leading-relaxed text-base space-y-4" dangerouslySetInnerHTML={{ __html: project.aiDescription.replace(/\n/g, '<br />') }} />;
        }
    };

    if (loading) return <div className="p-8 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>;
    if (!project) return <div className="p-8 text-center text-red-500 font-bold">Project Workspace Not Found.</div>;

    const step1Done = projectFiles.length > 0;
    const step2Done = step1Done && !!project.aiDescription;
    const step3Done = step2Done && (hasCopiedFigma || !!project.finishedProjectPack);
    const step4Done = step3Done && !!project.finishedProjectPack;

    const getHighlightStyles = (isCurrent, isDone, isDragging = false) => {
        if (isDragging) return {};
        if (isCurrent) return { 
            boxShadow: '0 0 0 2px #FA8500, 0 0 15px rgba(250,133,0,0.2)',
            borderColor: '#FA8500'
        };
        if (isDone) return { 
            boxShadow: '0 0 0 2px #10B981',
            borderColor: '#10B981'
        };
        return {};
    };

    const currentStepText = !step1Done ? "Upload project files" 
        : !step2Done ? "Generate AI summary" 
        : !step3Done ? "Copy JSON for Figma payload" 
        : !step4Done ? "Upload final project pack" 
        : "Workspace complete!";

    return (
        <div className="flex flex-col h-full bg-gray-50 overflow-hidden relative">
            {/* Header - Updated to match project/invoice details style */}
            <header className="px-4 py-4 sm:px-6 sm:py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center shrink-0">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                        <h3 className="text-lg sm:text-xl font-bold text-[#0f172a]">Project Pack Workspace</h3>
                        {project.url && (
                            <a 
                                href={project.url} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="hidden sm:flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold bg-white border border-gray-200 rounded-lg text-[#0f172a] hover:bg-gray-50 shadow-sm transition-colors uppercase tracking-wider"
                            >
                                Portal <ExternalLink className="h-3 w-3 text-gray-400" />
                            </a>
                        )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs sm:text-sm text-gray-500 font-medium truncate max-w-[200px] sm:max-w-md">{project.address}</p>
                        <span className="text-[10px] text-gray-300">•</span>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{project.id}</p>
                    </div>
                </div>
                
                <div className="flex items-center gap-2">
                    {project.url && (
                        <a 
                            href={project.url} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="sm:hidden p-2 text-gray-400 hover:text-gray-600"
                        >
                            <ExternalLink className="h-5 w-5" />
                        </a>
                    )}
                    <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 focus:outline-none p-2 rounded-full hover:bg-gray-200 transition-colors shrink-0">
                        <X className="h-6 w-6" />
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 md:p-6 mini-scroll">
                <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6 pb-12">
                    
                    {/* LEFT PANEL: AI Technical Summary (2/3 width) */}
                    <div className="lg:col-span-2 flex flex-col gap-6 order-2 lg:order-1">
                        <div 
                            className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[700px] transition-all duration-500"
                            style={getHighlightStyles(step1Done && !step2Done, step2Done)}
                        >
                            <div className="bg-[#1e1b4b] border-b border-indigo-900 px-5 py-4 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <Bot className="h-5 w-5 text-indigo-300" />
                                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">AI Technical Summary</h3>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={handleCopySummary}
                                        disabled={!project.aiDescription}
                                        className="p-1.5 text-indigo-300 hover:bg-indigo-800 rounded transition-colors disabled:opacity-30"
                                        title="Copy Summary"
                                    >
                                        <Copy className="h-4 w-4" />
                                    </button>
                                    <button 
                                        onClick={() => setIsSummaryMaximized(true)}
                                        disabled={!project.aiDescription}
                                        className="p-1.5 text-indigo-300 hover:bg-indigo-800 rounded transition-colors disabled:opacity-30"
                                        title="Full Screen View"
                                    >
                                        <Maximize2 className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                            <div className="p-8 flex-1 overflow-y-auto bg-gray-50/30 prose prose-slate prose-sm max-w-none">
                                {project.aiDescription ? (
                                    renderAIDescription()
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-center opacity-50 space-y-4">
                                        <div className="p-4 bg-gray-100 rounded-full">
                                            <Bot className="h-10 w-10 text-gray-400" />
                                        </div>
                                        <div>
                                            <p className="text-base font-bold text-gray-900">No Intelligence Generated</p>
                                            <p className="text-sm max-w-xs mt-1">Ready to analyze local PDFs and snapshots with Gemini 2.5 Flash.</p>
                                        </div>
                                        <button 
                                            onClick={handleGenerateAI} 
                                            disabled={isGeneratingAI || projectFiles.length === 0}
                                            className="mt-4 px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 disabled:opacity-50 transition-all"
                                        >
                                            {isGeneratingAI ? <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> : <Bot className="h-4 w-4 inline mr-2" />}
                                            Generate Initial Summary
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* RIGHT PANEL: Controls & Files (1/3 width) */}
                    <div className="flex flex-col gap-6 order-1 lg:order-2 lg:h-[700px]">
                        
                        {/* Custom ID Box */}
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Project Vault ID</label>
                            <div className="flex items-center gap-2">
                                <input 
                                    type="text" 
                                    readOnly 
                                    value={project.customId || 'No ID Generated'} 
                                    className="flex-1 bg-gray-50 border border-gray-100 text-gray-600 text-[13px] font-mono px-3 py-1.5 rounded outline-none"
                                />
                                {project.customId && (
                                    <button onClick={() => { navigator.clipboard.writeText(project.customId); alert("Copied!"); }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="Copy ID">
                                        <Copy className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Action Bar (Compact) */}
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={() => setPreviewModalOpen(true)} disabled={projectFiles.length === 0} className="flex items-center justify-center gap-2 px-3 py-2.5 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-lg text-xs font-bold shadow-sm transition-all disabled:opacity-50">
                                <Eye className="h-4 w-4 text-gray-400" /> Preview All
                            </button>
                            <button onClick={handleGenerateAI} disabled={isGeneratingAI || projectFiles.length === 0} className="flex items-center justify-center gap-2 px-3 py-2.5 bg-indigo-50 border border-indigo-100 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-bold shadow-sm transition-all disabled:opacity-50">
                                {isGeneratingAI ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                                Refresh Summary
                            </button>
                            <button 
                                onClick={handleCopyFigmaPayload} 
                                disabled={!project.aiDescription || isCopyingFigma} 
                                className="col-span-2 flex items-center justify-center gap-2 px-3 py-2.5 bg-[#0f172a] text-white hover:bg-black rounded-lg text-xs font-bold shadow-sm transition-all duration-500 disabled:opacity-50"
                                style={getHighlightStyles(step2Done && !step3Done, step3Done)}
                            >
                                {isCopyingFigma ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                                {isCopyingFigma ? 'Building Payload...' : 'Copy JSON for Figma'}
                            </button>
                            <button onClick={handleCleanUpFigmaTemp} disabled={isCleaningFigma} className="col-span-2 flex items-center justify-center gap-2 px-3 py-2.5 bg-orange-50 border border-orange-200 text-orange-700 hover:bg-orange-100 rounded-lg text-xs font-bold shadow-sm transition-all disabled:opacity-50">
                                {isCleaningFigma ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                {isCleaningFigma ? 'Cleaning...' : 'Clean Up Temp Previews'}
                            </button>
                        </div>

                        {/* Final Project Pack Section */}
                        <div 
                            className="bg-emerald-50/50 p-4 border border-emerald-100 rounded-xl space-y-3 transition-all duration-500"
                            style={getHighlightStyles(step3Done && !step4Done, step4Done)}
                        >
                            <h3 className="text-[10px] font-bold text-emerald-800 uppercase tracking-widest flex items-center justify-between">
                                <span className="flex items-center gap-2"><Package className="h-3.5 w-3.5" /> Final Project Pack</span>
                                {!project.finishedProjectPack && !isUploadingPack && (
                                    <button 
                                        onClick={() => packInputRef.current?.click()}
                                        className="text-[10px] bg-emerald-600 text-white px-2 py-1 rounded hover:bg-emerald-700 transition-colors flex items-center gap-1 shadow-sm"
                                    >
                                        <UploadCloud className="h-2.5 w-2.5" /> Upload
                                    </button>
                                )}
                            </h3>
                            
                            <input 
                                type="file" 
                                ref={packInputRef} 
                                className="hidden" 
                                onChange={handleUploadProjectPack} 
                            />

                            {isUploadingPack ? (
                                <div className="space-y-1.5">
                                    <div className="flex justify-between text-[10px] text-emerald-700 font-bold uppercase">
                                        <span>Uploading...</span>
                                        <span>{Math.round(uploadProgress)}%</span>
                                    </div>
                                    <div className="w-full bg-emerald-200 rounded-full h-1">
                                        <div 
                                            className="bg-emerald-600 h-1 rounded-full transition-all duration-300" 
                                            style={{ width: `${uploadProgress}%` }}
                                        ></div>
                                    </div>
                                </div>
                            ) : project.finishedProjectPack ? (
                                <div className="flex items-center justify-between bg-white/50 p-2.5 rounded-lg border border-emerald-100">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <div className="h-7 w-7 rounded bg-emerald-100 flex items-center justify-center shrink-0">
                                            <Package className="h-3.5 w-3.5 text-emerald-600" />
                                        </div>
                                        <div className="overflow-hidden">
                                            <p className="text-xs font-bold text-gray-900 truncate" title={project.finishedProjectPack.name}>
                                                {project.finishedProjectPack.name}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <a 
                                            href={project.finishedProjectPack.url} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                                            title="Open Pack"
                                        >
                                            <ExternalLink className="h-3.5 w-3.5" />
                                        </a>
                                        <button 
                                            onClick={handleDeleteProjectPack}
                                            className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors"
                                            title="Delete Pack"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-[10px] text-emerald-700/60 italic text-center">No final pack uploaded.</p>
                            )}
                        </div>

                        {/* File Uploader (Slim) */}
                        <div 
                            onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
                            className={`bg-white rounded-xl border border-dashed shadow-sm p-4 flex flex-col items-center justify-center text-center transition-all duration-500 min-h-[100px]
                            ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}`}
                            style={getHighlightStyles(!step1Done, step1Done, dragActive)}
                        >
                            <input type="file" multiple ref={fileInputRef} onChange={(e) => handleUploadFiles(Array.from(e.target.files))} className="hidden" />
                            {isUploading ? (
                                <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                            ) : (
                                <>
                                    <UploadCloud className={`h-6 w-6 mb-2 ${dragActive ? 'text-blue-500' : 'text-gray-400'}`} />
                                    <button onClick={() => fileInputRef.current.click()} className="text-xs font-bold text-gray-500 hover:text-blue-600">
                                        Drop or click to upload
                                    </button>
                                </>
                            )}
                        </div>

                        {/* File Listing (Standard size) */}
                        <div 
                            className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex-1 flex flex-col transition-all duration-500"
                            style={getHighlightStyles(!step1Done, step1Done)}
                        >
                            <div className="bg-gray-50 border-b border-gray-100 px-4 py-3 flex items-center justify-between">
                                <h3 className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2">Project Documents</h3>
                                <span className="bg-gray-200 text-gray-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{projectFiles.length}</span>
                            </div>
                            <div className="divide-y divide-gray-100 overflow-y-auto flex-1 mini-scroll">
                                {projectFiles.length === 0 ? (
                                    <p className="text-xs text-gray-400 italic p-6 text-center">No files in vault.</p>
                                ) : (
                                    projectFiles.map((f, i) => (
                                        <div key={i} className={`flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 group ${f.isSuperseded ? 'bg-gray-50/50' : ''}`}>
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className="h-7 w-7 rounded bg-gray-100 flex items-center justify-center shrink-0">
                                                    {f.isSuperseded ? <Ban className="h-3.5 w-3.5 text-gray-400" /> : <FileIcon className="h-3.5 w-3.5 text-gray-400" />}
                                                </div>
                                                <span className={`text-xs font-medium truncate ${f.isSuperseded ? 'text-gray-400 line-through italic' : 'text-gray-700'}`} title={f.name || f}>{f.name || 'Unnamed File'}</span>
                                            </div>
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => handleToggleSuperseded(f)} className={`p-1 rounded ${f.isSuperseded ? 'text-emerald-500' : 'text-amber-500'}`} title={f.isSuperseded ? "Activate" : "Supersede"}><Ban className="h-3.5 w-3.5" /></button>
                                                <button onClick={() => setPreviewModalOpen(true)} className="p-1 text-blue-600" title="View"><Eye className="h-3.5 w-3.5" /></button>
                                                <button onClick={() => handleDeleteFile(f)} className="p-1 text-red-500" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Maximize Summary Modal */}
            {isSummaryMaximized && (
                <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 md:p-12">
                    <div className="bg-white w-full max-w-5xl h-full max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Bot className="h-5 w-5 text-indigo-600" />
                                <h2 className="text-lg font-bold text-gray-900">Technical Build Summary</h2>
                            </div>
                            <div className="flex items-center gap-3">
                                <button onClick={handleCopySummary} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 text-xs font-bold text-gray-600 rounded-lg hover:bg-gray-50">
                                    <Copy className="h-4 w-4" /> Copy Text
                                </button>
                                <button onClick={() => setIsSummaryMaximized(false)} className="p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors">
                                    <X className="h-6 w-6" />
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-8 md:p-12 prose prose-slate max-w-none">
                            {renderAIDescription()}
                        </div>
                    </div>
                </div>
            )}

            {previewModalOpen && projectFiles.length > 0 && (
                <PDFPreviewModal files={projectFiles.filter(f => f.url)} initialIndex={0} onClose={() => setPreviewModalOpen(false)} />
            )}

            {/* Subtle Walkthrough Notification */}
            <div className="fixed bottom-6 right-6 z-50 pointer-events-none">
                <div className="bg-[#1e1b4b] text-white shadow-2xl border border-indigo-900/50 rounded-xl px-4 py-3 flex items-center gap-3 w-max animate-in slide-in-from-bottom-5 duration-500">
                    {!step4Done ? (
                        <div className="relative flex items-center justify-center w-5 h-5 shrink-0">
                            <div className="absolute inset-0 rounded-full border-[2px] border-[#FA8500] border-t-transparent animate-[spin_1.5s_linear_infinite]" />
                            <div className="w-[6px] h-[6px] bg-[#FA8500] rounded-full" />
                        </div>
                    ) : (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    )}
                    <p className="text-sm font-medium">{currentStepText}</p>
                </div>
            </div>

            <ConfirmationModal 
                isOpen={confirmation.isOpen}
                onClose={() => setConfirmation({ ...confirmation, isOpen: false })}
                onConfirm={confirmation.onConfirm}
                title={confirmation.title}
                message={confirmation.message}
                confirmText={confirmation.confirmText}
                type={confirmation.type}
            />
        </div>
    );
};

export default PackWorkspace;
