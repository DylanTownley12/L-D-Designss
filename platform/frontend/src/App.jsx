import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Leads from './pages/Leads'
import Outreach from './pages/Outreach'
import Previews from './pages/Previews'
import Settings from './pages/Settings'
import Agents from './pages/Agents'
import Command from './pages/Command'
import Hub from './pages/Hub'
import Holidays from './pages/Holidays'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Dashboard app */}
        <Route path="*" element={
          <div className="flex h-screen overflow-hidden bg-dark">
            <Sidebar />
            <main className="flex-1 overflow-y-auto">
              <Routes>
                <Route path="/" element={<Navigate to="/command" replace />} />
                {/* Redirect old routes */}
                <Route path="/dashboard" element={<Navigate to="/command" replace />} />
                <Route path="/missed-call" element={<Navigate to="/command" replace />} />
                <Route path="/plan" element={<Navigate to="/command" replace />} />
                <Route path="/live" element={<Navigate to="/command" replace />} />
                {/* Active routes */}
                <Route path="/command" element={<Command />} />
                <Route path="/hub" element={<Hub />} />
                <Route path="/agents" element={<Agents />} />
                <Route path="/leads" element={<Leads />} />
                <Route path="/outreach" element={<Outreach />} />
                <Route path="/previews" element={<Previews />} />
                <Route path="/holidays" element={<Holidays />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </main>
          </div>
        } />
      </Routes>
    </BrowserRouter>
  )
}
