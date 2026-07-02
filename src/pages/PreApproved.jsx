import { Search, Plus, Loader2, Network, UserPlus, Phone, Mail, Building, Activity, X, MapPin, ExternalLink, ClipboardList, ChevronLeft, ChevronRight, Filter, Receipt, FileText, User, Map as MapIcon, List, Users, Save, CheckCircle2, ArrowUpDown, Archive, Package, UploadCloud, File, Trash2, MessageSquare, Navigation as NavIcon, Star, XCircle, Link as LinkIcon, Unlink } from 'lucide-react';
import { useState, useEffect, useRef, memo, useCallback } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { db, storage } from '../firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, addDoc, setDoc, serverTimestamp, where, writeBatch, limit, getDocs, getDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import UniversalTimeline from '../components/UniversalTimeline';
import StatusBadge from '../components/StatusBadge';
import { generateCustomProjectId } from '../utils/projectIds';
import PackWorkspace from './PackWorkspace';
import ConfirmationModal from '../components/ConfirmationModal';
import { openExternalLink } from '../utils/opener';
import { useScrollRestoration } from '../hooks/useScrollRestoration';

// Fix for default marker icons in React Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const getWBDateString = (dateValue) => {
    if (!dateValue) return null;
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return null;
    
    // Normalize to Monday of that week
    const now = new Date(date);
    const day = now.getDay();
    const diffToAdd = day === 0 ? -6 : 1 - day;
    const monday = new Date(now.getTime() + diffToAdd * 24 * 60 * 60 * 1000);

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const dayStr = String(monday.getDate()).padStart(2, '0');
    const monthStr = monthNames[monday.getMonth()];
    const yearStr = monday.getFullYear();
    return `${dayStr} ${monthStr} ${yearStr}`;
};

const generateWBDates = (weeksBack = 52) => {
    const dates = [];
    const now = new Date();
    for (let i = 0; i < weeksBack; i++) {
        const d = new Date(now.getTime() - (i * 7 * 24 * 60 * 60 * 1000));
        dates.push(getWBDateString(d));
    }
    return dates;
};

