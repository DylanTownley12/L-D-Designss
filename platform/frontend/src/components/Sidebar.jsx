import { NavLink } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { dashboard as dashApi } from '../api/client'

const nav = [
  { to: '/dashboard', icon: '📊', label: 'Dashboard' },
  { to: '/leads',     icon: '🎯', label: 'Leads' },
  { to: '/outreach',  icon: '📤', label: 'Outreach' },
  { to: '/previews',  icon: '🌐', label: 'Previews' },
  { to: '/missed-call', icon: '📞', label: 'Text-Back' },
  { to: '/settings',  icon: '⚙️', label: 'Settings' },
]

export default function Sidebar() {
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    dashApi.notifications({ unread_only: true }).then(d => setUnread(d.notifications?.length || 0)).catch(() => {})
    const timer = setInterval(() => {
      dashApi.notifications({ unread_only: true }).then(d => setUnread(d.notifications?.length || 0)).catch(() => {})
    }, 30000)
    return () => clearInterval(timer)
  }, [])

  return (
    <aside className="w-56 bg-dark-2 border-r border-white/6 flex flex-col h-full flex-shrink-0">
      {/* Logo */}
      <div className="p-5 border-b border-white/6">
        <div className="text-lg font-bold">
          <span className="gold-text">L&amp;D</span>
          <span className="text-white/70 font-normal text-sm ml-2">Platform</span>
        </div>
        <div className="text-white/30 text-xs mt-0.5">Agency Dashboard</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1">
        {nav.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-gold/10 text-gold border border-gold/20'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              }`
            }
          >
            <span className="text-base">{item.icon}</span>
            <span>{item.label}</span>
            {item.label === 'Dashboard' && unread > 0 && (
              <span className="ml-auto bg-gold text-black text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {unread}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-white/6">
        <a
          href="https://dylantownley12.github.io/L-D-Designss"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-white/25 hover:text-gold transition-colors block"
        >
          View Portfolio Site →
        </a>
      </div>
    </aside>
  )
}
