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
import html2pdf from 'html2pdf.js';
import { BadgeHelp } from 'lucide-react';

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

const REVENUE_CATEGORIES = [
    'Commission', 'Consultancy', 'Referral', 'Retainer', 'Other Revenue',
];

const EXPENSE_CATEGORIES = [
    { label: 'Software', deductible: 'Fully', impact: '19-25% CT relief', code: '7506' },
    { label: 'Office', deductible: 'Fully', impact: '19-25% CT relief', code: '7200' },
    { label: 'Travel', deductible: 'Fully', impact: '19-25% CT relief', code: '7400' },
    { label: 'Marketing', deductible: 'Fully', impact: '19-25% CT relief', code: '7500' },
    { label: 'Insurance', deductible: 'Fully', impact: '19-25% CT relief', code: '7600' },
    { label: 'Equipment', deductible: 'Partial', impact: 'Capital Allowance AIA', code: '0030' },
    { label: 'Entertaining', deductible: 'None', impact: '0% Tax Relief', code: '7450' },
    { label: 'Fines', deductible: 'None', impact: '0% Tax Relief', code: '7900' },
    { label: 'Utilities', deductible: 'Fully', impact: '19-25% CT relief', code: '7100' },
    { label: 'Legal/Acc', deductible: 'Fully', impact: '19-25% CT relief', code: '7601' },
    { label: 'Other', deductible: 'Depends', impact: 'Review for CT relief', code: '7999' },
];

const WAGE_TYPES = ['Salary', 'Bonus', 'Contract', 'PAYE'];
const DIVIDEND_TYPES = ['Interim', 'Final'];

