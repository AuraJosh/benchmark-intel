import { Link, useLocation } from 'react-router-dom';
import { Home, Map as MapIcon, Users, LogOut, Loader2, Network, ClipboardList, LayoutDashboard, FileSignature, Receipt, MessageSquare, Package, X, TrendingUp, CheckCircle } from 'lucide-react';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import Logo from '../assets/LogoColoured.png';

const Sidebar = ({ onClose }) => {
    const location = useLocation();

    const handleLogout = () => {
        signOut(auth);
        if (onClose) onClose();
    };

    const navItems = [
        { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
        { label: 'Productivity', icon: CheckCircle, path: '/productivity' },
        { label: 'Projects', icon: Home, path: '/projects' },
        { label: 'Project Packs', icon: Package, path: '/packs' },
        { label: 'Builders', icon: Users, path: '/builders' },
        { label: 'Routing', icon: MapIcon, path: '/routing' },
        { label: 'Contracts', icon: FileSignature, path: '/contracts' },
        { label: 'Invoices', icon: Receipt, path: '/invoices' },
        { label: 'Finance', icon: TrendingUp, path: '/finance' },
        { label: 'Correspondence', icon: MessageSquare, path: '/correspondence' },
        { label: 'Capture Logs', icon: ClipboardList, path: '/captures' },
    ];

    return (
        <div className="flex w-64 flex-col border-r border-gray-200 bg-white h-full min-h-screen md:h-screen relative overflow-hidden">
            {/* Mobile close button */}
            <button 
                onClick={onClose}
                className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full md:hidden z-50"
            >
                <X className="h-6 w-6" />
            </button>

            <Link 
                to="/" 
                onClick={() => onClose && onClose()}
                className="flex h-15 items-center border-b border-gray-100 px-6 mt-3 mb-3 gap-3 hover:bg-gray-50 transition-colors"
            >
                <img src={Logo} alt="Benchmark Intelligence" className="h-11 w-11 object-contain" />
                <span className="text-[17px] font-semibold leading-tight tracking-tight text-[#0f172a]">Benchmark<br />Intelligence</span>
            </Link>

            <nav className="flex-1 space-y-1 pt-1 px-3 pb-2 overflow-y-auto mini-scroll">
                {navItems.map((item) => {
                    const isActive = location.pathname === item.path;
                    return (
                        <Link
                            key={item.label}
                            to={item.path}
                            onClick={() => onClose && onClose()}
                            target={item.external ? "_blank" : undefined}
                            rel={item.external ? "noopener noreferrer" : undefined}
                            className={`flex items-center gap-3 rounded-lg px-3 py-[11px] text-sm font-medium transition-colors ${isActive && !item.external
                                ? 'bg-blue-50 text-[#0284c7]'
                                : 'text-gray-600 hover:bg-gray-100 hover:text-[#0f172a]'
                                }`}
                        >
                            <item.icon className={`h-5 w-5 ${isActive && !item.external ? 'text-[#0284c7]' : 'text-gray-400'}`} />
                            {item.label}
                        </Link>
                    );
                })}
            </nav>

            <div className="border-t border-gray-100 p-3">
                <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-[11px] text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-700 transition-colors"
                >
                    <LogOut className="h-5 w-5 text-gray-400" />
                    Sign Out
                </button>
            </div>
        </div>
    );
};

export default Sidebar;
