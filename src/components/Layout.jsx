import Sidebar from './Sidebar';
import { Menu } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import Logo from '../assets/LogoColoured.png';
import AudioRecorder from './AudioRecorder';

const Layout = ({ children }) => {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <div className="flex bg-gray-50 h-screen overflow-hidden font-sans text-[#0f172a]">
            {/* Mobile overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[9998] md:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar wrapper */}
            <div className={`fixed inset-y-0 left-0 z-[9999] transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 transition duration-300 ease-in-out`}>
                <Sidebar onClose={() => setSidebarOpen(false)} />
            </div>

            {/* Main content */}
            <main className={`flex-1 flex flex-col h-screen w-full min-w-0 overflow-hidden ${sidebarOpen ? 'hidden md:flex' : 'flex'}`}>
                {/* Mobile header */}
                <div className="md:hidden flex items-center p-4 bg-white border-b border-gray-200 shrink-0">
                    <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2 mr-2 text-gray-600 hover:bg-gray-100 rounded-md">
                        <Menu className="h-6 w-6" />
                    </button>
                    <Link to="/" className="flex items-center gap-2 overflow-hidden">
                        <img src={Logo} alt="Benchmark" className="h-9 w-9 object-contain shrink-0" />
                        <span className="font-semibold text-[17px] truncate text-[#0f172a]">Benchmark Intel</span>
                    </Link>
                </div>
                <div className="p-4 md:p-8 flex-1 overflow-hidden flex flex-col min-h-0">
                    {children}
                </div>
                <AudioRecorder />
            </main>
        </div>
    );
};

export default Layout;
