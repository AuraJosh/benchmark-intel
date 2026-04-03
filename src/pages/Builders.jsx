import { Search, Plus, Loader2, Network, UserPlus, Phone, Mail, Building, Activity, X, Receipt, FileText, ChevronRight, Calculator, Calendar, User, MessageSquare, Archive, Trash2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, getDocs, where } from 'firebase/firestore';
import UniversalTimeline from '../components/UniversalTimeline';
import ConfirmationModal from '../components/ConfirmationModal';

const Builders = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [builders, setBuilders] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [isClosingAdd, setIsClosingAdd] = useState(false);
    const [selectedBuilder, setSelectedBuilder] = useState(null);
    const [closingBuilder, setClosingBuilder] = useState(null);
    const [assignedProjects, setAssignedProjects] = useState([]);
    const [relatedInvoices, setRelatedInvoices] = useState([]);
    const [relatedContracts, setRelatedContracts] = useState([]);
    const [loadingRelated, setLoadingRelated] = useState(false);
    const [hasCorrespondence, setHasCorrespondence] = useState(false);
    const [recentCorrespondence, setRecentCorrespondence] = useState([]);
    const [showArchive, setShowArchive] = useState(() => localStorage.getItem('benchmark_builders_showArchive') === 'true');
    const [isDeleting, setIsDeleting] = useState(false);
    const [confirmation, setConfirmation] = useState({ isOpen: false, type: 'warning' });

    // Derived state for animations
    const activeBuilder = selectedBuilder || closingBuilder;
    const showAddForm = isAdding || isClosingAdd;

    // New builder form state
    const [newBuilder, setNewBuilder] = useState({
        companyId: '',
        companyName: '',
        companyAddress: '',
        ownerName: '',
        phone: '',
        email: '',
        availability: true,
    });

    useEffect(() => {
        const q = query(collection(db, 'builders'), orderBy('companyName', 'asc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const builderData = snapshot.docs.map(doc => ({
                ...doc.data(),
                id: doc.id
            }));
            setBuilders(builderData);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // Persist showArchive state
    useEffect(() => {
        localStorage.setItem('benchmark_builders_showArchive', showArchive);
    }, [showArchive]);

    // Sync state with URL params
    useEffect(() => {
        const id = searchParams.get('id');
        if (id && builders.length > 0) {
            const builder = builders.find(b => b.id === id);
            if (builder) {
                setClosingBuilder(null);
                setSelectedBuilder(builder);
                fetchRelatedData(id);
            }
        } else {
            if (selectedBuilder) {
                setClosingBuilder(selectedBuilder);
                setSelectedBuilder(null);
                setTimeout(() => setClosingBuilder(null), 500);
            }
        }
    }, [searchParams, builders]);

    const fetchRelatedData = async (builderId) => {
        setLoadingRelated(true);
        try {
            // Fetch Assignments
            const asgnQ = query(collection(db, 'assignments'), where('builderId', '==', builderId));
            const asgnSnapshot = await getDocs(asgnQ);
            const assignmentData = asgnSnapshot.docs.map(doc => doc.data());

            // Fetch actual projects for these assignments
            const projects = [];
            for (const assignment of assignmentData) {
                const projectDoc = await getDocs(query(collection(db, 'projects'), where('__name__', '==', assignment.projectId)));
                if (!projectDoc.empty) {
                    projects.push({ ...projectDoc.docs[0].data(), id: projectDoc.docs[0].id, assignmentStatus: assignment.status });
                }
            }
            setAssignedProjects(projects);

            // Fetch Invoices
            const invQ = query(collection(db, 'invoices'), where('builderId', '==', builderId));
            const invSnapshot = await getDocs(invQ);
            setRelatedInvoices(invSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

            // Fetch Contracts (agreements)
            const conQ = query(collection(db, 'agreements'), where('builderId', '==', builderId));
            const conSnapshot = await getDocs(conQ);
            setRelatedContracts(conSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (error) {
            console.error("Error fetching related data for builder:", error);
        } finally {
            setLoadingRelated(false);
        }
    };

    // Check for correspondence
    useEffect(() => {
        if (!selectedBuilder?.id) return;
        const q = query(collection(db, 'correspondence'), where('builderId', '==', selectedBuilder.id), orderBy('timestamp', 'desc'));
        const unsubscribe = onSnapshot(q, (snap) => {
            const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setHasCorrespondence(docs.length > 0);
            setRecentCorrespondence(docs.slice(0, 3));
        });
        return () => unsubscribe();
    }, [selectedBuilder?.id]);

    const handleAddBuilder = async (e) => {
        e.preventDefault();
        try {
            await addDoc(collection(db, 'builders'), {
                ...newBuilder,
                createdAt: serverTimestamp()
            });
            setIsAdding(false);
            setNewBuilder({ companyId: '', companyName: '', companyAddress: '', ownerName: '', phone: '', email: '', availability: true });
        } catch (error) {
            console.error("Error adding builder:", error);
            alert("Failed to add builder");
        }
    };

    const toggleAvailability = async (builderId, currentAvailability) => {
        try {
            const builderRef = doc(db, 'builders', builderId);
            await updateDoc(builderRef, {
                availability: !currentAvailability
            });
        } catch (error) {
            console.error("Error updating availability:", error);
        }
    };

    const archiveBuilder = async (builderId, isArchived) => {
        setConfirmation({
            isOpen: true,
            title: isArchived ? 'Unarchive Builder' : 'Archive Builder',
            message: isArchived ? 'Restore this builder to the active list?' : 'Move this builder to the archive? You can still find them in the archive section.',
            confirmText: isArchived ? 'Unarchive' : 'Archive',
            type: isArchived ? 'success' : 'archive',
            onConfirm: async () => {
                try {
                    const builderRef = doc(db, 'builders', builderId);
                    await updateDoc(builderRef, { status: isArchived ? 'Active' : 'Archive' });
                    setConfirmation({ ...confirmation, isOpen: false });
                    closeBuilder();
                } catch (error) {
                    console.error("Error archiving builder:", error);
                    alert("Failed to archive builder");
                }
            }
        });
    };

    const deleteBuilder = async (builderId) => {
        setConfirmation({
            isOpen: true,
            title: 'Delete Builder',
            message: 'Are you sure you want to PERMANENTLY delete this builder? This cannot be undone.',
            confirmText: 'Delete Builder',
            type: 'danger',
            onConfirm: async () => {
                setIsDeleting(true);
                try {
                    const { deleteDoc } = await import('firebase/firestore');
                    await deleteDoc(doc(db, 'builders', builderId));
                    setConfirmation({ ...confirmation, isOpen: false });
                    closeBuilder();
                } catch (error) {
                    console.error("Error deleting builder:", error);
                    alert("Failed to delete builder");
                } finally {
                    setIsDeleting(false);
                }
            }
        });
    };

    const openAddBuilder = () => {
        setIsClosingAdd(false);
        setIsAdding(true);
    };

    const closeAddBuilder = () => {
        setIsClosingAdd(true);
        setIsAdding(false);
        setTimeout(() => setIsClosingAdd(false), 500);
    };



    const openBuilder = (builder) => {
        setSearchParams({ id: builder.id });
    };

    const closeBuilder = () => {
        const backTo = searchParams.get('backTo');
        if (backTo) {
            navigate(backTo);
        } else {
            setSearchParams({});
        }
    };

    const filteredBuilders = builders.filter(b => {
        const matchesSearch = b.companyName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            b.ownerName?.toLowerCase().includes(searchQuery.toLowerCase());
        
        const isArchived = b.status === 'Archive';
        const matchesArchive = showArchive ? isArchived : !isArchived;

        return matchesSearch && matchesArchive;
    });

    return (
        <div className="w-full relative flex flex-col h-full overflow-hidden">
            <header className="mb-3 md:mb-8 flex flex-row items-center justify-between gap-2 md:gap-4 shrink-0">
                <div className="min-w-0">
                    <h1 className="text-xl md:text-3xl font-semibold tracking-tight text-[#0f172a] truncate">Builders</h1>
                    <p className="mt-0.5 text-xs md:text-sm text-gray-500 hidden md:block">Manage your network of trusted tradespeople.</p>
                </div>
                <div className="flex items-center gap-1.5 md:gap-3 shrink-0">
                    <button onClick={() => setShowArchive(!showArchive)} title={showArchive ? 'Showing Archive' : 'View Archive'} className={`flex items-center gap-1 rounded-lg px-2 py-2 md:px-4 md:py-2.5 text-xs md:text-sm font-medium transition-all border ${showArchive ? 'bg-amber-50 border-amber-200 text-amber-700 shadow-inner' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 shadow-sm'}`}>
                        <Archive className={`h-3.5 w-3.5 md:h-4 md:w-4 ${showArchive ? 'text-amber-500' : 'text-gray-400'}`} />
                        <span className="hidden md:inline">{showArchive ? 'Showing Archive' : 'View Archive'}</span>
                    </button>
                    <button onClick={openAddBuilder} title="Add Builder" className="flex items-center gap-1 rounded-lg bg-[#0f172a] px-2 py-2 md:px-4 md:py-2.5 text-xs md:text-sm font-medium text-white shadow-sm transition-colors hover:bg-black">
                        <UserPlus className="h-3.5 w-3.5 md:h-4 md:w-4" />
                        <span className="hidden md:inline">Add Builder</span>
                    </button>
                </div>
            </header>

            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col min-h-0 flex-1">
                <div className="flex items-center gap-4 border-b border-gray-100 p-4 shrink-0">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search builders..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm focus:border-[#0f172a] focus:outline-none focus:ring-1 focus:ring-[#0f172a]"
                        />
                    </div>
                </div>

                <div className="overflow-auto flex-1 relative mini-scroll">
                    <table className="w-full text-left text-sm text-gray-600">
                        <thead className="bg-gray-50 text-xs uppercase text-gray-500 sticky top-0 z-10 shadow-sm border-b border-gray-200">
                            <tr>
                                <th className="px-4 py-4 font-medium hidden sm:table-cell">Company ID</th>
                                <th className="px-4 py-4 font-medium">Name & Owner</th>
                                <th className="px-4 py-4 font-medium hidden md:table-cell">Contact</th>
                                <th className="px-4 py-4 font-medium">Availability</th>
                                <th className="px-4 py-4 font-medium text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                            {loading ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-8 text-center text-sm text-gray-500">
                                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-gray-400" />
                                        Loading builders...
                                    </td>
                                </tr>
                            ) : filteredBuilders.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-8 text-center text-sm text-gray-500">
                                        No builders found.
                                    </td>
                                </tr>
                            ) : (
                                filteredBuilders.map((builder) => (
                                    <tr key={builder.id} onClick={() => openBuilder(builder)} className="hover:bg-gray-50/50 cursor-pointer transition-colors group">
                                        <td className="px-4 py-4 font-mono text-xs font-semibold text-[#0f172a] hidden sm:table-cell">
                                            {builder.companyId}
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="font-medium text-[#0f172a]">{builder.companyName}</div>
                                            <div className="text-gray-500 flex items-center gap-1 mt-0.5"><User className="h-3 w-3" /> {builder.ownerName}</div>
                                        </td>
                                        <td className="px-4 py-4 hidden md:table-cell">
                                            <div className="flex items-center gap-2 text-gray-600 mb-1">
                                                <Phone className="h-3 w-3" /> {builder.phone}
                                            </div>
                                            <div className="flex items-center gap-2 text-gray-600">
                                                <Mail className="h-3 w-3" /> {builder.email}
                                            </div>
                                        </td>
                                        <td className="px-4 py-4">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); toggleAvailability(builder.id, builder.availability); }}
                                                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium border ${builder.availability ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100' : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
                                            >
                                                {builder.availability ? 'Available' : 'Unavailable'}
                                            </button>
                                        </td>
                                        <td className="px-4 py-4 text-right">
                                            <button onClick={(e) => { e.stopPropagation(); openBuilder(builder); }} className="text-[#0284c7] hover:text-[#0369a1] font-semibold text-sm">
                                                View
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Slide-over for Builder Details */}
            <div className={`absolute inset-0 z-[60] bg-white flex flex-col transform transition-transform duration-500 ease-out shadow-2xl ${selectedBuilder ? 'translate-x-0' : 'translate-x-full'}`}>
                {activeBuilder && (
                    <>
                        <div className="px-4 py-4 sm:px-6 sm:py-4 border-b border-gray-100 flex flex-col bg-gray-50 shrink-0 gap-4">
                            <div className="flex justify-between items-center w-full">
                                <div>
                                    <h3 className="text-lg sm:text-xl font-semibold text-[#0f172a]">{activeBuilder.companyName}</h3>
                                    <p className="text-xs sm:text-sm text-gray-500">Builder Profile & Relational View</p>
                                </div>
                                <button onClick={closeBuilder} className="text-gray-400 hover:text-gray-600 focus:outline-none p-2 rounded-full hover:bg-gray-200 transition-colors shrink-0">
                                    <X className="h-6 w-6" />
                                </button>
                            </div>
                            
                            <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto mini-scroll pb-1 sm:pb-0">
                                <button
                                    onClick={() => {
                                        const path = hasCorrespondence
                                            ? `/correspondence?type=builder&id=${activeBuilder.id}`
                                            : '/correspondence';
                                        navigate(path);
                                    }}
                                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-[#0f172a] text-white rounded-lg hover:bg-black shadow-sm transition-all shrink-0"
                                >
                                    <MessageSquare className="h-4 w-4 text-blue-400" />
                                    <span>Correspondence</span>
                                </button>
                                <button
                                    onClick={() => archiveBuilder(activeBuilder.id, activeBuilder.status === 'Archive')}
                                    title={activeBuilder.status === 'Archive' ? "Unarchive Builder" : "Archive Builder"}
                                    className={`p-2 rounded-lg transition-colors border shrink-0 ${activeBuilder.status === 'Archive' ? 'text-green-600 bg-green-50 border-green-100 hover:bg-green-100' : 'text-gray-400 bg-white border-gray-200 hover:text-amber-600 hover:bg-amber-50 hover:border-amber-100'}`}
                                >
                                    {activeBuilder.status === 'Archive' ? <Activity className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                                </button>
                                <button
                                    onClick={() => deleteBuilder(activeBuilder.id)}
                                    disabled={isDeleting}
                                    title="Delete Builder"
                                    className="p-2 text-gray-400 bg-white border border-gray-200 hover:text-red-600 hover:bg-red-50 hover:border-red-100 rounded-lg transition-colors shrink-0 disabled:opacity-50"
                                >
                                    {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto px-6 py-8 mini-scroll">
                            <div className="max-w-4xl mx-auto space-y-10 pb-12">
                                <section>
                                    <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6">Contact Information</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex items-start gap-4">
                                            <div className="h-10 w-10 rounded-full bg-white flex items-center justify-center border border-gray-200 text-blue-600 shadow-sm"><User className="h-5 w-5" /></div>
                                            <div><p className="text-xs font-medium text-gray-500">Contact Person</p><p className="text-sm font-bold text-gray-900">{activeBuilder.ownerName}</p></div>
                                        </div>
                                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex items-start gap-4">
                                            <div className="h-10 w-10 rounded-full bg-white flex items-center justify-center border border-gray-200 text-green-600 shadow-sm"><Phone className="h-5 w-5" /></div>
                                            <div><p className="text-xs font-medium text-gray-500">Phone</p><a href={`tel:${activeBuilder.phone}`} className="text-sm font-bold text-gray-900 hover:text-blue-600">{activeBuilder.phone}</a></div>
                                        </div>
                                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex items-start gap-4">
                                            <div className="h-10 w-10 rounded-full bg-white flex items-center justify-center border border-gray-200 text-purple-600 shadow-sm"><Mail className="h-5 w-5" /></div>
                                            <div><p className="text-xs font-medium text-gray-500">Email</p><a href={`mailto:${activeBuilder.email}`} className="text-sm font-bold text-gray-900 hover:text-blue-600 break-all">{activeBuilder.email}</a></div>
                                        </div>
                                    </div>
                                </section>



                                <section className="space-y-6 pt-6 border-t border-gray-100">
                                    <h4 className="text-lg font-extrabold text-[#0f172a] flex items-center gap-2 mb-6">
                                        <Network className="h-5 w-5 text-blue-500" />
                                        Business Activity & Relationships
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        {/* Projects */}
                                        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                                            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between"><span className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2"><Network className="h-3.5 w-3.5" /> Assigned Projects</span><span className="text-xs bg-gray-200 px-2 py-0.5 rounded-full font-bold">{assignedProjects.length}</span></div>
                                            <div className="p-2 space-y-1">
                                                {assignedProjects.length === 0 ? <p className="text-xs text-gray-400 p-4 text-center italic">No projects assigned.</p> : assignedProjects.map(proj => (
                                                    <button key={proj.id} onClick={() => navigate(`/projects?id=${proj.id}&backTo=${encodeURIComponent(`/builders?id=${activeBuilder.id}`)}`)} className="w-full text-left p-2.5 hover:bg-blue-50 rounded-lg group transition-colors flex items-center justify-between">
                                                        <div className="truncate flex-1"><p className="text-sm font-bold text-gray-900 group-hover:text-blue-700 truncate">{proj.address}</p><p className="text-[10px] text-gray-500 uppercase">{proj.assignmentStatus}</p></div>
                                                        <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-400" />
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Invoices */}
                                        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                                            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between"><span className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2"><Receipt className="h-3.5 w-3.5" /> Recent Invoices</span><span className="text-xs bg-gray-200 px-2 py-0.5 rounded-full font-bold">{relatedInvoices.length}</span></div>
                                            <div className="p-2 space-y-1">
                                                {relatedInvoices.length === 0 ? <p className="text-xs text-gray-400 p-4 text-center italic">No invoices issued.</p> : relatedInvoices.map(inv => (
                                                    <button key={inv.id} onClick={() => navigate(`/invoices?id=${inv.id}&backTo=${encodeURIComponent(`/builders?id=${activeBuilder.id}`)}`)} className="w-full text-left p-2.5 hover:bg-blue-50 rounded-lg group transition-colors flex items-center justify-between">
                                                        <div className="truncate flex-1"><p className="text-sm font-bold text-gray-900 group-hover:text-blue-700">£{inv.commissionTotal.toFixed(2)}</p><p className="text-[10px] text-gray-500 uppercase">{inv.status}</p></div>
                                                        <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-400" />
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Contracts */}
                                        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                                            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between"><span className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2"><FileText className="h-3.5 w-3.5" /> Recent Contracts</span><span className="text-xs bg-gray-200 px-2 py-0.5 rounded-full font-bold">{relatedContracts.length}</span></div>
                                            <div className="p-2 space-y-1">
                                                {relatedContracts.length === 0 ? <p className="text-xs text-gray-400 p-4 text-center italic">No contracts issued.</p> : relatedContracts.map(con => (
                                                    <button key={con.id} onClick={() => navigate(`/contracts?id=${con.id}&backTo=${encodeURIComponent(`/builders?id=${activeBuilder.id}`)}`)} className="w-full text-left p-2.5 hover:bg-blue-50 rounded-lg group transition-colors flex items-center justify-between">
                                                        <div className="truncate flex-1"><p className="text-sm font-bold text-gray-900 group-hover:text-blue-700">{con.status === 'Signed' ? 'SIGNED' : 'PENDING'}</p><p className="text-[10px] text-gray-500 uppercase">{con.dateIssued ? new Date(con.dateIssued.toDate()).toLocaleDateString() : 'N/A'}</p></div>
                                                        <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-400" />
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Recent Correspondence Block */}
                                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                                        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                                            <span className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2">
                                                <MessageSquare className="h-4 w-4" /> Recent Correspondence
                                            </span>
                                            <button 
                                                onClick={() => {
                                                    const path = hasCorrespondence 
                                                        ? `/correspondence?type=builder&id=${activeBuilder.id}` 
                                                        : '/correspondence';
                                                    navigate(path);
                                                }}
                                                className="text-[10px] font-bold text-blue-600 hover:text-blue-800 uppercase tracking-widest"
                                            >
                                                {hasCorrespondence ? 'View Full Timeline' : 'Go to Section'}
                                            </button>
                                        </div>
                                        <div className="p-4">
                                            {recentCorrespondence.length === 0 ? (
                                                <div className="py-4 text-center">
                                                    <p className="text-xs text-gray-400 italic">No correspondence logged yet.</p>
                                                    <button 
                                                        onClick={() => navigate('/correspondence')}
                                                        className="mt-2 text-[10px] bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-200 transition-colors font-bold uppercase tracking-widest"
                                                    >
                                                        Log First Interaction
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="space-y-4">
                                                    {recentCorrespondence.map(corr => (
                                                        <div key={corr.id} className="flex gap-3 items-start border-l-2 border-blue-500/20 pl-4 py-1">
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center justify-between mb-1">
                                                                    <span className="text-xs font-bold text-gray-800">{corr.category}</span>
                                                                    <span className="text-[10px] text-gray-400">
                                                                        {corr.timestamp?.toDate ? corr.timestamp.toDate().toLocaleDateString() : 'Just now'}
                                                                    </span>
                                                                </div>
                                                                <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed">
                                                                    {corr.notes}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </section>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Slide-over for Add Builder */}
            <div className={`absolute inset-0 z-[60] bg-white flex flex-col transform transition-transform duration-500 ease-out shadow-2xl ${isAdding ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
                    <h3 className="text-xl font-semibold text-[#0f172a]">Add New Builder</h3>
                    <button onClick={closeAddBuilder} className="text-gray-400 hover:text-gray-600 focus:outline-none p-2 rounded-full hover:bg-gray-200 transition-colors">
                        <X className="h-6 w-6" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-8">
                    <form onSubmit={handleAddBuilder} className="max-w-2xl mx-auto space-y-8 pb-12">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div><label className="block text-sm font-bold text-gray-700 mb-2">Company ID (CRO/UTR)</label><input type="text" required value={newBuilder.companyId} onChange={(e) => setNewBuilder({ ...newBuilder, companyId: e.target.value })} className="w-full rounded-lg border border-gray-300 py-3 px-4 text-sm focus:border-[#0f172a] focus:ring-[#0f172a]" placeholder="e.g. 12345678" /></div>
                            <div><label className="block text-sm font-bold text-gray-700 mb-2">Company Name</label><input type="text" required value={newBuilder.companyName} onChange={(e) => setNewBuilder({ ...newBuilder, companyName: e.target.value })} className="w-full rounded-lg border border-gray-300 py-3 px-4 text-sm focus:border-[#0f172a] focus:ring-[#0f172a]" placeholder="e.g. Acme Construction Ltd" /></div>
                            <div className="md:col-span-2"><label className="block text-sm font-bold text-gray-700 mb-2">Company Address</label><textarea required value={newBuilder.companyAddress} onChange={(e) => setNewBuilder({ ...newBuilder, companyAddress: e.target.value })} className="w-full rounded-lg border border-gray-300 py-3 px-4 text-sm focus:border-[#0f172a] focus:ring-[#0f172a]" placeholder="e.g. 123 High St, London, SW1A 1AA" rows={2} /></div>
                            <div><label className="block text-sm font-bold text-gray-700 mb-2">Contact Person Name</label><input type="text" required value={newBuilder.ownerName} onChange={(e) => setNewBuilder({ ...newBuilder, ownerName: e.target.value })} className="w-full rounded-lg border border-gray-300 py-3 px-4 text-sm focus:border-[#0f172a] focus:ring-[#0f172a]" placeholder="e.g. John Doe" /></div>
                            <div><label className="block text-sm font-bold text-gray-700 mb-2">Phone Number</label><input type="tel" required value={newBuilder.phone} onChange={(e) => setNewBuilder({ ...newBuilder, phone: e.target.value })} className="w-full rounded-lg border border-gray-300 py-3 px-4 text-sm focus:border-[#0f172a] focus:ring-[#0f172a]" placeholder="e.g. +44 20 1234 5678" /></div>
                            <div className="md:col-span-2"><label className="block text-sm font-bold text-gray-700 mb-2">Email Address</label><input type="email" required value={newBuilder.email} onChange={(e) => setNewBuilder({ ...newBuilder, email: e.target.value })} className="w-full rounded-lg border border-gray-300 py-3 px-4 text-sm focus:border-[#0f172a] focus:ring-[#0f172a]" placeholder="e.g. billing@acme.com" /></div>
                        </div>
                        <div className="bg-gray-50 p-6 rounded-xl border border-gray-100 flex items-center justify-between"><div><h4 className="text-sm font-bold text-gray-900">Current Availability</h4><p className="text-xs text-gray-500">Is this builder currently looking for new projects?</p></div><button type="button" onClick={() => setNewBuilder({ ...newBuilder, availability: !newBuilder.availability })} className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${newBuilder.availability ? 'bg-green-600' : 'bg-gray-200'}`}><span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${newBuilder.availability ? 'translate-x-5' : 'translate-x-0'}`} /></button></div>
                        <div className="pt-6 border-t border-gray-100 flex justify-end gap-3"><button type="button" onClick={closeAddBuilder} className="px-6 py-2.5 text-sm font-semibold border rounded-lg hover:bg-gray-50">Cancel</button><button type="submit" className="bg-[#0f172a] text-white px-10 py-2.5 rounded-lg text-sm font-bold hover:bg-black">Add Builder</button></div>
                    </form>
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
                loading={isDeleting}
            />
        </div>
    );
};

export default Builders;
