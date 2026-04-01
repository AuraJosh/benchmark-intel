import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, where, getDocs } from 'firebase/firestore';
import { ClipboardList, Search, X, User, Mail, Phone, Calendar, MapPin, Filter, ExternalLink, ChevronRight, Loader2, ArrowRight } from 'lucide-react';

const Captures = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const projectIdFilter = searchParams.get('projectId');

    const [captures, setCaptures] = useState([]);
    const [projects, setProjects] = useState({});
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCapture, setSelectedCapture] = useState(null);

    useEffect(() => {
        let q = query(collection(db, 'homeowners'), orderBy('timestamp', 'desc'));
        
        if (projectIdFilter) {
            q = query(collection(db, 'homeowners'), where('projectId', '==', projectIdFilter), orderBy('timestamp', 'desc'));
        }

        const unsubscribe = onSnapshot(q, async (snapshot) => {
            const captureData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setCaptures(captureData);
            
            // Fetch project details for collections
            const projectIds = [...new Set(captureData.map(c => c.projectId).filter(Boolean))];
            if (projectIds.length > 0) {
                const projectSnap = await getDocs(query(collection(db, 'projects'), where('__name__', 'in', projectIds)));
                const projectMap = {};
                projectSnap.docs.forEach(doc => {
                    projectMap[doc.id] = doc.data();
                });
                setProjects(projectMap);
            }
            
            setLoading(false);
        });

        return () => unsubscribe();
    }, [projectIdFilter]);

    useEffect(() => {
        const id = searchParams.get('id');
        if (id && captures.length > 0) {
            const capture = captures.find(c => c.id === id);
            if (capture) {
                setSelectedCapture(capture);
            }
        } else {
            setSelectedCapture(null);
        }
    }, [searchParams, captures]);

    const openCapture = (capture) => {
        const params = new URLSearchParams(searchParams);
        params.set('id', capture.id);
        setSearchParams(params);
    };

    const closeCapture = () => {
        const params = new URLSearchParams(searchParams);
        params.delete('id');
        setSearchParams(params);
    };

    const filteredCaptures = captures.filter(c => {
        const search = searchQuery.toLowerCase();
        const project = projects[c.projectId] || {};
        return (c.fullName || '').toLowerCase().includes(search) ||
            (c.email || '').toLowerCase().includes(search) ||
            (c.phone || '').toLowerCase().includes(search) ||
            (c.address || '').toLowerCase().includes(search) ||
            (project.address || '').toLowerCase().includes(search);
    });

    return (
        <div className="w-full relative flex flex-col h-full overflow-hidden">
            <header className="mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shrink-0">
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight text-[#0f172a]">Capture Logs</h1>
                    <p className="mt-1.5 text-sm text-gray-500">History of homeowner details captured via the public form.</p>
                </div>
                <div className="flex items-center gap-3">
                    <a
                        href="/#/capture"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-lg bg-[#0f172a] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-black"
                    >
                        <ExternalLink className="h-4 w-4" />
                        Open Public Form
                    </a>
                </div>
            </header>

            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col flex-1 min-h-0 relative z-0">
                <div className="flex items-center gap-4 border-b border-gray-100 p-4 bg-white shrink-0">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search by name, email, address..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm focus:border-[#0f172a] focus:outline-none focus:ring-1 focus:ring-[#0f172a]"
                        />
                    </div>
                    {projectIdFilter && (
                        <button 
                            onClick={() => {
                                const params = new URLSearchParams(searchParams);
                                params.delete('projectId');
                                setSearchParams(params);
                            }}
                            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-blue-50 text-blue-700 rounded-lg border border-blue-100 hover:bg-blue-100 transition-colors"
                        >
                            <X className="h-3.5 w-3.5" /> Clear Project Filter
                        </button>
                    )}
                </div>

                <div className="flex-1 overflow-auto mini-scroll">
                    <table className="w-full text-left text-sm text-gray-600">
                        <thead className="bg-gray-50 text-xs uppercase text-gray-500 sticky top-0 z-10 shadow-sm border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-4 font-medium">Homeowner</th>
                                <th className="px-6 py-4 font-medium">Contact</th>
                                <th className="px-6 py-4 font-medium">Project / Collections</th>
                                <th className="px-6 py-4 font-medium">Captured</th>
                                <th className="px-6 py-4 font-medium text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                            {loading ? (
                                <tr><td colSpan="5" className="px-6 py-8 text-center text-sm text-gray-500"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-gray-400" />Loading captures...</td></tr>
                            ) : filteredCaptures.length === 0 ? (
                                <tr><td colSpan="5" className="px-6 py-8 text-center text-sm text-gray-500">No capture logs found.</td></tr>
                            ) : (
                                filteredCaptures.map((cap) => {
                                    const project = projects[cap.projectId] || {};
                                    return (
                                        <tr key={cap.id} onClick={() => openCapture(cap)} className="hover:bg-gray-50/50 cursor-pointer transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-[#0f172a]">{cap.fullName}</div>
                                                <div className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mt-0.5 flex items-center gap-1.5">
                                                    <MapPin className="h-3 w-3" /> {cap.address || project.address || 'Unknown'}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-1.5 text-xs text-gray-600"><Mail className="h-3 w-3 text-gray-400" /> {cap.email}</div>
                                                <div className="flex items-center gap-1.5 text-xs text-gray-600 mt-1"><Phone className="h-3 w-3 text-gray-400" /> {cap.phone}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-xs font-medium text-gray-900 truncate max-w-[200px]">{project.address || 'N/A'}</div>
                                                <div className="flex flex-wrap gap-1 mt-1.5">
                                                    {project.collections && project.collections.map((col, i) => (
                                                        <div key={i} className="text-[9px] text-blue-600 font-bold flex items-center gap-0.5 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100"><Filter className="h-2 w-2" />{col}</div>
                                                    ))}
                                                    {!project.collections && <div className="text-[9px] text-gray-400 italic">No collections</div>}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-gray-500 text-xs">
                                                {cap.timestamp?.toDate ? cap.timestamp.toDate().toLocaleString() : 'Recently'}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button className="text-blue-600 hover:text-blue-800 font-bold text-xs uppercase tracking-widest">Details</button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Slide-over for Details - Takeover Pattern */}
            <div className={`absolute inset-0 z-[60] bg-white flex flex-col transform transition-transform duration-500 ease-out shadow-2xl ${selectedCapture ? 'translate-x-0' : 'translate-x-full'}`}>
                {selectedCapture && (
                    <>
                        <div className="px-6 py-5 border-b border-gray-200 bg-gray-50 flex justify-between items-center shrink-0">
                            <div>
                                <h2 className="text-xl font-bold text-[#0f172a]">Capture Details</h2>
                                <p className="text-xs text-gray-500 mt-0.5">ID: {selectedCapture.id}</p>
                            </div>
                            <button onClick={closeCapture} className="text-gray-400 hover:text-gray-600 focus:outline-none p-2 rounded-full hover:bg-gray-200 transition-colors">
                                <X className="h-6 w-6" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 space-y-8 mini-scroll">
                            <div className="max-w-3xl mx-auto space-y-12">
                                <div className="bg-blue-50/50 p-6 rounded-2xl border border-blue-100 space-y-4">
                                    <div className="flex items-center gap-4">
                                        <div className="h-12 w-12 rounded-full bg-blue-600 flex items-center justify-center text-white text-lg font-bold">
                                            {selectedCapture.fullName?.charAt(0)}
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold text-[#0f172a]">{selectedCapture.fullName}</h3>
                                            <p className="text-xs text-blue-600 font-bold uppercase tracking-widest">Homeowner</p>
                                        </div>
                                    </div>
                                    
                                    <div className="space-y-3 pt-2">
                                        <div className="flex items-center gap-3 text-sm">
                                            <Mail className="h-4 w-4 text-gray-400" />
                                            <a href={`mailto:${selectedCapture.email}`} className="text-blue-600 hover:underline">{selectedCapture.email}</a>
                                        </div>
                                        <div className="flex items-center gap-3 text-sm">
                                            <Phone className="h-4 w-4 text-gray-400" />
                                            <a href={`tel:${selectedCapture.phone}`} className="text-blue-600 hover:underline">{selectedCapture.phone}</a>
                                        </div>
                                        <div className="flex items-start gap-3 text-sm">
                                            <MapPin className="h-4 w-4 text-gray-400 mt-0.5" />
                                            <span className="text-gray-700">{selectedCapture.address}</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-sm">
                                            <Calendar className="h-4 w-4 text-gray-400" />
                                            <span className="text-gray-700">Captured: {selectedCapture.timestamp?.toDate ? selectedCapture.timestamp.toDate().toLocaleString() : 'Recently'}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                        <ClipboardList className="h-4 w-4" /> Linked Project
                                    </h3>
                                    {selectedCapture.projectId ? (
                                        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:border-blue-300 transition-colors cursor-pointer group" onClick={() => navigate(`/projects?id=${selectedCapture.projectId}`)}>
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <p className="text-sm font-bold text-gray-900 group-hover:text-blue-700 transition-colors">
                                                        {projects[selectedCapture.projectId]?.address || 'Loading project...'}
                                                    </p>
                                                    <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-wider">
                                                        Ref: {projects[selectedCapture.projectId]?.reference || 'N/A'}
                                                    </p>
                                                </div>
                                                <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-blue-500 transition-colors" />
                                            </div>
                                            <div className="flex flex-wrap gap-1 mt-3">
                                                {projects[selectedCapture.projectId]?.collections && projects[selectedCapture.projectId].collections.map((col, i) => (
                                                    <div key={i} className="text-[9px] text-blue-600 font-bold flex items-center gap-0.5 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100"><Filter className="h-2 w-2" />{col}</div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center py-6 bg-gray-50 rounded-xl border border-gray-100 border-dashed">
                                            <p className="text-xs text-gray-400 italic">No linked project found for this capture.</p>
                                        </div>
                                    )}
                                </div>

                                <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
                                    <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest mb-1">Consent Note</p>
                                    <p className="text-xs text-emerald-800 leading-relaxed">
                                        User has given consent to be contacted by vetted builders for quotes related to their planning application.
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="p-6 bg-gray-50 border-t border-gray-200 shrink-0">
                            <div className="max-w-3xl mx-auto">
                                <button onClick={() => navigate(`/projects?id=${selectedCapture.projectId}`)} disabled={!selectedCapture.projectId} className="w-full bg-[#0f172a] text-white py-4 rounded-xl font-bold text-sm shadow-sm hover:bg-black transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                                    View Full Project <ArrowRight className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};


export default Captures;
