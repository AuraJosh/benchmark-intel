import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
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
import { RecordingProvider } from './context/RecordingContext';

function App() {
    return (
        <RecordingProvider>
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

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </HashRouter>
        </RecordingProvider>
    );
}

export default App;
