import { Search, Loader2, Filter, FileText, ChevronLeft, ChevronRight, Package, File } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { generateCustomProjectId } from '../utils/projectIds';
import StatusBadge from '../components/StatusBadge';
import PackWorkspace from './PackWorkspace';

const ProjectPacks = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    const [loading, setLoading] = useState(true);
    const [projects, setProjects] = useState([]);
    const [isClosing, setIsClosing] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    
    // Read from URL params
    const searchQuery = searchParams.get('q') || '';
    const filterStatus = searchParams.get('filter') || 'Pack Required';

    const STATUS_OPTIONS = ['Pack Required', 'Pack Created', 'Pack Sent'];
    
    const updateFilter = (status) => {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set('filter', status);
        nextParams.set('page', '1'); // Reset to page 1 on filter
        setSearchParams(nextParams);
    };

    const updateSearch = (q) => {
        const nextParams = new URLSearchParams(searchParams);
        if (q) nextParams.set('q', q);
        else nextParams.delete('q');
        nextParams.set('page', '1'); // Reset to page 1 on search
        setSearchParams(nextParams);
    };

    const currentPage = parseInt(searchParams.get('page') || '1');
    const setCurrentPage = (page) => {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set('page', page.toString());
        setSearchParams(nextParams);
    };

    const itemsPerPage = 20;

    useEffect(() => {
        const q = query(collection(db, 'projects'), orderBy('timestamp', 'desc'));
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

    useEffect(() => {
        // Any reset logic needed? setCurrentPage is now derived from URL.
    }, [searchQuery, filterStatus]);

    let filteredProjects = projects.filter(p => {
        const searchTerms = searchQuery.toLowerCase();
        const matchesSearch = p.address?.toLowerCase().includes(searchTerms) ||
            p.description?.toLowerCase().includes(searchTerms) ||
            p.reference?.toLowerCase().includes(searchTerms);

        const matchesStatus = filterStatus === 'All' 
            ? STATUS_OPTIONS.includes(p.status)
            : p.status === filterStatus;

        return matchesSearch && matchesStatus;
    });

    const totalPages = Math.ceil(filteredProjects.length / itemsPerPage);
    const paginatedProjects = filteredProjects.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const workspaceId = searchParams.get('id');
    useEffect(() => {
        if (workspaceId) {
            const t = setTimeout(() => setIsOpen(true), 20);
            return () => clearTimeout(t);
        } else {
            setIsOpen(false);
        }
    }, [workspaceId]);

    const openWorkspace = (p) => {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set('id', p.id);
        setSearchParams(nextParams);
    };

    const closeWorkspace = () => {
        setIsClosing(true);
        setIsOpen(false);
        setTimeout(() => {
            const nextParams = new URLSearchParams(searchParams);
            nextParams.delete('id');
            setSearchParams(nextParams);
            setIsClosing(false);
        }, 480);
    };

    return (
        <div className="w-full relative flex flex-col h-full overflow-hidden">
            <header className="mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shrink-0">
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight text-[#0f172a]">Project Packs</h1>
                    <p className="mt-1.5 text-sm text-gray-500">Manage required and created project packs.</p>
                </div>
            </header>

            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col flex-1 min-h-0 relative z-0">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 border-b border-gray-100 p-4 bg-white shrink-0">
                    <div className="relative flex-1 w-full max-w-sm">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search by address, description..."
                            value={searchQuery}
                            onChange={(e) => updateSearch(e.target.value)}
                            className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm focus:border-[#0f172a] focus:outline-none focus:ring-1 focus:ring-[#0f172a]"
                        />
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <select value={filterStatus} onChange={(e) => updateFilter(e.target.value)} className="rounded-lg border border-gray-300 py-2.5 px-3 text-sm focus:border-[#0f172a] focus:outline-none bg-white font-medium">
                            <option value="All">All Pack Statuses</option>
                            {STATUS_OPTIONS.map(status => (
                                <option key={status} value={status}>{status}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="flex-1 overflow-auto mini-scroll">
                    <table className="w-full text-left text-sm text-gray-600">
                        <thead className="bg-gray-50 text-xs uppercase text-gray-500 sticky top-0 z-10 shadow-sm border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-4 font-medium">Address</th>
                                <th className="px-6 py-4 font-medium">Finalised Pack</th>
                                <th className="px-6 py-4 font-medium w-32">Status</th>
                                <th className="px-6 py-4 font-medium w-32">Decided</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                            {loading ? (
                                <tr><td colSpan="4" className="px-6 py-8 text-center text-sm text-gray-500"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-gray-400" />Loading project packs...</td></tr>
                            ) : filteredProjects.length === 0 ? (
                                <tr><td colSpan="4" className="px-6 py-8 text-center text-sm text-gray-500">No project packs found matching your criteria.</td></tr>
                            ) : (
                                paginatedProjects.map((project) => (
                                    <tr key={project.id} onClick={() => openWorkspace(project)} className="hover:bg-gray-50/50 cursor-pointer transition-colors group">
                                        <td className="px-6 py-4 font-medium text-[#0f172a]">
                                            <div className="group-hover:text-blue-700 transition-colors">{project.address}</div>
                                            <div className="flex flex-col gap-1.5 mt-2">
                                                <div className="text-[10px] text-gray-800 font-bold flex items-center gap-1 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-300 shadow-sm w-fit" title="Project Pack ID">
                                                    <FileText className="h-2.5 w-2.5" /> 
                                                    {project.customId || generateCustomProjectId(project.address, project.reference, project.coordinates)}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {project.finishedProjectPack ? (
                                                <a href={project.finishedProjectPack.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs text-emerald-700 font-bold flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 transition-colors px-2.5 py-1.5 rounded-lg border border-emerald-200 shadow-sm w-fit truncate max-w-[250px]" title="Finalised Project Pack">
                                                    <Package className="h-3.5 w-3.5 shrink-0" />
                                                    <span className="truncate">{project.finishedProjectPack.name}</span>
                                                </a>
                                            ) : (
                                                <div className="text-xs text-gray-400 font-medium flex items-center gap-1.5 px-2.5 py-1.5 border border-dashed border-gray-300 rounded-lg w-fit">
                                                    <FileText className="h-3.5 w-3.5" />
                                                    Missing Project Pack
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <StatusBadge status={project.status} />
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-gray-500">{project.dateDecided ? new Date(project.dateDecided).toLocaleDateString() : 'N/A'}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {totalPages > 1 && (
                    <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-3 sm:px-6 shrink-0">
                        <span className="text-sm text-gray-700">Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium">{Math.min(currentPage * itemsPerPage, filteredProjects.length)}</span> of <span className="font-medium">{filteredProjects.length}</span> results</span>
                        <div className="flex gap-2">
                            <button onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1} className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"><ChevronLeft className="h-4 w-4 mr-1" /> Prev</button>
                            <button onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50">Next <ChevronRight className="h-4 w-4 ml-1" /></button>
                        </div>
                    </div>
                )}
            </div>

            {/* Slide-in Workspace Overlay */}
            {(workspaceId || isClosing) && (
                <div 
                    className={`absolute inset-0 z-[100] transition-all duration-500 ease-[cubic-bezier(0.2,0,0,1)] ${(isOpen && !isClosing) ? 'translate-x-0' : 'translate-x-full'}`}
                >
                    <div className="h-full w-full bg-white shadow-2xl overflow-hidden">
                        <PackWorkspace id={workspaceId} onClose={closeWorkspace} />
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProjectPacks;
