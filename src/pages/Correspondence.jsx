import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useRecording } from '../context/RecordingContext';
import { db } from '../firebase';
import {
    collection, query, where, orderBy, onSnapshot,
    addDoc, serverTimestamp, doc, updateDoc, deleteDoc,
} from 'firebase/firestore';
import {
    Search, Phone, Mail, MessageSquare, X, Plus,
    ExternalLink, ChevronRight, Home, Building2, Clock,
    StickyNote, Send, Footprints, AlarmClockCheck, Loader2,
    Pencil, Trash2, Mic, Play, Volume2,
} from 'lucide-react';

/* ─── theme tokens ──────────────────────────────────────────────────────────── */
const THEME = {
    homeowner: { bg: '#142E4F', light: '#EAF0F7', mid: '#B8CEDF' },
    builder:   { bg: '#1E406E', light: '#E8EEF8', mid: '#A8BFDA' },
};

/* ─── interaction types ─────────────────────────────────────────────────────── */
const CAT_META = {
    Call:     { icon: Phone,         bg: '#DBEAFE', fg: '#1D4ED8' },
    Email:    { icon: Mail,          bg: '#EDE9FE', fg: '#7C3AED' },
    Message:  { icon: MessageSquare, bg: '#D1FAE5', fg: '#065F46' },
    Visit:    { icon: Footprints,    bg: '#FEF3C7', fg: '#92400E' },
    Note:     { icon: StickyNote,    bg: '#FFEDD5', fg: '#D97706' },
    Contract: { icon: FileText,      bg: '#D1FAE5', fg: '#059669' },
    Other:    { icon: StickyNote,    bg: '#F3F4F6', fg: '#374151' },
};
const CATS = ['Call', 'Email', 'Message', 'Visit', 'Note', 'Contract', 'Other'];

/* ─── helpers ───────────────────────────────────────────────────────────────── */
const getDt = (ts) => {
    if (!ts) return new Date(0);
    if (ts.toDate) return ts.toDate();
    if (ts instanceof Date) return ts;
    const d = new Date(ts);
    return isNaN(d.getTime()) ? new Date(0) : d;
};

const fmt = (ts, opts) => {
    const d = getDt(ts);
    if (!opts) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
    }
    return d.toLocaleDateString('en-GB', opts);
};

/* ══════════════════════════════════════════════════════════════════════════════
   LOG MODAL
   ══════════════════════════════════════════════════════════════════════════════ */