// ──────────────────────────────────────────────
// Tab enum
// ──────────────────────────────────────────────
const TABS = {
    OVERVIEW: 'overview',
    REVENUE: 'revenue',
    EXPENSES: 'expenses',
    WAGES: 'wages',
    DIVIDENDS: 'dividends',
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

    // ── UK Tax Year Helper ──
    const isInTaxYear = (dateStr, yearStart = 2026) => {
        if (!dateStr) return false;
        const d = new Date(dateStr);
        const start = new Date(yearStart, 3, 6); // April 6
        const end = new Date(yearStart + 1, 3, 5, 23, 59, 59); // April 5
        return d >= start && d <= end;
    };

    // Data
    const [revenue, setRevenue] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [wages, setWages] = useState([]);
    const [dividends, setDividends] = useState([]);
    const [loading, setLoading] = useState(true);

    // UI
    const [search, setSearch] = useState('');
    const [filterMonth, setFilterMonth] = useState(''); // '' = all
    const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));
    const [filterTaxYear, setFilterTaxYear] = useState('2026'); // April 2026 - April 2027

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

    // ── Document Generation ──
    const generateDocument = (item, type) => {
        const isDiv = type === 'dividend';
        const content = document.createElement('div');
        content.style.padding = '40px';
        content.style.fontFamily = 'Arial, sans-serif';
        content.innerHTML = `
            <div style="border: 2px solid #000; padding: 30px;">
                <h1 style="text-align: center; margin-bottom: 30px;">${isDiv ? 'DIVIDEND VOUCHER' : 'PAYSLIP'}</h1>
                <div style="display: flex; justify-content: space-between; margin-bottom: 40px;">
                    <div>
                        <p><strong>Company:</strong> Benchmark Intelligence</p>
                        <p><strong>Date:</strong> ${new Date(item.date).toLocaleDateString('en-GB')}</p>
                    </div>
                    <div style="text-align: right;">
                        <p><strong>No:</strong> ${item.id.slice(-6).toUpperCase()}</p>
                    </div>
                </div>
                <div style="margin-bottom: 40px;">
                    <p><strong>${isDiv ? 'Shareholder' : 'Employee'}:</strong> ${isDiv ? item.shareholder : item.staffName}</p>
                    <p><strong>Description:</strong> ${item.description}</p>
                </div>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 40px;">
                    <tr style="border-bottom: 2px solid #eee;">
                        <th style="text-align: left; padding: 10px;">Description</th>
                        <th style="text-align: right; padding: 10px;">Amount</th>
                    </tr>
                    <tr>
                        <td style="padding: 10px;">${isDiv ? (item.dividendType || 'Interim') + ' Dividend' : 'Salary / Payment'}</td>
                        <td style="text-align: right; padding: 10px;">${fmt(item.amount)}</td>
                    </tr>
                </table>
                <div style="text-align: center; margin-top: 100px; font-size: 10px; color: #999;">
                    <p>This is a legal document required for HMRC records.</p>
                    <p>Benchmark Intelligence Software - Registered in England & Wales</p>
                </div>
            </div>
        `;

        const opt = {
            margin: 10,
            filename: `${isDiv ? 'Dividend_Voucher' : 'Payslip'}_${item.id.slice(-4)}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        html2pdf().set(opt).from(content).save();
    };

    useEffect(() => {
        const unsub1 = onSnapshot(
            query(collection(db, 'fin_revenue'), orderBy('date', 'desc')),
            (snap) => setRevenue(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        );
        const unsub2 = onSnapshot(
            query(collection(db, 'fin_expenses'), orderBy('date', 'desc')),
            (snap) => setExpenses(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        );
        const unsub3 = onSnapshot(
            query(collection(db, 'fin_wages'), orderBy('date', 'desc')),
            (snap) => setWages(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        );
        const unsub4 = onSnapshot(
            query(collection(db, 'fin_dividends'), orderBy('date', 'desc')),
            (snap) => {
                setDividends(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
                setLoading(false);
            }
        );
        return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
    }, []);

    // ── Open add modal ──
    const openAdd = (type) => {
        setAddType(type);
        setEditItem(null);
        let cat = '';
        if (type === 'revenue') cat = REVENUE_CATEGORIES[0];
        if (type === 'expense') cat = EXPENSE_CATEGORIES[0].label;
        if (type === 'dividend') cat = 'Interim';
        setForm({ ...emptyForm, category: cat, wageType: type === 'wage' ? 'Salary' : '' });
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
            shareholder: item.shareholder || '',
            dividendType: item.dividendType || 'Interim',
            nominalCode: item.nominalCode || '',
            isFixedAsset: !!item.isFixedAsset,
        });
        setShowAddModal(true);
    };

    // ── Save ──
    const handleSave = async () => {
        if (!form.description || !form.amount || !form.date) return;
        setSaving(true);
        const colMap = { revenue: 'fin_revenue', expense: 'fin_expenses', wage: 'fin_wages', dividend: 'fin_dividends' };
        const col = colMap[addType];
        
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
        } else if (addType === 'dividend') {
            payload.shareholder = form.shareholder.trim();
            payload.dividendType = form.dividendType;
        } else if (addType === 'expense') {
            payload.nominalCode = form.nominalCode;
            payload.isFixedAsset = form.isFixedAsset;
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
        const colMap = { revenue: 'fin_revenue', expense: 'fin_expenses', wage: 'fin_wages', dividend: 'fin_dividends' };
        await deleteDoc(doc(db, colMap[deleteTarget.type], deleteTarget.id));
        setDeleteTarget(null);
    };

    // ── Filtering helpers ──
    const applyFilters = (arr) => {
        return arr.filter((item) => {
            const matchSearch = search
                ? (item.description || '').toLowerCase().includes(search.toLowerCase()) ||
                  (item.category || '').toLowerCase().includes(search.toLowerCase()) ||
                  (item.staffName || '').toLowerCase().includes(search.toLowerCase()) ||
                  (item.shareholder || '').toLowerCase().includes(search.toLowerCase())
                : true;
            
            // Priority: Tax Year Filter
            if (filterTaxYear) {
                if (!isInTaxYear(item.date, parseInt(filterTaxYear))) return false;
            } else {
                const itemDate = item.date ? new Date(item.date) : null;
                const matchMonth = filterMonth && itemDate
                    ? itemDate.getMonth() === parseInt(filterMonth)
                    : true;
                const matchYear = filterYear && itemDate
                    ? itemDate.getFullYear() === parseInt(filterYear)
                    : true;
                if (!matchMonth || !matchYear) return false;
            }
            return matchSearch;
        });
    };

    const filteredRevenue = applyFilters(revenue);
    const filteredExpenses = applyFilters(expenses);
    const filteredWages = applyFilters(wages);
    const filteredDividends = applyFilters(dividends);

    // ── Tax Engine ──
    const calcTaxStats = () => {
        const rev = filteredRevenue.reduce((s, i) => s + (i.amount || 0), 0);
        const exp = filteredExpenses.reduce((s, i) => s + (i.amount || 0), 0);
        const wg = filteredWages.reduce((s, i) => s + (i.amount || 0), 0);
        const div = filteredDividends.reduce((s, i) => s + (i.amount || 0), 0);

        // Deductible logic: only fully/partially deductible expenses reduce CT
        // For simplicity: (Revenue - Deductible Expenses - Wages) * CT Rate
        const deductibleExp = filteredExpenses
            .filter(e => {
                const cat = EXPENSE_CATEGORIES.find(c => c.label === e.category);
                return cat && cat.deductible !== 'None';
            })
            .reduce((s, e) => s + (e.amount || 0), 0);

        const profitBeforeTax = rev - deductibleExp - wg;
        
        let ctRate = 0.19;
        if (profitBeforeTax > 250000) ctRate = 0.25;
        else if (profitBeforeTax > 50000) {
            // Marginal relief simplifier: linear scale between 19 and 25
            const excess = profitBeforeTax - 50000;
            const weight = Math.min(excess / 200000, 1);
            ctRate = 0.19 + (weight * 0.06);
        }
        
        const ctReserve = profitBeforeTax > 0 ? profitBeforeTax * ctRate : 0;
        const distributableProfit = (rev - exp - wg) - ctReserve;
        
        // VAT Tracker (£90k threshold)
        const rollingTurnover = filteredRevenue.reduce((s, i) => s + (i.amount || 0), 0); // Simplified to current filter
        const vatRegistrationPoint = 90000;
        const distToVAT = vatRegistrationPoint - rollingTurnover;

        return {
            rev, exp, wg, div, 
            profitBeforeTax, ctReserve, ctRate,
            distributableProfit,
            rollingTurnover, distToVAT
        };
    };

    const stats = calcTaxStats();

    // ── Chart data (last 6 months) ──
    const chartData = (() => {
        const now = new Date();
        return Array.from({ length: 6 }, (_, i) => {
            const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
            const m = d.getMonth();
            const y = d.getFullYear();
            const inSum = revenue
                .filter((x) => { const xd = x.date ? new Date(x.date) : null; return xd && xd.getMonth() === m && xd.getFullYear() === y; })
                .reduce((s, x) => s + (x.amount || 0), 0);
            const outSum = expenses
                .filter((x) => { const xd = x.date ? new Date(x.date) : null; return xd && xd.getMonth() === m && xd.getFullYear() === y; })
                .reduce((s, x) => s + (x.amount || 0), 0);
            const wgSum = wages
                .filter((x) => { const xd = x.date ? new Date(x.date) : null; return xd && xd.getMonth() === m && xd.getFullYear() === y; })
                .reduce((s, x) => s + (x.amount || 0), 0);
            return { month: MONTH_NAMES[m], revenue: inSum, expenses: outSum + wgSum, profit: inSum - outSum - wgSum };
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
                        Smart tax tracking, dividends & high-efficiency payroll.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => openAdd('revenue')}
                        className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 md:px-4 md:py-2.5 text-xs md:text-sm font-medium text-white shadow-sm hover:bg-emerald-700 transition-colors"
                    >
                        <ArrowUpRight className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Revenue</span>
                    </button>
                    <button
                        onClick={() => openAdd('expense')}
                        className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-2 md:px-4 md:py-2.5 text-xs md:text-sm font-medium text-white shadow-sm hover:bg-red-600 transition-colors"
                    >
                        <ArrowDownRight className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Expense</span>
                    </button>
                    <button
                        onClick={() => openAdd('wage')}
                        className="flex items-center gap-1.5 rounded-lg bg-[#0f172a] px-3 py-2 md:px-4 md:py-2.5 text-xs md:text-sm font-medium text-white shadow-sm hover:bg-black transition-colors"
                    >
                        <Users className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Wage</span>
                    </button>
                    <button
                        onClick={() => openAdd('dividend')}
                        className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 md:px-4 md:py-2.5 text-xs md:text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition-colors"
                    >
                        <DollarSign className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Dividend</span>
                    </button>
                </div>
            </header>

            {/* ── Filters bar ── */}
            <div className="flex flex-wrap items-center gap-2 mb-4 shrink-0">
                <div className="relative flex-1 min-w-[160px] max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search description, category, staff..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-[#0f172a] focus:outline-none focus:ring-1 focus:ring-[#0f172a]"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-400 ml-2" />
                    <select
                        value={filterTaxYear}
                        onChange={(e) => {
                            setFilterTaxYear(e.target.value);
                            setFilterMonth('');
                            setFilterYear('');
                        }}
                        className="rounded-lg border border-gray-300 py-2 px-3 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-[#0f172a] bg-emerald-50 text-emerald-700"
                    >
                        <option value="">Standard View</option>
                        <option value="2024">Tax Year 24/25</option>
                        <option value="2025">Tax Year 25/26</option>
                        <option value="2026">Tax Year 26/27</option>
                    </select>
                </div>
                {!filterTaxYear && (
                    <>
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
                    </>
                )}
            </div>

            {/* ── Tabs ── */}
            <div className="flex gap-1 mb-4 shrink-0 border-b border-gray-200">
                {[
                    { key: TABS.OVERVIEW, label: 'Overview' },
                    { key: TABS.REVENUE, label: `Revenue (${filteredRevenue.length})` },
                    { key: TABS.EXPENSES, label: `Expenses (${filteredExpenses.length})` },
                    { key: TABS.WAGES, label: `Wages (${filteredWages.length})` },
                    { key: TABS.DIVIDENDS, label: `Dividends (${filteredDividends.length})` },
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
                        {/* Primary KPIs */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <StatCard
                                label="Total Revenue"
                                value={fmt(stats.rev)}
                                icon={TrendingUp}
                                color={{ bg: 'bg-emerald-50', icon: 'text-emerald-600' }}
                                sub={`${filteredRevenue.length} entries`}
                            />
                            <StatCard
                                label="True Balance"
                                value={fmt(stats.rev - stats.exp - stats.wg - stats.div - stats.ctReserve)}
                                icon={Wallet}
                                color={{ bg: 'bg-blue-600 text-white', icon: 'text-blue-100' }}
                                sub="Bank minus Corp Tax Owed"
                            />
                            <StatCard
                                label="Corp Tax Reserve"
                                value={fmt(stats.ctReserve)}
                                icon={Briefcase}
                                color={{ bg: 'bg-orange-50', icon: 'text-orange-600' }}
                                sub={`Reserved for HMRC (@${(stats.ctRate * 100).toFixed(1)}%)`}
                            />
                            <StatCard
                                label="Distributable"
                                value={fmt(stats.distributableProfit)}
                                icon={DollarSign}
                                color={{ bg: stats.distributableProfit > 0 ? 'bg-indigo-50' : 'bg-red-50', icon: stats.distributableProfit > 0 ? 'text-indigo-600' : 'text-red-500' }}
                                sub="Available for Dividends"
                            />
                        </div>

                        {/* Secondary Indicators */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">VAT Registered Point</p>
                                    <p className="text-lg font-black text-[#0f172a]">{fmt(stats.rollingTurnover)} / {fmt(90000)}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-bold text-gray-500 uppercase">Distance</p>
                                    <p className={`text-sm font-bold ${stats.distToVAT < 10000 ? 'text-red-500' : 'text-emerald-600'}`}>
                                        {stats.distToVAT > 0 ? `${fmt(stats.distToVAT)} away` : 'Reached'}
                                    </p>
                                </div>
                            </div>
                            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Yearly Dividends</p>
                                    <p className="text-lg font-black text-[#0f172a]">{fmt(stats.div)}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-bold text-gray-500 uppercase">Allowance Left</p>
                                    <p className="text-sm font-bold text-indigo-600">{fmt(Math.max(0, 500 - stats.div))}</p>
                                </div>
                            </div>
                            <div className="bg-[#0f172a] text-white rounded-xl p-4 shadow-sm flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] font-bold text-blue-300 uppercase tracking-widest">Optimal Salary Tracker</p>
                                    <p className="text-lg font-black">{fmt(stats.wg)}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-bold text-blue-200 uppercase">Max Allowance</p>
                                    <p className="text-sm font-bold text-emerald-400">{fmt(12570)}</p>
                                </div>
                            </div>
                        </div>

                        {/* Charts */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Bar chart: Revenue vs Spend */}
                            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">
                                    Revenue vs Expenses (Last 6 Months)
                                </h3>
                                <div className="h-52">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 11 }} tickFormatter={(v) => `£${(v/1000).toFixed(0)}k`} />
                                            <RechartsTooltip
                                                formatter={(v, name) => [fmt(v), name === 'revenue' ? 'Revenue' : 'Costs']}
                                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                            />
                                            <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={32} />
                                            <Bar dataKey="expenses" fill="#f87171" radius={[4, 4, 0, 0]} maxBarSize={32} />
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
                                    ...filteredRevenue.slice(0, 3).map((i) => ({ ...i, _type: 'revenue' })),
                                    ...filteredExpenses.slice(0, 3).map((i) => ({ ...i, _type: 'expense' })),
                                    ...filteredWages.slice(0, 2).map((i) => ({ ...i, _type: 'wage' })),
                                    ...filteredDividends.slice(0, 2).map((i) => ({ ...i, _type: 'dividend' })),
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
                                {filteredRevenue.length + filteredExpenses.length + filteredWages.length + filteredDividends.length === 0 && (
                                    <p className="py-10 text-center text-sm text-gray-400">No transactions for this period.</p>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── REVENUE TAB ── */}
                {activeTab === TABS.REVENUE && (
                    <EntriesTable
                        rows={filteredRevenue}
                        type="revenue"
                        emptyLabel="No revenue entries found."
                        onAdd={() => openAdd('revenue')}
                        onEdit={(item) => openEdit(item, 'revenue')}
                        onDelete={(item) => setDeleteTarget({ ...item, type: 'revenue' })}
                        onGenerate={generateDocument}
                        totalLabel="Total Revenue"
                        total={stats.rev}
                    />
                )}

                {/* ── EXPENSES TAB ── */}
                {activeTab === TABS.EXPENSES && (
                    <EntriesTable
                        rows={filteredExpenses}
                        type="expense"
                        emptyLabel="No expense entries found."
                        onAdd={() => openAdd('expense')}
                        onEdit={(item) => openEdit(item, 'expense')}
                        onDelete={(item) => setDeleteTarget({ ...item, type: 'expense' })}
                        onGenerate={generateDocument}
                        totalLabel="Total Expenses"
                        total={stats.exp}
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
                        onGenerate={generateDocument}
                        totalLabel="Total Wages"
                        total={stats.wg}
                    />
                )}

                {/* ── DIVIDENDS TAB ── */}
                {activeTab === TABS.DIVIDENDS && (
                    <EntriesTable
                        rows={filteredDividends}
                        type="dividend"
                        emptyLabel="No dividend entries found."
                        onAdd={() => openAdd('dividend')}
                        onEdit={(item) => openEdit(item, 'dividend')}
                        onDelete={(item) => setDeleteTarget({ ...item, type: 'dividend' })}
                        onGenerate={generateDocument}
                        totalLabel="Total Dividends Paid"
                        total={stats.div}
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
                            addType === 'revenue' ? 'bg-emerald-50' : addType === 'expense' ? 'bg-red-50' : addType === 'dividend' ? 'bg-indigo-50' : 'bg-gray-50'
                        }`}>
                            <h3 className="text-base font-bold text-[#0f172a] flex items-center gap-2">
                                {addType === 'revenue' && <><TrendingUp className="h-4 w-4 text-emerald-600" /> {editItem ? 'Edit Revenue' : 'Log Revenue'}</>}
                                {addType === 'expense' && <><TrendingDown className="h-4 w-4 text-red-500" /> {editItem ? 'Edit Expense' : 'Log Expense'}</>}
                                {addType === 'wage' && <><Users className="h-4 w-4 text-purple-600" /> {editItem ? 'Edit Wage' : 'Log Wage'}</>}
                                {addType === 'dividend' && <><DollarSign className="h-4 w-4 text-indigo-600" /> {editItem ? 'Edit Dividend' : 'Log Dividend'}</>}
                            </h3>
                            <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200 transition-colors">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Modal body */}
                        <div className="px-6 py-5 space-y-4 overflow-y-auto max-h-[70vh]">
                            {/* Optimal Salary Toggle */}
                            {addType === 'wage' && !editItem && (
                                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <AlertCircle className="h-4 w-4 text-blue-600" />
                                        <span className="text-xs font-bold text-blue-700">Optimal Salary Optimizer</span>
                                    </div>
                                    <button 
                                        onClick={() => {
                                            setForm(p => ({
                                                ...p,
                                                description: `Optimal Salary Period - ${MONTH_NAMES[new Date().getMonth()]}`,
                                                amount: '1047.50',
                                                wageType: 'Salary'
                                            }));
                                        }}
                                        className="text-[10px] bg-blue-600 text-white px-2 py-1 rounded font-bold uppercase"
                                    >
                                        Auto-Fill (£1,047.50)
                                    </button>
                                </div>
                            )}

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

                            {/* Dividend-specific: shareholder */}
                            {addType === 'dividend' && (
                                <div>
                                    <label className={labelCls}>Shareholder Name</label>
                                    <input
                                        type="text"
                                        value={form.shareholder}
                                        onChange={(e) => setForm((p) => ({ ...p, shareholder: e.target.value }))}
                                        className={inputCls}
                                        placeholder="e.g. Jane Doe"
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
                                        addType === 'revenue'
                                            ? 'e.g. Commission — 12 Sycamore Rd'
                                            : addType === 'expense'
                                            ? 'e.g. Monthly Adobe subscription'
                                            : addType === 'dividend'
                                            ? 'e.g. Q1 Interim Payment'
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
                                {addType === 'dividend' && parseFloat(form.amount) > stats.distributableProfit && (
                                    <p className="mt-1 text-[10px] text-red-500 font-bold flex items-center gap-1">
                                        <AlertCircle className="h-3 w-3" /> Exceeds Distributable Profits ({fmt(stats.distributableProfit)})
                                    </p>
                                )}
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

                            {/* Category / Type */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                    ) : addType === 'dividend' ? (
                                        <select
                                            value={form.dividendType}
                                            onChange={(e) => setForm((p) => ({ ...p, dividendType: e.target.value }))}
                                            className={inputCls}
                                        >
                                            {DIVIDEND_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    ) : (
                                        <select
                                            value={form.category}
                                            onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                                            className={inputCls}
                                        >
                                            {(addType === 'revenue' ? REVENUE_CATEGORIES : EXPENSE_CATEGORIES.map(c => c.label)).map((c) => (
                                                <option key={c} value={c}>{c}</option>
                                            ))}
                                        </select>
                                    )}
                                </div>

                                {addType === 'expense' && (
                                    <div>
                                        <label className={labelCls}>Tax Treatment</label>
                                        <div className="text-xs p-2.5 bg-gray-50 border border-gray-200 rounded-md">
                                            {(() => {
                                                const cat = EXPENSE_CATEGORIES.find(c => c.label === form.category);
                                                return cat ? (
                                                    <div className="flex flex-col gap-1">
                                                        <span className="font-bold text-gray-700">{cat.deductible} Deductible</span>
                                                        <span className="text-emerald-600 font-medium">{cat.impact}</span>
                                                        <span className="text-gray-400">Nominal: {cat.code}</span>
                                                    </div>
                                                ) : 'Select category';
                                            })()}
                                        </div>
                                    </div>
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
                                    placeholder="Any additional details... (e.g. HMRC filing hints)"
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
    const isRevenue = type === 'revenue';
    const isWage = type === 'wage';
    const isDividend = type === 'dividend';
    return (
        <div className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 group transition-colors">
            <div className={`p-2 rounded-lg shrink-0 ${isRevenue ? 'bg-emerald-50' : isWage ? 'bg-purple-50' : isDividend ? 'bg-indigo-50' : 'bg-red-50'}`}>
                {isRevenue ? <ArrowUpRight className="h-4 w-4 text-emerald-600" /> :
                 isWage ? <Users className="h-4 w-4 text-purple-600" /> :
                 isDividend ? <DollarSign className="h-4 w-4 text-indigo-600" /> :
                 <ArrowDownRight className="h-4 w-4 text-red-500" />}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#0f172a] truncate">{item.description}</p>
                <div className="flex items-center gap-2 mt-0.5">
                    <CategoryBadge label={isWage ? (item.wageType || 'Wage') : isDividend ? (item.dividendType || 'Dividend') : (item.category || type)} type={type} />
                    {(item.staffName || item.shareholder) && (
                        <span className="text-[11px] text-gray-400">{item.staffName || item.shareholder}</span>
                    )}
                    {item.date && <span className="text-[11px] text-gray-400">{new Date(item.date).toLocaleDateString('en-GB')}</span>}
                </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <span className={`text-sm font-bold ${isRevenue ? 'text-emerald-600' : 'text-red-500'}`}>
                    {isRevenue ? '+' : '-'}{fmt(item.amount)}
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
const EntriesTable = ({ rows, type, emptyLabel, onAdd, onEdit, onDelete, onGenerate, totalLabel, total }) => {
    const isRevenue = type === 'revenue';
    const isWage = type === 'wage';
    const isDividend = type === 'dividend';
    const isExpense = type === 'expense';

    return (
        <div className="flex flex-col gap-4">
            {/* Footer summary */}
            <div className={`flex items-center justify-between p-4 rounded-xl border ${
                isRevenue ? 'bg-emerald-50 border-emerald-200' : isWage ? 'bg-purple-50 border-purple-200' : isDividend ? 'bg-indigo-50 border-indigo-200' : 'bg-red-50 border-red-200'
            }`}>
                <span className={`text-sm font-bold uppercase tracking-wider ${isRevenue ? 'text-emerald-700' : isWage ? 'text-purple-700' : isDividend ? 'text-indigo-700' : 'text-red-700'}`}>{totalLabel}</span>
                <span className={`text-xl font-extrabold ${isRevenue ? 'text-emerald-700' : isWage ? 'text-purple-700' : isDividend ? 'text-indigo-700' : 'text-red-700'}`}>{fmt(total)}</span>
            </div>

            {/* Table */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400">{rows.length} {rows.length === 1 ? 'entry' : 'entries'}</span>
                    <button
                        onClick={onAdd}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-colors ${
                            isRevenue ? 'bg-emerald-600 hover:bg-emerald-700' : 
                            isWage ? 'bg-[#0f172a] hover:bg-black' : 
                            isDividend ? 'bg-indigo-600 hover:bg-indigo-700' : 
                            'bg-red-500 hover:bg-red-600'}`}
                    >
                        <Plus className="h-3.5 w-3.5" /> Add {type.charAt(0).toUpperCase() + type.slice(1)}
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
                                    {(isWage || isDividend) && <th className="px-5 py-3 font-medium hidden sm:table-cell">{isWage ? 'Staff' : 'Shareholder'}</th>}
                                    <th className="px-5 py-3 font-medium hidden sm:table-cell">Category</th>
                                    <th className="px-5 py-3 font-medium hidden md:table-cell">Date</th>
                                    <th className="px-5 py-3 font-medium text-right">Amount</th>
                                    <th className="px-5 py-3 font-medium text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {rows.map((item) => {
                                    const expCat = isExpense ? EXPENSE_CATEGORIES.find(c => c.label === item.category) : null;
                                    return (
                                        <tr key={item.id} className="hover:bg-gray-50 group transition-colors">
                                            <td className="px-5 py-3.5">
                                                <div className="font-medium text-[#0f172a] truncate max-w-[200px]">{item.description}</div>
                                                {isExpense && expCat && (
                                                    <div className={`text-[10px] font-bold mt-0.5 ${expCat.deductible === 'None' ? 'text-gray-400' : 'text-emerald-600'}`}>
                                                        {expCat.impact}
                                                    </div>
                                                )}
                                                {item.notes && <div className="text-[11px] text-gray-400 truncate max-w-[200px] mt-0.5">{item.notes}</div>}
                                                {/* Mobile-only extras */}
                                                <div className="sm:hidden mt-1 flex items-center gap-2">
                                                    <CategoryBadge label={isWage ? (item.wageType || 'Wage') : isDividend ? (item.dividendType || 'Dividend') : item.category} type={type} />
                                                    {(item.staffName || item.shareholder) && <span className="text-[10px] text-gray-400">{item.staffName || item.shareholder}</span>}
                                                </div>
                                            </td>
                                            {(isWage || isDividend) && (
                                                <td className="px-5 py-3.5 hidden sm:table-cell text-gray-600">{item.staffName || item.shareholder || '—'}</td>
                                            )}
                                            <td className="px-5 py-3.5 hidden sm:table-cell">
                                                <CategoryBadge label={isWage ? (item.wageType || 'Wage') : isDividend ? (item.dividendType || 'Dividend') : (item.category || '—')} type={type} />
                                            </td>
                                            <td className="px-5 py-3.5 hidden md:table-cell text-gray-500 text-xs">
                                                {item.date ? new Date(item.date).toLocaleDateString('en-GB') : '—'}
                                            </td>
                                            <td className="px-5 py-3.5 text-right font-bold">
                                                <span className={`${isRevenue ? 'text-emerald-600' : 'text-red-500'}`}>
                                                    {isRevenue ? '+' : '-'}{fmt(item.amount)}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3.5 text-right">
                                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {isDividend && (
                                                        <button 
                                                            onClick={() => onGenerate(item, 'dividend')}
                                                            title="Generate Dividend Voucher"
                                                            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md"
                                                        >
                                                            <ReceiptText className="h-3.5 w-3.5" />
                                                        </button>
                                                    )}
                                                    {isWage && (
                                                        <button 
                                                            onClick={() => onGenerate(item, 'wage')}
                                                            title="Generate Payslip"
                                                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md"
                                                        >
                                                            <ReceiptText className="h-3.5 w-3.5" />
                                                        </button>
                                                    )}
                                                    <button onClick={() => onEdit(item)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors">
                                                        <Edit2 className="h-3.5 w-3.5" />
                                                    </button>
                                                    <button onClick={() => onDelete(item)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors">
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Finance;
