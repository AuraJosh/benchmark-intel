import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, getDocs, where, deleteDoc } from 'firebase/firestore';
import { MapPin, Navigation, Map as MapIcon, Loader2, User, Users, ExternalLink, Calendar, CheckCircle2, ChevronRight, Save, Trash2, X, Activity } from 'lucide-react';
import ConfirmationModal from '../components/ConfirmationModal';


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


    // Initialize map — delayed so slide-over animation completes before Google
    // tries to measure the div dimensions (zero-size div = blank map).
    useEffect(() => {
        if (!selectedRoute) {
            // Panel closing — destroy the map instance so next open starts fresh
            googleMap.current = null;
            directionsRenderer.current = null;
            return;
        }

        if (!window.google) return;

        // Wait for the 500ms slide-over transition to finish
        const timerId = setTimeout(() => {
            if (!mapRef.current) return;

            // Always create a fresh map for each route open
            googleMap.current = new window.google.maps.Map(mapRef.current, {
                center: { lat: 53.959965, lng: -1.087298 },
                zoom: 12,
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

            // Force the map to recalculate its size now the div is fully visible
            window.google.maps.event.trigger(googleMap.current, 'resize');

            directionsRenderer.current = new window.google.maps.DirectionsRenderer({
                map: googleMap.current,
                suppressMarkers: false,
                polylineOptions: {
                    strokeColor: '#3b82f6',
                    strokeOpacity: 0.8,
                    strokeWeight: 6
                }
            });
        }, 520); // Just after the 500ms slide-over CSS transition

        return () => clearTimeout(timerId);
    }, [selectedRoute]);

    // Attach Google Places Autocomplete to address inputs once panel opens
    useEffect(() => {
        if (!selectedRoute || !window.google?.maps?.places) return;

        const options = {
            componentRestrictions: { country: 'gb' },
            fields: ['formatted_address', 'geometry'],
            types: ['address']
        };

        // Start address
        if (startInputRef.current && !startAutocomplete.current) {
            startAutocomplete.current = new window.google.maps.places.Autocomplete(startInputRef.current, options);
            startAutocomplete.current.addListener('place_changed', () => {
                const place = startAutocomplete.current.getPlace();
                const addr = place.formatted_address || startInputRef.current.value;
                setStartAddress(addr);
                updateDoc(doc(db, 'routes', selectedRoute.id), { startAddress: addr }).catch(console.error);
            });
        }

        // End address
        if (endInputRef.current && !endAutocomplete.current) {
            endAutocomplete.current = new window.google.maps.places.Autocomplete(endInputRef.current, options);
            endAutocomplete.current.addListener('place_changed', () => {
                const place = endAutocomplete.current.getPlace();
                const addr = place.formatted_address || endInputRef.current.value;
                setEndAddress(addr);
                updateDoc(doc(db, 'routes', selectedRoute.id), { endAddress: addr }).catch(console.error);
            });
        }

        // Cleanup on panel close
        return () => {
            startAutocomplete.current = null;
            endAutocomplete.current = null;
        };
    }, [selectedRoute]);


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
                fetchRouteProjects(r.projectIds || [], r.orderedProjectIds);
            }
        } else {
            setSelectedRoute(null);
            setRouteProjects([]);
        }
    }, [searchParams, routes]);

    const fetchRouteProjects = async (projectIds, orderedIds) => {
        if (!projectIds || projectIds.length === 0) {
            setRouteProjects([]);
            return;
        }
        
        try {
            // Firestore 'in' query supports up to 30 items
            const chunks = [];
            for (let i = 0; i < projectIds.length; i += 30) {
                chunks.push(projectIds.slice(i, i + 30));
            }
            
            let allProjects = [];
            for (const chunk of chunks) {
                const q = query(collection(db, 'projects'), where('__name__', 'in', chunk));
                const snap = await getDocs(q);
                allProjects = [...allProjects, ...snap.docs.map(d => ({ id: d.id, ...d.data() }))];
            }
            
            // Reorder based on orderedIds if available
            if (orderedIds && orderedIds.length > 0) {
                allProjects.sort((a, b) => {
                    const idxA = orderedIds.indexOf(a.id);
                    const idxB = orderedIds.indexOf(b.id);
                    if (idxA === -1 && idxB === -1) return 0;
                    if (idxA === -1) return 1;
                    if (idxB === -1) return -1;
                    return idxA - idxB;
                });
            }
            
            setRouteProjects(allProjects);
        } catch (error) {
            console.error("Error fetching route projects:", error);
        }
    };

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

            let finalOrigin = startAddress;
            let finalDestination = endAddress;
            
            // Prefer address string over coords — ensures correct house number
            // (stored coords from scraper may be slightly inaccurate)
            if (!finalOrigin) {
                if (routeProjects[0].address) {
                    finalOrigin = routeProjects[0].address;
                } else if (routeProjects[0].coordinates?.lat) {
                    finalOrigin = new window.google.maps.LatLng(routeProjects[0].coordinates.lat, routeProjects[0].coordinates.lng);
                }
            }
            
            if (isRoundTrip) {
                finalDestination = finalOrigin;
            } else if (!finalDestination) {
                const lastP = routeProjects[routeProjects.length - 1];
                if (lastP.address) {
                    finalDestination = lastP.address;
                } else if (lastP.coordinates?.lat) {
                    finalDestination = new window.google.maps.LatLng(lastP.coordinates.lat, lastP.coordinates.lng);
                }
            }

            let waypointProjects = [...routeProjects];
            
            // LOGIC: If a custom 'startAddress' is provided, ALL routeProjects are intermediate waypoints.
            // If NO 'startAddress' is provided, we use routeProjects[0] as the ORIGIN, so we remove it from waypoints.
            if (!startAddress && waypointProjects.length > 0) {
                waypointProjects.shift();
            }

            // LOGIC: If 'isRoundTrip', the destination is the origin, so all remaining waypointProjects are intermediate.
            // If NOT 'isRoundTrip':
            //    - If custom 'endAddress' provided, all remaining are intermediate.
            //    - If NO custom 'endAddress', we use the last project as DESTINATION, so remove it from waypoints.
            if (!isRoundTrip && !endAddress && waypointProjects.length > 0) {
                waypointProjects.pop();
            }

            if (waypointProjects.length > 25) {
                alert("Google Maps limits optimized routes to exactly 25 mid-points. Please split this large route up.");
                setIsCalculating(false);
                return;
            }

            // Always use address string so Google finds the EXACT house number.
            // Stored coordinates from the scraper may be slightly wrong (e.g. resolving
            // to a different door number on the same street).
            const waypoints = waypointProjects.map(p => {
                if (p.address) {
                    return { location: p.address, stopover: true };
                }
                // Only fall back to coords if literally no address string exists
                if (p.coordinates?.lat && p.coordinates?.lng) {
                    return { location: new window.google.maps.LatLng(p.coordinates.lat, p.coordinates.lng), stopover: true };
                }
                return null;
            }).filter(Boolean);

            const requestParams = {
                origin: finalOrigin,
                destination: finalDestination,
                waypoints: waypoints,
                optimizeWaypoints: true,
                travelMode: window.google.maps.TravelMode.DRIVING
            };

            if (useTraffic) {
                requestParams.drivingOptions = {
                    departureTime: new Date(),
                    trafficModel: 'bestguess'
                };
            }

            // Fallback timeout in case Google API terminates silently (e.g. ApiNotActivatedMapError)
            const timeoutId = setTimeout(() => {
                setIsCalculating(false);
                alert("Google Maps API request timed out! Please ensure Maps JavaScript API and Directions API are enabled in your Google Cloud Console for your API Key.");
            }, 8000);

            directionsService.route(requestParams, async (result, status) => {
                clearTimeout(timeoutId);
                try {
                    if (status === window.google.maps.DirectionsStatus.OK) {
                        if (directionsRenderer.current) {
                            directionsRenderer.current.setDirections(result);
                        }

                        const route = result.routes[0];
                        const order = route.waypoint_order || []; 

                        // Reorder the waypoints based on the API response order (or fallback)
                        let optimizedWaypoints = [];
                        if (order && order.length > 0) {
                            optimizedWaypoints = order.map(index => waypointProjects[index]);
                        } else {
                            optimizedWaypoints = [...waypointProjects];
                        }
                        
                        // Reassemble full ordered list with start/end projects if we excluded them
                        let completedOrder = [];
                        
                        // If we used the first project as origin, put it back at index 0
                        if (!startAddress && routeProjects.length > 0) {
                            completedOrder.push(routeProjects[0]);
                        }
                        
                        completedOrder = [...completedOrder, ...optimizedWaypoints];
                        
                        // If we used the last project as destination (not round trip and no end addr), put it back at the end
                        if (!isRoundTrip && !endAddress && routeProjects.length > 1) {
                            // Only add it if it's not already there (though shift/pop should have handled this)
                            const lastProject = routeProjects[routeProjects.length - 1];
                            if (!completedOrder.find(p => p.id === lastProject.id)) {
                                completedOrder.push(lastProject);
                            }
                        }

                        // Safety check: Verify we have every project from the original set
                        const missingProjects = routeProjects.filter(p => !completedOrder.find(c => c.id === p.id));
                        completedOrder = [...completedOrder, ...missingProjects];

                        // Save the new perfect order
                        const finalOrderedIds = completedOrder.map(p => p.id);
                        await updateDoc(doc(db, 'routes', selectedRoute.id), {
                            orderedProjectIds: finalOrderedIds,
                            startAddress: startAddress || '',
                            endAddress: endAddress || '',
                            assignedTo
                        });
                        
                        setRouteProjects(completedOrder);
                        
                        // Notify the user of completion
                        setShowSuccessFeedback(true);
                        setTimeout(() => setShowSuccessFeedback(false), 2000);
                        
                    } else {
                        console.error("Directions failure", status);
                        alert("Could not calculate route: " + status);
                    }
                } catch (err) {
                    console.error("Error processing route callback:", err);
                    alert("An error occurred while compiling the route: " + err.message);
                } finally {
                    setIsCalculating(false);
                }
            });
            
        } catch (error) {
            console.error("Error initiating route calculation:", error);
            alert(error.message || "An unexpected error occurred during optimization.");
            setIsCalculating(false);
        }
    };

    const handleToggleComplete = async (id, currentStatus) => {
        try {
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
            </header>

            {/* Main Table View */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col min-h-0 flex-1">
                <div className="overflow-auto flex-1 relative mini-scroll">
                    <table className="w-full text-left text-sm text-gray-600">
                        <thead className="bg-gray-50 text-xs uppercase text-gray-500 sticky top-0 z-10 shadow-sm border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-4 font-medium">Date Created</th>
                                <th className="px-6 py-4 font-medium">Assigned To</th>
                                <th className="px-6 py-4 font-medium">Locations</th>
                                <th className="px-6 py-4 font-medium">Status</th>
                                <th className="px-6 py-4 font-medium text-right">Action</th>
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
                                routes.map(r => (
                                    <tr 
                                        key={r.id} 
                                        onClick={() => setSearchParams({ id: r.id })} 
                                        className={`hover:bg-gray-50/50 cursor-pointer transition-colors group ${r.completed ? 'bg-green-50/30' : ''}`}
                                    >
                                        <td className="px-6 py-4 font-semibold text-[#0f172a] whitespace-nowrap text-sm">
                                            <Calendar className="inline h-4 w-4 mr-2 text-blue-500" />
                                            {r.date ? new Date(r.date).toLocaleDateString() : 'No Date'}
                                        </td>
                                        <td className="px-6 py-4">
                                            {r.assignedTo ? (
                                                <span className="bg-gray-100 text-[#0f172a] px-2.5 py-1 rounded-md font-bold text-xs">
                                                    {r.assignedTo}
                                                </span>
                                            ) : <span className="text-gray-400 text-xs italic">Unassigned</span>}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-1.5 font-medium">
                                                <MapIcon className="h-4 w-4 text-gray-400" />
                                                {r.projectIds?.length || 0} stops
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {r.completed ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">
                                                    <CheckCircle2 className="h-3.5 w-3.5" /> Completed
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                                                    <Activity className="h-3.5 w-3.5" /> Active Route
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-3">
                                                <button className="text-[#0284c7] hover:text-[#0369a1] font-semibold text-sm">View Route Details</button>
                                                <button onClick={(e) => handleDeleteRoute(r.id, e)} className="text-gray-400 hover:text-red-500 transition-colors p-1 opacity-0 group-hover:opacity-100" title="Delete Route"><Trash2 className="h-4 w-4"/></button>
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
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
                            <div>
                                <h3 className="text-xl font-bold text-[#0f172a] flex items-center gap-2">
                                     <Calendar className="h-5 w-5 text-blue-500" />
                                     Route Summary: {selectedRoute.date ? new Date(selectedRoute.date).toLocaleDateString() : 'Unknown'}
                                </h3>
                                <p className="text-sm text-gray-500 mt-0.5">Configure and optimize your sequence</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleToggleComplete(selectedRoute.id, selectedRoute.completed)}
                                    className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg shadow-sm transition-all border ${selectedRoute.completed ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                                >
                                    <CheckCircle2 className={`h-4 w-4 ${selectedRoute.completed ? 'text-green-600' : 'text-gray-400'}`} />
                                    {selectedRoute.completed ? 'Completed' : 'Mark Route Complete'}
                                </button>
                                <div className="h-8 w-px bg-gray-200 mx-1"></div>
                                <a 
                                    href={generateGoogleMapsUrl()}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm transition-all"
                                >
                                    <Navigation className="h-4 w-4 text-white" /> Open in Google Maps
                                </a>
                                <div className="h-8 w-px bg-gray-200 mx-1"></div>
                                <button onClick={() => setSearchParams({})} className="text-gray-400 hover:text-gray-600 focus:outline-none p-2 rounded-full hover:bg-gray-200 transition-colors">
                                    <X className="h-6 w-6" />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto px-6 py-6 mini-scroll bg-white">
                            <div className="max-w-6xl mx-auto space-y-8 pb-12">
                                
                                {/* Route Configuration */}
                                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200 space-y-6">
                                    <h2 className="text-xs font-black uppercase text-gray-400 tracking-widest mb-4">Route Configuration</h2>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Start Address</label>
                                                <div className="flex bg-white rounded-lg border border-gray-300 overflow-hidden focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition shadow-sm h-10">
                                                    <div className="pl-3 flex items-center text-gray-400"><MapPin className="h-4 w-4" /></div>
                                                    <input 
                                                        ref={startInputRef}
                                                        className="w-full py-2 px-3 text-sm focus:outline-none placeholder:text-gray-300" 
                                                        placeholder="e.g. 38 Melrosegate, York"
                                                        defaultValue={startAddress}
                                                    />
                                                    {startAddress && (
                                                        <button onClick={() => { setStartAddress(''); if(startInputRef.current) startInputRef.current.value = ''; updateDoc(doc(db, 'routes', selectedRoute.id), { startAddress: '' }).catch(console.error); }} className="pr-3 flex items-center text-gray-400 hover:text-gray-600">
                                                            <X className="h-3.5 w-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                                <p className="text-[10px] text-gray-400 mt-1">Powered by Google Maps — suggestions appear as you type</p>
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-gray-600 mb-1.5">End Address <span className="font-normal text-gray-400">(Optional)</span></label>
                                                <div className="flex bg-white rounded-lg border border-gray-300 overflow-hidden focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition shadow-sm h-10">
                                                    <div className="pl-3 flex items-center text-gray-400"><CheckCircle2 className="h-4 w-4" /></div>
                                                    <input 
                                                        ref={endInputRef}
                                                        className="w-full py-2 px-3 text-sm focus:outline-none placeholder:text-gray-300" 
                                                        placeholder="e.g. 15 Station Road, York"
                                                        defaultValue={endAddress}
                                                    />
                                                    {endAddress && (
                                                        <button onClick={() => { setEndAddress(''); if(endInputRef.current) endInputRef.current.value = ''; updateDoc(doc(db, 'routes', selectedRoute.id), { endAddress: '' }).catch(console.error); }} className="pr-3 flex items-center text-gray-400 hover:text-gray-600">
                                                            <X className="h-3.5 w-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                                <p className="text-[10px] text-gray-400 mt-1">Leave blank to use Round Trip or end at the last stop</p>
                                            </div>
                                        </div>
                                        
                                        <div className="space-y-4">
                                            <label className="block text-xs font-bold text-gray-600 mb-1.5">Assigned To</label>
                                            <div className="flex flex-wrap gap-2">
                                                {['JW', 'JD', 'JW & JD'].map(val => (
                                                    <button
                                                        key={val}
                                                        onClick={() => handleAssign(val)}
                                                        className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold border transition ${assignedTo === val ? 'bg-[#0f172a] text-white border-[#0f172a]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'}`}
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
                                                    <div className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${isRoundTrip ? 'bg-blue-600' : 'bg-gray-200'}`} onClick={() => setIsRoundTrip(!isRoundTrip)}>
                                                        <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isRoundTrip ? 'translate-x-4' : 'translate-x-0'}`} />
                                                    </div>
                                                </label>

                                                <label className="flex items-center justify-between cursor-pointer group">
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-bold text-[#0f172a]">Live Traffic Aware</span>
                                                        <span className="text-[10px] text-gray-500">Accounts for current congestion</span>
                                                    </div>
                                                    <div className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${useTraffic ? 'bg-blue-600' : 'bg-gray-200'}`} onClick={() => setUseTraffic(!useTraffic)}>
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
                                                    {isCalculating ? 'Calculating Best Route...' : showSuccessFeedback ? 'Route Optimized!' : 'Find Quickest Route'}
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
                                        <div className="space-y-3 overflow-y-auto mini-scroll pr-2 flex-1 pb-4">
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
                                                         <div className="flex items-center gap-4 bg-blue-50/50 p-4 rounded-xl border border-blue-100 shadow-sm relative overflow-hidden">
                                                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-500"></div>
                                                            <div className="h-8 w-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-black shrink-0 text-xs">
                                                                Start
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <h3 className="font-bold text-[#0f172a] truncate">{routeProjects[0].address}</h3>
                                                                <p className="text-xs text-gray-500 truncate mt-0.5">Starting at First Project</p>
                                                            </div>
                                                        </div>
                                                    )}
                                                
                                                {routeProjects.map((p, idx) => {
                                                    // Don't show the project in the middle list if it's already acting as the START or END block
                                                    const isPrimaryStart = !startAddress && idx === 0;
                                                    const isPrimaryEnd = !isRoundTrip && !endAddress && idx === routeProjects.length - 1 && routeProjects.length > 1;
                                                    
                                                    if (isPrimaryStart || isPrimaryEnd) return null;

                                                    return (
                                                        <div key={p.id} className="flex items-center gap-4 bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:border-blue-200 hover:shadow-md transition-all group relative overflow-hidden">
                                                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                                            <div className="h-8 w-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-black shrink-0 text-sm shadow-sm border border-blue-100/50">
                                                                {idx + 1}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <h3 className="font-bold text-[#0f172a] truncate">{p.address}</h3>
                                                                </div>
                                                                <div className="flex items-center gap-2 mt-1">
                                                                    <span className="text-[10px] font-extrabold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded tracking-wide uppercase">{p.status}</span>
                                                                    {p.applicantName && <span className="text-[10px] text-gray-500 truncate"><User className="inline h-3 w-3 mr-0.5"/> {p.applicantName}</span>}
                                                                </div>
                                                            </div>
                                                            <div className="flex flex-col items-end gap-1">
                                                                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-full whitespace-nowrap hidden group-hover:block animate-in zoom-in slide-in-from-right-2 duration-200">
                                                                    Stop {idx + 1}
                                                                </span>
                                                                <button 
                                                                    onClick={() => navigate(`/projects?id=${p.id}&backTo=${encodeURIComponent(`/routing?id=${selectedRoute.id}`)}`)}
                                                                    className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition shrink-0"
                                                                    title="View Project Details"
                                                                >
                                                                    <ExternalLink className="h-4 w-4" />
                                                                </button>
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
                                                        <div className="flex items-center gap-4 bg-blue-50/50 p-4 rounded-xl border border-blue-100 shadow-sm relative overflow-hidden">
                                                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500"></div>
                                                            <div className="h-8 w-8 rounded-full bg-red-100 text-red-700 flex items-center justify-center font-black shrink-0 text-xs">
                                                                End
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <h3 className="font-bold text-[#0f172a] truncate">{routeProjects[routeProjects.length - 1].address}</h3>
                                                                <p className="text-xs text-gray-500 truncate mt-0.5">Ending at Final Project</p>
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
