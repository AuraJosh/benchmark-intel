import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, onSnapshot, orderBy, updateDoc, doc, addDoc, deleteDoc, Timestamp, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Network, Activity, FileSignature, Receipt, Users, Home, Loader2, Bell, EyeOff, Clock, CheckCircle2, ChevronLeft, ChevronRight, Plus, X, Calendar } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

// Format: 'YYYY-MM-DD'
const getDateFormat = (date) => {
    return date.toISOString().split('T')[0];
};

const getRecentMonday = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
};

const getDt = (ts) => {
    if (!ts) return null;
    if (ts.toDate) return ts.toDate();
    if (ts instanceof Date) return ts;
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
};

const Dashboard = () => {
    const navigate = useNavigate();
    const scrollRef = useRef(null);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        totalProjects: 0,
        pendingContracts: 0,
        unpaidInvoices: 0,
        availableBuilders: 0,
        lastScrapeTime: null,
        breakdown: {
            packSent: 0,
            packCreated: 0,
            packRequired: 0,
            assigned: 0,
            pipeline: 0,
            archived: 0
        }
    });

    const [chartData, setChartData] = useState([]);
    const [chartWeekOffset, setChartWeekOffset] = useState(0);
    
    // Reminders state
    const [projects, setProjects] = useState([]);
    const [builders, setBuilders] = useState([]);
    const [assignments, setAssignments] = useState([]);
    const [interactions, setInteractions] = useState([]);
    const [invoices, setInvoices] = useState([]);
    const [reminders, setReminders] = useState([]);
    const [showReminders, setShowReminders] = useState(true);
    const [thresholdDays, setThresholdDays] = useState(10);
    const [customTodos, setCustomTodos] = useState([]);
    const [showAddTodo, setShowAddTodo] = useState(false);
    const [newTodoText, setNewTodoText] = useState('');
    const [newTodoDate, setNewTodoDate] = useState('');
    const [isSavingTodo, setIsSavingTodo] = useState(false);

    useEffect(() => {
        let unsubscribeProjects;
        let unsubscribeBuilders;
        let unsubscribeContracts;
        let unsubscribeInvoices;
        let unsubscribeInteractions;
        let unsubscribeAssignments;

        const fetchData = () => {
            // Let's do parallel listeners
            const projectsQuery = query(collection(db, 'projects'), orderBy('timestamp', 'desc'));
            unsubscribeProjects = onSnapshot(projectsQuery, (snapshot) => {
                const projData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setProjects(projData);

                let latestTime = null;
                projData.forEach(p => {
                    if (p.timestamp && p.timestamp.toDate) {
                        const pTime = p.timestamp.toDate();
                        if (!latestTime || pTime > latestTime) latestTime = pTime;
                    }
                });

                setStats(prev => ({
                    ...prev,
                    totalProjects: projData.length,
                    lastScrapeTime: latestTime
                }));
            });

            const buildersQuery = query(collection(db, 'builders'));
            unsubscribeBuilders = onSnapshot(buildersQuery, (snapshot) => {
                const builderData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setBuilders(builderData);

                let available = 0;
                builderData.forEach(b => {
                    if (b.availability === true) available++;
                });
                setStats(prev => ({ ...prev, availableBuilders: available }));
            });

            const corrQuery = query(collection(db, 'correspondence'));
            unsubscribeInteractions = onSnapshot(corrQuery, (snapshot) => {
                const corrData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setInteractions(corrData);
            });

            const assignmentsQuery = query(collection(db, 'assignments'));
            unsubscribeAssignments = onSnapshot(assignmentsQuery, (snapshot) => {
                const assignData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setAssignments(assignData);
            });

            const contractsQuery = query(collection(db, 'agreements'));
            unsubscribeContracts = onSnapshot(contractsQuery, (snapshot) => {
                let pending = 0;
                snapshot.forEach(doc => {
                    if (doc.data().status === 'Pending' || doc.data().status === 'pending') pending++;
                });
                setStats(prev => ({ ...prev, pendingContracts: pending }));
            });

            const invoicesQuery = query(collection(db, 'invoices'));
            unsubscribeInvoices = onSnapshot(invoicesQuery, (snapshot) => {
                const invData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setInvoices(invData);
                
                let unpaid = 0;
                invData.forEach(inv => {
                    const s = inv.status;
                    if (s === 'Pending' || s === 'Partial' || s === 'pending' || s === 'partial') unpaid++;
                });
                setStats(prev => ({ ...prev, unpaidInvoices: unpaid }));
                setLoading(false);
            });

            const remindersQuery = query(collection(db, 'customReminders'), orderBy('timestamp', 'desc'));
            const unsubscribeCustomReminders = onSnapshot(remindersQuery, (snapshot) => {
                const todos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setCustomTodos(todos);
            });

            return () => {
                 if (unsubscribeCustomReminders) unsubscribeCustomReminders();
                 // We'll return this to the outer return
            };
        };

        const cleanup = fetchData();

        return () => {
            if (cleanup) cleanup();
            if (unsubscribeProjects) unsubscribeProjects();
            if (unsubscribeBuilders) unsubscribeBuilders();
            if (unsubscribeContracts) unsubscribeContracts();
            if (unsubscribeInvoices) unsubscribeInvoices();
            if (unsubscribeInteractions) unsubscribeInteractions();
            if (unsubscribeAssignments) unsubscribeAssignments();
        };
    }, []);

    // Breakdown Logic
    useEffect(() => {
        if (!projects.length) return;

        const monday = getRecentMonday();
        let thisWeek = 0;
        let packSent = 0;
        let packCreated = 0;
        let packRequired = 0;
        let assigned = 0;
        let pipeline = 0;
        let archived = 0;

        projects.forEach(p => {
            const dt = getDt(p.timestamp);
            if (dt && dt >= monday) thisWeek++;

            if (p.status === 'Archive' || p.status === 'Dead') {
                archived++;
            } else if (p.status === 'Pack Sent') {
                packSent++;
            } else if (p.status === 'Pack Created') {
                packCreated++;
            } else if (p.status === 'Pack Required' || p.status === 'Won') {
                packRequired++;
            } else if (assignments.some(a => a.projectId === p.id)) {
                assigned++;
            } else {
                pipeline++;
            }
        });

        setStats(prev => ({
            ...prev,
            thisWeekTotal: thisWeek,
            breakdown: {
                packSent,
                packCreated,
                packRequired,
                assigned,
                pipeline,
                archived
            }
        }));
    }, [projects, assignments]);

    // Chart Data Generation (Depends on Offset)
    useEffect(() => {
        if (!projects.length) return;

        const recentDatesCount = {};
        const targetEnd = new Date();
        targetEnd.setDate(targetEnd.getDate() - (chartWeekOffset * 14));

        for (let i = 13; i >= 0; i--) {
            const d = new Date(targetEnd);
            d.setDate(d.getDate() - i);
            recentDatesCount[getDateFormat(d)] = 0;
        }

        projects.forEach(p => {
            if (p.dateDecided) {
                const dTime = new Date(p.dateDecided);
                if (!isNaN(dTime.getTime())) {
                    const dStr = getDateFormat(dTime);
                    if (recentDatesCount[dStr] !== undefined) {
                        recentDatesCount[dStr]++;
                    }
                }
            }
        });

        const cData = Object.keys(recentDatesCount).map(date => ({
            date,
            count: recentDatesCount[date]
        })).sort((a, b) => a.date.localeCompare(b.date));
        
        setChartData(cData);
    }, [projects, chartWeekOffset]);

    useEffect(() => {
        if (!projects.length && !builders.length) return;
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const reminderList = [];

        const checkContact = (contact, type) => {
            const matchId = contact.id;
            
            // 1. Check for Manual Follow-ups
            const fuDate = contact.corrFollowUp ? new Date(contact.corrFollowUp) : null;
            if (fuDate) {
                fuDate.setHours(0, 0, 0, 0);
                const isDueToday = fuDate.getTime() === now.getTime();
                const isOverdue = fuDate < now;

                if (isDueToday || isOverdue) {
                    reminderList.push({
                        id: matchId + '-fu',
                        type: type,
                        contactId: matchId,
                        name: type === 'homeowner' ? (contact.homeownerName || contact.address || 'Unnamed') : (contact.companyName || 'Unnamed Builder'),
                        status: isOverdue ? 'Overdue' : 'Due Today',
                        date: fuDate,
                        priority: isOverdue ? 1 : 2
                    });
                }
            }

            // 2. Check for Inactivity
            const contactInteractions = interactions.filter(i => 
                (type === 'homeowner' ? i.projectId === matchId : i.builderId === matchId)
            );
            
            contactInteractions.sort((a, b) => {
                const da = getDt(a.timestamp);
                const db = getDt(b.timestamp);
                return (db?.getTime() || 0) - (da?.getTime() || 0);
            });

            const latestInt = contactInteractions[0];
            const latestDate = latestInt ? getDt(latestInt.timestamp) : null;

            if (!latestDate) return;

            const hasDetails = type === 'homeowner' 
                ? (contact.homeownerName || contact.homeownerEmail || contact.homeownerPhone)
                : (contact.ownerName || contact.email || contact.phone);
            
            if (!hasDetails) return;
            if (type === 'homeowner' && contact.status === 'Dead') return; 
            if (type === 'builder' && contact.status === 'Inactive') return; 

            const daysSince = Math.floor((new Date() - latestDate) / (1000 * 60 * 60 * 24));
            
            if (daysSince >= thresholdDays) {
                const clearedAt = getDt(contact.reminderClearedAt);
                if (clearedAt && clearedAt > latestDate) return; 
                
                const snoozedUntil = getDt(contact.reminderSnoozedUntil);
                if (snoozedUntil && snoozedUntil > new Date()) return; 
                
                // Don't duplicate if already added as follow-up
                if (reminderList.some(r => r.contactId === matchId)) return;

                reminderList.push({
                    id: matchId,
                    type: type,
                    contactId: matchId,
                    name: type === 'homeowner' ? (contact.homeownerName || contact.address || 'Unnamed') : (contact.companyName || 'Unnamed Builder'),
                    status: `${daysSince}d Inactive`,
                    date: latestDate,
                    priority: 3
                });
            }
        };

        projects.forEach(p => checkContact(p, 'homeowner'));
        builders.forEach(b => checkContact(b, 'builder'));
        
        // 3. Check for Pending/Overdue Invoices
        invoices.forEach(inv => {
            const currentStatus = (inv.status || '').toLowerCase();
            if (currentStatus === 'paid') return;
            
            const builder = builders.find(b => b.id === inv.builderId);
            const builderName = builder?.companyName || 'Unknown Builder';

            if (inv.payments) {
                ['p1', 'p2', 'p3'].forEach((pKey) => {
                    const pay = inv.payments[pKey];
                    // Only check if it's not paid and has a due date
                    const payStatus = (pay?.status || '').toLowerCase();
                    if (pay && payStatus !== 'paid' && pay.dueDate) {
                        const dueDate = getDt(pay.dueDate);
                        if (dueDate) {
                            dueDate.setHours(0, 0, 0, 0);
                            const isDueToday = dueDate.getTime() === now.getTime();
                            const isOverdue = dueDate < now;

                            if (isDueToday || isOverdue) {
                                // Prevent duplication if builder already has a reminder
                                if (reminderList.some(r => r.id === `${inv.id}-${pKey}`)) return;

                                reminderList.push({
                                    id: `${inv.id}-${pKey}`,
                                    type: 'invoice',
                                    contactId: inv.id,
                                    name: `Chase Invoice: ${builderName}`,
                                    status: isOverdue ? 'Overdue' : 'Due Today',
                                    date: dueDate,
                                    priority: isOverdue ? 1 : 2
                                });
                            }
                        }
                    }
                });
            }
        });

        // 4. Check for Custom Reminders (To-Dos)
        customTodos.forEach(todo => {
            if (todo.completed) return;
            
            let shouldShow = true;
            let priority = 3; // "Needs Attention" default
            let statusText = "To Do";
            let displayDate = todo.date ? (todo.date.toDate ? todo.date.toDate() : new Date(todo.date)) : null;

            if (displayDate) {
                const dDate = new Date(displayDate);
                dDate.setHours(0, 0, 0, 0);
                
                const dNow = new Date(now);
                dNow.setHours(0, 0, 0, 0);

                const dayBefore = new Date(dDate);
                dayBefore.setDate(dayBefore.getDate() - 1);
                
                if (dNow < dayBefore) {
                    shouldShow = false; // Too early
                } else if (dNow.getTime() === dDate.getTime()) {
                    statusText = "Due Today";
                    priority = 2;
                } else if (dNow > dDate) {
                    statusText = "Overdue";
                    priority = 1;
                } else if (dNow.getTime() === dayBefore.getTime()) {
                    statusText = "Due Tomorrow";
                    priority = 2;
                }
            }

            if (shouldShow) {
                // Prevent duplication
                if (reminderList.some(r => r.id === todo.id)) return;

                reminderList.push({
                    id: todo.id,
                    type: 'todo',
                    contactId: todo.id,
                    name: todo.text,
                    status: statusText,
                    date: displayDate,
                    priority: priority
                });
            }
        });

        // prioritize: Overdue (1), Due Today (2), Inactivity (3)
        reminderList.sort((a, b) => {
            if (a.priority !== b.priority) return a.priority - b.priority;
            return (a.date?.getTime() || 0) - (b.date?.getTime() || 0);
        });

        setReminders(reminderList);
    }, [projects, builders, interactions, invoices, thresholdDays, customTodos]);

    const saveTodo = async (e) => {
        e.preventDefault();
        if (!newTodoText.trim()) return;
        setIsSavingTodo(true);
        try {
            await addDoc(collection(db, 'customReminders'), {
                text: newTodoText,
                date: newTodoDate ? Timestamp.fromDate(new Date(newTodoDate)) : null,
                completed: false,
                timestamp: serverTimestamp()
            });
            setNewTodoText('');
            setNewTodoDate('');
            setShowAddTodo(false);
        } catch (error) {
            console.error("Error adding custom reminder:", error);
        } finally {
            setIsSavingTodo(false);
        }
    };

    const clearReminder = async (reminder) => {
        if (reminder.type === 'todo') {
            await deleteDoc(doc(db, 'customReminders', reminder.contactId));
            return;
        }
        const colName = reminder.type === 'builder' ? 'builders' : 'projects';
        await updateDoc(doc(db, colName, reminder.contactId), {
            reminderClearedAt: new Date()
        });
    };

    const snoozeReminder = async (reminder) => {
        if (reminder.type === 'todo') {
             // For custom todos, we don't have a specific snooze field, 
             // but maybe we can update the date to +3 days if it has a date
             if (reminder.date) {
                 const newDate = new Date(reminder.date);
                 newDate.setDate(newDate.getDate() + 3);
                 await updateDoc(doc(db, 'customReminders', reminder.contactId), {
                     date: Timestamp.fromDate(newDate)
                 });
             }
             return;
        }
        const colName = reminder.type === 'builder' ? 'builders' : 'projects';
        const snoozeUntil = new Date();
        snoozeUntil.setDate(snoozeUntil.getDate() + 3);
        await updateDoc(doc(db, colName, reminder.contactId), {
            reminderSnoozedUntil: snoozeUntil
        });
    };

    const pieData = [
        { name: 'New', value: stats.breakdown.pipeline, color: '#3b82f6', status: 'New' },
        { name: 'Pack Required', value: stats.breakdown.packRequired, color: '#f97316', status: 'Pack Required' },
        { name: 'Pack Created', value: stats.breakdown.packCreated, color: '#a855f7', status: 'Pack Created' },
        { name: 'Assigned', value: stats.breakdown.assigned, color: '#22c55e', status: 'Assigned' },
        { name: 'Archived', value: stats.breakdown.archived, color: '#94a3b8', status: 'Archive' }
    ].filter(d => d.value > 0);

    const handlePieClick = (data) => {
        if (data && data.status) {
            navigate(`/projects?status=${encodeURIComponent(data.status)}&backTo=/dashboard`);
        }
    };

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
        );
    }

    return (
        <div className="w-full relative flex flex-col h-full overflow-hidden">
            <header className="mb-3 md:mb-4 flex flex-row items-center justify-between gap-2 shrink-0">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[#0f172a]">Dashboard</h1>
                </div>
                <div className="flex items-center gap-2">
                    {!showReminders && reminders.length > 0 && (
                        <button onClick={() => setShowReminders(true)} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 border border-blue-100 rounded-lg text-[11px] font-bold text-blue-600 hover:bg-blue-100 transition-all shadow-sm">
                            <Bell className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Attention Widget</span> ({reminders.length})
                        </button>
                    )}
                    {stats.lastScrapeTime && (
                        <div className="hidden sm:flex bg-blue-50 text-blue-800 text-xs font-medium px-3 py-1.5 rounded-full border border-blue-200 shadow-sm items-center gap-2">
                            <Activity className="h-3.5 w-3.5" />
                            Last Scrape: {stats.lastScrapeTime.toLocaleString()}
                        </div>
                    )}
                </div>
            </header>

            <div className="flex-1 flex flex-col min-h-0 w-full overflow-x-hidden overflow-y-auto md:overflow-hidden pb-4">
                <div className={`shrink-0 transition-all duration-500 ease-in-out ${showReminders && reminders.length > 0 ? 'opacity-100 mb-3 max-h-[300px]' : 'max-h-0 opacity-0 mb-0 overflow-hidden'}`}>
                     <div className="w-full max-w-7xl animate-fade-in">
                          <div className="flex items-center justify-between mb-4 px-1">
                               <div className="flex items-center gap-2">
                                   <div className="h-6 w-1 bg-blue-500 rounded-full"></div>
                                   <h2 className="text-xs font-extrabold uppercase tracking-[0.2em] text-gray-400">Needs Attention</h2>
                                   <span className="bg-blue-50 text-blue-600 text-[10px] font-black px-2 py-0.5 rounded-full">{reminders.length}</span>
                               </div>
                               <div className="flex items-center gap-3">
                                   <div className="flex items-center gap-1 border-r border-gray-100 pr-3 mr-1">
                                       <select value={thresholdDays} onChange={e => setThresholdDays(Number(e.target.value))} className="text-[10px] font-bold uppercase bg-transparent text-gray-400 px-2 py-1 border-0 cursor-pointer focus:ring-0">
                                           <option value={3}>3+ Days</option>
                                           <option value={7}>7+ Days</option>
                                           <option value={10}>10+ Days</option>
                                           <option value={15}>15+ Days</option>
                                       </select>
                                       <button 
                                            onClick={() => setShowAddTodo(true)} 
                                            className="h-6 w-6 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100 transition-colors"
                                            title="Add Custom Reminder"
                                       >
                                            <Plus className="h-3.5 w-3.5" />
                                       </button>
                                   </div>
                                   <button onClick={() => setShowReminders(false)} className="text-[10px] font-bold uppercase text-gray-400 hover:text-gray-900 transition-colors flex items-center gap-1.5"><EyeOff className="h-3 w-3"/> Hide</button>
                               </div>
                          </div>

                          {reminders.length === 0 ? (
                               <div className="bg-white border border-gray-100 rounded-xl p-6 flex flex-col items-center justify-center shadow-sm h-[130px]">
                                   <CheckCircle2 className="h-6 w-6 text-green-500 mb-2" />
                                   <p className="text-sm font-bold text-gray-900">Everything is up to date</p>
                               </div>
                          ) : (
                               <div 
                                    ref={scrollRef}
                                    onWheel={(e) => {
                                        if (scrollRef.current) {
                                            scrollRef.current.scrollLeft += e.deltaY;
                                        }
                                    }}
                                    className="flex gap-4 overflow-x-auto pb-4 pt-1 mini-scroll -mx-1 px-1"
                                >
                                    {reminders.map(r => (
                                          <div key={r.id} onClick={() => {
                                               if (r.type === 'todo') return; // Don't navigate for to-dos
                                               if (r.type === 'invoice') {
                                                   navigate(`/invoices?id=${r.contactId}&backTo=/dashboard`);
                                               } else {
                                                   navigate(`/correspondence?type=${r.type === 'homeowner' ? 'homeowner' : 'builder'}&id=${r.contactId}`);
                                               }
                                          }} className={`min-w-[280px] max-w-[280px] flex-shrink-0 bg-white border border-gray-200 rounded-xl p-4 shadow-sm transition-all hover:border-blue-300 hover:shadow-md group relative flex flex-col min-h-0 overflow-visible ${r.type === 'todo' ? 'cursor-default border-l-4 border-l-blue-400' : 'cursor-pointer'}`}>
                                              {/* Circular Icons on the border */}
                                              <div className="absolute -top-2.5 -right-2.5 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all transform group-hover:scale-100 scale-90 z-10 pointer-events-none group-hover:pointer-events-auto">
                                                   <button onClick={(e) => { e.stopPropagation(); snoozeReminder(r); }} title="Snooze 3 days" className="h-6 w-6 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center hover:bg-gray-50 text-gray-400 hover:text-blue-500 transition-colors pointer-events-auto">
                                                        <Clock className="h-3 w-3" />
                                                   </button>
                                                   <button onClick={(e) => { e.stopPropagation(); clearReminder(r); }} title="Clear Reminder" className="h-6 w-6 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center hover:bg-gray-50 text-gray-400 hover:text-green-600 transition-colors pointer-events-auto">
                                                        <CheckCircle2 className="h-3 w-3" />
                                                   </button>
                                              </div>

                                              <div className="flex items-center justify-between mb-1.5">
                                                   <h4 className="text-[13px] font-bold text-gray-900 truncate pr-2">{r.name}</h4>
                                                   <span className="text-[8px] font-black px-1.5 py-0.5 rounded-lg bg-gray-50 text-gray-400 uppercase border border-gray-200 tracking-tighter shrink-0">{r.type}</span>
                                              </div>
                                              <p className="text-[11px] font-medium text-gray-500 flex items-center gap-1.5 shrink-0">
                                                   <span className={`flex h-1.5 w-1.5 rounded-full ${r.priority === 1 ? 'bg-red-500 animate-pulse' : r.priority === 2 ? 'bg-amber-500' : 'bg-blue-500'}`}></span>
                                                   <span className={`font-bold ${r.priority === 1 ? 'text-red-600' : r.priority === 2 ? 'text-amber-600' : 'text-blue-600'}`}>
                                                       {r.status}
                                                   </span>
                                              </p>
                                         </div>
                                    ))}
                               </div>
                          )}
                     </div>
                </div>

                <div className="shrink-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-3 w-full max-w-7xl animate-fade-in">
                    {/* Stat Cards */}
                    <div 
                        onClick={() => navigate('/projects?backTo=/dashboard')}
                        className="bg-blue-50 p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3 cursor-pointer hover:border-blue-400 hover:shadow-md transition-all group"
                    >
                        <div className="bg-blue-100 p-2.5 rounded-lg group-hover:scale-110 transition-transform"><Home className="h-5 w-5 text-blue-600" /></div>
                        <div>
                            <p className="text-xs font-medium text-gray-500">New This Week</p>
                            <p className="text-xl font-bold text-gray-900">{stats.thisWeekTotal}</p>
                        </div>
                    </div>
                    <div 
                        onClick={() => navigate('/builders')}
                        className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3 cursor-pointer hover:border-green-400 hover:shadow-md transition-all group"
                    >
                        <div className="bg-green-50 p-2.5 rounded-lg group-hover:scale-110 transition-transform"><Users className="h-5 w-5 text-green-600" /></div>
                        <div>
                            <p className="text-xs font-medium text-gray-500">Available Builders</p>
                            <p className="text-xl font-bold text-gray-900">{stats.availableBuilders}</p>
                        </div>
                    </div>
                    <div 
                        onClick={() => navigate('/contracts')}
                        className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3 cursor-pointer hover:border-orange-400 hover:shadow-md transition-all group"
                    >
                        <div className="bg-orange-50 p-2.5 rounded-lg group-hover:scale-110 transition-transform"><FileSignature className="h-5 w-5 text-orange-600" /></div>
                        <div>
                            <p className="text-xs font-medium text-gray-500">Pending Contracts</p>
                            <p className="text-xl font-bold text-gray-900">{stats.pendingContracts}</p>
                        </div>
                    </div>
                    <div 
                        onClick={() => navigate('/invoices')}
                        className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3 cursor-pointer hover:border-purple-400 hover:shadow-md transition-all group"
                    >
                        <div className="bg-purple-50 p-2.5 rounded-lg group-hover:scale-110 transition-transform"><Receipt className="h-5 w-5 text-purple-600" /></div>
                        <div>
                            <p className="text-xs font-medium text-gray-500">Unpaid Invoices</p>
                            <p className="text-xl font-bold text-gray-900">{stats.unpaidInvoices}</p>
                        </div>
                    </div>
                </div>

                <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 w-full max-w-7xl min-h-0">
                    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col min-h-[350px] md:min-h-0">
                        <div className="flex items-center justify-between mb-2 shrink-0">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                                New Projects {(() => {
                                    const end = new Date();
                                    end.setDate(end.getDate() - (chartWeekOffset * 14));
                                    const start = new Date(end);
                                    start.setDate(start.getDate() - 13);
                                    const fmt = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                                    return chartWeekOffset === 0 ? '(Current 14 Days)' : `(w/c ${fmt(start)})`;
                                })()}
                            </h3>
                            <div className="flex items-center gap-1">
                                <button 
                                    onClick={() => setChartWeekOffset(prev => prev + 1)} 
                                    title="Earlier"
                                    className="p-1 hover:bg-gray-100 rounded-md transition-colors text-gray-400 hover:text-gray-900"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </button>
                                {chartWeekOffset > 0 && (
                                    <button 
                                        onClick={() => setChartWeekOffset(prev => Math.max(0, prev - 1))} 
                                        title="Later"
                                        className="p-1 hover:bg-gray-100 rounded-md transition-colors text-gray-400 hover:text-gray-900"
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="flex-1 w-full relative min-h-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                    <XAxis
                                        dataKey="date"
                                        tickFormatter={(val) => {
                                            const d = new Date(val);
                                            return `${d.getDate()}/${d.getMonth() + 1}`;
                                        }}
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#6B7280', fontSize: 12 }}
                                        dy={10}
                                    />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                                    <RechartsTooltip
                                        cursor={{ fill: '#F3F4F6' }}
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Bar dataKey="count" fill="#0f172a" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col items-center min-h-[350px] md:min-h-0">
                        <h3 className="text-xs font-bold mb-2 uppercase tracking-wider text-gray-400 w-full text-left shrink-0">Project Breakdown</h3>
                        <div className="flex-1 w-full relative flex items-center justify-center min-h-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                                    <Pie
                                        data={pieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={95}
                                        paddingAngle={2}
                                        dataKey="value"
                                        stroke="none"
                                        className="outline-none cursor-pointer"
                                        onClick={handlePieClick}
                                    >
                                        {pieData.map((entry, index) => (
                                            <Cell 
                                                key={`cell-${index}`} 
                                                fill={entry.color} 
                                                className="hover:opacity-80 transition-opacity"
                                            />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>

            {/* Custom Reminder Modal */}
            {showAddTodo && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-slide-up">
                        <div className="flex items-center justify-between p-4 border-b border-gray-100">
                            <h3 className="text-lg font-bold text-gray-900">Custom Reminder</h3>
                            <button onClick={() => setShowAddTodo(false)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-900 transition-colors">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <form onSubmit={saveTodo} className="p-6 space-y-4">
                            <div>
                                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">To Do Item</label>
                                <textarea
                                    value={newTodoText}
                                    onChange={(e) => setNewTodoText(e.target.value)}
                                    placeholder="Enter your reminder here..."
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all min-h-[100px] resize-none"
                                    required
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">Due Date (Optional)</label>
                                <div className="relative">
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                                        <Calendar className="h-4 w-4" />
                                    </div>
                                    <input
                                        type="date"
                                        value={newTodoDate}
                                        onChange={(e) => setNewTodoDate(e.target.value)}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                    />
                                </div>
                                <p className="text-[10px] text-gray-500 mt-2 italic font-medium">If set, this will appear in 'Needs Attention' starting 1 day before.</p>
                            </div>
                            <div className="pt-2 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowAddTodo(false)}
                                    className="flex-1 px-4 py-3 bg-gray-100 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-200 transition-all border border-gray-200"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSavingTodo}
                                    className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-md shadow-blue-200 flex items-center justify-center gap-2 group"
                                >
                                    {isSavingTodo ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                                        <>
                                            Save Reminder
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;