// Self-contained popup component so each pin has independent route picker state
const MapPinPopup = ({ project, routesList, onOpenProject, onNavigate }) => {
    const map = useMap();
    const [showOptions, setShowOptions] = useState(false);
    const [popupRouteDate, setPopupRouteDate] = useState('');
    const [popupExistingRouteId, setPopupExistingRouteId] = useState('');
    const [adding, setAdding] = useState(false);
    const [added, setAdded] = useState(false);

    // Auto-pan the map when the popup expands so it doesn't get cut off
    useEffect(() => {
        if (showOptions) {
            const timeout = setTimeout(() => {
                // Pan specifically to make room for the *top* of the expanded popup
                // By panning the view "up" (-150 pixels), we push the pin towards the bottom of the screen
                map.panBy([0, -150], {
                    animate: true,
                    duration: 0.5
                });
            }, 100);
            return () => clearTimeout(timeout);
        }
    }, [showOptions, map]);

    const handleAdd = async () => {
        if (!popupRouteDate && !popupExistingRouteId) return;
        setAdding(true);
        try {
            if (popupExistingRouteId) {
                await updateDoc(doc(db, 'routes', popupExistingRouteId), { projectIds: arrayUnion(project.id) });
                setAdded(true);
                setTimeout(() => { setAdded(false); setShowOptions(false); }, 3000);
            } else if (popupRouteDate) {
                await addDoc(collection(db, 'routes'), {
                    date: popupRouteDate,
                    projectIds: [project.id],
                    assignedTo: '',
                    startAddress: '',
                    endAddress: '',
                    timestamp: serverTimestamp()
                });
                setAdded(true);
                setTimeout(() => { setAdded(false); setShowOptions(false); }, 3000);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setAdding(false);
        }
    };

    return (
        <div 
            className="flex flex-col gap-1.5" 
            style={{ minWidth: 200 }}
            onClick={(e) => e.stopPropagation()} // Stop click from leaking to the map
            onMouseDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
        >
            <div>
                <button 
                    onClick={() => onOpenProject()}
                    className="font-bold text-[13px] text-blue-ex-dark leading-tight mb-0.5 text-left hover:text-blue-mid transition-colors block w-full"
                >
                    {project.address}
                </button>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-grey-light">{project.status}</span>
                    <button onClick={() => onOpenProject()} className="text-[10px] text-blue-mid font-bold hover:underline">View Details →</button>
                    {project.url && (
                        <button 
                            onClick={(e) => { 
                                e.stopPropagation(); 
                                openExternalLink(project.url); 
                            }} 
                            className="text-grey-light hover:text-blue-mid transition-colors ml-auto"
                            title="Open Planning Portal"
                        >
                             <ExternalLink className="h-3 w-3" />
                        </button>
                    )}
                </div>
            </div>

            {project.description && (
                <p className="text-[11px] text-grey-mid line-clamp-1 italic">{project.description}</p>
            )}

            {!showOptions && !added && (
                <button 
                    onClick={() => setShowOptions(true)}
                    className="w-full mt-1 py-1.5 bg-grey-accent border border-grey-ex-light rounded-lg text-[11px] font-bold text-grey-dark hover:bg-grey-ex-light transition-colors flex items-center justify-center gap-1.5"
                >
                    <MapPin className="h-3 w-3 text-grey-light" /> Add to Route
                </button>
            )}

            {showOptions && !added && (
                <div className="mt-1 pt-2 border-t border-grey-ex-light space-y-2">
                    <select
                        value={popupExistingRouteId}
                        onChange={e => { setPopupExistingRouteId(e.target.value); if (e.target.value) setPopupRouteDate(''); }}
                        className="w-full rounded border border-grey-ex-light px-2 py-1 text-[11px] focus:outline-none"
                    >
                        <option value="">Existing route...</option>
                        {routesList.map(r => (
                            <option key={r.id} value={r.id}>{r.date ? new Date(r.date).toLocaleDateString('en-GB') : 'Unknown'}</option>
                        ))}
                    </select>
                    <input
                        type="date"
                        value={popupRouteDate}
                        onChange={e => { setPopupRouteDate(e.target.value); if (e.target.value) setPopupExistingRouteId(''); }}
                        className="w-full rounded border border-grey-ex-light px-2 py-1 text-[11px]"
                    />
                    <div className="flex gap-1.5">
                        <button onClick={() => setShowOptions(false)} className="flex-1 py-1.5 border border-grey-ex-light text-grey-mid rounded text-[11px] font-bold">Cancel</button>
                        <button 
                            onClick={handleAdd}
                            disabled={adding || (!popupRouteDate && !popupExistingRouteId)}
                            className="flex-[2] py-1.5 bg-blue-ex-dark text-white rounded text-[11px] font-bold disabled:opacity-30"
                        >
                            {adding ? 'Adding...' : 'Confirm'}
                        </button>
                    </div>
                </div>
            )}
            {added && <p className="text-[11px] text-green-dark font-bold text-center mt-1 py-1.5 bg-green-ex-light rounded flex items-center justify-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5" /> Added Successfully!
            </p>}
        </div>
    );
};

// Memoized Map to prevent auto-closing popups on project list updates
const MapDisplay = memo(({ filteredProjects, mapSelectedIds, toggleMapPin, routesList, openProject, navigate, mapRouteMode }) => {
    return (
        <MapContainer
            center={[53.9591, -1.0815]}
            zoom={13}
            style={{ height: '100%', width: '100%' }}
        >
            <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {filteredProjects.filter(p => p.coordinates?.lat && p.coordinates?.lng).map(project => {
                const isSelected = mapSelectedIds.includes(project.id);
                const isLinked = !!project.linkedProjectId;
                const icon = L.divIcon({
                    className: '',
                    html: `<div style="
                        width:28px;height:28px;border-radius:50% 50% 50% 0;
                        transform:rotate(-45deg);
                        background:${isSelected ? '#10b981' : '#0284c7'};
                        border:2px solid ${isLinked ? '#F8791E' : 'white'};
                        box-shadow:0 2px 6px rgba(0,0,0,0.3);
                        display:flex;align-items:center;justify-content:center;
                        transition: all 0.3s ease;
                    "><div style="transform:rotate(45deg);color:white;font-size:10px;font-weight:bold;margin-top:2px;">${isSelected ? '✓' : ''}</div></div>`,
                    iconSize: [28, 28],
                    iconAnchor: [14, 28],
                    popupAnchor: [0, -30]
                });
                return (
                    <Marker
                        key={project.id}
                        position={[project.coordinates.lat, project.coordinates.lng]}
                        icon={icon}
                        eventHandlers={{
                            click: (e) => {
                                if (mapRouteMode) {
                                    // Prevent popup from opening when in route mode if you want, 
                                    // but Leaflet opens popups by default on Marker click.
                                    // We'll toggle the pin here.
                                    toggleMapPin(project.id);
                                }
                            }
                        }}
                    >
                        {!mapRouteMode && (
                            <Popup minWidth={250}>
                                <MapPinPopup
                                    project={project}
                                    routesList={routesList}
                                    onOpenProject={(e) => { 
                                        if (e) e.stopPropagation(); 
                                        openProject(project); 
                                    }}
                                    onNavigate={navigate}
                                />
                            </Popup>
                        )}
                    </Marker>
                );
            })}
        </MapContainer>
    );
});

const PreApproved = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const location = useLocation();

    const [loading, setLoading] = useState(true);
    const [projects, setProjects] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedProject, setSelectedProject] = useState(null);
    const [closingProject, setClosingProject] = useState(null);
    const [isWorkspaceClosing, setIsWorkspaceClosing] = useState(false);
    const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);
    const [confirmation, setConfirmation] = useState({ isOpen: false, type: 'warning' });
    const activeProject = selectedProject || closingProject;

    const [isUploadingPack, setIsUploadingPack] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const packInputRef = useRef(null);

    const [editNotes, setEditNotes] = useState('');
    const [editStatus, setEditStatus] = useState('');
    const [editLetterVersion, setEditLetterVersion] = useState('');
    const [letterOptions, setLetterOptions] = useState([]);
    const [newLetterOptionInput, setNewLetterOptionInput] = useState('');

    // Related data for active project
    const [relatedInvoices, setRelatedInvoices] = useState([]);
    const [relatedContracts, setRelatedContracts] = useState([]);
    const [loadingRelated, setLoadingRelated] = useState(false);
    const [hasCorrespondence, setHasCorrespondence] = useState(false);
    const [recentCorrespondence, setRecentCorrespondence] = useState([]);
    const [relatedCaptures, setRelatedCaptures] = useState([]);

    // Auto-detect viewMode from routing
    const initialViewMode = location.pathname === '/pre-approved-map' ? 'map' : 'list';
    const [viewMode, setViewMode] = useState(initialViewMode);

    const [syncing, setSyncing] = useState(false);
    const [syncStatus, setSyncStatus] = useState(null);
    const [syncReport, setSyncReport] = useState(null);
    const [syncProgress, setSyncProgress] = useState(null);

    const [showSyncModal, setShowSyncModal] = useState(false);
    const [selectedSyncDate, setSelectedSyncDate] = useState('current');
    const syncDates = generateWBDates(52);

    const [builders, setBuilders] = useState([]);
    const [allAssignments, setAllAssignments] = useState([]);
    const [selectedBuilderToAssign, setSelectedBuilderToAssign] = useState('');
    const [newProjectCollection, setNewProjectCollection] = useState('');

    const [sortBy, setSortBy] = useState('dateDecidedDesc');
    const STATUS_OPTIONS = ['New', 'Pack Required', 'Pack Created', 'Quoted', 'Won', 'Paid', 'Revisit', 'Assigned', 'Opted Out', 'Letter Dropped', 'Letter Posted', 'Decided', 'Rejected'];
    const [filterStatus, setFilterStatus] = useState('New');
    const [filterCollection, setFilterCollection] = useState('All');
    const [filterWeek, setFilterWeek] = useState('All');
    const [archiveMode, setArchiveMode] = useState(() => {
        const saved = localStorage.getItem('benchmark_projects_archiveMode');
        if (saved) return saved;
        return localStorage.getItem('benchmark_projects_showArchive') === 'true' ? 'only' : 'off';
    });
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 20;

    const [selectedRowIds, setSelectedRowIds] = useState([]);
    const [batchCollectionName, setBatchCollectionName] = useState('');
    
    const scrollContainerRef = useScrollRestoration('projects-list', [loading, currentPage, viewMode]);
    
    // Routing state
    const [routesList, setRoutesList] = useState([]);
    const [routeDate, setRouteDate] = useState('');
    const [existingRouteId, setExistingRouteId] = useState('');

    // Map multi-select route mode
    const [mapRouteMode, setMapRouteMode] = useState(false);
    const [mapSelectedIds, setMapSelectedIds] = useState([]);
    const [mapRouteDate, setMapRouteDate] = useState('');
    const [mapExistingRouteId, setMapExistingRouteId] = useState('');
    const [mapRouteAdding, setMapRouteAdding] = useState(false);

    const cycleArchiveMode = () => {
        if (archiveMode === 'off') setArchiveMode('only');
        else if (archiveMode === 'only') setArchiveMode('both');
        else setArchiveMode('off');
    };

    const toggleMapRouteMode = () => {
        setMapRouteMode(v => !v);
        setMapSelectedIds([]);
        setMapRouteDate('');
        setMapExistingRouteId('');
    };

    const toggleMapPin = useCallback((id) => {
        setMapSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    }, []);

    const handleMapBatchRoute = async () => {
        if (mapSelectedIds.length === 0 || (!mapRouteDate && !mapExistingRouteId)) return;
        setMapRouteAdding(true);
        try {
            const batch = writeBatch(db);
            mapSelectedIds.forEach(id => {
                batch.update(doc(db, 'pre_approved_projects', id), { completed: false });
            });
            await batch.commit();

            if (mapExistingRouteId) {
                await updateDoc(doc(db, 'routes', mapExistingRouteId), { projectIds: arrayUnion(...mapSelectedIds) });
                navigate(`/routing?id=${mapExistingRouteId}`);
            } else if (mapRouteDate) {
                const docRef = await addDoc(collection(db, 'routes'), {
                    date: mapRouteDate,
                    projectIds: mapSelectedIds,
                    assignedTo: '',
                    startAddress: '',
                    endAddress: '',
                    timestamp: serverTimestamp()
                });
                navigate(`/routing?id=${docRef.id}`);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setMapRouteAdding(false);
        }
    };


    useEffect(() => {
        setViewMode(location.pathname === '/pre-approved-map' ? 'map' : 'list');
    }, [location.pathname]);

    useEffect(() => {
        const unsubscribe = onSnapshot(doc(db, 'system', 'sync_status_pre_approved'), (docSnap) => {
            if (docSnap.exists()) {
                setSyncProgress(docSnap.data());
            }
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const unsubscribe = onSnapshot(doc(db, 'system', 'letter_options'), (docSnap) => {
            if (docSnap.exists()) {
                setLetterOptions(docSnap.data().options || []);
            } else {
                setLetterOptions([]);
            }
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const q = query(collection(db, 'pre_approved_projects'), orderBy('timestamp', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const projectData = snapshot.docs.map(doc => ({
                ...doc.data(),
                id: doc.id
            }));
            setProjects(projectData);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // Persist archiveMode state
    useEffect(() => {
        localStorage.setItem('benchmark_projects_archiveMode', archiveMode);
    }, [archiveMode]);

    // Sync state with URL params
    useEffect(() => {
        const id = searchParams.get('id');
        const statusParam = searchParams.get('status');

        if (statusParam) {
            if (statusParam === 'Archive') {
                setArchiveMode('only');
                setFilterStatus('All');
            } else {
                setFilterStatus(statusParam);
            }
        }

        if (id && projects.length > 0) {
            const project = projects.find(p => p.id === id);
            if (project) {
                setClosingProject(null);
                setSelectedProject(project);
                setEditNotes(project.notes || '');
                setEditStatus(project.status || 'New');
                setEditLetterVersion(project.letterVersion || '');
                fetchRelatedData(id);
            }
        } else {
            if (setSelectedProject) {
                setClosingProject(selectedProject);
                setSelectedProject(null);
                setTimeout(() => setClosingProject(null), 500);
            }
        }
    }, [searchParams, projects]);

    const fetchRelatedData = async (projectId) => {
        setLoadingRelated(true);
        try {
            const invQ = query(collection(db, 'invoices'), where('projectId', '==', projectId));
            const invSnapshot = await getDocs(invQ);
            setRelatedInvoices(invSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

            const conQ = query(collection(db, 'agreements'), where('projectId', '==', projectId));
            const conSnapshot = await getDocs(conQ);
            setRelatedContracts(conSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

            const capQ = query(collection(db, 'homeowners'), where('projectId', '==', projectId), orderBy('timestamp', 'desc'));
            const capSnapshot = await getDocs(capQ);
            setRelatedCaptures(capSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (error) {
            console.error("Error fetching related data:", error);
        } finally {
            setLoadingRelated(false);
        }
    };

    // Check for correspondence
    useEffect(() => {
        if (!selectedProject?.id) return;
        const q = query(collection(db, 'correspondence'), where('projectId', '==', selectedProject.id), orderBy('timestamp', 'desc'));
        const unsubscribe = onSnapshot(q, (snap) => {
            const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setHasCorrespondence(docs.length > 0);
            setRecentCorrespondence(docs.slice(0, 3));
        });
        return () => unsubscribe();
    }, [selectedProject?.id]);

    const openProject = useCallback((project) => {
        setSearchParams({ id: project.id });
    }, [setSearchParams]);

    const openWorkspace = (projectId) => {
        setSearchParams({ id: projectId, workspace: 'true' });
    };

    useEffect(() => {
        if (searchParams.get('workspace') === 'true') {
            const t = setTimeout(() => setIsWorkspaceOpen(true), 20);
            return () => clearTimeout(t);
        } else {
            setIsWorkspaceOpen(false);
        }
    }, [searchParams.get('workspace')]);

    const closeWorkspace = () => {
        setIsWorkspaceClosing(true);
        setIsWorkspaceOpen(false);
        setTimeout(() => {
            setSearchParams({ id: searchParams.get('id') }); // remove workspace but keep id for details panel if needed? Or clear all? Let's keep ID to return to details.
            setIsWorkspaceClosing(false);
        }, 480);
    };

    const closeProject = () => {
        const backTo = searchParams.get('backTo');
        if (backTo) {
            navigate(backTo);
        } else {
            // Explicitly go back to projects list (Overview)
            navigate('/pre-approved'); 
            setSearchParams({});
        }
    };

    // Fetch all builders for assignments
    useEffect(() => {
        const q = query(collection(db, 'builders'), orderBy('companyName', 'asc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const builderData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
            setBuilders(builderData);
        });
        return () => unsubscribe();
    }, []);

    // Fetch all assignments (globally for filtering)
    useEffect(() => {
        const q = query(collection(db, 'assignments'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const assignmentData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
            setAllAssignments(assignmentData);
        });
        return () => unsubscribe();
    }, []);

    // Fetch all routes
    useEffect(() => {
        const q = query(collection(db, 'routes'), orderBy('timestamp', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const routesData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
            setRoutesList(routesData);
        });
        return () => unsubscribe();
    }, []);

    const projectAssignments = selectedProject ? allAssignments.filter(a => a.projectId === selectedProject.id) : [];

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, filterStatus, filterCollection, filterWeek, sortBy]);

    // Compute available collections dynamically based on all projects
    const availableCollections = Array.from(new Set(
        projects.reduce((acc, p) => {
            if (p.collections && Array.isArray(p.collections)) {
                acc.push(...p.collections);
            }
            if (p.collectionId && (!p.collections || !p.collections.includes(p.collectionId))) {
                acc.push(p.collectionId);
            }
            return acc;
        }, [])
    )).filter(Boolean).sort((a, b) => a.localeCompare(b));

    // Dynamic weeks based on actual project data
    const availableWeeks = Array.from(new Set(
        projects.map(p => getWBDateString(p.dateDecided)).filter(Boolean)
    )).sort((a, b) => {
        // Sort by date descending (Newest first)
        const dateA = new Date(a);
        const dateB = new Date(b);
        return dateB - dateA;
    });

    let filteredProjects = projects.filter(p => {
        const searchTerms = searchQuery.toLowerCase();
        const matchesSearch = p.address?.toLowerCase().includes(searchTerms) ||
            p.description?.toLowerCase().includes(searchTerms) ||
            p.collectionId?.toLowerCase().includes(searchTerms) ||
            (p.collections && p.collections.some(c => c.toLowerCase().includes(searchTerms))) ||
            p.homeownerName?.toLowerCase().includes(searchTerms) ||
            p.reference?.toLowerCase().includes(searchTerms) ||
            p.applicationStatus?.toLowerCase().includes(searchTerms) ||
            p.homeownerEmail?.toLowerCase().includes(searchTerms);

        const isProjArchived = p.isArchived === true || p.status === 'Archive';
        const matchesArchiveState = archiveMode === 'off' ? !isProjArchived 
                                  : archiveMode === 'only' ? isProjArchived 
                                  : true;

        const matchesStatus = filterStatus === 'All'
            ? true
            : filterStatus === 'Assigned'
                ? allAssignments.some(assign => assign.projectId === p.id)
                : filterStatus === 'New + Revisit'
                    ? (p.status === 'New' || p.status === 'Revisit')
                    : filterStatus === 'Letters'
                        ? (p.status === 'Letter Dropped' || p.status === 'Letter Posted')
                        : p.status === filterStatus;

        const matchesCollection = filterCollection === 'All'
            ? true
            : (p.collections && p.collections.includes(filterCollection)) || (p.collectionId === filterCollection);

        const matchesWeek = filterWeek === 'All'
            ? true
            : getWBDateString(p.dateDecided) === filterWeek;

        return matchesSearch && matchesStatus && matchesCollection && matchesWeek && matchesArchiveState;
    });

    filteredProjects.sort((a, b) => {
        if (sortBy === 'dateDecidedDesc') {
            return new Date(b.dateDecided || 0) - new Date(a.dateDecided || 0);
        } else if (sortBy === 'dateDecidedAsc') {
            return new Date(a.dateDecided || 0) - new Date(b.dateDecided || 0);
        } else if (sortBy === 'status') {
            return (a.status || '').localeCompare(b.status || '');
        }
        return 0;
    });

    const totalPages = Math.ceil(filteredProjects.length / itemsPerPage);
    const paginatedProjects = viewMode === 'list'
        ? filteredProjects.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
        : filteredProjects;

    const toggleArchiveProject = async (id, isArchived, currentStatus) => {
        try {
            const currentlyArchived = isArchived === true || currentStatus === 'Archive';
            const updates = { isArchived: !currentlyArchived };
            if (currentlyArchived && currentStatus === 'Archive') {
                updates.status = 'New'; 
            }
            
            const batch = writeBatch(db);
            const ref = doc(db, 'pre_approved_projects', id);
            batch.update(ref, updates);

            // If archiving (not currently archived) and has a linked project
            if (!currentlyArchived) {
                const project = projects.find(p => p.id === id);
                if (project && project.linkedProjectId) {
                    const linkedRef = doc(db, 'projects', project.linkedProjectId);
                    const linkedSnap = await getDoc(linkedRef);
                    if (linkedSnap.exists()) {
                        const linkedData = linkedSnap.data();
                        const dateStr = new Date().toLocaleDateString('en-GB');
                        const noteToAppend = `\n\n[System]: Pre-approved project was archived on ${dateStr}.`;
                        const currentNotes = linkedData.notes || '';
                        batch.update(linkedRef, {
                            isArchived: true,
                            notes: currentNotes + noteToAppend
                        });
                    }
                }
            }

            await batch.commit();
        } catch (error) {
            console.error("Error toggling archive status:", error);
            alert("Failed to update archive status.");
        }
    };

    const saveProjectDetails = async () => {
        if (!selectedProject) return;
        try {
            const batch = writeBatch(db);
            const projectRef = doc(db, 'pre_approved_projects', selectedProject.id);
            
            batch.update(projectRef, {
                notes: editNotes,
                status: editStatus,
                letterVersion: editLetterVersion
            });

            if (selectedProject.linkedProjectId) {
                const pRef = doc(db, 'projects', selectedProject.linkedProjectId);
                batch.update(pRef, {
                    notes: editNotes
                });
            }

            await batch.commit();
            closeProject();
        } catch (error) {
            console.error("Error updating project:", error);
            alert("Failed to save project details.");
        }
    };

    const handleManualLink = async () => {
        if (!selectedProject) return;
        const projectId = window.prompt("Enter the exact ID of the Final Project to link:");
        if (!projectId) return;

        try {
            const paRef = doc(db, 'pre_approved_projects', selectedProject.id);
            const projectRef = doc(db, 'projects', projectId);

            const paSnap = await getDoc(paRef);
            const pSnap = await getDoc(projectRef);
            let combinedNotes = "";
            let combinedCollections = [];

            if (pSnap.exists() && paSnap.exists()) {
                const pData = pSnap.data();
                const paData = paSnap.data();
                
                if (paData.notes) combinedNotes += `[Pre-Approved]:\n${paData.notes}\n\n`;
                if (pData.notes) combinedNotes += `[Approved]:\n${pData.notes}`;
                combinedNotes = combinedNotes.trim();
                
                combinedCollections = Array.from(new Set([...(pData.collections || []), ...(paData.collections || [])]));
            }

            const batch = writeBatch(db);
            batch.update(paRef, {
                linkedProjectId: projectId,
                notes: combinedNotes,
                collections: combinedCollections
            });

            batch.update(projectRef, {
                linkedPreApprovedId: selectedProject.id,
                suggestedPreApprovedId: null,
                notes: combinedNotes,
                collections: combinedCollections
            });

            await batch.commit();
            setSelectedProject(prev => ({
                ...prev,
                linkedProjectId: projectId,
                notes: combinedNotes,
                collections: combinedCollections
            }));
            setEditNotes(combinedNotes);
        } catch (err) {
            console.error("Error linking manually:", err);
            alert("Failed to link project manually. Please check the ID.");
        }
    };

    const handleUnlink = async () => {
        if (!selectedProject || !selectedProject.linkedProjectId) return;
        if (!window.confirm("Are you sure you want to unlink these projects?")) return;
        
        try {
            const batch = writeBatch(db);
            const paRef = doc(db, 'pre_approved_projects', selectedProject.id);
            const projectRef = doc(db, 'projects', selectedProject.linkedProjectId);
            
            batch.update(paRef, {
                linkedProjectId: null
            });

            batch.update(projectRef, {
                linkedPreApprovedId: null
            });

            await batch.commit();
            setSelectedProject(prev => ({
                ...prev,
                linkedProjectId: null
            }));
        } catch (err) {
            console.error("Error unlinking:", err);
            alert("Failed to unlink.");
        }
    };

    const handleAddLetterOption = async (e) => {
        e.preventDefault();
        if (!newLetterOptionInput.trim()) return;
        try {
            await updateDoc(doc(db, 'system', 'letter_options'), {
                options: arrayUnion(newLetterOptionInput.trim())
            });
            setEditLetterVersion(newLetterOptionInput.trim());
            setNewLetterOptionInput('');
        } catch (error) {
            try {
                await setDoc(doc(db, 'system', 'letter_options'), {
                    options: [newLetterOptionInput.trim()]
                });
                setEditLetterVersion(newLetterOptionInput.trim());
                setNewLetterOptionInput('');
            } catch (err) {
                console.error("Error adding letter option:", err);
                alert("Failed to add letter option.");
            }
        }
    };

    const toggleBuilderAvailability = async (builderId, currentAvailability) => {
        try {
            const builderRef = doc(db, 'builders', builderId);
            await updateDoc(builderRef, {
                availability: !currentAvailability
            });
        } catch (error) {
            console.error("Error updating builder availability:", error);
        }
    };

    const assignLead = async () => {
        if (!selectedProject || !selectedBuilderToAssign) return;

        if (projectAssignments.some(assign => assign.builderId === selectedBuilderToAssign)) {
            alert("This project is already assigned to that builder.");
            return;
        }

        try {
            await addDoc(collection(db, 'assignments'), {
                projectId: selectedProject.id,
                builderId: selectedBuilderToAssign,
                dateAssigned: serverTimestamp(),
                status: 'Pending'
            });
            setSelectedBuilderToAssign('');
            setEditStatus('Assigned');
        } catch (error) {
            console.error("Error assigning lead:", error);
            alert("Failed to assign lead.");
        }
    };

    const handleAddCollectionToProject = async (e) => {
        e.preventDefault();
        if (!selectedProject || !newProjectCollection.trim()) return;
        try {
            const batch = writeBatch(db);
            const projectRef = doc(db, 'pre_approved_projects', selectedProject.id);
            batch.update(projectRef, {
                collections: arrayUnion(newProjectCollection.trim())
            });

            if (selectedProject.linkedProjectId) {
                const pRef = doc(db, 'projects', selectedProject.linkedProjectId);
                batch.update(pRef, {
                    collections: arrayUnion(newProjectCollection.trim())
                });
            }

            await batch.commit();
            setNewProjectCollection('');
        } catch (error) {
            console.error("Error adding collection:", error);
            alert("Failed to add collection.");
        }
    };

    const handleRemoveCollectionFromProject = async (collectionToRemove) => {
        if (!selectedProject) return;
        try {
            const batch = writeBatch(db);
            const updates = { collections: arrayRemove(collectionToRemove) };
            if (selectedProject.collectionId === collectionToRemove) {
                updates.collectionId = null;
            }
            
            const projectRef = doc(db, 'pre_approved_projects', selectedProject.id);
            batch.update(projectRef, updates);

            if (selectedProject.linkedProjectId) {
                const pRef = doc(db, 'projects', selectedProject.linkedProjectId);
                const pUpdates = { collections: arrayRemove(collectionToRemove) };
                batch.update(pRef, pUpdates);
            }

            await batch.commit();
        } catch (error) {
            console.error("Error removing collection:", error);
            alert("Failed to remove collection.");
        }
    };

    const toggleRowSelect = (e, id) => {
        if (selectedRowIds.includes(id)) {
            setSelectedRowIds(selectedRowIds.filter(rid => rid !== id));
        } else {
            setSelectedRowIds([...selectedRowIds, id]);
        }
    };

    const handleBatchCollect = async () => {
        if (selectedRowIds.length === 0 || !batchCollectionName.trim()) return;
        try {
            const batch = writeBatch(db);
            selectedRowIds.forEach(id => {
                const ref = doc(db, 'pre_approved_projects', id);
                batch.update(ref, { 
                    collections: arrayUnion(batchCollectionName),
                    collectionId: batchCollectionName
                });
            });
            await batch.commit();
            setSelectedRowIds([]);
            setBatchCollectionName('');
        } catch (error) {
            console.error("Batch collection update error:", error);
            alert("Failed to update collection.");
        }
    };

    const handleBatchRoute = async () => {
        if (selectedRowIds.length === 0) return;
        if (!routeDate && !existingRouteId) {
            alert("Please select a date for a new route, or choose an existing route.");
            return;
        }

        try {
            const batch = writeBatch(db);
            selectedRowIds.forEach(id => {
                batch.update(doc(db, 'pre_approved_projects', id), { completed: false });
            });
            await batch.commit();

            if (existingRouteId) {
                const routeRef = doc(db, 'routes', existingRouteId);
                await updateDoc(routeRef, {
                    projectIds: arrayUnion(...selectedRowIds)
                });
                navigate(`/routing?id=${existingRouteId}`);
            } else if (routeDate) {
                const docRef = await addDoc(collection(db, 'routes'), {
                    date: routeDate,
                    projectIds: selectedRowIds,
                    assignedTo: '',
                    startAddress: '',
                    endAddress: '',
                    timestamp: serverTimestamp()
                });
                navigate(`/routing?id=${docRef.id}`);
            }
        } catch (error) {
            console.error("Batch route update error:", error);
            alert("Failed to update route.");
        }
    };

    const handleBatchStatusUpdate = async (status) => {
        if (selectedRowIds.length === 0 || !status) return;
        try {
            const batch = writeBatch(db);
            selectedRowIds.forEach(id => {
                const ref = doc(db, 'pre_approved_projects', id);
                batch.update(ref, { status: status });
            });
            await batch.commit();
            setSelectedRowIds([]);
        } catch (error) {
            console.error("Batch status update error:", error);
            alert("Failed to update status.");
        }
    };

    const handleBatchArchive = async (archiveState) => {
        if (selectedRowIds.length === 0) return;
        try {
            const batch = writeBatch(db);
            for (const id of selectedRowIds) {
                const ref = doc(db, 'pre_approved_projects', id);
                batch.update(ref, { isArchived: archiveState });

                if (archiveState === true) {
                    const project = projects.find(p => p.id === id);
                    if (project && project.linkedProjectId) {
                        const linkedRef = doc(db, 'projects', project.linkedProjectId);
                        const linkedSnap = await getDoc(linkedRef);
                        if (linkedSnap.exists()) {
                            const linkedData = linkedSnap.data();
                            const dateStr = new Date().toLocaleDateString('en-GB');
                            const noteToAppend = `\n\n[System]: Pre-approved project was archived on ${dateStr}.`;
                            const currentNotes = linkedData.notes || '';
                            batch.update(linkedRef, {
                                isArchived: true,
                                notes: currentNotes + noteToAppend
                            });
                        }
                    }
                }
            }
            await batch.commit();
            setSelectedRowIds([]);
        } catch (error) {
            console.error("Batch archive update error:", error);
            alert("Failed to update archive status.");
        }
    };

    const triggerSync = async () => {
        setSyncing(true);
        setSyncStatus('waiting');
        setSyncReport(null);
        setShowSyncModal(false);

        const attemptSync = async (retryCount) => {
            try {
                const response = await fetch('https://europe-west2-benchmark-intel-3ea4a.cloudfunctions.net/scraper', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        targetWeek: selectedSyncDate === 'current' ? null : selectedSyncDate,
                        projectType: 'Pre-Approved'
                    })
                });

                if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);

                const result = await response.json();
                if (result.success) {
                    setSyncReport(result.data);
                    setSyncStatus('success');
                    setSyncing(false);
                } else {
                    throw new Error(result.error || 'Unknown error');
                }
            } catch (error) {
                if (retryCount < 1) {
                    console.warn("First sync attempt failed (likely cold start), retrying in 5 seconds...", error);
                    setTimeout(() => attemptSync(retryCount + 1), 5000);
                } else {
                    console.error("Sync error:", error);
                    setSyncStatus('error');
                    setSyncing(false);
                }
            }
        };

        attemptSync(0);
    };

    const handleUploadProjectPack = async (e) => {
        const file = e.target.files[0];
        if (!file || !activeProject) return;

        setIsUploadingPack(true);
        setUploadProgress(0);

        try {
            const timestamp = Date.now();
            const storagePath = `projects/${activeProject.id}/finished_pack/${timestamp}_${file.name}`;
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

                    await updateDoc(doc(db, 'pre_approved_projects', activeProject.id), {
                        finishedProjectPack: packData,
                        status: 'Pack Created'
                    });

                    setEditStatus('Pack Created');
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
        if (!activeProject?.finishedProjectPack) return;
        
        setConfirmation({
            isOpen: true,
            title: 'Delete Project Pack',
            message: 'Are you sure you want to delete the finished project pack? This action will permanently remove the file from storage.',
            confirmText: 'Delete Pack',
            type: 'danger',
            onConfirm: async () => {
                try {
                    // Try to extract path from fullPath or fall back to URL extraction
                    const path = activeProject.finishedProjectPack.fullPath || (activeProject.finishedProjectPack.url?.includes('/o/') 
                        ? decodeURIComponent(activeProject.finishedProjectPack.url.split('/o/')[1].split('?')[0]) 
                        : null);

                    if (path) {
                        try {
                            const packRef = ref(storage, path);
                            await deleteObject(packRef);
                        } catch (storageErr) {
                            // If file is already gone, proceed with cleaning the record
                            if (storageErr.code !== 'storage/object-not-found') {
                                throw storageErr;
                            }
                            console.warn("Storage object already deleted, cleaning Firestore record.");
                        }
                    }

                    await updateDoc(doc(db, 'pre_approved_projects', activeProject.id), {
                        finishedProjectPack: null,
                        status: 'Pack Required'
                    });
                    setEditStatus('Pack Required');
                    setConfirmation({ ...confirmation, isOpen: false });
                } catch (error) {
                    console.error("Delete error:", error);
                    alert("Failed to delete project pack: " + (error.message || "Unknown error"));
                }
            }
        });
    };

    return (
        <div className="w-full relative flex flex-col h-full overflow-hidden">
            <header className="mb-3 md:mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shrink-0">
                <div className="min-w-0">
                    <h1 className="text-xl md:text-3xl font-semibold tracking-tight text-blue-ex-dark truncate">Pre-Approved</h1>
                    <p className="mt-0.5 text-xs md:text-sm text-grey-mid hidden md:block">Track and manage planning application leads.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 md:gap-3 shrink-0 w-full md:w-auto">
                    <div className="flex rounded-lg border border-grey-ex-light p-0.5 md:p-1 bg-grey-accent/50">
                        <button onClick={() => navigate('/pre-approved')} title="List View" className={`flex items-center gap-1.5 px-2 py-1.5 md:px-3 text-xs font-semibold rounded-md transition-all ${viewMode === 'list' ? 'bg-white text-blue-ex-dark shadow-sm' : 'text-grey-mid hover:text-grey-dark'}`}>
                            <List className="h-3.5 w-3.5" /> <span className="hidden md:inline">List</span>
                        </button>
                        <button onClick={() => navigate('/pre-approved-map')} title="Map View" className={`flex items-center gap-1.5 px-2 py-1.5 md:px-3 text-xs font-semibold rounded-md transition-all ${viewMode === 'map' ? 'bg-white text-blue-ex-dark shadow-sm' : 'text-grey-mid hover:text-grey-dark'}`}>
                            <MapIcon className="h-3.5 w-3.5" /> <span className="hidden md:inline">Map</span>
                        </button>
                    </div>
                    {viewMode === 'map' && (
                        <button onClick={toggleMapRouteMode} title="Route Mode" className={`flex items-center gap-1 rounded-lg px-2 py-2 md:px-4 md:py-2.5 text-xs md:text-sm font-medium transition-all border ${ mapRouteMode ? 'bg-green-mid border-green-mid text-black shadow-inner' : 'bg-white border-grey-ex-light text-grey-dark hover:bg-grey-ex-light shadow-sm' }`}>
                            <NavIcon className={`h-3.5 w-3.5 md:h-4 md:w-4 ${mapRouteMode ? 'text-white' : 'text-grey-light'}`} />
                            <span className="hidden md:inline">{mapRouteMode ? `Route Mode (${mapSelectedIds.length} selected)` : 'Route Mode'}</span>
                        </button>
                    )}
                    <button onClick={cycleArchiveMode} title={archiveMode === 'off' ? 'View Archive' : archiveMode === 'only' ? 'Showing Archived' : 'Showing Both'} className={`flex items-center gap-1 rounded-lg px-2 py-2 md:px-4 md:py-2.5 text-xs md:text-sm font-medium transition-all border ${archiveMode !== 'off' ? 'bg-gold-ex-light border-gold-ex-light text-gold-dark shadow-inner' : 'bg-white border-grey-ex-light text-grey-dark hover:bg-grey-ex-light shadow-sm'}`}>
                        <Archive className={`h-3.5 w-3.5 md:h-4 md:w-4 ${archiveMode !== 'off' ? 'text-gold-mid' : 'text-grey-light'}`} />
                        <span className="hidden md:inline">{archiveMode === 'off' ? 'View Archive' : archiveMode === 'only' ? 'Showing Archived' : 'Showing Both'}</span>
                    </button>
                    <div className="relative flex flex-col items-center">
                        <button onClick={() => setShowSyncModal(true)} disabled={syncing} title="Sync Data" className="flex items-center gap-1 rounded-lg bg-blue-ex-dark px-2 py-2 md:px-4 md:py-2.5 text-xs md:text-sm font-medium text-white shadow-sm transition-all hover:bg-black disabled:opacity-50">
                            {syncing ? <Loader2 className="h-3.5 w-3.5 md:h-4 md:w-4 animate-spin" /> : <Activity className="h-3.5 w-3.5 md:h-4 md:w-4 text-blue-light" />}
                            <span className="hidden md:inline">{syncing ? 'Scraping...' : 'Sync Data'}</span>
                        </button>
                        {syncProgress?.timestamp && (
                            <span className="absolute -bottom-4 right-0 md:right-auto md:left-1/2 md:-translate-x-1/2 text-[10px] text-grey-light whitespace-nowrap pointer-events-none hidden md:block">
                                Last sync: {syncProgress.timestamp?.toDate ? syncProgress.timestamp.toDate().toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : new Date(syncProgress.timestamp).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </span>
                        )}
                        {syncProgress?.timestamp && (
                            <span className="absolute -bottom-4 right-0 text-[9px] text-grey-light whitespace-nowrap pointer-events-none md:hidden">
                                {syncProgress.timestamp?.toDate ? syncProgress.timestamp.toDate().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : new Date(syncProgress.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        )}
                    </div>
                </div>
            </header>

            {syncStatus && (
                <div className={`mb-6 p-4 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between animate-in fade-in slide-in-from-top-2 duration-300 gap-4 ${syncStatus === 'success' ? 'bg-green-ex-light border-green-ex-light text-green-dark' : syncStatus === 'error' ? 'bg-red-ex-light border-red-ex-light text-red-dark' : 'bg-blue-ex-light border-blue-ex-light text-blue-dark'}`}>
                    <div className="flex items-start md:items-center gap-3 flex-1 w-full">
                        {syncStatus === 'success' ? <CheckCircle2 className="h-6 w-6 text-green-mid mt-0.5 md:mt-0 shrink-0" /> : <Activity className="h-6 w-6 animate-pulse text-blue-mid mt-0.5 md:mt-0 shrink-0" />}
                        <div className="flex-1 w-full">
                            <p className="text-sm font-bold">{syncStatus === 'success' ? 'Sync Complete' : syncStatus === 'error' ? 'Sync Failed' : (syncProgress?.message || 'Sync in progress...')}</p>
                            
                            {syncStatus === 'waiting' && syncProgress?.status === 'running' && (
                                <div className="w-full max-w-md h-2.5 bg-blue-ex-light rounded-full mt-2 overflow-hidden border border-blue-light">
                                    <div 
                                        className="h-full bg-blue-mid transition-all duration-300 ease-out" 
                                        style={{ width: `${Math.max(5, syncProgress.progress || 0)}%` }}
                                    ></div>
                                </div>
                            )}

                            {syncReport && (
                                <div className="mt-1.5 space-y-1">
                                    <p className="text-xs font-medium">
                                        Added <b>{syncReport.added}</b> new projects, skipped <b>{syncReport.skipped}</b> existing.
                                    </p>
                                    {syncReport.addedRefs && syncReport.addedRefs.length > 0 && (
                                        <p className="text-[11px] opacity-80 leading-relaxed bg-white/50 p-2 rounded-lg border border-black/5 inline-block w-full max-w-2xl break-words">
                                            <b>New Project References:</b> {syncReport.addedRefs.join(', ')}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                    <button onClick={() => setSyncStatus(null)} className="p-1.5 hover:bg-black/5 rounded-full self-start md:self-center shrink-0"><X className="h-4 w-4" /></button>
                </div>
            )}

            <div className="rounded-xl border border-grey-ex-light bg-white shadow-sm overflow-hidden flex flex-col flex-1 min-h-0 relative z-0">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 border-b border-grey-ex-light p-4 bg-white shrink-0">
                    <div className="relative flex-1 w-full max-w-sm">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-grey-light" />
                        <input
                            type="text"
                            placeholder="Search by address, description, name..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full rounded-lg border border-grey-light py-2.5 pl-10 pr-4 text-sm focus:border-blue-ex-dark focus:outline-none focus:ring-1 focus:ring-blue-ex-dark"
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
                        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded-lg border border-grey-light py-2.5 px-3 text-sm focus:border-blue-ex-dark focus:outline-none bg-white flex-1 sm:flex-none min-w-[140px]">
                            <option value="All">All Statuses</option>
                            <option value="New + Revisit">New + Revisit</option>
                            <option value="Letters">Letters</option>
                            {STATUS_OPTIONS.map(status => (
                                <option key={status} value={status}>{status}</option>
                            ))}
                        </select>
                        <select value={filterCollection} onChange={(e) => setFilterCollection(e.target.value)} className="rounded-lg border border-grey-light py-2.5 px-3 text-sm focus:border-blue-ex-dark focus:outline-none bg-white max-w-[160px] truncate flex-1 sm:flex-none min-w-[140px]">
                            <option value="All">All Collections</option>
                            {availableCollections.map(col => (
                                <option key={col} value={col}>{col}</option>
                            ))}
                        </select>
                        <select value={filterWeek} onChange={(e) => setFilterWeek(e.target.value)} className="rounded-lg border border-grey-light py-2.5 px-3 text-sm focus:border-blue-ex-dark focus:outline-none bg-white max-w-[160px] truncate flex-1 sm:flex-none min-w-[140px]">
                            <option value="All">All Weeks</option>
                            {availableWeeks.map(date => (
                                <option key={date} value={date}>{date}</option>
                            ))}
                        </select>
                        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="rounded-lg border border-grey-light py-2.5 px-3 text-sm focus:border-blue-ex-dark focus:outline-none bg-white flex-1 sm:flex-none min-w-[140px]">
                            <option value="dateDecidedDesc">Decided (Newest)</option>
                            <option value="dateDecidedAsc">Decided (Oldest)</option>
                            <option value="status">Status</option>
                        </select>
                    </div>
                </div>

                {selectedRowIds.length > 0 && (
                    <div className="bg-blue-ex-light/50 px-4 py-3 border-b border-blue-ex-light flex flex-col md:flex-row items-start md:items-center justify-between animate-in slide-in-from-left-2 duration-200 gap-3">
                        <div className="flex flex-col md:flex-row md:items-center gap-3 w-full">
                            <span className="text-sm font-bold text-blue-ex-dark shrink-0">{selectedRowIds.length} projects selected</span>
                            <div className="flex flex-wrap gap-2 md:gap-4 w-full">
                                <div className="flex gap-2 items-center">
                                    <input
                                        type="text"
                                        placeholder="Collection..."
                                        value={batchCollectionName}
                                        onChange={(e) => setBatchCollectionName(e.target.value)}
                                        className="rounded border border-blue-ex-light px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-light w-32 bg-white"
                                    />
                                    <button onClick={handleBatchCollect} className="bg-blue-mid text-black px-3 py-1.5 rounded text-xs font-bold hover:bg-blue-dark">Apply</button>
                                </div>
                                <div className="h-6 w-px bg-blue-ex-light"></div>
                                <div className="flex gap-2 items-center">
                                    <input
                                        type="date"
                                        value={routeDate}
                                        onChange={(e) => {
                                            setRouteDate(e.target.value);
                                            if (e.target.value) setExistingRouteId('');
                                        }}
                                        className="rounded border border-blue-ex-light px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-light bg-white"
                                    />
                                    <select
                                        value={existingRouteId}
                                        onChange={(e) => {
                                            setExistingRouteId(e.target.value);
                                            if (e.target.value) setRouteDate('');
                                        }}
                                        className="rounded border border-blue-ex-light px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-light max-w-[120px] truncate bg-white"
                                    >
                                        <option value="">Existing Route...</option>
                                        {routesList.map(r => (
                                            <option key={r.id} value={r.id}>{r.date ? new Date(r.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Unknown Date'}</option>
                                        ))}
                                    </select>
                                    <button onClick={handleBatchRoute} className="bg-green-mid text-black px-3 py-1.5 rounded text-xs font-bold hover:bg-green-dark flex items-center gap-1"><MapPin className="h-3 w-3" /> Add Route</button>
                                </div>
                                <div className="h-6 w-px bg-blue-ex-light"></div>
                                <div className="flex gap-2 items-center">
                                    <select
                                        onChange={(e) => handleBatchStatusUpdate(e.target.value)}
                                        className="rounded border border-blue-ex-light px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-light bg-white"
                                        defaultValue=""
                                    >
                                        <option value="" disabled>Update Status...</option>
                                        {STATUS_OPTIONS.map(status => (
                                            <option key={status} value={status}>{status}</option>
                                        ))}
                                    </select>
                                    <button 
                                        onClick={() => handleBatchArchive(archiveMode !== 'only')} 
                                        className="bg-gold-ex-light text-gold-dark px-3 py-1.5 rounded text-xs font-bold hover:bg-gold-ex-light flex items-center gap-1.5 border border-gold-ex-light transition-colors shadow-sm"
                                    >
                                        <Archive className="h-3 w-3" /> 
                                        {archiveMode === 'only' ? 'Unarchive' : 'Archive'}
                                    </button>
                                </div>
                            </div>
                        </div>
                        <button onClick={() => setSelectedRowIds([])} className="text-blue-mid font-bold text-xs hover:underline">Clear Selection</button>
                    </div>
                )}

                {viewMode === 'list' ? (
                    <>
                        <div ref={scrollContainerRef} className="flex-1 overflow-auto mini-scroll">
                            <table className="w-full text-left text-sm text-grey-mid">
                                <thead className="bg-grey-accent text-xs uppercase text-grey-dark sticky top-0 z-10 shadow-sm border-b border-grey-ex-light">
                                    <tr>
                                        <th className="px-4 py-4 w-10 text-center"><input type="checkbox" onChange={(e) => e.target.checked ? setSelectedRowIds(filteredProjects.map(p => p.id)) : setSelectedRowIds([])} checked={selectedRowIds.length === filteredProjects.length && filteredProjects.length > 0} className="rounded border-grey-light text-blue-ex-dark focus:ring-blue-ex-dark" /></th>
                                        <th className="px-4 py-4 font-medium">Address</th>
                                        <th className="px-4 py-4 font-medium hidden md:table-cell">Description</th>
                                        <th className="px-4 py-4 font-medium w-32">Status</th>
                                        <th className="px-4 py-4 font-medium w-32 hidden sm:table-cell">Decided</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 bg-white">
                                    {loading ? (
                                        <tr><td colSpan="5" className="px-6 py-8 text-center text-sm text-grey-mid"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-grey-light" />Loading projects...</td></tr>
                                    ) : filteredProjects.length === 0 ? (
                                        <tr><td colSpan="5" className="px-6 py-8 text-center text-sm text-grey-mid">No projects found matching your criteria.</td></tr>
                                    ) : (
                                        paginatedProjects.map((project) => (
                                            <tr key={project.id} onClick={() => openProject(project)} className={`hover:bg-grey-ex-light/50 cursor-pointer transition-colors ${selectedRowIds.includes(project.id) ? 'bg-blue-ex-light/30' : ''} ${(project.isArchived || project.status === 'Archive') ? 'opacity-50 grayscale-[0.5]' : ''}`}>
                                                <td className="px-4 py-4 text-center" onClick={(e) => { e.stopPropagation(); toggleRowSelect(e, project.id); }}>
                                                    <input type="checkbox" className="rounded border-grey-light text-blue-ex-dark focus:ring-blue-ex-dark" checked={selectedRowIds.includes(project.id)} onChange={e => { }} />
                                                </td>
                                                <td className="px-4 py-4 font-medium text-blue-ex-dark">
                                                    <div className="flex items-center gap-1.5">
                                                        {project.linkedProjectId && <Star className="h-3.5 w-3.5 text-grey-light" strokeWidth={2} title="Linked to Final Project" />}
                                                        {project.status === 'Rejected' && <XCircle className="h-3.5 w-3.5 text-grey-light" strokeWidth={2} title="Rejected Final Project" />}
                                                        <span>{project.address}</span>
                                                    </div>
                                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                                        {project.collections && project.collections.map((col, i) => (
                                                            <div key={i} className="text-[10px] text-blue-ex-dark font-bold flex items-center gap-1 bg-blue-ex-light px-1.5 py-0.5 rounded border border-blue-ex-light w-fit"><Filter className="h-2.5 w-2.5" />{col}</div>
                                                        ))}
                                                        {project.collectionId && (!project.collections || !project.collections.includes(project.collectionId)) && (
                                                            <div className="text-[10px] text-blue-ex-dark font-bold flex items-center gap-1 bg-blue-ex-light px-1.5 py-0.5 rounded border border-blue-ex-light w-fit"><Filter className="h-2.5 w-2.5" />{project.collectionId}</div>
                                                        )}
                                                        {(project.status === 'Pack Required' || project.status === 'Pack Created' || project.status === 'Assigned') && (
                                                            <div className="text-[10px] text-grey-dark font-bold flex items-center gap-1 bg-grey-accent px-1.5 py-0.5 rounded border border-grey-light shadow-sm w-fit" title="Project Pack ID">
                                                                <FileText className="h-2.5 w-2.5" /> 
                                                                 {project.customId || generateCustomProjectId(project.address, project.reference, project.coordinates)}
                                                             </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4 truncate max-w-xs hidden md:table-cell" title={project.description}>{project.description}</td>
                                                <td className="px-4 py-4">
                                                    <StatusBadge status={project.status} />
                                                </td>
                                                <td className="px-4 py-4 whitespace-nowrap text-grey-mid hidden sm:table-cell">{project.dateDecided ? new Date(project.dateDecided).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'N/A'}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {totalPages > 1 && (
                            <div className="flex items-center justify-between border-t border-grey-ex-light bg-grey-accent px-4 py-3 sm:px-6 shrink-0">
                                <span className="text-sm text-grey-dark">Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium">{Math.min(currentPage * itemsPerPage, filteredProjects.length)}</span> of <span className="font-medium">{filteredProjects.length}</span> results</span>
                                <div className="flex gap-2">
                                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="relative inline-flex items-center rounded-md border border-grey-light bg-white px-3 py-2 text-sm font-medium text-grey-dark hover:bg-grey-ex-light disabled:opacity-50"><ChevronLeft className="h-4 w-4 mr-1" /> Prev</button>
                                    <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="relative inline-flex items-center rounded-md border border-grey-light bg-white px-3 py-2 text-sm font-medium text-grey-dark hover:bg-grey-ex-light disabled:opacity-50">Next <ChevronRight className="h-4 w-4 ml-1" /></button>
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="flex-1 w-full relative z-0 min-h-0">
                        <MapDisplay 
                            filteredProjects={filteredProjects}
                            mapSelectedIds={mapSelectedIds}
                            toggleMapPin={toggleMapPin}
                            routesList={routesList}
                            openProject={openProject}
                            navigate={navigate}
                            mapRouteMode={mapRouteMode}
                        />

                        {/* Floating action bar — slides up ONLY when pins are selected */}
                        {mapSelectedIds.length > 0 && (
                            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] bg-white rounded-2xl shadow-2xl border border-grey-ex-light p-4 flex flex-col gap-3 animate-in slide-in-from-bottom-4 duration-200" style={{ minWidth: 320 }}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="h-6 w-6 rounded-full bg-green-ex-light flex items-center justify-center text-green-dark text-xs font-bold">{mapSelectedIds.length}</div>
                                        <p className="text-sm font-bold text-blue-ex-dark">Stop{mapSelectedIds.length !== 1 ? 's' : ''} Selected</p>
                                    </div>
                                    <button onClick={() => setMapSelectedIds([])} className="text-xs text-grey-light hover:text-grey-mid font-medium">Clear All</button>
                                </div>
                                <div className="flex gap-2">
                                    <select
                                        value={mapExistingRouteId}
                                        onChange={e => { setMapExistingRouteId(e.target.value); if (e.target.value) setMapRouteDate(''); }}
                                        className="flex-1 rounded-lg border border-grey-ex-light px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-green-light"
                                    >
                                        <option value="">Existing route...</option>
                                        {routesList.map(r => (
                                            <option key={r.id} value={r.id}>
                                                {r.date ? new Date(r.date).toLocaleDateString('en-GB') : 'Unknown'}
                                            </option>
                                        ))}
                                    </select>
                                    <input
                                        type="date"
                                        value={mapRouteDate}
                                        onChange={e => { setMapRouteDate(e.target.value); if (e.target.value) setMapExistingRouteId(''); }}
                                        className="rounded-lg border border-grey-ex-light px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-green-light"
                                    />
                                </div>
                                <button
                                    onClick={handleMapBatchRoute}
                                    disabled={mapRouteAdding || (!mapRouteDate && !mapExistingRouteId)}
                                    className="w-full py-2.5 bg-green-mid hover:bg-green-dark text-black text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-40 shadow-lg shadow-green-ex-light"
                                >
                                    {mapRouteAdding ? <><Loader2 className="h-4 w-4 animate-spin" /> Finalizing...</> : <><MapPin className="h-4 w-4" /> Add {mapSelectedIds.length} Stop{mapSelectedIds.length !== 1 ? 's' : ''} to Route</>}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className={`absolute inset-0 z-[60] bg-white flex flex-col transform transition-transform duration-500 ease-out shadow-2xl ${selectedProject ? 'translate-x-0' : 'translate-x-full'}`}>
                {activeProject && (
                    <>
                        <div className="px-4 py-4 sm:px-6 sm:py-4 border-b border-grey-ex-light bg-grey-accent flex justify-between items-center shrink-0">
                            <div>
                                <h3 className="text-lg sm:text-xl font-bold text-blue-ex-dark">Project Details</h3>
                                <p className="text-xs sm:text-sm text-grey-mid mt-0.5 font-medium">{activeProject.id}</p>
                            </div>
                            <button onClick={closeProject} className="text-grey-dark hover:text-grey-dark focus:outline-none p-2 rounded-full hover:bg-grey-ex-light transition-colors shrink-0">
                                <X className="h-6 w-6" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 bg-grey-accent mini-scroll">
                            <div className="max-w-4xl mx-auto space-y-8 pb-12">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div>
                                        <h3 className="text-sm font-medium text-grey-mid uppercase tracking-wider">Address</h3>
                                        <p className="mt-2 text-base text-grey-ex-dark flex items-start gap-2 font-medium"><MapPin className="h-5 w-5 mt-0.5 text-blue-mid shrink-0" />{activeProject.address}</p>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-medium text-grey-mid uppercase tracking-wider">Description</h3>
                                        <p className="mt-2 text-base text-grey-ex-dark leading-relaxed">{activeProject.description}</p>
                                    </div>
                                </div>

                                <div className="bg-grey-accent p-6 rounded-xl border border-grey-ex-light">
                                    {/* Action Bar - Now non-absolute to prevent overlapping */}
                                    <div className="flex flex-wrap items-center justify-end gap-2 mb-6 border-b border-grey-ex-light pb-4">
                                        <button
                                            onClick={() => toggleArchiveProject(activeProject.id, activeProject.isArchived, activeProject.status)}
                                            title={(activeProject.isArchived || activeProject.status === 'Archive') ? "Unarchive Project" : "Archive Project"}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg shadow-sm transition-colors border ${(activeProject.isArchived || activeProject.status === 'Archive') ? 'bg-gold-ex-light text-gold-mid border-gold-ex-light hover:bg-gold-ex-light' : 'bg-white text-grey-mid border-grey-ex-light hover:bg-grey-ex-light hover:text-gold-mid'}`}
                                        >
                                            <Archive className="h-4 w-4" />
                                            {(activeProject.isArchived || activeProject.status === 'Archive') ? 'Unarchive' : 'Archive'}
                                        </button>
                                        <button
                                            onClick={() => setViewMode('map')}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-white border border-grey-ex-light rounded-lg text-blue-ex-dark hover:bg-grey-ex-light shadow-sm transition-colors"
                                        >
                                            <MapIcon className="h-3.5 w-3.5 text-blue-mid" /> View on Map
                                        </button>
                                        <button 
                                            onClick={() => {
                                                const path = hasCorrespondence 
                                                    ? `/correspondence?type=homeowner&id=${activeProject.id}` 
                                                    : '/correspondence';
                                                navigate(path);
                                            }}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-white border border-grey-ex-light rounded-lg text-blue-ex-dark hover:bg-grey-ex-light shadow-sm transition-colors"
                                        >
                                            <MessageSquare className="h-3.5 w-3.5 text-blue-mid" /> Correspondence
                                        </button>
                                        <a href={activeProject.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-white border border-grey-ex-light rounded-lg text-blue-ex-dark hover:bg-grey-ex-light shadow-sm transition-colors">
                                            Portal <ExternalLink className="h-3.5 w-3.5 text-grey-light" />
                                        </a>
                                        <button 
                                            onClick={() => openWorkspace(activeProject.id)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-blue-ex-dark border border-transparent rounded-lg text-white hover:bg-black shadow-sm transition-colors"
                                        >
                                            Open Workspace <ChevronRight className="h-3.5 w-3.5 text-white/70" />
                                        </button>
                                    </div>

                                    {/* Project Meta Data Grid */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-y-6 gap-x-4">
                                        <div className="col-span-2 bg-grey-accent p-3 rounded-lg border border-grey-ex-light">
                                            <h3 className="text-[10px] font-bold text-grey-light uppercase tracking-widest">Applicant</h3>
                                            <p className="mt-1 text-sm font-bold text-grey-ex-dark truncate" title={activeProject.applicantName || activeProject.homeownerName || 'Unknown Applicant'}>
                                                {activeProject.applicantName || activeProject.homeownerName || 'Unknown Applicant'}
                                            </p>
                                        </div>
                                        <div className="bg-grey-accent p-3 rounded-lg border border-grey-ex-light">
                                            <h3 className="text-[10px] font-bold text-grey-light uppercase tracking-widest">Reference</h3>
                                            <p className="mt-1 text-sm font-semibold text-grey-ex-dark truncate">{activeProject.reference || 'N/A'}</p>
                                        </div>
                                        <div className="bg-grey-accent p-3 rounded-lg border border-grey-ex-light">
                                            <h3 className="text-[10px] font-bold text-grey-light uppercase tracking-widest">App Status</h3>
                                            <p className="mt-1 text-sm font-semibold text-grey-ex-dark truncate">{activeProject.applicationStatus || 'N/A'}</p>
                                        </div>

                                        <div className="pt-2">
                                            <h3 className="text-[10px] font-bold text-grey-light uppercase tracking-widest">Received</h3>
                                            <p className="mt-1 text-sm font-medium text-grey-dark">{activeProject.dateReceived ? new Date(activeProject.dateReceived).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'N/A'}</p>
                                        </div>
                                        <div className="pt-2">
                                            <h3 className="text-[10px] font-bold text-grey-light uppercase tracking-widest">Validated</h3>
                                            <p className="mt-1 text-sm font-medium text-grey-dark">{activeProject.dateValidated ? new Date(activeProject.dateValidated).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'N/A'}</p>
                                        </div>
                                        <div className="pt-2">
                                            <h3 className="text-[10px] font-bold text-grey-light uppercase tracking-widest">Decided</h3>
                                            <p className="mt-1 text-sm font-medium text-grey-dark">{activeProject.dateDecided ? new Date(activeProject.dateDecided).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'N/A'}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-green-ex-light/50 p-6 border border-green-ex-light rounded-xl space-y-4">
                                    <h3 className="text-sm font-semibold text-green-ex-dark flex items-center justify-between">
                                        <span className="flex items-center gap-2"><Package className="h-4 w-4" /> Finished Project Pack</span>
                                        {!activeProject.finishedProjectPack && !isUploadingPack && (
                                            <button 
                                                onClick={() => packInputRef.current?.click()}
                                                className="text-xs bg-green-mid text-black px-3 py-1.5 rounded-lg hover:bg-green-dark transition-colors flex items-center gap-1.5 shadow-sm"
                                            >
                                                <UploadCloud className="h-3 w-3" /> Upload Pack
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
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-xs text-green-dark font-medium">
                                                <span>Uploading...</span>
                                                <span>{Math.round(uploadProgress)}%</span>
                                            </div>
                                            <div className="w-full bg-green-ex-light rounded-full h-1.5">
                                                <div 
                                                    className="bg-green-mid h-1.5 rounded-full transition-all duration-300" 
                                                    style={{ width: `${uploadProgress}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    ) : activeProject.finishedProjectPack ? (
                                        <div className="flex items-center justify-between bg-white p-4 rounded-lg border border-green-ex-light shadow-sm">
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className="h-10 w-10 rounded-lg bg-green-ex-light flex items-center justify-center shrink-0">
                                                    <File className="h-5 w-5 text-green-mid" />
                                                </div>
                                                <div className="overflow-hidden">
                                                    <p className="text-sm font-bold text-grey-ex-dark truncate" title={activeProject.finishedProjectPack.name}>
                                                        {activeProject.finishedProjectPack.name}
                                                    </p>
                                                    <p className="text-[10px] text-grey-mid uppercase tracking-wider font-semibold">
                                                        Uploaded {new Date(activeProject.finishedProjectPack.uploadedAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <a 
                                                    href={activeProject.finishedProjectPack.url} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-green-mid text-black rounded-lg hover:bg-green-dark shadow-sm"
                                                >
                                                    <ExternalLink className="h-3.5 w-3.5" /> Open Pack
                                                </a>
                                                <button 
                                                    onClick={handleDeleteProjectPack}
                                                    className="p-1.5 text-red-dark0 hover:bg-red-ex-light rounded-lg transition-colors"
                                                    title="Delete Pack"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center py-4">
                                            <p className="text-sm text-green-dark/60 italic">No project pack uploaded yet. This is your final delivery for this homeowner.</p>
                                        </div>
                                    )}
                                </div>

                                <div className="bg-blue-ex-light/50 p-6 border border-blue-ex-light rounded-xl space-y-6">
                                    <h3 className="text-sm font-semibold text-blue-ex-dark flex items-center justify-between">
                                        <span className="flex items-center gap-2"><ClipboardList className="h-4 w-4" /> Homeowner & Capture Details</span>
                                        <div className="flex gap-2">
                                            <button 
                                                onClick={() => navigate(`/captures?projectId=${activeProject.id}`)}
                                                className="text-xs bg-white text-blue-ex-dark px-3 py-1.5 rounded-lg border border-blue-ex-light hover:bg-blue-ex-light transition-colors font-bold shadow-sm"
                                            >
                                                View All Logs
                                            </button>
                                            <a
                                                href={`${window.location.origin}${window.location.pathname}#/prefilled/capture?id=${activeProject.id}&type=preapproved`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs bg-blue-mid text-black px-3 py-1.5 rounded-lg hover:bg-blue-dark transition-colors flex items-center gap-1.5 shadow-sm"
                                            >
                                                <ExternalLink className="h-3 w-3" /> Open Capture Form
                                            </a>
                                        </div>
                                    </h3>
                                    
                                    {/* Primary Info from Project Doc */}
                                    {activeProject.homeownerName && (
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-6 bg-white/40 p-4 rounded-lg border border-blue-ex-light/50">
                                            <div><h4 className="text-[10px] font-bold text-blue-dark uppercase tracking-widest">Current Name</h4><p className="mt-1 text-sm font-bold text-blue-ex-dark">{activeProject.homeownerName}</p></div>
                                            <div><h4 className="text-[10px] font-bold text-blue-dark uppercase tracking-widest">Email</h4><a href={`mailto:${activeProject.homeownerEmail}`} className="mt-1 text-sm text-blue-mid hover:underline font-bold">{activeProject.homeownerEmail}</a></div>
                                            <div><h4 className="text-[10px] font-bold text-blue-dark uppercase tracking-widest">Phone</h4><a href={`tel:${activeProject.homeownerPhone}`} className="mt-1 text-sm text-blue-mid hover:underline font-bold">{activeProject.homeownerPhone}</a></div>
                                        </div>
                                    )}

                                    {/* Capture History Logs */}
                                    <div className="space-y-3">
                                        <h4 className="text-[10px] font-bold text-blue-dark uppercase tracking-widest flex items-center gap-2 border-b border-blue-ex-light pb-2">
                                            Capture History Log
                                        </h4>
                                        {relatedCaptures.length > 0 ? (
                                            <>
                                                {relatedCaptures.slice(0, 3).map((cap, i) => (
                                                    <div key={cap.id} onClick={() => navigate(`/captures?projectId=${activeProject.id}&id=${cap.id}`)} className="bg-white p-3 rounded-lg border border-blue-ex-light shadow-sm flex justify-between items-center cursor-pointer hover:border-blue-light transition-colors group">
                                                        <div>
                                                            <div className="text-sm font-bold text-grey-ex-dark group-hover:text-blue-dark transition-colors">{cap.fullName}</div>
                                                            <div className="text-[10px] text-grey-mid uppercase font-semibold mt-0.5">
                                                                {cap.timestamp?.toDate ? cap.timestamp.toDate().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Recent'} • {cap.email}
                                                            </div>
                                                        </div>
                                                        <ChevronRight className="h-4 w-4 text-grey-light group-hover:text-blue-mid transition-colors" />
                                                    </div>
                                                ))}
                                                {relatedCaptures.length > 3 && (
                                                    <button onClick={() => navigate(`/captures?projectId=${activeProject.id}`)} className="w-full text-center py-1 text-[10px] font-bold text-blue-mid hover:text-blue-dark uppercase tracking-widest">
                                                        + {relatedCaptures.length - 3} more logs
                                                    </button>
                                                )}
                                            </>
                                        ) : (
                                            <div className="text-center py-4 bg-white/20 rounded-lg border border-blue-ex-light border-dashed">
                                                <p className="text-xs text-blue-dark/60 italic">No historical capture logs found for this project.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Linked Entities Header */}
                                <div className="pt-6 border-t border-grey-ex-light flex items-center justify-between mb-6">
                                    <h3 className="text-lg font-extrabold text-blue-ex-dark flex items-center gap-2">
                                        <Network className="h-5 w-5 text-blue-mid" /> 
                                        Linked Entities & History
                                    </h3>
                                    {!activeProject.linkedProjectId && (
                                        <button 
                                            onClick={handleManualLink}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-white border border-grey-ex-light rounded-lg text-grey-mid hover:text-blue-ex-dark hover:bg-blue-ex-light shadow-sm transition-colors"
                                            title="Link to a Final Project"
                                        >
                                            <LinkIcon className="h-3.5 w-3.5" /> Link Final Project
                                        </button>
                                    )}
                                </div>

                                {/* Linked Entities */}
                                <div className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {activeProject.linkedProjectId && (
                                            <div className="bg-white border border-grey-ex-light rounded-xl overflow-hidden shadow-sm">
                                                <div className="bg-grey-accent px-4 py-2 border-b border-grey-ex-light flex items-center justify-between">
                                                    <span className="text-xs font-bold text-grey-mid uppercase flex items-center gap-1.5">
                                                        <Star className="h-3.5 w-3.5" /> Final Project Link
                                                    </span>
                                                    <button onClick={handleUnlink} title="Unlink Project" className="text-grey-light hover:text-red-mid transition-colors">
                                                        <Unlink className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                                <div className="p-2 space-y-1">
                                                    <button 
                                                        onClick={() => navigate(`/projects?id=${activeProject.linkedProjectId}`)} 
                                                        className="w-full text-left p-2 hover:bg-blue-ex-light rounded-lg group transition-colors flex items-center justify-between"
                                                    >
                                                        <div className="truncate flex-1">
                                                            <div className="text-sm font-semibold text-grey-ex-dark group-hover:text-blue-dark truncate">
                                                                {activeProject.linkedProjectId}
                                                            </div>
                                                            <div className="text-[10px] text-grey-mid uppercase">Click to view details</div>
                                                        </div>
                                                        <ChevronRight className="h-4 w-4 text-grey-light group-hover:text-blue-light" />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                        <div className="bg-white border border-grey-ex-light rounded-xl overflow-hidden shadow-sm">
                                            <div className="bg-grey-accent px-4 py-2 border-b border-grey-ex-light flex items-center justify-between"><span className="text-xs font-bold text-grey-mid uppercase flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> Builders</span><span className="text-[10px] bg-grey-accent px-1.5 py-0.5 rounded text-grey-dark font-bold">{projectAssignments.length}</span></div>
                                            <div className="p-2 space-y-1">
                                                {projectAssignments.length === 0 ? <p className="text-xs text-grey-light p-2 italic text-center">No builders assigned.</p> : projectAssignments.map(asgn => (
                                                    <button key={asgn.builderId} onClick={() => navigate(`/builders?id=${asgn.builderId}`)} className="w-full text-left p-2 hover:bg-blue-ex-light rounded-lg group transition-colors flex items-center justify-between">
                                                        <div className="truncate flex-1"><div className="text-sm font-semibold text-grey-ex-dark group-hover:text-blue-dark truncate">{builders.find(b => b.id === asgn.builderId)?.companyName || 'Unknown'}</div><div className="text-[10px] text-grey-mid uppercase">{asgn.status}</div></div><ChevronRight className="h-4 w-4 text-grey-light group-hover:text-blue-light" />
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="bg-white border border-grey-ex-light rounded-xl overflow-hidden shadow-sm">
                                            <div className="bg-grey-accent px-4 py-2 border-b border-grey-ex-light flex items-center justify-between"><span className="text-xs font-bold text-grey-mid uppercase flex items-center gap-1.5"><Receipt className="h-3.5 w-3.5" /> Invoices</span><span className="text-[10px] bg-grey-accent px-1.5 py-0.5 rounded text-grey-dark font-bold">{relatedInvoices.length}</span></div>
                                            <div className="p-2 space-y-1">
                                                {relatedInvoices.length === 0 ? <p className="text-xs text-grey-light p-2 italic text-center">No invoices.</p> : relatedInvoices.map(inv => (
                                                    <button key={inv.id} onClick={() => navigate(`/invoices?id=${inv.id}`)} className="w-full text-left p-2 hover:bg-blue-ex-light rounded-lg group transition-colors flex items-center justify-between">
                                                        <div className="truncate flex-1"><div className="text-sm font-semibold text-grey-ex-dark group-hover:text-blue-dark">£{inv.commissionTotal.toFixed(2)}</div><div className="text-[10px] text-grey-mid uppercase">{inv.status}</div></div><ChevronRight className="h-4 w-4 text-grey-light group-hover:text-blue-light" />
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="bg-white border border-grey-ex-light rounded-xl overflow-hidden shadow-sm">
                                            <div className="bg-grey-accent px-4 py-2 border-b border-grey-ex-light flex items-center justify-between"><span className="text-xs font-bold text-grey-mid uppercase flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Contracts</span><span className="text-[10px] bg-grey-accent px-1.5 py-0.5 rounded text-grey-dark font-bold">{relatedContracts.length}</span></div>
                                            <div className="p-2 space-y-1">
                                                {relatedContracts.length === 0 ? <p className="text-xs text-grey-light p-2 italic text-center">No contracts.</p> : relatedContracts.map(con => (
                                                    <button key={con.id} onClick={() => navigate(`/contracts?id=${con.id}`)} className="w-full text-left p-2 hover:bg-blue-ex-light rounded-lg group transition-colors flex items-center justify-between">
                                                        <div className="truncate flex-1"><div className="text-sm font-semibold text-grey-ex-dark group-hover:text-blue-dark">{con.status === 'Signed' ? 'SIGNED' : 'PENDING'}</div><div className="text-[10px] text-grey-mid uppercase">{con.dateIssued ? new Date(con.dateIssued.toDate()).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Now'}</div></div><ChevronRight className="h-4 w-4 text-grey-light group-hover:text-blue-light" />
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Recent Correspondence Block */}
                                <div className="bg-white border border-grey-ex-light rounded-xl overflow-hidden shadow-sm">
                                    <div className="bg-grey-accent px-4 py-3 border-b border-grey-ex-light flex items-center justify-between">
                                        <span className="text-xs font-bold text-grey-mid uppercase flex items-center gap-2">
                                            <MessageSquare className="h-3.5 w-3.5" /> Recent Correspondence
                                        </span>
                                        <button 
                                            onClick={() => {
                                                const path = hasCorrespondence 
                                                    ? `/correspondence?type=homeowner&id=${activeProject.id}` 
                                                    : '/correspondence';
                                                navigate(path);
                                            }}
                                            className="text-[10px] font-bold text-blue-mid hover:text-blue-dark uppercase tracking-widest"
                                        >
                                            {hasCorrespondence ? 'View Full Timeline' : 'Go to Section'}
                                        </button>
                                    </div>
                                    <div className="p-4">
                                        {recentCorrespondence.length === 0 ? (
                                            <div className="py-4 text-center">
                                                <p className="text-xs text-grey-light italic">No correspondence logged yet.</p>
                                                <button 
                                                    onClick={() => navigate('/correspondence')}
                                                    className="mt-2 text-[10px] bg-grey-accent text-grey-dark px-3 py-1.5 rounded-lg hover:bg-grey-ex-light transition-colors font-bold uppercase tracking-widest"
                                                >
                                                    Log First Interaction
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="space-y-4">
                                                {recentCorrespondence.map(corr => (
                                                    <div key={corr.id} className="flex gap-3 items-start border-l-2 border-blue-mid/20 pl-4 py-1">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center justify-between mb-1">
                                                                <span className="text-xs font-bold text-grey-dark">{corr.category}</span>
                                                                <span className="text-[10px] text-grey-light">
                                                                    {corr.timestamp?.toDate ? corr.timestamp.toDate().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Just now'}
                                                                </span>
                                                            </div>
                                                            <p className="text-xs text-grey-mid line-clamp-2 leading-relaxed">
                                                                {corr.notes}
                                                            </p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8">
                                    <div>
                                        <label className="block text-sm font-medium text-grey-dark mb-2">Project Status</label>
                                        <select
                                            value={editStatus}
                                            onChange={(e) => setEditStatus(e.target.value)}
                                            className="block w-full rounded-md border-grey-light py-2.5 pl-3 pr-10 text-sm focus:border-blue-ex-dark focus:ring-blue-ex-dark border"
                                        >
                                            {STATUS_OPTIONS.map(status => (
                                                <option key={status} value={status}>{status}</option>
                                            ))}
                                        </select>
                                        {(editStatus === 'Letter Dropped' || editStatus === 'Letter Posted') && (
                                            <div className="mt-4 p-4 bg-pink-ex-light border border-pink-ex-light rounded-lg animate-in fade-in slide-in-from-top-2">
                                                <label className="block text-sm font-medium text-pink-ex-dark mb-2">
                                                    {editStatus === 'Letter Posted' ? 'Letter Version Posted' : 'Letter Version Dropped'}
                                                </label>
                                                <select
                                                    value={editLetterVersion}
                                                    onChange={(e) => setEditLetterVersion(e.target.value)}
                                                    className="block w-full rounded-md border-pink-ex-light py-2 pl-3 pr-10 text-sm focus:border-pink-mid focus:ring-pink-mid border bg-white"
                                                >
                                                    <option value="" disabled>Select a version...</option>
                                                    {letterOptions.map(opt => (
                                                        <option key={opt} value={opt}>{opt}</option>
                                                    ))}
                                                </select>
                                                <form onSubmit={handleAddLetterOption} className="mt-3 flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={newLetterOptionInput}
                                                        onChange={(e) => setNewLetterOptionInput(e.target.value)}
                                                        placeholder="Add new letter version..."
                                                        className="block w-full rounded-md border-pink-ex-light text-sm focus:border-pink-mid focus:ring-pink-mid border px-3 py-1.5 bg-white"
                                                    />
                                                    <button type="submit" disabled={!newLetterOptionInput.trim()} className="bg-pink-mid px-3 py-1.5 rounded-md text-xs font-semibold text-white hover:bg-pink-dark disabled:opacity-50 whitespace-nowrap shadow-sm">
                                                        Add
                                                    </button>
                                                </form>
                                            </div>
                                        )}
                                    </div>
                                    <div><label className="block text-sm font-medium text-grey-dark mb-2">Internal Notes</label><textarea rows={4} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="block w-full rounded-md border-grey-light shadow-sm focus:border-blue-ex-dark focus:ring-blue-ex-dark text-sm p-3 border" placeholder="Add notes..." /></div>
                                </div>

                                <div className="bg-blue-ex-light/30 p-6 rounded-xl border border-blue-ex-light">
                                    <h3 className="text-sm font-semibold text-blue-ex-dark flex items-center gap-2 mb-4">
                                        <Filter className="h-4 w-4 text-blue-mid" /> Collections & Tags
                                    </h3>
                                    
                                    <div className="space-y-4">
                                        <div className="flex flex-wrap gap-2">
                                            {activeProject.collections && activeProject.collections.map((col, i) => (
                                                <div key={i} className="flex items-center gap-1.5 bg-white text-blue-dark px-3 py-1.5 rounded-lg text-sm font-bold border border-blue-ex-light shadow-sm">
                                                    <Filter className="h-3 w-3" /> {col}
                                                    <button onClick={() => handleRemoveCollectionFromProject(col)} className="ml-1 text-grey-light hover:text-red-mid transition-colors p-0.5">
                                                        <X className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            ))}

                                            {activeProject.collectionId && (!activeProject.collections || !activeProject.collections.includes(activeProject.collectionId)) && (
                                                <div className="flex items-center gap-1.5 bg-white text-blue-dark px-3 py-1.5 rounded-lg text-sm font-bold border border-blue-ex-light shadow-sm">
                                                    <Filter className="h-3 w-3" /> {activeProject.collectionId}
                                                    <button onClick={() => handleRemoveCollectionFromProject(activeProject.collectionId)} className="ml-1 text-grey-light hover:text-red-mid transition-colors p-0.5">
                                                        <X className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            )}

                                            {(!activeProject.collections || activeProject.collections.length === 0) && !activeProject.collectionId && (
                                                <div className="text-sm text-grey-light italic py-1 items-center flex">No tags added yet.</div>
                                            )}
                                        </div>

                                        <form onSubmit={handleAddCollectionToProject} className="flex gap-3">
                                            <input 
                                                type="text" 
                                                placeholder="Add new collection tag..." 
                                                value={newProjectCollection}
                                                onChange={(e) => setNewProjectCollection(e.target.value)}
                                                className="block w-full rounded-md border-grey-light text-sm focus:border-blue-mid focus:ring-blue-mid border px-3 py-2 bg-white"
                                            />
                                            <button 
                                                type="submit"
                                                disabled={!newProjectCollection.trim()}
                                                className="bg-blue-mid px-6 py-2 rounded-md text-sm font-semibold text-black hover:bg-blue-dark disabled:opacity-50 whitespace-nowrap shadow-sm"
                                            >
                                                Add Tag
                                            </button>
                                        </form>
                                    </div>
                                </div>

                                <div className="bg-grey-accent p-6 rounded-xl border border-grey-ex-light">
                                    <h3 className="text-sm font-semibold text-grey-ex-dark flex items-center gap-2 mb-4">
                                        <Users className="h-4 w-4 text-grey-mid" /> Assign Builders
                                    </h3>
                                    <div className="space-y-4">
                                        <div className="flex gap-3">
                                            <select
                                                value={selectedBuilderToAssign}
                                                onChange={(e) => setSelectedBuilderToAssign(e.target.value)}
                                                className="block w-full rounded-md border-grey-light text-sm focus:border-blue-ex-dark focus:ring-blue-ex-dark border"
                                            >
                                                <option value="" disabled>Select builder to add...</option>
                                                {builders.map(b => (
                                                    <option key={b.id} value={b.id}>
                                                        {b.companyName} {!b.availability ? '(Unavailable)' : ''}
                                                    </option>
                                                ))}
                                            </select>
                                            <button
                                                onClick={assignLead}
                                                disabled={!selectedBuilderToAssign}
                                                className="bg-blue-ex-dark px-6 py-2 rounded-md text-sm font-semibold text-white hover:bg-black disabled:opacity-50 whitespace-nowrap"
                                            >
                                                Add to Project
                                            </button>
                                        </div>

                                        {projectAssignments.length > 0 && (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
                                                {projectAssignments.map(asgn => {
                                                    const builder = builders.find(b => b.id === asgn.builderId);
                                                    return (
                                                        <div key={asgn.id} className="flex flex-col bg-white p-3 rounded-lg border border-grey-ex-light shadow-sm gap-2">
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="h-8 w-8 rounded-full bg-blue-ex-light flex items-center justify-center text-blue-dark text-xs font-bold">
                                                                        {builder?.companyName?.charAt(0) || '?'}
                                                                    </div>
                                                                    <div className="text-sm font-medium text-grey-ex-dark truncate max-w-[120px]">
                                                                        {builder?.companyName || 'Unknown'}
                                                                    </div>
                                                                </div>
                                                                <div className="text-[10px] font-bold text-blue-ex-dark uppercase bg-blue-ex-light px-2 py-1 rounded">
                                                                    {asgn.status}
                                                                </div>
                                                            </div>
                                                            {builder && (
                                                                <div className="flex items-center justify-between pt-2 border-t border-grey-ex-light">
                                                                    <span className="text-[10px] font-bold text-grey-light uppercase tracking-wider">Availability</span>
                                                                    <button
                                                                        onClick={() => toggleBuilderAvailability(builder.id, builder.availability)}
                                                                        className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold border transition-colors ${builder.availability ? 'bg-green-ex-light border-green-ex-light text-green-dark hover:bg-green-ex-light' : 'bg-grey-accent border-grey-ex-light text-grey-mid hover:bg-grey-ex-light'}`}
                                                                    >
                                                                        <Activity className={`h-3 w-3 ${builder.availability ? 'text-green-mid' : 'text-grey-light'}`} />
                                                                        {builder.availability ? 'Available' : 'Unavailable'}
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="flex shrink-0 justify-end px-6 py-4 bg-grey-accent border-t border-grey-ex-light gap-3"><button onClick={closeProject} className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-grey-ex-dark border border-grey-light hover:bg-grey-ex-light">Cancel</button><button onClick={saveProjectDetails} className="rounded-md bg-blue-ex-dark px-4 py-2 text-sm font-semibold text-white hover:bg-black flex items-center gap-2"><Save className="h-4 w-4" />Save Changes</button></div>
                    </>
                )}
            </div>

            {showSyncModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="fixed inset-0 bg-grey-ex-dark/40 backdrop-blur-sm" onClick={() => setShowSyncModal(false)}></div>
                    <div className="bg-white rounded-xl shadow-2xl relative w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="bg-grey-accent px-6 py-4 border-b border-grey-ex-light flex justify-between items-center"><h3 className="text-lg font-bold">Select Sync Week</h3><button onClick={() => setShowSyncModal(false)}><X className="h-5 w-5" /></button></div>
                        <div className="p-6"><select value={selectedSyncDate} onChange={(e) => setSelectedSyncDate(e.target.value)} className="w-full border rounded-lg p-3 text-sm focus:border-blue-ex-dark focus:ring-blue-ex-dark outline-none" size="8"><option value="current">Current Week</option>{syncDates.map(date => <option key={date} value={date}>{date}</option>)}</select></div>
                        <div className="bg-grey-accent p-4 border-t border-grey-ex-light flex justify-end gap-3"><button onClick={() => setShowSyncModal(false)} className="px-4 py-2 text-sm font-semibold border rounded-lg">Cancel</button><button onClick={triggerSync} className="bg-blue-ex-dark text-white px-6 py-2 rounded-lg text-sm font-bold">Start Scraper</button></div>
                    </div>
                </div>
            )}

            {/* Slide-in Workspace Overlay */}
            {(searchParams.get('workspace') === 'true' || isWorkspaceClosing) && (
                <div 
                    className={`absolute inset-0 z-[100] transition-all duration-500 ease-[cubic-bezier(0.2,0,0,1)] ${(isWorkspaceOpen && !isWorkspaceClosing) ? 'translate-x-0' : 'translate-x-full'}`}
                >
                    <div className="h-full w-full bg-white shadow-2xl overflow-hidden">
                        <PackWorkspace id={searchParams.get('id')} type="preapproved" onClose={closeWorkspace} />
                    </div>
                </div>
            )}

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

export default PreApproved;
