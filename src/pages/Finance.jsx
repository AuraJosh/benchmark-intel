import { useState, useEffect, useRef } from 'react';
import {
    collection, query, orderBy, onSnapshot,
    addDoc, updateDoc, deleteDoc, doc, serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import {
    TrendingUp, TrendingDown, Wallet, Plus, X, Save, Trash2,
    Search, ChevronDown, ChevronUp, DollarSign, Users, ArrowUpRight,
    ArrowDownRight, Filter, Calendar, Tag, MoreVertical, Edit2,
    CheckCircle2, Loader2, PoundSterling, Briefcase, ReceiptText, AlertCircle
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
    ResponsiveContainer, LineChart, Line
} from 'recharts';

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
const fmt = (n) =>
    `£${(Number(n) || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const getDt = (ts) => {
    if (!ts) return null;
    if (ts.toDate) return ts.toDate();
    if (ts instanceof Date) return ts;
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
};

const INCOME_CATEGORIES = [
    'Commission', 'Consultancy', 'Referral', 'Retainer', 'Other Income',
];

const OUTGOING_CATEGORIES = [
    'Software', 'Office', 'Travel', 'Marketing', 'Legal', 'Accountancy',
    'Equipment', 'Utilities', 'Insurance', 'Subscriptions', 'Materials', 'Other',
];

const WAGE_TYPES = ['Salary', 'Bonus', 'Contract', 'PAYE'];

// ──────────────────────────────────────────────
// Tab enum
// ──────────────────────────────────────────────
const TABS = {
    OVERVIEW: 'overview',
    INCOME: 'income',
    OUTGOINGS: 'outgoings',
    WAGES: 'wages',
};

// ──────────────────────────────────────────────
// Modal helpers
// ──────────────────────────────────────────────
const ModalBackdrop = ({ onClose }) => (
    <div
        className="fixed inset-0 bg-gray-800/60 backdrop-blur-sm z-[78]"
        onClick={onClose}
    />
);

const inputCls =
    'w-full rounded-md border border-gray-300 py-2.5 px-3 text-sm focus:border-[#0f172a] focus:outline-none focus:ring-1 focus:ring-[#0f172a] bg-white';

const labelCls = 'block text-sm font-semibold text-gray-700 mb-1.5';

// ──────────────────────────────────────────────
// Small stat card
// ──────────────────────────────────────────────
const StatCard = ({ label, value, icon: Icon, color, sub }) => (
    <div className={`bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex items-center gap-4`}>
        <div className={`p-3 rounded-xl ${color.bg}`}>
            <Icon className={`h-5 w-5 ${color.icon}`} />
        </div>
        <div className="min-w-0">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
            <p className="text-xl font-bold text-[#0f172a] truncate">{value}</p>
            {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
        </div>
    </div>
);

// ──────────────────────────────────────────────
// Category badge
// ──────────────────────────────────────────────
const CategoryBadge = ({ label, type }) => {
    const color =
        type === 'income'
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : type === 'outgoing'
            ? 'bg-red-50 text-red-700 border-red-200'
            : 'bg-purple-50 text-purple-700 border-purple-200';
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${color}`}>
            {label}
        </span>
    );
};

