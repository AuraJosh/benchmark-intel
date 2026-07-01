import { Search, Loader2, Filter, FileText, ChevronLeft, ChevronRight, Package, File, ExternalLink } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { generateCustomProjectId } from '../utils/projectIds';
import StatusBadge from '../components/StatusBadge';
import PackWorkspace from './PackWorkspace';
import { useScrollRestoration } from '../hooks/useScrollRestoration';

const ProjectPacks = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();

    const [loading, setLoading] = useState(true);
    const [projects, setProjects] = useState([]);
    const [isClosing, setIsClosing] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    
    // Read from URL params
    const searchQuery = searchParams.get('q') || '';
    const filterStatus = searchParams.get('filter') || 'Pack Required';

    const STATUS_OPTIONS = ['Pack Required', 'Pack Created', 'Assigned'];
    
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

    const scrollContainerRef = useScrollRestoration('project-packs-list', [loading, currentPage]);

    useEffect(() => {
        let projectsData = [];
        let preApprovedData = [];
        let pLoading = true;
        let paLoading = true;

        const updateProjects = () => {
            if (!pLoading && !paLoading) {
                const combined = [...projectsData, ...preApprovedData];
                combined.sort((a, b) => {
                    const tA = a.timestamp?.toMillis ? a.timestamp.toMillis() : 0;
                    const tB = b.timestamp?.toMillis ? b.timestamp.toMillis() : 0;
                    return tB - tA;
                });
                setProjects(combined);
                setLoading(false);
            }
        };

        const unsub1 = onSnapshot(query(collection(db, 'projects'), orderBy('timestamp', 'desc')), (snapshot) => {
            projectsData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, projectType: 'normal' }));
            pLoading = false;
            updateProjects();
        });

        const unsub2 = onSnapshot(query(collection(db, 'pre_approved_projects'), orderBy('timestamp', 'desc')), (snapshot) => {
            preApprovedData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, projectType: 'preapproved' }));
            paLoading = false;
            updateProjects();
        });

        return () => {
            unsub1();
            unsub2();
        };
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

    const openWorkspace = (project) => {
        setSearchParams({ id: project.id, type: project.projectType || 'normal', view: 'workspace' });
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
                    <h1 className="text-3xl font-semibold tracking-tight text-blue-ex-dark">Project Packs</h1>
                    <p className="mt-1.5 text-sm text-grey-mid">Manage required and created project packs.</p>
                </div>
            </header>

            <div className="rounded-xl border border-grey-ex-light bg-white shadow-sm overflow-hidden flex flex-col flex-1 min-h-0 relative z-0">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 border-b border-grey-ex-light p-4 bg-white shrink-0">
                    <div className="relative flex-1 w-full max-w-sm">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-grey-light" />
                        <input
                            type="text"
                            placeholder="Search by address, description..."
                            value={searchQuery}
                            onChange={(e) => updateSearch(e.target.value)}
                            className="w-full rounded-lg border border-grey-light py-2.5 pl-10 pr-4 text-sm focus:border-blue-ex-dark focus:outline-none focus:ring-1 focus:ring-blue-ex-dark"
                        />
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <select value={filterStatus} onChange={(e) => updateFilter(e.target.value)} className="rounded-lg border border-grey-light py-2.5 px-3 text-sm focus:border-blue-ex-dark focus:outline-none bg-white font-medium">
                            <option value="All">All Pack Statuses</option>
                            {STATUS_OPTIONS.map(status => (
                                <option key={status} value={status}>{status}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div ref={scrollContainerRef} className="flex-1 overflow-auto mini-scroll">
                    <table className="w-full text-left text-sm text-grey-mid">
                        <thead className="bg-grey-accent text-xs uppercase text-grey-dark sticky top-0 z-10 shadow-sm border-b border-grey-ex-light">
                            <tr>
                                <th className="px-6 py-4 font-medium">Address</th>
                                <th className="px-6 py-4 font-medium">Finalised Pack</th>
                                <th className="px-6 py-4 font-medium w-32">Status</th>
                                <th className="px-6 py-4 font-medium w-32">Decided</th>
                                <th className="w-12"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                            {loading ? (
                                <tr><td colSpan="5" className="px-6 py-8 text-center text-sm text-grey-mid"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-grey-light" />Loading project packs...</td></tr>
                            ) : filteredProjects.length === 0 ? (
                                <tr><td colSpan="5" className="px-6 py-8 text-center text-sm text-grey-mid">No project packs found matching your criteria.</td></tr>
                            ) : (
                                paginatedProjects.map((project) => (
                                    <tr key={project.id} onClick={() => openWorkspace(project)} className="hover:bg-grey-ex-light/50 cursor-pointer transition-colors group">
                                        <td className="px-6 py-4 font-medium text-blue-ex-dark">
                                            <div className="group-hover:text-blue-dark transition-colors">{project.address}</div>
                                            <div className="flex flex-col gap-1.5 mt-2">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <div className="text-[10px] text-grey-dark font-bold flex items-center gap-1 bg-grey-accent px-1.5 py-0.5 rounded border border-grey-light shadow-sm w-fit" title="Project Pack ID">
                                                        <FileText className="h-2.5 w-2.5" /> 
                                                        {project.customId || generateCustomProjectId(project.address, project.reference, project.coordinates)}
                                                    </div>
                                                    {project.projectType === 'preapproved' && (
                                                        <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded" style={{ color: '#142E4F', backgroundColor: '#142E4F15' }}>
                                                            Pre-Approved
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {project.finishedProjectPack ? (
                                                <a href={project.finishedProjectPack.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs text-green-dark font-bold flex items-center gap-1.5 bg-green-ex-light hover:bg-green-ex-light transition-colors px-2.5 py-1.5 rounded-lg border border-green-ex-light shadow-sm w-fit truncate max-w-[250px]" title="Finalised Project Pack">
                                                    <Package className="h-3.5 w-3.5 shrink-0" />
                                                    <span className="truncate">{project.finishedProjectPack.name}</span>
                                                </a>
                                            ) : (
                                                <div className="text-xs text-grey-light font-medium flex items-center gap-1.5 px-2.5 py-1.5 border border-dashed border-grey-light rounded-lg w-fit">
                                                    <FileText className="h-3.5 w-3.5" />
                                                    Missing Project Pack
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <StatusBadge status={project.status} />
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-grey-mid">{project.dateDecided ? new Date(project.dateDecided).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'N/A'}</td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const currentFullUrl = location.pathname + location.search;
                                                    const basePath = project.projectType === 'preapproved' ? '/pre-approved' : '/projects';
                                                    navigate(`${basePath}?id=${project.id}&backTo=${encodeURIComponent(currentFullUrl)}`);
                                                }}
                                                className="p-2 text-grey-dark hover:text-blue-mid hover:bg-blue-ex-light rounded-lg transition-colors"
                                                title="View Project Details"
                                            >
                                                <ExternalLink className="h-4 w-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {totalPages > 1 && (
                    <div className="flex items-center justify-between border-t border-grey-ex-light bg-grey-accent px-4 py-3 sm:px-6 shrink-0">
                        <span className="text-sm text-grey-dark">Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium">{Math.min(currentPage * itemsPerPage, filteredProjects.length)}</span> of <span className="font-medium">{filteredProjects.length}</span> results</span>
                        <div className="flex gap-2">
                            <button onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1} className="relative inline-flex items-center rounded-md border border-grey-light bg-white px-3 py-2 text-sm font-medium text-grey-dark hover:bg-grey-ex-light disabled:opacity-50"><ChevronLeft className="h-4 w-4 mr-1" /> Prev</button>
                            <button onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} className="relative inline-flex items-center rounded-md border border-grey-light bg-white px-3 py-2 text-sm font-medium text-grey-dark hover:bg-grey-ex-light disabled:opacity-50">Next <ChevronRight className="h-4 w-4 ml-1" /></button>
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
                        <PackWorkspace id={workspaceId} type={searchParams.get('type')} onClose={closeWorkspace} />
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProjectPacks;
