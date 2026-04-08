import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import Productivity from './pages/Productivity';
import Capture from './pages/Capture';
import Builders from './pages/Builders';
import Contracts from './pages/Contracts';
import Invoices from './pages/Invoices';
import SignContract from './pages/SignContract';
import PackWorkspace from './pages/PackWorkspace';
import ProjectPacks from './pages/ProjectPacks';
import Correspondence from './pages/Correspondence';
import Captures from './pages/Captures';
import ProtectedRoute from './components/ProtectedRoute';
import Routing from './pages/Routing';
import Finance from './pages/Finance';
import { RecordingProvider } from './context/RecordingContext';
import NotificationManager from './components/NotificationManager';

// Web Push Certificate Key (VAPID Key) from Firebase Console
const NOTIFICATION_VAPID_KEY = "BCj59RXnXkR_mAzEpU8RvE2ae5zIKwx_hdDfh2Bk0aFa48Uyyc1D-qxRzVmaEFtQLcfWBDaX1tY1wwNtzOZstlg";

function App() {
    useEffect(() => {
        const handleGlobalClick = (e) => {
            const anchor = e.target.closest('a');
            if (!anchor) return;

            const href = anchor.getAttribute('href');
            if (!href) return;

            // Only intercept external URLs or urls explicitly opening in new tabs
            const isExternal = 
                href.startsWith('http') || 
                href.startsWith('https') || 
                href.startsWith('mailto:') || 
                href.startsWith('tel:');
            
            const isBlankTarget = anchor.target === '_blank';

            // Check if we are in Tauri
            const isTauri = window.__TAURI_INTERNALS__ !== undefined;

            if (isTauri && (isExternal || isBlankTarget)) {
                e.preventDefault();
                openExternalLink(href);
            }
        };

        window.addEventListener('click', handleGlobalClick);
        return () => window.removeEventListener('click', handleGlobalClick);
    }, []);

    return (
        <RecordingProvider>
            <NotificationManager vapidKey={NOTIFICATION_VAPID_KEY} />
            <HashRouter>
            <Routes>
                {/* Public Routes */}
                <Route path="/login" element={<Login />} />
                <Route path="/capture" element={<Capture />} />
                <Route path="/sign/:agreementId/:accessKey" element={<SignContract />} />

                {/* Protected Routes */}
                <Route
                    path="/"
                    element={
                        <ProtectedRoute>
                            <Dashboard />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/productivity"
                    element={
                        <ProtectedRoute>
                            <Productivity />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/projects"
                    element={
                        <ProtectedRoute>
                            <Projects />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/packs"
                    element={
                        <ProtectedRoute>
                            <ProjectPacks />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/map"
                    element={
                        <ProtectedRoute>
                            <Projects />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/builders"
                    element={
                        <ProtectedRoute>
                            <Builders />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/contracts"
                    element={
                        <ProtectedRoute>
                            <Contracts />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/invoices"
                    element={
                        <ProtectedRoute>
                            <Invoices />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/correspondence"
                    element={
                        <ProtectedRoute>
                            <Correspondence />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/captures"
                    element={
                        <ProtectedRoute>
                            <Captures />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/routing"
                    element={
                        <ProtectedRoute>
                            <Routing />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/workspace"
                    element={
                        <ProtectedRoute>
                            <PackWorkspace />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/finance"
                    element={
                        <ProtectedRoute>
                            <Finance />
                        </ProtectedRoute>
                    }
                />

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </HashRouter>
        </RecordingProvider>
    );
}

export default App;