// ──────────────────────────────────────────────
// Main Finance Page
// ──────────────────────────────────────────────
const Finance = () => {
    const [activeTab, setActiveTab] = useState(TABS.OVERVIEW);

    // Data
    const [incomes, setIncomes] = useState([]);
    const [outgoings, setOutgoings] = useState([]);
    const [wages, setWages] = useState([]);
    const [loading, setLoading] = useState(true);

    // UI
    const [search, setSearch] = useState('');
    const [filterMonth, setFilterMonth] = useState(''); // '' = all
    const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));

    // Modals
    const [showAddModal, setShowAddModal] = useState(false);
    const [addType, setAddType] = useState('income'); // 'income' | 'outgoing' | 'wage'
    const [editItem, setEditItem] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);

    // Form
    const emptyForm = {
        description: '',
        amount: '',
        category: '',
        date: new Date().toISOString().slice(0, 10),
        notes: '',
        // wages only
        staffName: '',
        wageType: 'Salary',
    };
    const [form, setForm] = useState(emptyForm);
    const [saving, setSaving] = useState(false);

    // ── Firestore subscriptions ──
    useEffect(() => {
        const unsub1 = onSnapshot(
            query(collection(db, 'fin_income'), orderBy('date', 'desc')),
            (snap) => setIncomes(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        );
        const unsub2 = onSnapshot(
            query(collection(db, 'fin_outgoings'), orderBy('date', 'desc')),
            (snap) => setOutgoings(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        );
        const unsub3 = onSnapshot(
            query(collection(db, 'fin_wages'), orderBy('date', 'desc')),
            (snap) => {
                setWages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
                setLoading(false);
            }
        );
        return () => { unsub1(); unsub2(); unsub3(); };
    }, []);

    // ── Open add modal ──
    const openAdd = (type) => {
        setAddType(type);
        setEditItem(null);
        setForm({ ...emptyForm, category: type === 'income' ? INCOME_CATEGORIES[0] : type === 'outgoing' ? OUTGOING_CATEGORIES[0] : '', wageType: 'Salary' });
        setShowAddModal(true);
    };

    // ── Open edit modal ──
    const openEdit = (item, type) => {
        setAddType(type);
        setEditItem(item);
        setForm({
            description: item.description || '',
            amount: String(item.amount || ''),
            category: item.category || '',
            date: item.date || new Date().toISOString().slice(0, 10),
            notes: item.notes || '',
            staffName: item.staffName || '',
            wageType: item.wageType || 'Salary',
        });
        setShowAddModal(true);
    };

    // ── Save ──
    const handleSave = async () => {
        if (!form.description || !form.amount || !form.date) return;
        setSaving(true);
        const col = addType === 'income' ? 'fin_income' : addType === 'outgoing' ? 'fin_outgoings' : 'fin_wages';
        const payload = {
            description: form.description.trim(),
            amount: parseFloat(form.amount),
            category: form.category,
            date: form.date,
            notes: form.notes.trim(),
            updatedAt: serverTimestamp(),
        };
        if (addType === 'wage') {
            payload.staffName = form.staffName.trim();
            payload.wageType = form.wageType;
        }
        try {
            if (editItem) {
                await updateDoc(doc(db, col, editItem.id), payload);
            } else {
                await addDoc(collection(db, col), { ...payload, createdAt: serverTimestamp() });
            }
            setShowAddModal(false);
        } catch (e) {
            console.error(e);
        } finally {
            setSaving(false);
        }
    };

    // ── Delete ──
    const handleDelete = async () => {
        if (!deleteTarget) return;
        const col = deleteTarget.type === 'income' ? 'fin_income' : deleteTarget.type === 'outgoing' ? 'fin_outgoings' : 'fin_wages';
        await deleteDoc(doc(db, col, deleteTarget.id));
        setDeleteTarget(null);
    };

    // ── Filtering helpers ──
    const applyFilters = (arr) => {
        return arr.filter((item) => {
            const matchSearch = search
                ? (item.description || '').toLowerCase().includes(search.toLowerCase()) ||
                  (item.category || '').toLowerCase().includes(search.toLowerCase()) ||
                  (item.staffName || '').toLowerCase().includes(search.toLowerCase())
                : true;
            const itemDate = item.date ? new Date(item.date) : null;
            const matchMonth = filterMonth && itemDate
                ? itemDate.getMonth() === parseInt(filterMonth)
                : true;
            const matchYear = filterYear && itemDate
                ? itemDate.getFullYear() === parseInt(filterYear)
                : true;
            return matchSearch && matchMonth && matchYear;
        });
    };

    const filteredIncome = applyFilters(incomes);
    const filteredOutgoings = applyFilters(outgoings);
    const filteredWages = applyFilters(wages);

    // ── Summary figures (filtered) ──
    const totalIncome = filteredIncome.reduce((s, i) => s + (i.amount || 0), 0);
    const totalOutgoings = filteredOutgoings.reduce((s, i) => s + (i.amount || 0), 0);
    const totalWages = filteredWages.reduce((s, i) => s + (i.amount || 0), 0);
    const netProfit = totalIncome - totalOutgoings - totalWages;

    // ── Chart data (last 6 months) ──
    const chartData = (() => {
        const now = new Date();
        return Array.from({ length: 6 }, (_, i) => {
            const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
            const m = d.getMonth();
            const y = d.getFullYear();
            const inSum = incomes
                .filter((x) => { const xd = x.date ? new Date(x.date) : null; return xd && xd.getMonth() === m && xd.getFullYear() === y; })
                .reduce((s, x) => s + (x.amount || 0), 0);
            const outSum = outgoings
                .filter((x) => { const xd = x.date ? new Date(x.date) : null; return xd && xd.getMonth() === m && xd.getFullYear() === y; })
                .reduce((s, x) => s + (x.amount || 0), 0);
            const wgSum = wages
                .filter((x) => { const xd = x.date ? new Date(x.date) : null; return xd && xd.getMonth() === m && xd.getFullYear() === y; })
                .reduce((s, x) => s + (x.amount || 0), 0);
            return { month: MONTH_NAMES[m], income: inSum, outgoings: outSum + wgSum, profit: inSum - outSum - wgSum };
        });
    })();

    // ── Year options ──
    const yearOptions = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
        );
    }

    return (
        <div className="w-full relative flex flex-col h-full overflow-hidden">
            {/* ── Header ── */}
            <header className="mb-3 md:mb-5 flex flex-row items-center justify-between gap-2 shrink-0">
                <div>
                    <h1 className="text-xl md:text-3xl font-semibold tracking-tight text-[#0f172a]">Finance</h1>
                    <p className="mt-0.5 text-xs md:text-sm text-gray-500 hidden md:block">
                        Track income, outgoings &amp; wages in one place.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => openAdd('income')}
                        className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 md:px-4 md:py-2.5 text-xs md:text-sm font-medium text-white shadow-sm hover:bg-emerald-700 transition-colors"
                    >
                        <ArrowUpRight className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Income</span>
                    </button>
                    <button
                        onClick={() => openAdd('outgoing')}
                        className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-2 md:px-4 md:py-2.5 text-xs md:text-sm font-medium text-white shadow-sm hover:bg-red-600 transition-colors"
                    >
                        <ArrowDownRight className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Outgoing</span>
                    </button>
                    <button
                        onClick={() => openAdd('wage')}
                        className="flex items-center gap-1.5 rounded-lg bg-[#0f172a] px-3 py-2 md:px-4 md:py-2.5 text-xs md:text-sm font-medium text-white shadow-sm hover:bg-black transition-colors"
                    >
                        <Users className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Wage</span>
                    </button>
                </div>
            </header>

            {/* ── Filters bar ── */}
            <div className="flex flex-wrap items-center gap-2 mb-4 shrink-0">
                <div className="relative flex-1 min-w-[160px] max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-[#0f172a] focus:outline-none focus:ring-1 focus:ring-[#0f172a]"
                    />
                </div>
                <select
                    value={filterMonth}
                    onChange={(e) => setFilterMonth(e.target.value)}
                    className="rounded-lg border border-gray-300 py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#0f172a] bg-white"
                >
                    <option value="">All Months</option>
                    {MONTH_NAMES.map((m, i) => <option key={m} value={i}>{m}</option>)}
                </select>
                <select
                    value={filterYear}
                    onChange={(e) => setFilterYear(e.target.value)}
                    className="rounded-lg border border-gray-300 py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#0f172a] bg-white"
                >
                    <option value="">All Years</option>
                    {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
            </div>

            {/* ── Tabs ── */}
            <div className="flex gap-1 mb-4 shrink-0 border-b border-gray-200">
                {[
                    { key: TABS.OVERVIEW, label: 'Overview' },
                    { key: TABS.INCOME, label: `Income (${filteredIncome.length})` },
                    { key: TABS.OUTGOINGS, label: `Outgoings (${filteredOutgoings.length})` },
                    { key: TABS.WAGES, label: `Wages (${filteredWages.length})` },
                ].map(({ key, label }) => (
                    <button
                        key={key}
                        onClick={() => setActiveTab(key)}
                        className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                            activeTab === key
                                ? 'border-[#0284c7] text-[#0284c7]'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/* ── Main content area ── */}
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">

                {/* ── OVERVIEW TAB ── */}
                {activeTab === TABS.OVERVIEW && (
                    <div className="space-y-6">
                        {/* KPIs */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <StatCard
                                label="Total Income"
                                value={fmt(totalIncome)}
                                icon={TrendingUp}
                                color={{ bg: 'bg-emerald-50', icon: 'text-emerald-600' }}
                                sub={`${filteredIncome.length} entries`}
                            />
                            <StatCard
                                label="Total Outgoings"
                                value={fmt(totalOutgoings)}
                                icon={TrendingDown}
                                color={{ bg: 'bg-red-50', icon: 'text-red-500' }}
                                sub={`${filteredOutgoings.length} entries`}
                            />
                            <StatCard
                                label="Total Wages"
                                value={fmt(totalWages)}
                                icon={Users}
                                color={{ bg: 'bg-purple-50', icon: 'text-purple-600' }}
                                sub={`${filteredWages.length} entries`}
                            />
                            <StatCard
                                label="Net Profit"
                                value={fmt(netProfit)}
                                icon={Wallet}
                                color={{ bg: netProfit >= 0 ? 'bg-blue-50' : 'bg-orange-50', icon: netProfit >= 0 ? 'text-blue-600' : 'text-orange-500' }}
                                sub={netProfit >= 0 ? 'Profitable' : 'In the red'}
                            />
                        </div>

                        {/* Charts */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Bar chart: Income vs Spend */}
                            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">
                                    Income vs Spend (Last 6 Months)
                                </h3>
                                <div className="h-52">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 11 }} tickFormatter={(v) => `£${(v/1000).toFixed(0)}k`} />
                                            <RechartsTooltip
                                                formatter={(v, name) => [fmt(v), name === 'income' ? 'Income' : 'Costs']}
                                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                            />
                                            <Bar dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={32} />
                                            <Bar dataKey="outgoings" fill="#f87171" radius={[4, 4, 0, 0]} maxBarSize={32} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Line chart: Net Profit trend */}
                            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">
                                    Net Profit Trend
                                </h3>
                                <div className="h-52">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 11 }} tickFormatter={(v) => `£${(v/1000).toFixed(0)}k`} />
                                            <RechartsTooltip
                                                formatter={(v) => [fmt(v), 'Net Profit']}
                                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                            />
                                            <Line type="monotone" dataKey="profit" stroke="#0284c7" strokeWidth={2.5} dot={{ r: 4, fill: '#0284c7' }} activeDot={{ r: 6 }} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>

                        {/* Quick recent entries */}
                        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Recent Transactions</h3>
                            </div>
                            <div className="divide-y divide-gray-50">
                                {[
                                    ...filteredIncome.slice(0, 3).map((i) => ({ ...i, _type: 'income' })),
                                    ...filteredOutgoings.slice(0, 3).map((i) => ({ ...i, _type: 'outgoing' })),
                                    ...filteredWages.slice(0, 2).map((i) => ({ ...i, _type: 'wage' })),
                                ]
                                    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                                    .slice(0, 8)
                                    .map((item) => (
                                        <TransactionRow
                                            key={`${item._type}-${item.id}`}
                                            item={item}
                                            type={item._type}
                                            onEdit={() => openEdit(item, item._type)}
                                            onDelete={() => setDeleteTarget({ ...item, type: item._type })}
                                        />
                                    ))}
                                {filteredIncome.length + filteredOutgoings.length + filteredWages.length === 0 && (
                                    <p className="py-10 text-center text-sm text-gray-400">No transactions yet. Use the buttons above to add entries.</p>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── INCOME TAB ── */}
                {activeTab === TABS.INCOME && (
                    <EntriesTable
                        rows={filteredIncome}
                        type="income"
                        emptyLabel="No income entries found."
                        onAdd={() => openAdd('income')}
                        onEdit={(item) => openEdit(item, 'income')}
                        onDelete={(item) => setDeleteTarget({ ...item, type: 'income' })}
                        totalLabel="Total Income"
                        total={totalIncome}
                    />
                )}

                {/* ── OUTGOINGS TAB ── */}
                {activeTab === TABS.OUTGOINGS && (
                    <EntriesTable
                        rows={filteredOutgoings}
                        type="outgoing"
                        emptyLabel="No outgoing entries found."
                        onAdd={() => openAdd('outgoing')}
                        onEdit={(item) => openEdit(item, 'outgoing')}
                        onDelete={(item) => setDeleteTarget({ ...item, type: 'outgoing' })}
                        totalLabel="Total Outgoings"
                        total={totalOutgoings}
                    />
                )}

                {/* ── WAGES TAB ── */}
                {activeTab === TABS.WAGES && (
                    <EntriesTable
                        rows={filteredWages}
                        type="wage"
                        emptyLabel="No wage entries found."
                        onAdd={() => openAdd('wage')}
                        onEdit={(item) => openEdit(item, 'wage')}
                        onDelete={(item) => setDeleteTarget({ ...item, type: 'wage' })}
                        totalLabel="Total Wages"
                        total={totalWages}
                    />
                )}
            </div>

            {/* ── ADD / EDIT MODAL ── */}
            {showAddModal && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
                    <ModalBackdrop onClose={() => setShowAddModal(false)} />
                    <div className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl z-[81] overflow-hidden">
                        {/* Modal header */}
                        <div className={`px-6 py-4 border-b border-gray-100 flex items-center justify-between ${
                            addType === 'income' ? 'bg-emerald-50' : addType === 'outgoing' ? 'bg-red-50' : 'bg-gray-50'
                        }`}>
                            <h3 className="text-base font-bold text-[#0f172a] flex items-center gap-2">
                                {addType === 'income' && <><TrendingUp className="h-4 w-4 text-emerald-600" /> {editItem ? 'Edit Income' : 'Log Income'}</>}
                                {addType === 'outgoing' && <><TrendingDown className="h-4 w-4 text-red-500" /> {editItem ? 'Edit Outgoing' : 'Log Outgoing'}</>}
                                {addType === 'wage' && <><Users className="h-4 w-4 text-purple-600" /> {editItem ? 'Edit Wage' : 'Log Wage'}</>}
                            </h3>
                            <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200 transition-colors">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Modal body */}
                        <div className="px-6 py-5 space-y-4 overflow-y-auto max-h-[70vh]">
                            {/* Wage-specific: staff name */}
                            {addType === 'wage' && (
                                <div>
                                    <label className={labelCls}>Staff Name</label>
                                    <input
                                        type="text"
                                        value={form.staffName}
                                        onChange={(e) => setForm((p) => ({ ...p, staffName: e.target.value }))}
                                        className={inputCls}
                                        placeholder="e.g. John Smith"
                                    />
                                </div>
                            )}

                            {/* Description */}
                            <div>
                                <label className={labelCls}>
                                    {addType === 'wage' ? 'Description / Period' : 'Description'}
                                </label>
                                <input
                                    type="text"
                                    value={form.description}
                                    onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                                    className={inputCls}
                                    placeholder={
                                        addType === 'income'
                                            ? 'e.g. Commission — 12 Sycamore Rd'
                                            : addType === 'outgoing'
                                            ? 'e.g. Monthly Adobe subscription'
                                            : 'e.g. April 2026 salary'
                                    }
                                />
                            </div>

                            {/* Amount */}
                            <div>
                                <label className={labelCls}>Amount (£)</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">£</span>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={form.amount}
                                        onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                                        className={`${inputCls} pl-8`}
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>

                            {/* Date */}
                            <div>
                                <label className={labelCls}>Date</label>
                                <input
                                    type="date"
                                    value={form.date}
                                    onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                                    className={inputCls}
                                />
                            </div>

                            {/* Category */}
                            <div>
                                <label className={labelCls}>Category</label>
                                {addType === 'wage' ? (
                                    <select
                                        value={form.wageType}
                                        onChange={(e) => setForm((p) => ({ ...p, wageType: e.target.value }))}
                                        className={inputCls}
                                    >
                                        {WAGE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                ) : (
                                    <select
                                        value={form.category}
                                        onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                                        className={inputCls}
                                    >
                                        {(addType === 'income' ? INCOME_CATEGORIES : OUTGOING_CATEGORIES).map((c) => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                )}
                            </div>

                            {/* Notes */}
                            <div>
                                <label className={labelCls}>Notes <span className="text-gray-400 font-normal">(optional)</span></label>
                                <textarea
                                    value={form.notes}
                                    onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                                    rows={2}
                                    className={`${inputCls} resize-none`}
                                    placeholder="Any additional details..."
                                />
                            </div>
                        </div>

                        {/* Modal footer */}
                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                            <button
                                onClick={() => setShowAddModal(false)}
                                className="rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving || !form.description || !form.amount || !form.date}
                                className="flex items-center gap-2 rounded-md bg-[#0f172a] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                {editItem ? 'Save Changes' : 'Add Entry'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── DELETE CONFIRM MODAL ── */}
            {deleteTarget && (
                <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
                    <ModalBackdrop onClose={() => setDeleteTarget(null)} />
                    <div className="relative w-full max-w-sm bg-white rounded-xl shadow-2xl z-[91] overflow-hidden">
                        <div className="px-6 py-5 flex flex-col items-center text-center gap-3">
                            <div className="p-3 bg-red-50 rounded-full">
                                <AlertCircle className="h-6 w-6 text-red-500" />
                            </div>
                            <h3 className="font-bold text-gray-900">Delete Entry?</h3>
                            <p className="text-sm text-gray-500">
                                <span className="font-semibold text-gray-700">"{deleteTarget.description}"</span> will be permanently removed.
                            </p>
                        </div>
                        <div className="px-6 pb-6 flex gap-3">
                            <button
                                onClick={() => setDeleteTarget(null)}
                                className="flex-1 rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDelete}
                                className="flex-1 rounded-md bg-red-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-600"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ──────────────────────────────────────────────
// Transaction row (used on overview quick list)
// ──────────────────────────────────────────────
const TransactionRow = ({ item, type, onEdit, onDelete }) => {
    const isIncome = type === 'income';
    const isWage = type === 'wage';
    return (
        <div className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 group transition-colors">
            <div className={`p-2 rounded-lg shrink-0 ${isIncome ? 'bg-emerald-50' : isWage ? 'bg-purple-50' : 'bg-red-50'}`}>
                {isIncome ? <ArrowUpRight className="h-4 w-4 text-emerald-600" /> :
                 isWage ? <Users className="h-4 w-4 text-purple-600" /> :
                 <ArrowDownRight className="h-4 w-4 text-red-500" />}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#0f172a] truncate">{item.description}</p>
                <div className="flex items-center gap-2 mt-0.5">
                    <CategoryBadge label={isWage ? (item.wageType || 'Wage') : (item.category || type)} type={type} />
                    {item.staffName && <span className="text-[11px] text-gray-400">{item.staffName}</span>}
                    {item.date && <span className="text-[11px] text-gray-400">{new Date(item.date).toLocaleDateString('en-GB')}</span>}
                </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <span className={`text-sm font-bold ${isIncome ? 'text-emerald-600' : 'text-red-500'}`}>
                    {isIncome ? '+' : '-'}{fmt(item.amount)}
                </span>
                <div className="hidden group-hover:flex items-center gap-1">
                    <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors">
                        <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>
        </div>
    );
};

// ──────────────────────────────────────────────
// Full entries table (Income / Outgoings / Wages tabs)
// ──────────────────────────────────────────────
const EntriesTable = ({ rows, type, emptyLabel, onAdd, onEdit, onDelete, totalLabel, total }) => {
    const isIncome = type === 'income';
    const isWage = type === 'wage';

    return (
        <div className="flex flex-col gap-4">
            {/* Footer summary */}
            <div className={`flex items-center justify-between p-4 rounded-xl border ${
                isIncome ? 'bg-emerald-50 border-emerald-200' : isWage ? 'bg-purple-50 border-purple-200' : 'bg-red-50 border-red-200'
            }`}>
                <span className={`text-sm font-bold uppercase tracking-wider ${isIncome ? 'text-emerald-700' : isWage ? 'text-purple-700' : 'text-red-700'}`}>{totalLabel}</span>
                <span className={`text-xl font-extrabold ${isIncome ? 'text-emerald-700' : isWage ? 'text-purple-700' : 'text-red-700'}`}>{fmt(total)}</span>
            </div>

            {/* Table */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400">{rows.length} {rows.length === 1 ? 'entry' : 'entries'}</span>
                    <button
                        onClick={onAdd}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-colors ${isIncome ? 'bg-emerald-600 hover:bg-emerald-700' : isWage ? 'bg-[#0f172a] hover:bg-black' : 'bg-red-500 hover:bg-red-600'}`}
                    >
                        <Plus className="h-3.5 w-3.5" /> Add {type === 'income' ? 'Income' : type === 'outgoing' ? 'Outgoing' : 'Wage'}
                    </button>
                </div>
                {rows.length === 0 ? (
                    <p className="py-12 text-center text-sm text-gray-400">{emptyLabel}</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 text-xs uppercase text-gray-400 border-b border-gray-200">
                                <tr>
                                    <th className="px-5 py-3 font-medium">Description</th>
                                    {isWage && <th className="px-5 py-3 font-medium hidden sm:table-cell">Staff</th>}
                                    <th className="px-5 py-3 font-medium hidden sm:table-cell">Category</th>
                                    <th className="px-5 py-3 font-medium hidden md:table-cell">Date</th>
                                    <th className="px-5 py-3 font-medium text-right">Amount</th>
                                    <th className="px-5 py-3 font-medium text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {rows.map((item) => (
                                    <tr key={item.id} className="hover:bg-gray-50 group transition-colors">
                                        <td className="px-5 py-3.5">
                                            <div className="font-medium text-[#0f172a] truncate max-w-[200px]">{item.description}</div>
                                            {item.notes && <div className="text-[11px] text-gray-400 truncate max-w-[200px] mt-0.5">{item.notes}</div>}
                                            {/* Mobile-only extras */}
                                            <div className="sm:hidden mt-1 flex items-center gap-2">
                                                <CategoryBadge label={isWage ? (item.wageType || 'Wage') : item.category} type={type} />
                                                {item.staffName && <span className="text-[10px] text-gray-400">{item.staffName}</span>}
                                            </div>
                                        </td>
                                        {isWage && (
                                            <td className="px-5 py-3.5 hidden sm:table-cell text-gray-600">{item.staffName || '—'}</td>
                                        )}
                                        <td className="px-5 py-3.5 hidden sm:table-cell">
                                            <CategoryBadge label={isWage ? (item.wageType || 'Wage') : (item.category || '—')} type={type} />
                                        </td>
                                        <td className="px-5 py-3.5 hidden md:table-cell text-gray-500 text-xs">
                                            {item.date ? new Date(item.date).toLocaleDateString('en-GB') : '—'}
                                        </td>
                                        <td className="px-5 py-3.5 text-right">
                                            <span className={`font-bold ${isIncome ? 'text-emerald-600' : 'text-red-500'}`}>
                                                {isIncome ? '+' : '-'}{fmt(item.amount)}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3.5 text-right">
                                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => onEdit(item)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors">
                                                    <Edit2 className="h-3.5 w-3.5" />
                                                </button>
                                                <button onClick={() => onDelete(item)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors">
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Finance;
