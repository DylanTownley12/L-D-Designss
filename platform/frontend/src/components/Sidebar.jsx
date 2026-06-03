import { NavLink } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { dashboard as dashApi } from '../api/client'
import {
  LayoutDashboard, Bot, Target, Send, Globe, Phone, Calendar, Settings,
} from 'lucide-react'

const nav = [
  { to: '/dashboard',   Icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/agents',      Icon: Bot,             label: 'Agents' },
  { to: '/leads',       Icon: Target,          label: 'Leads' },
  { to: '/outreach',    Icon: Send,            label: 'Outreach' },
  { to: '/previews',    Icon: Globe,           label: 'Previews' },
  { to: '/missed-call', Icon: Phone,           label: 'Text-Back' },
  { to: '/plan',        Icon: Calendar,        label: 'Plan' },
  { to: '/settings',    Icon: Settings,        label: 'Settings' },
]

function LogoMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <path d="M14 2L26 14L14 26L2 14Z" fill="rgba(212,168,67,0.12)" stroke="#D4A843" strokeWidth="1.4"/>
      <path d="M14 8L20 14L14 20L8 14Z" fill="rgba(212,168,67,0.5)"/>
    </svg>
  )
}

function NavItem({ to, Icon, label, badge }) {
  const [hovered, setHovered] = useState(false)

  return (
    <NavLink
      to={to}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '8px 10px 8px 9px',
        borderRadius: 8,
        fontSize: 13.5,
        fontWeight: 500,
        textDecoration: 'none',
        transition: 'all 0.14s ease',
        borderLeft: isActive ? '2px solid #D4A843' : '2px solid transparent',
        background: isActive
          ? 'linear-gradient(90deg, rgba(212,168,67,0.1) 0%, rgba(212,168,67,0.015) 100%)'
          : hovered
          ? 'rgba(255,255,255,0.05)'
          : 'transparent',
        color: isActive ? 'rgba(255,255,255,0.95)' : hovered ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.4)',
      })}
    >
      {({ isActive }) => (
        <>
          <Icon
            size={15}
            style={{
              color: isActive ? '#D4A843' : hovered ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.28)',
              flexShrink: 0,
              transition: 'color 0.14s ease',
            }}
          />
          <span style={{ flex: 1 }}>{label}</span>
          {badge > 0 && (
            <span style={{
              background: '#D4A843',
              color: '#000',
              fontSize: 9.5,
              fontWeight: 700,
              minWidth: 17,
              height: 17,
              borderRadius: 999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
            }}>
              {badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}

export default function Sidebar() {
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    const fetch = () => {
      dashApi.notifications({ unread_only: true })
        .then(d => setUnread(d.notifications?.length || 0))
        .catch(() => {})
    }
    fetch()
    const t = setInterval(fetch, 30000)
    return () => clearInterval(t)
  }, [])

  return (
    <aside style={{
      width: 236,
      flexShrink: 0,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: '#0a0a10',
      borderRight: '1px solid rgba(255,255,255,0.06)',
      position: 'relative',
    }}>
      {/* Top atmospheric glow */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: 130,
        background: 'radial-gradient(ellipse at 50% 0%, rgba(212,168,67,0.09) 0%, transparent 70%)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      {/* Logo */}
      <div style={{
        padding: '20px 16px 15px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        position: 'relative',
        zIndex: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <LogoMark />
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 15.5,
            fontWeight: 800,
            letterSpacing: '-0.025em',
            lineHeight: 1,
            background: 'linear-gradient(135deg, #D4A843 0%, #F0C96A 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            L&D
          </div>
          <div style={{
            fontSize: 8.5,
            fontWeight: 600,
            letterSpacing: '0.15em',
            color: 'rgba(255,255,255,0.22)',
            marginTop: 2,
            textTransform: 'uppercase',
          }}>
            AI PLATFORM
          </div>
        </div>
        <div style={{
          fontSize: 8.5,
          fontWeight: 600,
          padding: '2px 6px',
          borderRadius: 4,
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.07)',
          color: 'rgba(255,255,255,0.18)',
          letterSpacing: '0.04em',
          flexShrink: 0,
        }}>
          v1
        </div>
      </div>

      {/* Nav */}
      <nav style={{
        flex: 1,
        padding: '10px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        position: 'relative',
        zIndex: 1,
      }}>
        {nav.map(item => (
          <NavItem
            key={item.to}
            to={item.to}
            Icon={item.Icon}
            label={item.label}
            badge={item.label === 'Dashboard' ? unread : 0}
          />
        ))}
      </nav>

      {/* Footer */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'relative',
        zIndex: 1,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{
            position: 'relative',
            width: 7,
            height: 7,
          }}>
            <div style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              background: '#10b981',
              opacity: 0.4,
              animation: 'ping 2s cubic-bezier(0,0,0.2,1) infinite',
              transform: 'scale(1.5)',
            }} />
            <div style={{
              position: 'relative',
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: '#10b981',
              boxShadow: '0 0 8px rgba(16,185,129,0.7)',
            }} />
          </div>
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.28)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            SYS LIVE
          </span>
        </div>
        <a
          href="https://dylantownley12.github.io/L-D-Designss"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 10,
            color: 'rgba(255,255,255,0.14)',
            textDecoration: 'none',
          }}
        >
          Portfolio →
        </a>
      </div>
    </aside>
  )
}
