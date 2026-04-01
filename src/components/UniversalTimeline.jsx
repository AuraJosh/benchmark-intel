import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { Phone, Mail, Users, FileText, Send, Clock } from 'lucide-react';

const UniversalTimeline = ({ contactId, projectId, type = 'Internal' }) => {
    const [interactions, setInteractions] = useState([]);
    const [summary, setSummary] = useState('');
    const [interactionType, setInteractionType] = useState('Note');

    useEffect(() => {
        let q;
        if (contactId) {
            q = query(
                collection(db, 'interactions'),
                where('contact_id', '==', contactId),
                orderBy('timestamp', 'desc')
            );
        } else if (projectId) {
            q = query(
                collection(db, 'interactions'),
                where('project_id', '==', projectId),
                orderBy('timestamp', 'desc')
            );
        } else {
            return;
        }

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setInteractions(data);
        });

        return () => unsubscribe();
    }, [contactId, projectId]);

    const handleAddInteraction = async (e) => {
        e.preventDefault();
        if (!summary.trim()) return;

        try {
            await addDoc(collection(db, 'interactions'), {
                contact_id: contactId || null,
                project_id: projectId || null,
                type: interactionType,
                summary,
                timestamp: serverTimestamp(),
            });
            setSummary('');
        } catch (error) {
            console.error("Error adding interaction:", error);
            alert("Failed to add interaction.");
        }
    };

    const getIcon = (type) => {
        switch (type) {
            case 'Call': return <Phone className="h-4 w-4 bg-blue-100 text-blue-600 rounded-full p-0.5" />;
            case 'Email': return <Mail className="h-4 w-4 bg-purple-100 text-purple-600 rounded-full p-0.5" />;
            case 'Meeting': return <Users className="h-4 w-4 bg-green-100 text-green-600 rounded-full p-0.5" />;
            case 'Note': default: return <FileText className="h-4 w-4 bg-gray-100 text-gray-600 rounded-full p-0.5" />;
        }
    };

    return (
        <div className="flex flex-col h-full bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                <span className="text-sm font-bold text-gray-700 uppercase flex items-center gap-2">
                    <Clock className="h-4 w-4" /> Timeline ({type})
                </span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 mini-scroll">
                {interactions.length === 0 ? (
                    <p className="text-center text-sm text-gray-400 italic">No interactions yet.</p>
                ) : (
                    interactions.map(item => (
                        <div key={item.id} className="flex gap-3 relative">
                            <div className="flex flex-col items-center">
                                <div className="z-10 bg-white ring-4 ring-white">{getIcon(item.type)}</div>
                                <div className="w-px h-full bg-gray-200 absolute top-4 left-2 -z-10"></div>
                            </div>
                            <div className="pb-4">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-bold text-gray-800">{item.type}</span>
                                    <span className="text-[10px] text-gray-500">
                                        {item.timestamp?.toDate ? item.timestamp.toDate().toLocaleString() : 'Just now'}
                                    </span>
                                </div>
                                <div className="text-sm text-gray-600 bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                                    {item.summary}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="p-4 border-t border-gray-100 bg-gray-50">
                <form onSubmit={handleAddInteraction} className="flex flex-col gap-2">
                    <div className="flex gap-2">
                        <select
                            value={interactionType}
                            onChange={(e) => setInteractionType(e.target.value)}
                            className="text-xs border border-gray-300 rounded-md px-2 py-1.5 focus:border-[#0f172a] focus:ring-1 focus:ring-[#0f172a] bg-white outline-none"
                        >
                            <option value="Note">Note</option>
                            <option value="Call">Call</option>
                            <option value="Email">Email</option>
                            <option value="Meeting">Meeting</option>
                        </select>
                        <input
                            type="text"
                            placeholder="Add a new note..."
                            value={summary}
                            onChange={(e) => setSummary(e.target.value)}
                            className="flex-1 text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:border-[#0f172a] focus:ring-1 focus:ring-[#0f172a] outline-none"
                        />
                        <button
                            type="submit"
                            disabled={!summary.trim()}
                            className="bg-[#0f172a] text-white p-2 rounded-md hover:bg-black disabled:opacity-50 transition-colors"
                        >
                            <Send className="h-4 w-4" />
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default UniversalTimeline;
