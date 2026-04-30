import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, getDocs, where, deleteDoc } from 'firebase/firestore';
import { MapPin, Navigation, Map as MapIcon, Loader2, User, Users, ExternalLink, Calendar, CheckCircle2, ChevronRight, Save, Trash2, X, Activity, Eye, EyeOff, ClipboardList } from 'lucide-react';
import ConfirmationModal from '../components/ConfirmationModal';
import { useScrollRestoration } from '../hooks/useScrollRestoration';


const STATUS_OPTIONS = ['New', 'Pack Required', 'Pack Created', 'Quoted', 'Won', 'Paid', 'Revisit', 'Archive', 'Assigned'];

const Routing = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    
    const [routes, setRoutes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedRoute, setSelectedRoute] = useState(null);
    const [routeProjects, setRouteProjects] = useState([]);
    
    // Form state
    const [startAddress, setStartAddress] = useState('');
    const [endAddress, setEndAddress] = useState('');
    const [assignedTo, setAssignedTo] = useState('');
    const [isCalculating, setIsCalculating] = useState(false);
    const [showSuccessFeedback, setShowSuccessFeedback] = useState(false);
    
    // Delete Confirmation Modal state
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [routeToDelete, setRouteToDelete] = useState(null);
    const [hideCompleted, setHideCompleted] = useState(() => localStorage.getItem('benchmark_routing_hideCompleted') === 'true');
    const [searchQuery, setSearchQuery] = useState(''); 

    const routesListRef = useScrollRestoration('routes-list', [loading]);
    const stopsListRef = useScrollRestoration(`stops-list-${selectedRoute?.id || 'none'}`, [!selectedRoute || routeProjects.length === 0]);
    const rightPanelRef = useScrollRestoration(`routing-panel-${selectedRoute?.id || 'none'}`, [!selectedRoute]);
    


    // Map and routing modifiers
    const [isRoundTrip, setIsRoundTrip] = useState(true);
    const [useTraffic, setUseTraffic] = useState(true);
    const mapRef = useRef(null);
    const googleMap = useRef(null);
    const directionsRenderer = useRef(null);

    // Google Places Autocomplete refs
    const startInputRef = useRef(null);
    const endInputRef = useRef(null);
    const startAutocomplete = useRef(null);
    const endAutocomplete = useRef(null);
    const activeMarkers = useRef([]);
    const [mapReady, setMapReady] = useState(false);

    // Manage manual project markers
    useEffect(() => {
        if (!googleMap.current || !routeProjects.length) {
            activeMarkers.current.forEach(m => m.setMap(null));
            activeMarkers.current = [];
            return;
        }

        // Clear existing markers
        activeMarkers.current.forEach(m => m.setMap(null));
        activeMarkers.current = [];

        // Determine if we should show labels (order)
        const sortedProjects = [...routeProjects].sort((a, b) => {
            const indexA = selectedRoute.projectIds?.indexOf(a.id) ?? 999;
            const indexB = selectedRoute.projectIds?.indexOf(b.id) ?? 999;
            return indexA - indexB;
        });

        // Add markers for each project
        const bounds = new window.google.maps.LatLngBounds();
        let validCoordsFound = false;

        sortedProjects.forEach((proj, idx) => {
            const lat = parseFloat(proj.coordinates?.lat || proj.latitude);
            const lng = parseFloat(proj.coordinates?.lng || proj.longitude);

            if (!isNaN(lat) && !isNaN(lng)) {
                const pos = { lat, lng };
                const marker = new window.google.maps.Marker({
                    position: pos,
                    map: googleMap.current,
                    label: {
                        text: (idx + 1).toString(),
                        color: 'white',
                        fontWeight: 'bold'
                    },
                    title: proj.title || proj.name,
                    icon: {
                        path: window.google.maps.SymbolPath.CIRCLE,
                        fillColor: '#3b82f6',
                        fillOpacity: 1,
                        strokeColor: '#ffffff',
                        strokeWeight: 2,
                        scale: 12,
                    }
                });

                bounds.extend(pos);
                activeMarkers.current.push(marker);
                validCoordsFound = true;
            }
        });

        // Auto-center map if markers are present
        if (validCoordsFound && !directionsRenderer.current?.getDirections()) {
            googleMap.current.fitBounds(bounds);
            // Don't zoom in too far for a single marker
            if (activeMarkers.current.length === 1) {
                googleMap.current.setZoom(14);
            }
        }

    }, [routeProjects, selectedRoute?.projectIds, mapReady]);


    // Initialize map — delayed so slide-over animation completes before Google
    // tries to measure the div dimensions (zero-size div = blank map).
    // Initialize map and library
    useEffect(() => {
        if (!selectedRoute) {
            googleMap.current = null;
            directionsRenderer.current = null;
            activeMarkers.current = [];
            setMapReady(false);
            return;
        }

        if (!window.google) return;

        const initMap = async () => {
             // Wait for the slide-over transition
            await new Promise(resolve => setTimeout(resolve, 520));
            if (!mapRef.current) return;

            try {
                // Load libraries using the modern pattern
                const { Map } = await window.google.maps.importLibrary("maps");
                const { DirectionsRenderer } = await window.google.maps.importLibrary("routes");

                googleMap.current = new Map(mapRef.current, {
                    center: { lat: 53.959965, lng: -1.087298 },
                    zoom: 12,
                    mapId: 'DEMO_MAP_ID', // Modern maps require a Map ID or 'DEMO_MAP_ID'
                    mapTypeControl: false,
                    streetViewControl: false,
                    styles: [
                        { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#e9e9e9" }, { "lightness": 17 }] },
                        { "featureType": "landscape", "elementType": "geometry", "stylers": [{ "color": "#f5f5f5" }, { "lightness": 20 }] },
                        { "featureType": "road.highway", "elementType": "geometry.fill", "stylers": [{ "color": "#ffffff" }, { "lightness": 17 }] },
                        { "featureType": "road.highway", "elementType": "geometry.stroke", "stylers": [{ "color": "#ffffff" }, { "lightness": 29 }, { "weight": 0.2 }] },
                        { "featureType": "road.arterial", "elementType": "geometry", "stylers": [{ "color": "#ffffff" }, { "lightness": 18 }] },
                        { "featureType": "road.local", "elementType": "geometry", "stylers": [{ "color": "#ffffff" }, { "lightness": 16 }] },
                        { "featureType": "poi", "elementType": "geometry", "stylers": [{ "color": "#f5f5f5" }, { "lightness": 21 }] },
                        { "featureType": "poi.park", "elementType": "geometry", "stylers": [{ "color": "#dedede" }, { "lightness": 21 }] },
                        { "elementType": "labels.text.stroke", "stylers": [{ "visibility": "on" }, { "color": "#ffffff" }, { "lightness": 16 }] },
                        { "elementType": "labels.text.fill", "stylers": [{ "saturation": 36 }, { "color": "#333333" }, { "lightness": 40 }] },
                        { "elementType": "labels.icon", "stylers": [{ "visibility": "off" }] },
                        { "featureType": "transit", "elementType": "geometry", "stylers": [{ "color": "#f2f2f2" }, { "lightness": 19 }] },
                        { "featureType": "administrative", "elementType": "geometry.fill", "stylers": [{ "color": "#fefefe" }, { "lightness": 20 }] },
                        { "featureType": "administrative", "elementType": "geometry.stroke", "stylers": [{ "color": "#fefefe" }, { "lightness": 17 }, { "weight": 1.2 }] }
                    ]
                });

                directionsRenderer.current = new DirectionsRenderer({
                    map: googleMap.current,
                    suppressMarkers: true,
                    polylineOptions: {
                        strokeColor: '#3b82f6',
                        strokeOpacity: 0.8,
                        strokeWeight: 6
                    }
                });

                // Initialize Autocomplete using the modern pattern
                const { Autocomplete } = await window.google.maps.importLibrary("places");
                
                const options = {
                    componentRestrictions: { country: 'gb' },
                    fields: ['formatted_address', 'geometry'],
                    types: ['address']
                };

                if (startInputRef.current) {
                    startAutocomplete.current = new Autocomplete(startInputRef.current, options);
                    startAutocomplete.current.addListener('place_changed', () => {
                        const place = startAutocomplete.current.getPlace();
                        const addr = place.formatted_address || startInputRef.current.value;
                        setStartAddress(addr);
                        updateDoc(doc(db, 'routes', selectedRoute.id), { startAddress: addr }).catch(console.error);
                    });
                }

                if (endInputRef.current) {
                    endAutocomplete.current = new Autocomplete(endInputRef.current, options);
                    endAutocomplete.current.addListener('place_changed', () => {
                        const place = endAutocomplete.current.getPlace();
                        const addr = place.formatted_address || endInputRef.current.value;
                        setEndAddress(addr);
                        updateDoc(doc(db, 'routes', selectedRoute.id), { endAddress: addr }).catch(console.error);
                    });
                }

                setMapReady(true);

            } catch (error) {
                console.error("Error initializing Google Maps/Places:", error);
            }
        };

        initMap();

        return () => {
            googleMap.current = null;
            directionsRenderer.current = null;
            startAutocomplete.current = null;
            endAutocomplete.current = null;
            setMapReady(false);
        };
    }, [selectedRoute?.id]);

    // Persist hideCompleted state
    useEffect(() => {
        localStorage.setItem('benchmark_routing_hideCompleted', hideCompleted);
    }, [hideCompleted]);


    useEffect(() => {
        const q = query(collection(db, 'routes'), orderBy('timestamp', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const routesData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setRoutes(routesData);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const id = searchParams.get('id');
        if (id && routes.length > 0) {
            const r = routes.find(r => r.id === id);
            if (r) {
                setSelectedRoute(r);
                setStartAddress(r.startAddress || '');
                setEndAddress(r.endAddress || '');
                setAssignedTo(r.assignedTo || '');
            }
        } else {
            setSelectedRoute(null);
            setRouteProjects([]);
        }
    }, [searchParams, routes]);

    // REAL-TIME LISTENER for the projects in the current route
    useEffect(() => {
        if (!selectedRoute?.projectIds || selectedRoute.projectIds.length === 0) {
            setRouteProjects([]);
            return;
        }

        const projectIds = selectedRoute.projectIds;
        const orderedIds = selectedRoute.projectIds; // We use projectIds for order now

        // Firestore 'in' query limit is 30. Most routes are < 30.
        // For simplicity and performance, we'll listen to projects in chunks of 30 if needed,
        // but for now let's handle the primary case.
        const q = query(collection(db, 'projects'), where('__name__', 'in', projectIds.slice(0, 30)));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            let allProjects = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            
            // Reorder based on the projectIds order in the route
            allProjects.sort((a, b) => {
                const idxA = projectIds.indexOf(a.id);
                const idxB = projectIds.indexOf(b.id);
                return idxA - idxB;
            });
            
            setRouteProjects(allProjects);
        }, (error) => {
            console.error("Error listening to route projects:", error);
        });

        return () => unsubscribe();
    }, [selectedRoute?.projectIds]);

    const handleSaveDetails = async () => {
        if (!selectedRoute) return;
        try {
            await updateDoc(doc(db, 'routes', selectedRoute.id), {
                startAddress,
                endAddress,
                assignedTo
            });
        } catch (error) {
            console.error("Error saving details:", error);
        }
    };

    const handleAssign = async (val) => {
        setAssignedTo(val);
        if (selectedRoute) {
             await updateDoc(doc(db, 'routes', selectedRoute.id), { assignedTo: val });
        }
    };

    const handleAddressChange = (val, field) => {
        if (field === 'start') setStartAddress(val);
        else setEndAddress(val);
    };


    const handleCalculateRoute = async () => {
        if (!selectedRoute || routeProjects.length === 0) return;
        if (!window.google) {
            alert("Google Maps has not loaded correctly. Please refresh the page.");
            return;
        }

        setIsCalculating(true);
        
        try {
            const directionsService = new window.google.maps.DirectionsService();

            let waypointProjects = [...routeProjects].filter(p => !p.completed);
            let actualOriginWasProject = null;
            let actualDestWasProject = null;
            let finalOrigin = startAddress;
            let finalDestination = endAddress;

            // ORIGIN: If no start address, use the first project
            if (!finalOrigin && waypointProjects.length > 0) {
                actualOriginWasProject = waypointProjects.shift();
                finalOrigin = { 
                    lat: parseFloat(actualOriginWasProject.coordinates?.lat || actualOriginWasProject.latitude), 
                    lng: parseFloat(actualOriginWasProject.coordinates?.lng || actualOriginWasProject.longitude) 
                };
            }

            // DESTINATION:
            if (isRoundTrip) {
                finalDestination = finalOrigin;
            } else if (!finalDestination && waypointProjects.length > 0) {
                actualDestWasProject = waypointProjects.pop();
                finalDestination = { 
                    lat: parseFloat(actualDestWasProject.coordinates?.lat || actualDestWasProject.latitude), 
                    lng: parseFloat(actualDestWasProject.coordinates?.lng || actualDestWasProject.longitude) 
                };
            }

            if (waypointProjects.length > 25) {
                alert("Google Maps limits optimized routes to exactly 25 mid-points. Please split this large route up.");
                setIsCalculating(false);
                return;
            }

            // Build the intermediate waypoints
            const waypoints = waypointProjects.map(p => {
                const lat = parseFloat(p.coordinates?.lat || p.latitude);
                const lng = parseFloat(p.coordinates?.lng || p.longitude);
                if (!isNaN(lat) && !isNaN(lng)) {
                    return { location: new window.google.maps.LatLng(lat, lng), stopover: true };
                }
                return null;
            }).filter(Boolean);

            const requestParams = {
                origin: finalOrigin,
                destination: finalDestination,
                waypoints: waypoints,
                optimizeWaypoints: true,
                travelMode: window.google.maps.TravelMode.DRIVING,
                drivingOptions: useTraffic ? {
                    departureTime: new Date(),
                    trafficModel: 'bestguess'
                } : undefined
            };

            const timeoutId = setTimeout(() => {
                setIsCalculating(false);
                alert("Google Maps API request timed out! Please ensure Maps JavaScript API and Directions API are enabled for your Key.");
            }, 15000);

            directionsService.route(requestParams, async (result, status) => {
                clearTimeout(timeoutId);
                try {
                    if (status === window.google.maps.DirectionsStatus.OK) {
                        if (directionsRenderer.current) {
                            directionsRenderer.current.setDirections(result);
                        }

                        const route = result.routes[0];
                        const fastOrderOrder = route.waypoint_order || []; 
                        
                        // REBUILD the list in the OPTIMIZED order
                        const finalOrderedIds = [];

                        // 1. Start Point
                        if (actualOriginWasProject) {
                            finalOrderedIds.push(actualOriginWasProject.id);
                        }

                        // 2. Optimized Middle Waypoints
                        fastOrderOrder.forEach(index => {
                            const p = waypointProjects[index];
                            if (p) finalOrderedIds.push(p.id);
                        });

                        // 3. End Point (if not round trip)
                        if (actualDestWasProject && !isRoundTrip) {
                            finalOrderedIds.push(actualDestWasProject.id);
                        }

                        // 4. Any projects that were NOT in the optimization (completed or excluded)
                        routeProjects.forEach(p => {
                            if (!finalOrderedIds.includes(p.id)) {
                                finalOrderedIds.push(p.id);
                            }
                        });

                        // SAVE THE PERFECT NEW ORDER TO FIRESTORE
                        await updateDoc(doc(db, 'routes', selectedRoute.id), {
                            projectIds: finalOrderedIds
                        });
                        
                        setShowSuccessFeedback(true);
                        setTimeout(() => setShowSuccessFeedback(false), 2000);
                        
                    } else {
                        console.error("Directions Failure:", status);
                        alert("Could not calculate route: " + status);
                    }
                } catch (err) {
                    console.error("Error processing route callback:", err);
                } finally {
                    setIsCalculating(false);
                }
            });
            
        } catch (error) {
            console.error("Error initiating route calculation:", error);
            setIsCalculating(false);
        }
    };

    const handleToggleComplete = async (id, currentStatus) => {
        try {
            // If we are marking the route as complete, tag the completed projects
            if (!currentStatus) {
                // Format date as DD/MM/YY
                const routeDate = selectedRoute.date ? new Date(selectedRoute.date) : new Date();
                const day = String(routeDate.getDate()).padStart(2, '0');
                const month = String(routeDate.getMonth() + 1).padStart(2, '0');
                const year = String(routeDate.getFullYear()).slice(-2);
                const tagDate = `${day}/${month}/${year}`;

                // Iterate through routeProjects and tag completed ones
                for (const project of routeProjects) {
                    if (project.completed) {
                        const projectRef = doc(db, 'projects', project.id);
                        
                        // Check if the tag already exists to avoid duplicates
                        const existingTags = project.tags || [];
                        if (!existingTags.includes(tagDate)) {
                            await updateDoc(projectRef, {
                                tags: [...existingTags, tagDate]
                            });
                        }
                    }
                }
            }

            await updateDoc(doc(db, 'routes', id), { completed: !currentStatus });
        } catch (error) {
            console.error("Error toggling complete:", error);
            alert("Failed to update status.");
        }
    };

    const generateGoogleMapsUrl = () => {
        if (routeProjects.length === 0) return '#';
        
        const baseUrl = 'https://www.google.com/maps/dir/';
        let stops = [];
        
        // 1. Add Start Address (or first project if no explicit start)
        if (startAddress) {
            stops.push(encodeURIComponent(startAddress));
        } else if (routeProjects.length > 0) {
            stops.push(encodeURIComponent(routeProjects[0].address));
        }
        
        // 2. Add all optimized projects in between
        // If we used startAddress, all projects are stops.
        // If we didn't, the first project is already the start, so skip it.
        routeProjects.forEach((p, idx) => {
            if (!startAddress && idx === 0) return; 
            if (p.address) stops.push(encodeURIComponent(p.address));
        });
        
        // 3. Add End Address
        if (isRoundTrip) {
            // Round trip returns to whatever the start was
            if (startAddress) {
                stops.push(encodeURIComponent(startAddress));
            } else if (routeProjects.length > 0) {
                stops.push(encodeURIComponent(routeProjects[0].address));
            }
        } else if (endAddress) {
            stops.push(encodeURIComponent(endAddress));
        }
        
        return baseUrl + stops.join('/');
    };
    
    const handleDeleteRoute = (id, e) => {
        e.stopPropagation();
        setRouteToDelete(id);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (routeToDelete) {
            try {
                await deleteDoc(doc(db, 'routes', routeToDelete));
                if (selectedRoute?.id === routeToDelete) {
                    setSearchParams({});
                }
            } catch (error) {
                console.error("Error deleting route:", error);
            } finally {
                setIsDeleteModalOpen(false);
                setRouteToDelete(null);
            }
        }
    };

    return (
        <div className="w-full relative flex flex-col h-full overflow-hidden">
            <header className="mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shrink-0">
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight text-[#0f172a]">Routing</h1>
                    <p className="mt-1.5 text-sm text-gray-500">Plan and optimize project site visits.</p>
                </div>
                <button
                    onClick={() => setHideCompleted(!hideCompleted)}
                    className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all border ${hideCompleted ? 'bg-amber-50 border-amber-200 text-amber-700 shadow-inner' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 shadow-sm'}`}
                >
                    <EyeOff className={`h-4 w-4 ${hideCompleted ? 'text-amber-500' : 'text-gray-400'}`} />
                    {hideCompleted ? 'Hiding Completed' : 'Hide Completed Routes'}
                </button>
            </header>

            {/* Main Table View */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col min-h-0 flex-1">
                <div ref={routesListRef} className="overflow-auto flex-1 relative mini-scroll">
                    <table className="w-full text-left text-sm text-gray-600">
                        <thead className="bg-gray-50 text-xs uppercase text-gray-500 sticky top-0 z-10 shadow-sm border-b border-gray-200">
                            <tr>
                                <th className="px-4 py-4 font-medium">Date</th>
                                <th className="px-4 py-4 font-medium hidden sm:table-cell">Assigned To</th>
                                <th className="px-4 py-4 font-medium">Locations</th>
                                <th className="px-4 py-4 font-medium">Status</th>
                                <th className="px-4 py-4 font-medium text-right hidden md:table-cell">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                            {loading ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-8 text-center text-sm text-gray-500">
                                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-gray-400" />
                                        Loading routes...
                                    </td>
                                </tr>
                            ) : routes.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-8 text-center text-sm text-gray-500">
                                        No routes created yet. Add them from the Projects tab.
                                    </td>
                                </tr>
                            ) : (
                                routes
                                .filter(r => !hideCompleted || !r.completed)
                                .map(r => (
                                    <tr 
                                        key={r.id} 
                                        onClick={() => setSearchParams({ id: r.id })} 
                                        className={`hover:bg-gray-50/50 cursor-pointer transition-colors group ${r.completed ? 'bg-green-50/30' : ''}`}
                                    >
                                        <td className="px-4 py-4 font-semibold text-[#0f172a] whitespace-nowrap text-sm">
                                            <Calendar className="inline h-4 w-4 mr-2 text-blue-500" />
                                            {r.date ? new Date(r.date).toLocaleDateString() : 'No Date'}
                                            {!r.assignedTo && <div className="sm:hidden text-[10px] text-gray-400 font-normal">Unassigned</div>}
                                            {r.assignedTo && <div className="sm:hidden text-[10px] text-blue-600 font-bold">{r.assignedTo}</div>}
                                        </td>
                                        <td className="px-4 py-4 hidden sm:table-cell">
                                            {r.assignedTo ? (
                                                <span className="bg-gray-100 text-[#0f172a] px-2.5 py-1 rounded-md font-bold text-xs">
                                                    {r.assignedTo}
                                                </span>
                                            ) : <span className="text-gray-400 text-xs italic">Unassigned</span>}
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="flex items-center gap-1.5 font-medium">
                                                <MapIcon className="h-4 w-4 text-gray-400" />
                                                {r.projectIds?.length || 0} stops
                                            </div>
                                        </td>
                                        <td className="px-4 py-4">
                                            {r.completed ? (
                                                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] sm:text-xs font-bold bg-green-100 text-green-700">
                                                    <CheckCircle2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> <span className="hidden sm:inline">Completed</span><span className="sm:hidden">Done</span>
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] sm:text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                                                    <Activity className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> <span className="hidden sm:inline">Active Route</span><span className="sm:hidden">Active</span>
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2 sm:gap-3">
                                                <button className="hidden md:block text-[#0284c7] hover:text-[#0369a1] font-semibold text-sm">View Details</button>
                                                <button 
                                                    onClick={(e) => handleDeleteRoute(r.id, e)} 
                                                    className="text-gray-400 hover:text-red-500 transition-colors p-2 md:p-1 md:opacity-0 md:group-hover:opacity-100" 
                                                    title="Delete Route"
                                                >
                                                    <Trash2 className="h-4 w-4"/>
                                                </button>
                                                <ChevronRight className="md:hidden h-5 w-5 text-gray-300" />
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Slide-over View */}
            <div className={`absolute inset-0 z-[60] bg-white flex flex-col transform transition-transform duration-500 ease-out shadow-2xl ${selectedRoute ? 'translate-x-0' : 'translate-x-full'}`}>
                {selectedRoute && (
                    <>
                        <div className="px-4 py-4 sm:px-6 sm:py-4 border-b border-gray-100 flex flex-col bg-gray-50 shrink-0 gap-4">
                            <div className="flex justify-between items-center w-full">
                                <div>
                                    <h3 className="text-lg sm:text-xl font-bold text-[#0f172a] flex items-center gap-2">
                                         <Calendar className="h-5 w-5 text-blue-500" />
                                         Route: {selectedRoute.date ? new Date(selectedRoute.date).toLocaleDateString() : 'Unknown'}
                                    </h3>
                                    <p className="text-xs sm:text-sm text-gray-500 mt-0.5">Configure and optimize your sequence</p>
                                </div>
                                <button onClick={() => setSearchParams({})} className="text-gray-400 hover:text-gray-600 focus:outline-none p-2 rounded-full hover:bg-gray-200 transition-colors shrink-0">
                                    <X className="h-6 w-6" />
                                </button>
                            </div>
                            
                            <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto mini-scroll pb-1 sm:pb-0">
                                <button
                                    onClick={() => handleToggleComplete(selectedRoute.id, selectedRoute.completed)}
                                    className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg shadow-sm transition-all border shrink-0 ${selectedRoute.completed ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                                >
                                    <CheckCircle2 className={`h-4 w-4 ${selectedRoute.completed ? 'text-green-600' : 'text-gray-400'}`} />
                                    <span>{selectedRoute.completed ? 'Completed' : 'Mark Complete'}</span>
                                </button>
                                <a 
                                    href={generateGoogleMapsUrl()}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm transition-all shrink-0"
                                >
                                    <Navigation className="h-4 w-4 text-white" /> <span>Open in Maps</span>
                                </a>
                            </div>
                        </div>

                        <div ref={rightPanelRef} className="flex-1 overflow-y-auto px-6 py-6 mini-scroll bg-white">
                            <div className="max-w-6xl mx-auto space-y-8 pb-12">
                                
                                {/* Route Configuration */}
                                <div className="bg-gray-50 rounded-xl p-4 sm:p-6 border border-gray-200 space-y-6">
                                    <h2 className="text-xs font-black uppercase text-gray-400 tracking-widest mb-4">Route Configuration</h2>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Start Address</label>
                                                <div className="flex bg-white rounded-lg border border-gray-300 overflow-hidden focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition shadow-sm h-10">
                                                    <div className="pl-3 flex items-center text-gray-400"><MapPin className="h-4 w-4" /></div>
                                                    <input 
                                                        ref={startInputRef}
                                                        className="w-full py-2 px-3 text-sm focus:outline-none placeholder:text-gray-300 min-w-0" 
                                                        placeholder="e.g. 38 Melrosegate, York"
                                                        defaultValue={startAddress}
                                                    />
                                                    {startAddress && (
                                                        <button onClick={() => { setStartAddress(''); if(startInputRef.current) startInputRef.current.value = ''; updateDoc(doc(db, 'routes', selectedRoute.id), { startAddress: '' }).catch(console.error); }} className="pr-3 flex items-center text-gray-400 hover:text-gray-600 shrink-0">
                                                            <X className="h-3.5 w-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                                <p className="text-[10px] text-gray-400 mt-1">Suggestions appear as you type</p>
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-gray-600 mb-1.5">End Address <span className="font-normal text-gray-400">(Optional)</span></label>
                                                <div className="flex bg-white rounded-lg border border-gray-300 overflow-hidden focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition shadow-sm h-10">
                                                    <div className="pl-3 flex items-center text-gray-400"><CheckCircle2 className="h-4 w-4" /></div>
                                                    <input 
                                                        ref={endInputRef}
                                                        className="w-full py-2 px-3 text-sm focus:outline-none placeholder:text-gray-300 min-w-0" 
                                                        placeholder="e.g. 15 Station Road, York"
                                                        defaultValue={endAddress}
                                                    />
                                                    {endAddress && (
                                                        <button onClick={() => { setEndAddress(''); if(endInputRef.current) endInputRef.current.value = ''; updateDoc(doc(db, 'routes', selectedRoute.id), { endAddress: '' }).catch(console.error); }} className="pr-3 flex items-center text-gray-400 hover:text-gray-600 shrink-0">
                                                            <X className="h-3.5 w-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                                <p className="text-[10px] text-gray-400 mt-1">Leave blank to use Round Trip</p>
                                            </div>
                                        </div>
                                        
                                        <div className="space-y-4">
                                            <label className="block text-xs font-bold text-gray-600 mb-1.5">Assigned To</label>
                                            <div className="flex flex-wrap gap-2">
                                                {['JW', 'JD', 'JW & JD'].map(val => (
                                                    <button
                                                        key={val}
                                                        onClick={() => handleAssign(val)}
                                                        className={`flex-1 min-w-[80px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-bold border transition ${assignedTo === val ? 'bg-[#0f172a] text-white border-[#0f172a]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'}`}
                                                    >
                                                        {val === 'JW & JD' ? <Users className="h-4 w-4" /> : <User className="h-4 w-4" />}
                                                        {val}
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="flex flex-col gap-3 py-2 border-t border-gray-100 mt-2">
                                                <label className="flex items-center justify-between cursor-pointer group">
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-bold text-[#0f172a]">Round Trip</span>
                                                        <span className="text-[10px] text-gray-500">Return to starting location</span>
                                                    </div>
                                                    <div className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${isRoundTrip ? 'bg-blue-600' : 'bg-gray-200'}`} onClick={() => setIsRoundTrip(!isRoundTrip)}>
                                                        <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isRoundTrip ? 'translate-x-4' : 'translate-x-0'}`} />
                                                    </div>
                                                </label>

                                                <label className="flex items-center justify-between cursor-pointer group">
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-bold text-[#0f172a]">Live Traffic Aware</span>
                                                        <span className="text-[10px] text-gray-500">Accounts for current congestion</span>
                                                    </div>
                                                    <div className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${useTraffic ? 'bg-blue-600' : 'bg-gray-200'}`} onClick={() => setUseTraffic(!useTraffic)}>
                                                        <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${useTraffic ? 'translate-x-4' : 'translate-x-0'}`} />
                                                    </div>
                                                </label>
                                            </div>

                                            <div className="pt-2">
                                                 <button 
                                                    onClick={handleCalculateRoute}
                                                    disabled={isCalculating || showSuccessFeedback || routeProjects.length === 0}
                                                    className={`w-full py-2.5 rounded-lg font-bold text-sm transition flex items-center justify-center gap-2 disabled:opacity-50 shadow-md relative overflow-hidden ${showSuccessFeedback ? 'bg-green-600 hover:bg-green-700' : 'bg-[#0f172a] hover:bg-black'} text-white`}
                                                >
                                                    <div className="absolute inset-0 bg-white/20 translate-y-full hover:translate-y-0 transition-transform duration-300 pointer-events-none"></div>
                                                    {isCalculating ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : showSuccessFeedback ? (
                                                        <CheckCircle2 className="h-4 w-4 animate-in zoom-in duration-300" />
                                                    ) : (
                                                        <Navigation className="h-4 w-4" />
                                                    )}
                                                    {isCalculating ? 'Calculating...' : showSuccessFeedback ? 'Optimized!' : 'Find Quickest Route'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                    <div className="flex flex-col h-full min-h-[500px]">
                                        <h2 className="text-sm font-bold text-[#0f172a] uppercase tracking-wider mb-4 flex items-center gap-2 border-b border-gray-100 pb-2 shrink-0">
                                            Final Map
                                        </h2>
                                        <div 
                                            ref={mapRef} 
                                            className="w-full flex-1 min-h-[500px] bg-gray-100 rounded-xl shadow-inner border border-gray-200 overflow-hidden"
                                        >
                                            {/* Google Map inserts here */}
                                        </div>
                                    </div>

                                    <div className="flex flex-col h-full max-h-[700px]">
                                        <h2 className="text-sm font-bold text-[#0f172a] uppercase tracking-wider mb-4 flex items-center gap-2 border-b border-gray-100 pb-2 shrink-0">
                                            Stops ({routeProjects.length})
                                        </h2>
                                        <div ref={stopsListRef} className="space-y-3 overflow-y-auto mini-scroll pr-2 flex-1 pb-4">
                                            {routeProjects.length === 0 ? (
                                                <div className="p-8 text-center text-gray-400 bg-gray-50 rounded-xl border border-gray-100 border-dashed">No projects added.</div>
                                            ) : (
                                                <>
                                                    {/* Fixed Start Block */}
                                                    {startAddress ? (
                                                        <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-xl border border-gray-200/60 shadow-sm relative overflow-hidden">
                                                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-500"></div>
                                                            <div className="h-8 w-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-black shrink-0 text-xs shadow-sm shadow-green-200">
                                                                Start
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <h3 className="font-bold text-[#0f172a] truncate">{startAddress}</h3>
                                                                <p className="text-xs text-gray-500 truncate mt-0.5">Origin Location</p>
                                                            </div>
                                                        </div>
                                                    ) : routeProjects.length > 0 && (
                                                         <div className="flex items-center gap-4 bg-blue-50/50 p-4 rounded-xl border border-blue-100 shadow-sm relative group transition-all">
                                                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-500"></div>
                                                            <div className="h-8 w-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-black shrink-0 text-xs shadow-sm shadow-green-200">
                                                                Start
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <button 
                                                                        onClick={async () => {
                                                                            const projectRef = doc(db, 'projects', routeProjects[0].id);
                                                                            await updateDoc(projectRef, { completed: !routeProjects[0].completed });
                                                                        }}
                                                                        className={`flex-shrink-0 h-5 w-5 rounded border flex items-center justify-center transition-colors ${routeProjects[0].completed ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-blue-400'}`}
                                                                    >
                                                                        {routeProjects[0].completed && <CheckCircle2 className="h-3.5 w-3.5" />}
                                                                    </button>
                                                                    <h3 className={`font-bold text-[#0f172a] truncate ${routeProjects[0].completed ? 'line-through text-gray-400 opacity-60' : ''}`}>{routeProjects[0].address}</h3>
                                                                </div>
                                                                <div className="flex items-center gap-2 mt-1.5">
                                                                    <select 
                                                                        value={routeProjects[0].status || 'New'} 
                                                                        onChange={async (e) => {
                                                                            const newStatus = e.target.value;
                                                                            const projectRef = doc(db, 'projects', routeProjects[0].id);
                                                                            await updateDoc(projectRef, { status: newStatus });
                                                                        }}
                                                                        className="text-[11px] sm:text-[10px] font-extrabold bg-white/50 text-gray-600 px-2 py-1 rounded border border-gray-200 outline-none"
                                                                    >
                                                                        {STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                                    </select>
                                                                    <p className="text-xs text-blue-600 font-medium truncate">Starting at First Project</p>
                                                                </div>
                                                            </div>
                                                            <div className="flex flex-col items-end gap-2 shrink-0">
                                                                <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-green-50 text-green-700 border border-green-100">
                                                                    Terminal
                                                                </span>
                                                                <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                                                    <button 
                                                                        onClick={() => navigate(`/capture?id=${routeProjects[0].id}`)}
                                                                        className="p-2 sm:p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition shrink-0"
                                                                        title="Add Quick Capture"
                                                                    >
                                                                        <ClipboardList className="h-5 w-5 sm:h-4 sm:w-4" />
                                                                    </button>
                                                                    <button 
                                                                        onClick={() => navigate(`/projects?id=${routeProjects[0].id}&backTo=${encodeURIComponent(`/routing?id=${selectedRoute.id}`)}`)}
                                                                        className="p-2 sm:p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition shrink-0"
                                                                        title="View Project Details"
                                                                    >
                                                                        <ExternalLink className="h-5 w-5 sm:h-4 sm:w-4" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                
                                                {routeProjects.map((p, idx) => {
                                                    // Don't show the project in the middle list if it's already acting as the START or END block
                                                    const isPrimaryStart = !startAddress && idx === 0;
                                                    const isPrimaryEnd = !isRoundTrip && !endAddress && idx === routeProjects.length - 1 && routeProjects.length > 1;
                                                    
                                                    if (isPrimaryStart || isPrimaryEnd) return null;

                                                    return (
                                                        <div key={p.id} className="flex items-center gap-4 bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:border-blue-200 hover:shadow-md transition-all group relative">
                                                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                                            <div className="h-8 w-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-black shrink-0 text-sm shadow-sm border border-blue-100/50">
                                                                {idx + 1}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <button 
                                                                        onClick={async () => {
                                                                            const projectRef = doc(db, 'projects', p.id);
                                                                            await updateDoc(projectRef, { completed: !p.completed });
                                                                        }}
                                                                        className={`flex-shrink-0 h-5 w-5 rounded border flex items-center justify-center transition-colors ${p.completed ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-blue-400'}`}
                                                                        title={p.completed ? "Mark as unvisited" : "Mark as visited"}
                                                                    >
                                                                        {p.completed && <CheckCircle2 className="h-3.5 w-3.5" />}
                                                                    </button>
                                                                    <h3 className={`font-bold text-[#0f172a] truncate transition-all ${p.completed ? 'line-through text-gray-400 opacity-60' : ''}`}>
                                                                        {p.address}
                                                                    </h3>
                                                                </div>
                                                                <div className="flex items-center gap-2 mt-1.5">
                                                                    <select 
                                                                        value={p.status || 'New'} 
                                                                        onChange={async (e) => {
                                                                            const newStatus = e.target.value;
                                                                            const projectRef = doc(db, 'projects', p.id);
                                                                            await updateDoc(projectRef, { status: newStatus });
                                                                        }}
                                                                        className="text-[11px] sm:text-[10px] font-extrabold bg-gray-50 text-gray-600 px-2 py-1 sm:px-1.5 sm:py-0.5 rounded border border-gray-200 tracking-wide uppercase cursor-pointer hover:bg-white hover:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all outline-none"
                                                                    >
                                                                        {STATUS_OPTIONS.map(opt => (
                                                                            <option key={opt} value={opt}>{opt}</option>
                                                                        ))}
                                                                    </select>
                                                                    {p.applicantName && <span className="text-[11px] sm:text-[10px] text-gray-500 truncate"><User className="inline h-3 w-3 mr-0.5"/> {p.applicantName.split(' ')[0]}</span>}
                                                                </div>
                                                                
                                                                {/* Quick Notes Input */}
                                                                <div className="mt-2.5 flex items-center gap-2">
                                                                    <input 
                                                                        type="text"
                                                                        placeholder="Quick internal note..."
                                                                        defaultValue={p.notes || ''}
                                                                        onBlur={async (e) => {
                                                                            if (e.target.value !== (p.notes || '')) {
                                                                                const projectRef = doc(db, 'projects', p.id);
                                                                                await updateDoc(projectRef, { notes: e.target.value });
                                                                            }
                                                                        }}
                                                                        className="w-full text-xs sm:text-[11px] bg-gray-50 border-gray-200 focus:bg-white focus:border-blue-300 rounded-lg px-3 py-2 sm:py-1.5 placeholder-gray-400 transition-all outline-none border"
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="flex flex-col items-end gap-2 shrink-0">
                                                                <span className={`text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap md:hidden md:group-hover:block border animate-in zoom-in slide-in-from-right-2 duration-200 ${p.completed ? 'bg-green-50 text-green-700 border-green-100' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>
                                                                    {p.completed ? 'Completed' : `Stop ${idx + 1}`}
                                                                </span>
                                                                <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                                                    <button 
                                                                        onClick={() => navigate(`/capture?id=${p.id}`)}
                                                                        className="p-2 sm:p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition shrink-0"
                                                                        title="Add Quick Capture"
                                                                    >
                                                                        <ClipboardList className="h-5 w-5 sm:h-4 sm:w-4" />
                                                                    </button>
                                                                    <button 
                                                                        onClick={() => navigate(`/projects?id=${p.id}&backTo=${encodeURIComponent(`/routing?id=${selectedRoute.id}`)}`)}
                                                                        className="p-2 sm:p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition shrink-0"
                                                                        title="View Project Details"
                                                                    >
                                                                        <ExternalLink className="h-5 w-5 sm:h-4 sm:w-4" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}

                                                    {/* Fixed End Block */}
                                                    {isRoundTrip ? (
                                                        <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-xl border border-gray-200/60 shadow-sm relative overflow-hidden">
                                                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500"></div>
                                                            <div className="h-8 w-8 rounded-full bg-red-100 text-red-700 flex items-center justify-center font-black shrink-0 text-xs shadow-sm shadow-red-200">
                                                                End
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <h3 className="font-bold text-[#0f172a] truncate">{startAddress || (routeProjects.length > 0 ? routeProjects[0].address : 'Start Location')}</h3>
                                                                <p className="text-xs text-gray-500 truncate mt-0.5">Returning to Start (Round Trip)</p>
                                                            </div>
                                                        </div>
                                                    ) : endAddress ? (
                                                        <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-xl border border-gray-200/60 shadow-sm relative overflow-hidden">
                                                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500"></div>
                                                            <div className="h-8 w-8 rounded-full bg-red-100 text-red-700 flex items-center justify-center font-black shrink-0 text-xs shadow-sm shadow-red-200">
                                                                End
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <h3 className="font-bold text-[#0f172a] truncate">{endAddress}</h3>
                                                                <p className="text-xs text-gray-500 truncate mt-0.5">Destination Location</p>
                                                            </div>
                                                        </div>
                                                    ) : routeProjects.length > 1 && (
                                                        <div className="flex items-center gap-4 bg-blue-50/50 p-4 rounded-xl border border-blue-100 shadow-sm relative group transition-all">
                                                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500"></div>
                                                            <div className="h-8 w-8 rounded-full bg-red-100 text-red-700 flex items-center justify-center font-black shrink-0 text-xs shadow-sm shadow-red-200">
                                                                End
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <button 
                                                                        onClick={async () => {
                                                                            const projectRef = doc(db, 'projects', routeProjects[routeProjects.length - 1].id);
                                                                            await updateDoc(projectRef, { completed: !routeProjects[routeProjects.length - 1].completed });
                                                                        }}
                                                                        className={`flex-shrink-0 h-5 w-5 rounded border flex items-center justify-center transition-colors ${routeProjects[routeProjects.length - 1].completed ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-blue-400'}`}
                                                                    >
                                                                        {routeProjects[routeProjects.length - 1].completed && <CheckCircle2 className="h-3.5 w-3.5" />}
                                                                    </button>
                                                                    <h3 className={`font-bold text-[#0f172a] truncate ${routeProjects[routeProjects.length - 1].completed ? 'line-through text-gray-400 opacity-60' : ''}`}>{routeProjects[routeProjects.length - 1].address}</h3>
                                                                </div>
                                                                <div className="flex items-center gap-2 mt-1.5">
                                                                    <select 
                                                                        value={routeProjects[routeProjects.length - 1].status || 'New'} 
                                                                        onChange={async (e) => {
                                                                            const newStatus = e.target.value;
                                                                            const projectRef = doc(db, 'projects', routeProjects[routeProjects.length - 1].id);
                                                                            await updateDoc(projectRef, { status: newStatus });
                                                                        }}
                                                                        className="text-[11px] sm:text-[10px] font-extrabold bg-white/50 text-gray-600 px-2 py-1 rounded border border-gray-200 outline-none"
                                                                    >
                                                                        {STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                                    </select>
                                                                    <p className="text-xs text-red-600 font-medium truncate">Ending at Final Project</p>
                                                                </div>
                                                            </div>
                                                            <div className="flex flex-col items-end gap-2 shrink-0">
                                                                <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-red-50 text-red-700 border border-red-100">
                                                                    Terminal
                                                                </span>
                                                                <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                                                    <button 
                                                                        onClick={() => navigate(`/capture?id=${routeProjects[routeProjects.length - 1].id}`)}
                                                                        className="p-2 sm:p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition shrink-0"
                                                                        title="Add Quick Capture"
                                                                    >
                                                                        <ClipboardList className="h-5 w-5 sm:h-4 sm:w-4" />
                                                                    </button>
                                                                    <button 
                                                                        onClick={() => navigate(`/projects?id=${routeProjects[routeProjects.length - 1].id}&backTo=${encodeURIComponent(`/routing?id=${selectedRoute.id}`)}`)}
                                                                        className="p-2 sm:p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition shrink-0"
                                                                        title="View Project Details"
                                                                    >
                                                                        <ExternalLink className="h-5 w-5 sm:h-4 sm:w-4" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
            {/* Delete Confirmation Modal */}
            <ConfirmationModal 
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="Delete Route"
                message="Are you sure you want to delete this route? This action cannot be undone and will remove all optimization data."
                confirmText="Delete Route"
                type="danger"
            />
        </div>
    );
};

export default Routing;
