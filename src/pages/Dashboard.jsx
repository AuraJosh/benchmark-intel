import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, onSnapshot, orderBy, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { Network, Activity, FileSignature, Receipt, Users, Home, Loader2, Bell, EyeOff, Clock, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
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
    const [reminders, setReminders] = useState([]);
    const [showReminders, setShowReminders] = useState(true);
    const [thresholdDays, setThresholdDays] = useState(10);

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
                let unpaid = 0;
                snapshot.forEach(doc => {
                    const s = doc.data().status;
                    if (s === 'Pending' || s === 'Partial' || s === 'pending' || s === 'partial') unpaid++;
                });
                setStats(prev => ({ ...prev, unpaidInvoices: unpaid }));
                setLoading(false);
            });
        };

        fetchData();

        return () => {
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

        // prioritize: Overdue (1), Due Today (2), Inactivity (3)
        reminderList.sort((a, b) => a.priority - b.priority);

        setReminders(reminderList);
    }, [projects, builders, interactions, thresholdDays]);

    const clearReminder = async (reminder) => {
        const colName = reminder.type === 'builder' ? 'builders' : 'projects';
        await updateDoc(doc(db, colName, reminder.contactId), {
            reminderClearedAt: new Date()
        });
    };

    const snoozeReminder = async (reminder) => {
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
            navigate(`/projects?status=${encodeURIComponent(data.status)}`);
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
            <header className="mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shrink-0">
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
                    <p className="mt-2 text-sm text-gray-500">Live overview and key metrics from the platform.</p>
                </div>
                <div className="flex items-center gap-3">
                    {!showReminders && reminders.length > 0 && (
                        <button onClick={() => setShowReminders(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-lg text-[11px] font-bold text-blue-600 hover:bg-blue-100 transition-all shadow-sm">
                            <Bell className="h-3.5 w-3.5" />
                            Show Attention Widget ({reminders.length})
                        </button>
                    )}
                    {stats.lastScrapeTime && (
                        <div className="bg-blue-50 text-blue-800 text-xs font-medium px-3 py-1.5 rounded-full border border-blue-200 shadow-sm flex items-center gap-2">
                            <Activity className="h-3.5 w-3.5" />
                            Last Scrape: {stats.lastScrapeTime.toLocaleString()}
                        </div>
                    )}
                </div>
            </header>

            <div className="flex-1 overflow-auto pb-6 w-full">
                <div className={`overflow-hidden transition-all duration-500 ease-in-out ${showReminders ? 'max-h-[1000px] opacity-100 mb-10' : 'max-h-0 opacity-0 mb-0'}`}>
                     <div className="w-full max-w-7xl animate-fade-in">
                          <div className="flex items-center justify-between mb-4 px-1">
                               <div className="flex items-center gap-2">
                                   <div className="h-6 w-1 bg-blue-500 rounded-full"></div>
                                   <h2 className="text-xs font-extrabold uppercase tracking-[0.2em] text-gray-400">Needs Attention</h2>
                                   <span className="bg-blue-50 text-blue-600 text-[10px] font-black px-2 py-0.5 rounded-full">{reminders.length}</span>
                               </div>
                               <div className="flex items-center gap-3">
                                   <select value={thresholdDays} onChange={e => setThresholdDays(Number(e.target.value))} className="text-[10px] font-bold uppercase bg-transparent text-gray-400 px-2 py-1 border-0 cursor-pointer focus:ring-0">
                                       <option value={3}>3+ Days</option>
                                       <option value={7}>7+ Days</option>
                                       <option value={10}>10+ Days</option>
                                       <option value={15}>15+ Days</option>
                                   </select>
                                   <button onClick={() => setShowReminders(false)} className="text-[10px] font-bold uppercase text-gray-400 hover:text-gray-900 transition-colors flex items-center gap-1.5"><EyeOff className="h-3 w-3"/> Hide</button>
                               </div>
                          </div>

                          {reminders.length === 0 ? (
                               <div className="bg-white border border-gray-100 rounded-xl p-8 flex flex-col items-center justify-center shadow-sm">
                                   <div className="h-12 w-12 bg-green-50 rounded-2xl flex items-center justify-center mb-3"><CheckCircle2 className="h-6 w-6 text-green-500" /></div>
                                   <p className="text-sm font-bold text-gray-900 tracking-tight">Everything is up to date</p>
                                   <p className="text-xs text-gray-400 mt-1 max-w-sm text-center font-medium">Tracking {thresholdDays} days since last interaction for active contacts.</p>
                               </div>
                          ) : (
                               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 pt-3">
                                    {reminders.map(r => (
                                         <div key={r.id} onClick={() => navigate(`/correspondence?type=${r.type === 'homeowner' ? 'homeowner' : 'builder'}&id=${r.contactId}`)} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm transition-all hover:border-blue-300 hover:shadow-md group relative flex flex-col min-h-0 overflow-visible cursor-pointer">
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

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 w-full max-w-7xl animate-fade-in">
                    {/* Stat Cards */}
                    <div 
                        onClick={() => navigate('/projects')}
                        className="bg-blue-50 p-6 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4 cursor-pointer hover:border-blue-400 hover:shadow-md transition-all group"
                    >
                        <div className="bg-blue-100 p-3 rounded-lg group-hover:scale-110 transition-transform"><Home className="h-6 w-6 text-blue-600" /></div>
                        <div>
                            <p className="text-sm font-medium text-gray-500">New This Week</p>
                            <p className="text-2xl font-semibold text-gray-900">{stats.thisWeekTotal}</p>
                        </div>
                    </div>
                    <div 
                        onClick={() => navigate('/builders')}
                        className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4 cursor-pointer hover:border-green-400 hover:shadow-md transition-all group"
                    >
                        <div className="bg-green-50 p-3 rounded-lg group-hover:scale-110 transition-transform"><Users className="h-6 w-6 text-green-600" /></div>
                        <div>
                            <p className="text-sm font-medium text-gray-500">Available Builders</p>
                            <p className="text-2xl font-semibold text-gray-900">{stats.availableBuilders}</p>
                        </div>
                    </div>
                    <div 
                        onClick={() => navigate('/contracts')}
                        className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4 cursor-pointer hover:border-orange-400 hover:shadow-md transition-all group"
                    >
                        <div className="bg-orange-50 p-3 rounded-lg group-hover:scale-110 transition-transform"><FileSignature className="h-6 w-6 text-orange-600" /></div>
                        <div>
                            <p className="text-sm font-medium text-gray-500">Pending Contracts</p>
                            <p className="text-2xl font-semibold text-gray-900">{stats.pendingContracts}</p>
                        </div>
                    </div>
                    <div 
                        onClick={() => navigate('/invoices')}
                        className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4 cursor-pointer hover:border-purple-400 hover:shadow-md transition-all group"
                    >
                        <div className="bg-purple-50 p-3 rounded-lg group-hover:scale-110 transition-transform"><Receipt className="h-6 w-6 text-purple-600" /></div>
                        <div>
                            <p className="text-sm font-medium text-gray-500">Unpaid Invoices</p>
                            <p className="text-2xl font-semibold text-gray-900">{stats.unpaidInvoices}</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 w-full max-w-7xl">
                    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm min-h-[350px] flex flex-col">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
                                New Projects {chartWeekOffset === 0 ? '(Current 14 Days)' : `(Week -${chartWeekOffset * 2})`}
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
                        <div className="flex-1 w-full relative min-h-[250px]">
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

                    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm min-h-[350px] flex flex-col items-center">
                        <h3 className="text-sm font-semibold mb-2 uppercase tracking-wider text-gray-500 w-full text-left">Project Breakdown</h3>
                        <div className="flex-1 w-full relative flex items-center justify-center min-h-[250px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={pieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={100}
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
        </div>
    );
};

export default Dashboard;
