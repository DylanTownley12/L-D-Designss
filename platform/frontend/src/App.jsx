import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Leads from './pages/Leads'
import Outreach from './pages/Outreach'
import Previews from './pages/Previews'
import Settings from './pages/Settings'
import Agents from './pages/Agents'
import Command from './pages/Command'
import Hub from './pages/Hub'
import Calls from './pages/Calls'
import Jarvis from './pages/Jarvis'
import Capture from './pages/Capture'
import ClientDashboard from './pages/ClientDashboard'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Standalone full-screen JARVIS OS — no dashboard chrome */}
        <Route path="/jarvis" element={<Jarvis />} />

        {/* Public, token-gated pages — no dashboard chrome */}
        <Route path="/capture/:token" element={<Capture />} />
        <Route path="/d/:token" element={<ClientDashboard />} />

        {/* Dashboard app */}
        <Route path="*" element={
          <div className="flex h-screen overflow-hidden bg-dark">
            <Sidebar />
            <main className="flex-1 overflow-y-auto">
              <Routes>
                {/* ONE founder interface: everything funnels to /jarvis */}
                <Route path="/" element={<Navigate to="/jarvis" replace />} />
                <Route path="/command" element={<Navigate to="/jarvis" replace />} />
                <Route path="/ops" element={<Navigate to="/jarvis" replace />} />
                <Route path="/dashboard" element={<Navigate to="/jarvis" replace />} />
                <Route path="/missed-call" element={<Navigate to="/jarvis" replace />} />
                <Route path="/plan" element={<Navigate to="/jarvis" replace />} />
                <Route path="/live" element={<Navigate to="/jarvis" replace />} />
                {/* Barber DO-NEXT preserved (not the trades cockpit) */}
                <Route path="/do-next" element={<Command />} />
                <Route path="/hub" element={<Hub />} />
                <Route path="/agents" element={<Agents />} />
                <Route path="/leads" element={<Leads />} />
                <Route path="/calls" element={<Calls />} />
                <Route path="/outreach" element={<Outreach />} />
                <Route path="/previews" element={<Previews />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </main>
          </div>
        } />
      </Routes>
    </BrowserRouter>
  )
}
