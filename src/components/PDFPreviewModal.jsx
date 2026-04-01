import { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { X, Copy, Link, ChevronLeft, ChevronRight, Loader2, Check } from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const PDFPreviewModal = ({ files, initialIndex = 0, onClose }) => {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [loading, setLoading] = useState(true);
    const [copiedStatus, setCopiedStatus] = useState({ link: false, word: false });
    const canvasRef = useRef(null);
    const currentFile = files[currentIndex];

    const renderPreview = useCallback(async (file) => {
        setLoading(true);
        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext('2d');
        
        // Clear previous state
        context.clearRect(0, 0, canvas.width, canvas.height);

        try {
            const burstUrl = `${file.url}${file.url.includes('?') ? '&' : '?'}t=${Date.now()}`;
            const response = await fetch(burstUrl);
            const blob = await response.blob();
            const localUrl = URL.createObjectURL(blob);

            const isPdf = file.contentType?.includes('pdf') || file.name?.toLowerCase().endsWith('.pdf');

            if (isPdf) {
                const loadingTask = pdfjsLib.getDocument({ url: localUrl, disableAutoFetch: true });
                const pdf = await loadingTask.promise;
                const page = await pdf.getPage(1);
                
                const scale = 2.0; // Retina-grade sharpness
                const viewport = page.getViewport({ scale });

                canvas.height = viewport.height;
                canvas.width = viewport.width;

                await page.render({
                    canvasContext: context,
                    viewport: viewport
                }).promise;
            } else {
                // Unified Canvas Rendering for Images
                const img = new Image();
                img.onload = () => {
                    const scale = 2.0;
                    canvas.width = img.width * scale;
                    canvas.height = img.height * scale;
                    context.drawImage(img, 0, 0, canvas.width, canvas.height);
                    URL.revokeObjectURL(localUrl);
                    setLoading(false);
                };
                img.onerror = () => {
                    console.error("Image load failed");
                    setLoading(false);
                };
                img.src = localUrl;
                return; // setLoading handled in onload
            }

            URL.revokeObjectURL(localUrl);
        } catch (error) {
            console.error("Preview Rendering Error:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (currentFile && currentFile.url) {
            renderPreview(currentFile);
        }
    }, [currentFile, renderPreview]);

    const handleCopyLink = async () => {
        try {
            await navigator.clipboard.writeText(currentFile.url);
            setCopiedStatus(prev => ({ ...prev, link: true }));
            setTimeout(() => setCopiedStatus(prev => ({ ...prev, link: false })), 2000);
        } catch (err) {
            console.error("Failed to copy link:", err);
        }
    };

    const handleCopyWord = async () => {
        try {
            const canvas = canvasRef.current;
            if (!canvas) return;
            
            canvas.toBlob(async (blob) => {
                if (blob) {
                    try {
                        const item = new window.ClipboardItem({ 'image/png': blob });
                        await navigator.clipboard.write([item]);
                        setCopiedStatus(prev => ({ ...prev, word: true }));
                        setTimeout(() => setCopiedStatus(prev => ({ ...prev, word: false })), 2000);
                    } catch (err) {
                        console.error("Failed clipboard write:", err);
                    }
                }
            }, 'image/png');
        } catch (err) {
            console.error("Copy for Word failed:", err);
        }
    };

    const nextFile = useCallback(() => {
        if (currentIndex < files.length - 1) setCurrentIndex(prev => prev + 1);
    }, [currentIndex, files.length]);

    const prevFile = useCallback(() => {
        if (currentIndex > 0) setCurrentIndex(prev => prev - 1);
    }, [currentIndex]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'ArrowRight') nextFile();
            if (e.key === 'ArrowLeft') prevFile();
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [nextFile, prevFile, onClose]);

    if (!currentFile) return null;

    const isDirectImage = currentFile.contentType?.startsWith('image/') || /\.(jpg|jpeg|png)$/i.test(currentFile.name);

    return (
        <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col backdrop-blur-sm">
            {/* Top Toolbar */}
            <div className="flex items-center justify-between p-4 bg-black/50 text-white shrink-0">
                <div className="flex flex-col">
                    <span className="font-semibold">{currentFile.name}</span>
                    <span className="text-xs text-gray-400">File {currentIndex + 1} of {files.length}</span>
                </div>
                <div className="flex items-center gap-4">
                    <button onClick={handleCopyLink} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${copiedStatus.link ? 'bg-green-600' : 'bg-gray-800 hover:bg-gray-700'}`}>
                        {copiedStatus.link ? <Check className="h-4 w-4" /> : <Link className="h-4 w-4" />}
                        {copiedStatus.link ? 'Copied!' : 'Copy Link'}
                    </button>
                    <button onClick={handleCopyWord} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${copiedStatus.word ? 'bg-green-600' : 'bg-[#0284c7] hover:bg-[#0369a1]'}`}>
                        {copiedStatus.word ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {copiedStatus.word ? 'Copied HD!' : 'Copy for Word'}
                    </button>
                    <button onClick={onClose} className="p-2 bg-gray-800 hover:bg-gray-700 hover:text-red-400 rounded-full transition-colors ml-4">
                        <X className="h-5 w-5" />
                    </button>
                </div>
            </div>

            {/* Viewer Stage */}
            <div className="flex-1 relative flex items-center justify-center p-8 overflow-hidden">
                <button 
                    onClick={prevFile} 
                    disabled={currentIndex === 0}
                    className="absolute left-4 p-4 rounded-full bg-white/10 hover:bg-white/20 text-white disabled:opacity-30 disabled:hover:bg-white/10 transition-colors z-10"
                >
                    <ChevronLeft className="h-8 w-8" />
                </button>

                <div className="max-h-full max-w-full relative shadow-2xl rounded-sm overflow-hidden bg-white mini-scroll" style={{ overflow: 'auto' }}>
                    {loading && (
                        <div className="absolute inset-0 bg-gray-100 flex items-center justify-center min-w-[300px] min-h-[400px]">
                            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                        </div>
                    )}
                    
                    <canvas ref={canvasRef} className={`block max-w-full h-auto object-contain mx-auto ${loading ? 'opacity-0' : 'opacity-100'} transition-opacity shadow-lg`} />
                </div>

                <button 
                    onClick={nextFile} 
                    disabled={currentIndex === files.length - 1}
                    className="absolute right-4 p-4 rounded-full bg-white/10 hover:bg-white/20 text-white disabled:opacity-30 disabled:hover:bg-white/10 transition-colors z-10"
                >
                    <ChevronRight className="h-8 w-8" />
                </button>
            </div>
        </div>
    );
};

export default PDFPreviewModal;