const LogSlideover = ({ isOpen, onClose, onSave, mode, theme, initialData = null }) => {
    const [cat, setCat]       = useState('Call');
    const [direction, setDirection] = useState('Outbound');
    const [notes, setNotes]   = useState('');
    const [subj, setSubj]     = useState('');
    const [fu, setFu]         = useState('');
    const [logDate, setLogDate] = useState('');
    const [staff, setStaff]     = useState('JW');
    const [busy, setBusy]       = useState(false);
    const isEditing = !!initialData;

    useEffect(() => {
        if (isOpen) {
            setCat(initialData?.category || 'Call');
            setDirection(initialData?.direction || 'Outbound');
            setNotes(initialData?.notes || '');
            setSubj(initialData?.subject || '');
            setFu(initialData?.followUp || '');
            setStaff(initialData?.staff || 'JW');
            if (initialData?.timestamp) {
                const d = getDt(initialData.timestamp);
                setLogDate(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
            } else {
                const now = new Date();
                setLogDate(now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0'));
            }
        }
    }, [isOpen, initialData]);

    const submit = async (e) => {
        e.preventDefault();
        if (!notes.trim()) return;
        setBusy(true);
        await onSave({ category: cat, notes, subject: subj, followUp: fu, date: logDate, direction, staff });
        setBusy(false);
        onClose();
    };

    return (
        <div className={`fixed inset-0 z-[300] flex justify-end transition-opacity duration-500 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            {/* Backdrop */}
            <div 
                className={`absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity duration-500 ${isOpen ? 'opacity-100' : 'opacity-0'}`} 
                onClick={onClose} 
            />
            
            {/* Slide-over Content */}
            <div className={`relative bg-white w-full max-w-lg h-full shadow-2xl flex flex-col transform transition-transform duration-500 ease-[cubic-bezier(0.2,0,0,1)] ${isOpen ? 'translate-x-0' : 'translate-x-full'} ${busy ? 'cursor-wait' : ''}`}>
                <div className="px-8 pt-8 pb-6 bg-white border-b border-gray-100 shrink-0">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest leading-none">
                                {isEditing ? 'Reference: ' + (initialData?.id?.slice(0,8) || '...') : 'New Activity'}
                            </p>
                            <h3 className="text-[#0f172a] text-3xl font-extrabold mt-2 tracking-tight">
                                {isEditing ? 'Edit Interaction' : 'Log Interaction'}
                            </h3>
                        </div>
                        <button onClick={onClose}
                            className="h-10 w-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all">
                            <X className="h-6 w-6" />
                        </button>
                    </div>

                    <div className="flex gap-2 flex-wrap">
                        {CATS.map(c => {
                            const m = CAT_META[c];
                            const Icon = m.icon;
                            const active = cat === c;
                            return (
                                <button key={c} type="button" onClick={() => setCat(c)}
                                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all duration-200"
                                    style={active
                                        ? { background: theme.bg, color: 'white', boxShadow: `0 8px 20px ${theme.bg}33` }
                                        : { background: 'white', color: '#64748b', border: '1px solid #f1f5f9' }
                                    }>
                                    <Icon className="h-4 w-4" />{c}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <form onSubmit={submit} className="flex-1 overflow-y-auto p-8 space-y-8 mini-scroll">
                    <div className="flex gap-2">
                        <button type="button" onClick={() => setDirection('Outbound')} className={`flex-1 py-3 text-xs font-bold rounded-xl transition-all border ${direction === 'Outbound' ? 'bg-[#0f172a] text-white border-[#0f172a] shadow-md' : 'bg-gray-50 text-gray-400 border-gray-100 hover:bg-gray-100 hover:text-gray-600'}`}>We contacted {mode === 'homeowner' ? 'Homeowner' : 'Builder'}</button>
                        <button type="button" onClick={() => setDirection('Inbound')} className={`flex-1 py-3 text-xs font-bold rounded-xl transition-all border ${direction === 'Inbound' ? 'bg-[#0f172a] text-white border-[#0f172a] shadow-md' : 'bg-gray-50 text-gray-400 border-gray-100 hover:bg-gray-100 hover:text-gray-600'}`}>They contacted us</button>
                    </div>

                    <div className="flex bg-gray-50 p-1 rounded-xl">
                        {['JW', 'JD', 'JW & JD'].map(val => (
                            <button key={val} type="button" onClick={() => setStaff(val)}
                                className={`flex-1 py-2.5 text-xs font-black rounded-lg transition-all ${staff === val ? 'bg-[#0f172a] text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
                                {val}
                            </button>
                        ))}
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 ml-1">Subject / Description</label>
                        <input type="text" value={subj} onChange={e => setSubj(e.target.value)}
                            placeholder="e.g. Followed up on planning status..."
                            className="w-full rounded-2xl border border-gray-100 py-4 px-6 text-sm font-semibold text-[#0f172a] outline-none transition-all bg-gray-50 focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-200"
                        />
                    </div>

                    <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 ml-1">Detailed Interaction Notes *</label>
                        <textarea rows={6} required value={notes} onChange={e => setNotes(e.target.value)}
                            placeholder="What was discussed or decided?"
                            className="w-full rounded-2xl border border-gray-100 py-4 px-6 text-sm font-medium text-[#0f172a] outline-none resize-none transition-all bg-gray-50 focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-200"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 ml-1">Date of Interaction</label>
                            <input type={logDate ? "date" : "text"} onFocus={(e) => (e.target.type = "date")} onBlur={(e) => (!e.target.value ? (e.target.type = "text") : null)} value={logDate} onChange={e => setLogDate(e.target.value)}
                                placeholder="-- ---- ----"
                                className="w-full rounded-xl border border-gray-100 py-3.5 px-4 text-sm font-bold text-[#0f172a] bg-gray-50 outline-none focus:bg-white focus:border-blue-200 placeholder:text-gray-400"
                            />
                        </div>
                        <div>
                            <div className="flex items-center justify-between mb-3 ml-1">
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Next Follow-up</label>
                                {fu && (
                                    <button type="button" onClick={() => setFu('')} className="text-[9px] font-black uppercase text-red-500 hover:text-red-600 transition-colors">Clear</button>
                                )}
                            </div>
                            <input type={fu ? "date" : "text"} onFocus={(e) => (e.target.type = "date")} onBlur={(e) => (!e.target.value ? (e.target.type = "text") : null)} value={fu} onChange={e => setFu(e.target.value)}
                                placeholder="-- ---- ----"
                                className="w-full rounded-xl border border-gray-100 py-3.5 px-4 text-sm font-bold text-[#0f172a] bg-gray-50 outline-none focus:bg-white focus:border-blue-200 placeholder:text-gray-400"
                            />
                        </div>
                    </div>
                </form>

                <div className="p-8 bg-gray-50/50 border-t border-gray-100 shrink-0">
                    <div className="flex gap-3">
                        <button type="button" onClick={onClose} 
                            className="flex-1 py-4 rounded-2xl border border-gray-200 text-sm font-bold text-gray-500 hover:bg-gray-100 transition-colors">
                            Discard Changes
                        </button>
                        <button type="submit" disabled={busy || !notes.trim()} onClick={submit}
                            className="flex-[1.5] py-4 rounded-2xl text-sm font-black text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40 shadow-lg"
                            style={{ background: theme.bg, boxShadow: `0 12px 24px ${theme.bg}44` }}>
                            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-4 w-4" />}
                            {isEditing ? 'Save Changes' : 'Record Interaction'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

/* ══════════════════════════════════════════════════════════════════════════════
   SELECTOR MODAL
   ══════════════════════════════════════════════════════════════════════════════ */
const SelectorModal = ({ list, mode, onSelect, onClose }) => {
    const [search, setSearch] = useState('');
    const filtered = list.filter(item => {
        const q = search.toLowerCase();
        return mode === 'homeowner'
            ? (item.address?.toLowerCase().includes(q) || item.homeownerName?.toLowerCase().includes(q))
            : (item.companyName?.toLowerCase().includes(q) || item.ownerName?.toLowerCase().includes(q));
    });
    return (
        <div className="fixed inset-0 z-[300] flex items-start justify-center pt-[10vh] p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-md" onClick={onClose} />
            <div className="relative bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden" style={{ animation: 'slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1)' }}>
                <div className="p-8 pb-4">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-2xl font-black text-gray-900">Add {mode === 'homeowner' ? 'Homeowner' : 'Builder'}</h3>
                        <button onClick={onClose} className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 transition-colors"><X className="h-5 w-5" /></button>
                    </div>
                    <div className="relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-300" />
                        <input autoFocus placeholder="Start typing..." value={search} onChange={e => setSearch(e.target.value)}
                            className="w-full pl-12 pr-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:bg-white transition-all text-sm font-medium" />
                    </div>
                </div>
                <div className="max-h-[50vh] overflow-y-auto px-4 pb-8 mini-scroll">
                    <div className="space-y-1">
                        {filtered.length === 0 ? <p className="text-center py-20 text-gray-400 font-medium">No results found</p> : filtered.slice(0, 15).map(item => (
                            <button key={item.id} onClick={() => { onSelect(item); onClose(); }} className="w-full flex items-center gap-4 p-4 rounded-xl border-b border-gray-100 hover:bg-gray-50 transition-colors text-left group">
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-[#0f172a] truncate group-hover:text-blue-700">{mode === 'homeowner' ? (item.homeownerName || item.address || 'Unnamed') : (item.companyName || 'Unnamed')}</p>
                                    <p className="text-xs text-gray-500 truncate mt-0.5">{mode === 'homeowner' ? item.address : (item.ownerName || item.email)}</p>
                                </div>
                                <ChevronRight className="h-4 w-4 text-gray-300 ml-auto group-hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100" />
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

/* ══════════════════════════════════════════════════════════════════════════════
   CONFIRM MODAL
   ══════════════════════════════════════════════════════════════════════════════ */
const ConfirmModal = ({ message, detail, onConfirm, onCancel }) => (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-md" onClick={onCancel} />
        <div className="relative bg-white w-full max-w-sm rounded-[2rem] shadow-2xl p-8 overflow-hidden" style={{ animation: 'slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1)' }}>
            <div className="h-14 w-14 rounded-2xl bg-red-50 flex items-center justify-center mb-6"><Trash2 className="h-6 w-6 text-red-500" /></div>
            <h3 className="text-xl font-bold text-[#0f172a] mb-2">{message}</h3>
            <p className="text-sm text-gray-500 leading-relaxed mb-8">{detail}</p>
            <div className="flex gap-3">
                <button onClick={onCancel} className="flex-1 py-3.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
                <button onClick={onConfirm} className="flex-1 py-3.5 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-700 transition-colors flex items-center justify-center gap-2 shadow-sm shadow-red-200">Delete</button>
            </div>
        </div>
    </div>
);

/* ══════════════════════════════════════════════════════════════════════════════
   INTERACTION DETAIL MODAL
   ══════════════════════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════════════════════
   INTERACTION DETAIL SLIDEOVER
   ══════════════════════════════════════════════════════════════════════════════ */
const InteractionSlideover = ({ item, onClose, onEdit, theme }) => {
    const isOpen = !!item;
    const [displayItem, setDisplayItem] = useState(null);

    useEffect(() => {
        if (item) setDisplayItem(item);
    }, [item]);

    const activeItem = item || displayItem;
    if (!activeItem) return null;

    const m = CAT_META[activeItem.category] || CAT_META.Other;
    const Icon = m.icon;
    const ts = getDt(activeItem.timestamp);

    return (
        <div className={`fixed inset-0 z-[300] flex justify-end transition-opacity duration-500 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            {/* Backdrop */}
            <div className={`absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity duration-500 ${isOpen ? 'opacity-100' : 'opacity-0'}`} onClick={onClose} />
            
            {/* Slide Content */}
            <div className={`relative bg-white w-full max-w-md h-full shadow-2xl flex flex-col transform transition-transform duration-500 ease-[cubic-bezier(0.2,0,0,1)] ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="px-6 py-5 bg-white border-b border-gray-100 shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl flex items-center justify-center shadow-sm" style={{ background: m.bg, color: m.fg }}>
                                <Icon className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="text-[#0f172a] font-bold text-lg leading-tight">{activeItem.category}</h3>
                                <div className="flex items-center gap-2 mt-1">
                                    <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest">{fmt(ts)} • {ts.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</p>
                                    <span className="h-1 w-1 rounded-full bg-gray-300" />
                                    <span className="text-[9px] font-black text-[#0f172a] uppercase tracking-widest bg-gray-100 px-1.5 py-0.5 rounded">{activeItem.staff || 'JW'}</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <button onClick={onEdit} className="h-9 w-9 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all hover:scale-110 active:scale-95">
                                <Pencil className="h-4 w-4" />
                            </button>
                            <button onClick={onClose} className="h-9 w-9 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all hover:rotate-90">
                                <X className="h-5.5 w-5.5" />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8 mini-scroll">
                    {activeItem.recordingUrl && (
                        <div className="bg-blue-50/50 rounded-2xl p-6 border border-blue-100/50 shadow-sm">
                            <div className="flex items-center gap-4 mb-5">
                                <div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-100">
                                    <Volume2 className="h-5 w-5 text-white" />
                                </div>
                                <div>
                                    <p className="text-[9px] font-black text-blue-800 uppercase tracking-widest mb-0.5">Call Recording</p>
                                    <p className="text-xs text-blue-600 font-extrabold">{activeItem.recordingDuration ? `${Math.floor(activeItem.recordingDuration / 60)}:${(activeItem.recordingDuration % 60).toString().padStart(2, '0')}` : 'Full Playback Available'}</p>
                                </div>
                            </div>
                            <audio src={activeItem.recordingUrl} controls className="w-full h-10 custom-audio" />
                        </div>
                    )}
                    
                    {activeItem.subject && (
                        <section>
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 ml-1">Subject Header</label>
                            <div className="p-5 bg-gray-50/50 rounded-xl border border-gray-100">
                                <h4 className="text-base font-bold text-[#0f172a] leading-relaxed">{activeItem.subject}</h4>
                            </div>
                        </section>
                    )}

                    <section>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 ml-1">Detailed Log Entry</label>
                        <div className="p-5 bg-gray-50/30 rounded-xl border border-gray-100/80">
                            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed font-medium">
                                {activeItem.notes}
                            </p>
                        </div>
                    </section>

                    {activeItem.followUp && (
                        <div className="flex items-center gap-4 rounded-xl px-6 py-4 bg-amber-50 border border-amber-100 shadow-sm shadow-amber-50">
                            <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                                <AlarmClockCheck className="h-6 w-6 text-amber-600" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase text-amber-700 tracking-widest mb-0.5">Planned Follow-up</p>
                                <p className="text-base font-extrabold text-amber-900 tracking-tight">{fmt(new Date(activeItem.followUp))}</p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-6 bg-gray-50/50 border-t border-gray-100 shrink-0">
                    <button onClick={onClose} className="w-full py-3 rounded-xl bg-[#0f172a] text-white font-bold text-xs tracking-widest uppercase shadow-lg hover:bg-black transition-all">
                        Compact Detail
                    </button>
                </div>
            </div>
        </div>
    );
};

/* ══════════════════════════════════════════════════════════════════════════════
   DETAIL PANEL
   ══════════════════════════════════════════════════════════════════════════════ */
const DetailPanel = ({ contact, mode, theme, onClose }) => {
    const navigate = useNavigate();
    const { startRecording, isRecording, activeContact } = useRecording();
    const [interactions, setInteractions] = useState([]);
    const [notes, setNotes]               = useState('');
    const [fuDate, setFuDate]             = useState('');
    const [showLog, setShowLog]           = useState(false);
    const [editingItem, setEditingItem]   = useState(null);
    const [activeItem, setActiveItem]     = useState(null);
    const [filterCat, setFilterCat]       = useState('All');
    const [confirmPending, setConfirmPending] = useState(null);

    const isRecordingThisContact = isRecording && activeContact?.id === contact?.id;

    const handleRecordClick = () => {
        if (isRecording) {
            alert("A recording is already in progress.");
            return;
        }
        startRecording({
            id: contact.id,
            name: mode === 'homeowner' ? (contact.homeownerName || contact.address) : contact.companyName,
            mode
        });
    };

    useEffect(() => {
        if (!contact) return;
        setNotes(contact.corrNotes || '');
        setFuDate(contact.corrFollowUp || '');
    }, [contact?.id]);

    useEffect(() => {
        if (!contact) return;
        const field = mode === 'homeowner' ? 'projectId' : 'builderId';
        const q = query(collection(db, 'correspondence'), where(field, '==', contact.id));
        return onSnapshot(q, snap => {
            const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            docs.sort((a, b) => getDt(b.timestamp) - getDt(a.timestamp));
            setInteractions(docs);
        });
    }, [contact?.id, mode]);

    const saveNotes = async (eOrOverride = null) => {
        if (!contact) return;
        const col = mode === 'homeowner' ? 'projects' : 'builders';
        let updatedFu = fuDate;
        if (typeof eOrOverride === 'string') {
            updatedFu = eOrOverride;
        }
        await updateDoc(doc(db, col, contact.id), { corrNotes: notes, corrFollowUp: updatedFu }).catch(console.error);
    };

    const handleLogSave = async ({ category, notes: n, subject, followUp, date, direction, staff }) => {
        let timestamp = new Date();
        if (date) {
            const [y, m, d] = date.split('-').map(Number);
            timestamp = new Date(y, m - 1, d);
        }
        // If it's today, we might want to keep the current time, but for backdating it's fine to just use the date's start or current time if it's today.
        // Let's adjust to current time if the date is today's date to keep sequence logical if logged same day.
        const now = new Date();
        const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
        if (date === today && !editingItem) {
             // keep current time for today's entries
             timestamp.setHours(new Date().getHours(), new Date().getMinutes());
        }

        const data = { category, notes: n, subject, followUp, timestamp, direction, staff };

        if (editingItem) {
            await updateDoc(doc(db, 'correspondence', editingItem.id), data);
            setEditingItem(null);
        } else {
            const payload = { ...data, mode };
            if (mode === 'homeowner') payload.projectId = contact.id;
            else payload.builderId = contact.id;
            await addDoc(collection(db, 'correspondence'), payload);
        }
    };

    const handleDelete = async (e, item) => { e.stopPropagation(); setConfirmPending(item); };
    const confirmDelete = async () => { if (confirmPending) await deleteDoc(doc(db, 'correspondence', confirmPending.id)); setConfirmPending(null); };
    const handleEditClick = (e, item) => { e.stopPropagation(); setEditingItem(item); setShowLog(true); };

    const filtered = filterCat === 'All' ? interactions : interactions.filter(i => i.category === filterCat);
    const isOverdue = fuDate && new Date(fuDate) < new Date();
    const name = mode === 'homeowner' ? (contact.homeownerName || contact.address || 'Unnamed') : contact.companyName;
    const sub = mode === 'homeowner' ? contact.address : contact.ownerName;

    return (
        <div className="flex flex-col h-full bg-white overflow-hidden">
            {/* Header */}
            <div className="relative shrink-0 px-6 py-5 border-b border-gray-100">
                <div className="flex justify-between items-center gap-4">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-gray-100 text-gray-500" style={{ color: theme.bg, backgroundColor: theme.bg + '15' }}>
                                {mode === 'homeowner' ? 'Homeowner' : 'Builder'}
                            </span>
                        </div>
                        <h2 className="text-[#0f172a] font-bold text-xl leading-tight truncate">{name}</h2>
                        {sub && name !== sub && <p className="text-gray-400 text-xs mt-0.5 truncate font-medium">{sub}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={onClose} className="h-9 w-9 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all shrink-0 hover:rotate-90"><X className="h-5.5 w-5.5" /></button>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-4">
                    <button onClick={() => navigate(mode === 'homeowner' ? `/projects?id=${contact.id}` : `/builders?id=${contact.id}`)} 
                        className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold text-white transition-all shadow-sm hover:shadow-md active:scale-95" 
                        style={{ background: theme.bg }}>
                        View Profile
                    </button>
                    <button onClick={() => setShowLog(true)} 
                        className="flex items-center gap-1.5 bg-gray-50 text-[#0f172a] hover:bg-gray-100 border border-gray-200 text-xs font-bold px-3.5 py-1.5 rounded-lg transition-all active:scale-95">
                        <Plus className="h-3 w-3" /> Log
                    </button>
                    <button 
                        onClick={handleRecordClick} 
                        disabled={isRecording}
                        className={`flex items-center gap-1.5 text-xs font-bold px-3.5 py-1.5 rounded-lg transition-all active:scale-95 border ${isRecordingThisContact ? 'bg-red-500 text-white border-transparent animate-pulse shadow-lg shadow-red-100' : 'bg-white text-[#0f172a] border-gray-200 hover:bg-gray-50 disabled:opacity-40'}`}
                    >
                        <Mic className={`h-3 w-3 ${isRecordingThisContact ? 'text-white' : 'text-red-500'}`} />
                        {isRecordingThisContact ? 'Live' : 'Record'}
                    </button>
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto mini-scroll p-6 bg-white">
                <div className="max-w-4xl mx-auto space-y-8 pb-12">
                    {/* Follow-up Header */}
                    <div className={`rounded-3xl border p-6 flex gap-5 transition-all ${isOverdue ? 'bg-red-50/50 border-red-100 shadow-sm' : fuDate ? 'bg-indigo-50/30 border-indigo-100' : 'bg-gray-50/50 border-gray-100'}`}>
                        <div className={`h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 ${isOverdue ? 'bg-red-100 text-red-600' : fuDate ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-400'}`}>
                            <AlarmClockCheck className="h-5.5 w-5.5" />
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Upcoming Follow-up</label>
                                {fuDate && (
                                    <button onClick={() => { setFuDate(''); saveNotes(''); }} className="text-[9px] font-black uppercase text-red-500 hover:text-red-600 transition-colors">Clear</button>
                                )}
                            </div>
                            <input type={fuDate ? "date" : "text"} onFocus={(e) => (e.target.type = "date")} onBlur={(e) => { if (!e.target.value) e.target.type = "text"; saveNotes(e); }} placeholder="-- ---- ----" value={fuDate} onChange={e => setFuDate(e.target.value)} 
                                className="text-base font-bold bg-transparent w-full focus:outline-none text-[#0f172a] placeholder:text-gray-300" />
                            {fuDate && <p className={`text-[10px] font-bold mt-1 ${isOverdue ? 'text-red-500' : 'text-indigo-500'}`}>{isOverdue ? 'Overdue' : 'Scheduled'}: {fmt(new Date(fuDate))}</p>}
                        </div>
                    </div>

                    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden group focus-within:border-blue-200 transition-all">
                        <div className="px-6 py-3 bg-gray-50/50 border-b border-gray-50 flex items-center gap-2">
                            <StickyNote className="h-3.5 w-3.5 text-gray-400" />
                            <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Notes Scratchpad</span>
                        </div>
                        <textarea value={notes} onChange={e => setNotes(e.target.value)} onBlur={saveNotes} placeholder="Log persistent notes here..." rows={4} 
                            className="w-full px-6 py-4 text-sm font-medium text-[#0f172a] resize-none focus:outline-none placeholder:text-gray-300 leading-relaxed" />
                    </div>

                    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/30">
                            <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-gray-400" /><span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Interaction Timeline</span></div>
                            <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="text-[10px] font-bold bg-white border border-gray-200 rounded-lg py-1 px-3 focus:ring-0 text-gray-500">
                                {['All Types', ...CATS].map(c => <option key={c} value={c === 'All Types' ? 'All' : c}>{c}</option>)}
                            </select>
                        </div>
                        <div className="p-4 space-y-3">
                            {filtered.length === 0 ? (
                                <div className="text-center py-20 bg-gray-50/30 rounded-2xl border border-dashed border-gray-200">
                                    <MessageSquare className="h-10 w-10 text-gray-200 mx-auto mb-3" />
                                    <p className="text-xs text-gray-400 font-medium">No interactions logged yet</p>
                                </div>
                            ) : filtered.map((item, idx) => {
                                const m = CAT_META[item.category] || CAT_META.Other;
                                const Icon = m.icon;
                                return (
                                    <div key={item.id} onClick={() => setActiveItem(item)} className="group flex items-start gap-4 p-5 rounded-[1.5rem] hover:bg-gray-50 border border-transparent hover:border-gray-100 cursor-pointer transition-all active:scale-[0.99] bg-white hover:shadow-md">
                                        <div className="h-12 w-12 rounded-2xl shrink-0 flex items-center justify-center shadow-sm" style={{ background: m.bg, color: m.fg }}>
                                            <Icon className="h-5 w-5" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1.5">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="text-sm font-bold text-[#0f172a]">{item.category}</span>
                                                    {item.direction === 'Inbound' && (
                                                        <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-600 text-[9px] font-black uppercase tracking-tight border border-purple-100">Inbound</span>
                                                    )}
                                                    {item.direction === 'Outbound' && (
                                                        <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-600 text-[9px] font-black uppercase tracking-tight border border-blue-100">Outbound</span>
                                                    )}
                                                    {item.recordingUrl && (
                                                        <div className="flex items-center gap-1 bg-rose-50 text-rose-600 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-tight border border-rose-100">
                                                            <Mic className="h-2.5 w-2.5" /> Recording
                                                        </div>
                                                    )}
                                                    <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-500 text-[9px] font-black uppercase tracking-tight border border-gray-200">{item.staff || 'JW'}</span>
                                                </div>
                                                <span className="text-[10px] font-bold text-gray-400 group-hover:text-gray-500 transition-colors uppercase tracking-tight whitespace-nowrap ml-2">
                                                    {fmt(item.timestamp)}
                                                </span>
                                            </div>
                                            <p className="text-sm text-gray-600 line-clamp-3 leading-relaxed font-medium group-hover:text-gray-900 transition-colors">
                                                {item.notes}
                                            </p>
                                        </div>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0 ml-2">
                                            <button onClick={e => handleEditClick(e, item)} className="h-9 w-9 rounded-full flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                                                <Pencil className="h-4 w-4" />
                                            </button>
                                            <button onClick={e => handleDelete(e, item)} className="h-9 w-9 rounded-full flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            <LogSlideover isOpen={showLog} onClose={() => { setShowLog(false); setEditingItem(null); }} onSave={handleLogSave} mode={mode} theme={theme} initialData={editingItem} />
            <InteractionSlideover item={activeItem} onClose={() => setActiveItem(null)} onEdit={() => { setEditingItem(activeItem); setShowLog(true); setActiveItem(null); }} theme={theme} />
            {confirmPending && <ConfirmModal message="Delete entry?" detail="This cannot be undone." onConfirm={confirmDelete} onCancel={() => setConfirmPending(null)} />}
        </div>
    );
};

/* ══════════════════════════════════════════════════════════════════════════════
   CORRESPONDENCE PAGE
   ══════════════════════════════════════════════════════════════════════════════ */
const Correspondence = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [projects, setProjects] = useState([]);
    const [builders, setBuilders] = useState([]);
    const [activeIds, setActiveIds] = useState(new Set());
    const [selected, setSelected] = useState(null);
    const [isClosing, setIsClosing] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [mode, setMode] = useState('homeowner');
    const [showSelector, setShowSelector] = useState(false);

    // switch animation
    const [sweeping, setSweeping] = useState(false);
    const [sweepDir, setSweepDir] = useState('right');
    const [nextMode, setNextMode] = useState(null);
    const [listFading, setListFading] = useState(false);

    const theme = THEME[mode];
    const sweepTheme = nextMode ? THEME[nextMode] : theme;

    useEffect(() => {
        const q = query(collection(db, 'projects'), orderBy('timestamp', 'desc'));
        return onSnapshot(q, snap => { setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); });
    }, []);

    useEffect(() => {
        const q = query(collection(db, 'builders'), orderBy('companyName', 'asc'));
        return onSnapshot(q, snap => setBuilders(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    }, []);

    useEffect(() => {
        const q = query(collection(db, 'correspondence'));
        return onSnapshot(q, snap => {
            const ids = new Set();
            snap.docs.forEach(d => {
                const data = d.data();
                if (data.projectId) ids.add(data.projectId);
                if (data.builderId) ids.add(data.builderId);
            });
            setActiveIds(ids);
        });
    }, []);

    useEffect(() => {
        const urlMode = searchParams.get('type');
        if (urlMode === 'homeowner' || urlMode === 'builder') setMode(urlMode);
    }, []);

    useEffect(() => {
        if (selected) {
            const t = setTimeout(() => setIsOpen(true), 20);
            return () => clearTimeout(t);
        } else {
            setIsOpen(false);
        }
    }, [selected?.id]);

    useEffect(() => {
        const urlId   = searchParams.get('id');
        const urlMode = searchParams.get('type');
        if (!urlId) return;
        const list = urlMode === 'builder' ? builders : projects;
        if (!list.length) return;
        const found = list.find(i => i.id === urlId);
        if (found) { setMode(urlMode || 'homeowner'); setSelected(found); }
    }, [searchParams, projects, builders]);

    const switchMode = (newMode) => {
        if (newMode === mode || sweeping) return;
        setSweepDir(newMode === 'builder' ? 'right' : 'left');
        setNextMode(newMode);
        setSweeping(true);
        setListFading(true);
        setTimeout(() => {
            setMode(newMode);
            setSelected(null);
            setSearch('');
            setNextMode(null);
            setSweeping(false);
            setListFading(false);
        }, 420);
    };

    const activeList = (mode === 'homeowner' ? projects : builders).filter(item => {
        return activeIds.has(item.id) || (item.corrNotes && item.corrNotes.trim()) || !!item.corrFollowUp || item.id === selected?.id;
    });

    const filtered = activeList.filter(item => {
        const q = search.toLowerCase();
        return mode === 'homeowner'
            ? (item.address?.toLowerCase().includes(q) || item.homeownerName?.toLowerCase().includes(q))
            : (item.companyName?.toLowerCase().includes(q) || item.ownerName?.toLowerCase().includes(q));
    });

    const selectItem = (item) => {
        if (selected?.id === item.id) return;
        setIsOpen(false); // reset if switching
        setSelected(item);
        setSearchParams({ type: mode, id: item.id });
    };
    const clearItem = () => {
        setIsOpen(false);
        setIsClosing(true);
        setTimeout(() => { setSelected(null); setIsClosing(false); setSearchParams({}); }, 480);
    };

    return (
        <>
            <style>{`
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                @keyframes sweepRight { from { transform: translateX(-100%); } to { transform: translateX(0); } }
                @keyframes sweepLeft { from { transform: translateX(100%); } to { transform: translateX(0); } }
                .sweep-right { animation: sweepRight 0.42s cubic-bezier(0.4,0,0.2,1) forwards; }
                .sweep-left  { animation: sweepLeft  0.42s cubic-bezier(0.4,0,0.2,1) forwards; }
                .animate-fade-in { animation: fadeIn 0.4s ease-out both; }
            `}</style>

            <div className="w-full flex flex-col h-full overflow-hidden">
                {/* Header */}
                <header className="mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shrink-0">
                    <div>
                        <h1 className="text-3xl font-semibold tracking-tight text-[#0f172a]">Correspondence</h1>
                        <p className="mt-1.5 text-sm text-gray-500">Track and manage communications with contacts.</p>
                    </div>
                    <div className="flex bg-gray-100/80 p-1 rounded-xl">
                        <button onClick={() => switchMode('homeowner')} className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all ${mode === 'homeowner' ? 'text-white shadow-md' : 'text-gray-500 hover:text-gray-700'}`} style={mode === 'homeowner' ? { background: theme.bg } : {}}><Home className="h-4 w-4" />Homeowners</button>
                        <button onClick={() => switchMode('builder')} className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all ${mode === 'builder' ? 'text-white shadow-md' : 'text-gray-500 hover:text-gray-700'}`} style={mode === 'builder' ? { background: theme.bg } : {}}><Building2 className="h-4 w-4" />Builders</button>
                    </div>
                </header>

                {/* Main Content Area */}
                <div className="flex-1 min-h-0 relative">
                    {/* List of Contacts */}
                    <div className="flex flex-col h-full bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden transition-all duration-500">
                        <div className="p-5 border-b border-gray-100 shrink-0 space-y-4">
                            <button onClick={() => setShowSelector(true)} className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl bg-gray-50 text-[#0f172a] hover:bg-gray-100 transition-all font-medium text-sm border border-dashed border-gray-300 hover:border-gray-400 group">
                                <Plus className="h-5 w-5 text-gray-400 group-hover:text-[#0f172a] transition-colors" />
                                <span>Add {mode === 'homeowner' ? 'Homeowner' : 'Builder'}</span>
                            </button>
                            <div className="relative group">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-gray-400" />
                                <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="w-full pl-12 pr-5 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#0f172a] focus:ring-1 focus:ring-[#0f172a] transition-all" />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto mini-scroll">
                            {loading ? <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-gray-200" /></div> : filtered.map(item => {
                                const isActive = selected?.id === item.id;
                                const name = mode === 'homeowner' ? (item.homeownerName || item.address || 'Unnamed') : item.companyName;
                                const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                                return (
                                    <button key={item.id} onClick={() => selectItem(item)} className={`w-full text-left flex items-center gap-3 px-4 py-3 border-b border-gray-100 transition-colors group ${isActive ? 'bg-blue-50/30' : 'hover:bg-gray-50'}`}>
                                        {mode === 'builder' && <div className="h-9 w-9 rounded-lg bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-600">{initials}</div>}
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm truncate ${isActive ? 'text-[#0f172a] font-semibold' : 'text-[#0f172a] font-medium'}`}>{name}</p>
                                            <p className="text-xs text-gray-500 truncate mt-0.5">{item.address || item.ownerName}</p>
                                        </div>
                                        <ChevronRight className={`h-4 w-4 shrink-0 transition-colors ${isActive ? 'text-blue-500' : 'text-gray-300 opacity-0 group-hover:opacity-100'}`} />
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Takeover Detail Panel */}
                    <div className={`absolute inset-0 z-[60] bg-white rounded-2xl border border-gray-200 flex flex-col transform transition-transform duration-500 ease-out shadow-2xl overflow-hidden ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                        {selected && <DetailPanel contact={selected} mode={mode} theme={theme} onClose={clearItem} />}
                    </div>
                </div>
            </div>

            {showSelector && <SelectorModal list={mode === 'homeowner' ? projects : builders} mode={mode} onSelect={selectItem} onClose={() => setShowSelector(false)} />}
        </>
    );
};

export default Correspondence;
