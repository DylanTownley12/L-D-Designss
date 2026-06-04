import { useState, useEffect } from 'react'
import api from '../api/client'
import { Phone, Plus, X, Play, Pause, Trash2, Send, CheckCircle2, AlertCircle, MessageSquare } from 'lucide-react'

const C = {
  bg:        '#02020e',
  panel:     'rgba(0, 8, 28, 0.7)',
  border:    'rgba(0, 212, 255, 0.1)',
  borderDim: 'rgba(0, 212, 255, 0.06)',
  cyan:      '#00D4FF',
  blue:      '#0055FF',
  gold:      '#D4A843',
  green:     '#00FF88',
  red:       '#FF3355',
  text:      'rgba(255,255,255,0.88)',
  textMid:   'rgba(255,255,255,0.42)',
  textDim:   'rgba(255,255,255,0.16)',
  mono:      '"JetBrains Mono", monospace',
}
const label = (extra = {}) => ({ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.textDim, fontFamily: C.mono, ...extra })
const panel = (extra = {}) => ({ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, ...extra })

const TRADES = ['plumber', 'electrician', 'builder', 'carpenter', 'painter', 'decorator', 'roofer', 'plasterer', 'tiler', 'landscaper', 'other']

function ClientCard({ client, onToggle, onDelete, onTest }) {
  const [testing, setTesting] = useState(false)
  const [testPhone, setTestPhone] = useState('')
  const [showTest, setShowTest] = useState(false)

  const runTest = async () => {
    if (!testPhone) return
    setTesting(true)
    try { await onTest(client.id, testPhone); setShowTest(false); setTestPhone('') }
    finally { setTesting(false) }
  }

  return (
    <div style={{
      background: client.active
        ? 'linear-gradient(135deg, rgba(16,185,129,0.07) 0%, #0c0c12 100%)'
        : '#0c0c12',
      border: `1px solid ${client.active ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.07)'}`,
      borderRadius: 14,
      padding: 18,
      opacity: client.active ? 1 : 0.65,
      boxShadow: client.active ? '0 0 20px rgba(16,185,129,0.06)' : 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, justifyContent: 'space-between' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>{client.business_name}</span>
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '2px 9px', borderRadius: 99,
              background: client.active ? 'rgba(16,185,129,0.15)' : 'rgba(107,114,128,0.15)',
              color: client.active ? '#6ee7b7' : '#9ca3af',
            }}>
              {client.active ? 'Active' : 'Paused'}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 3 }}>
            {client.owner_name} · {client.trade}
          </div>
          <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.28)', fontFamily: '"JetBrains Mono", monospace', marginBottom: 10 }}>
            {client.phone}
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.35)' }}>
              Today: <span style={{ color: '#D4A843', fontWeight: 600 }}>{client.events_today || 0}</span>
            </span>
            <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.35)' }}>
              Total: <span style={{ color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>{client.total_textbacks_sent || 0}</span>
            </span>
            <span style={{ fontSize: 11.5, color: '#34d399', fontWeight: 600 }}>
              £{(client.monthly_fee || 49).toFixed(0)}/mo
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button
            onClick={() => onToggle(client.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 11.5, padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
              background: client.active ? 'rgba(255,255,255,0.06)' : 'rgba(16,185,129,0.12)',
              border: `1px solid ${client.active ? 'rgba(255,255,255,0.1)' : 'rgba(16,185,129,0.25)'}`,
              color: client.active ? 'rgba(255,255,255,0.55)' : '#6ee7b7',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            {client.active ? <><Pause size={11} /> Pause</> : <><Play size={11} /> Resume</>}
          </button>
          <button
            onClick={() => setShowTest(!showTest)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 11.5, padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
              background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.22)',
              color: '#60a5fa', fontFamily: 'Inter, sans-serif',
            }}
          >
            <MessageSquare size={11} /> Test
          </button>
          <button
            onClick={() => onDelete(client.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 11.5, padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)',
              color: '#fca5a5', fontFamily: 'Inter, sans-serif',
            }}
          >
            <Trash2 size={11} /> Delete
          </button>
        </div>
      </div>

      {showTest && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 8 }}>
          <input
            type="tel"
            value={testPhone}
            onChange={e => setTestPhone(e.target.value)}
            placeholder="07700 900000"
            style={{
              flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'white',
              outline: 'none', fontFamily: 'Inter, sans-serif',
            }}
          />
          <button
            onClick={runTest}
            disabled={testing || !testPhone}
            className="btn-gold"
            style={{ fontSize: 12, whiteSpace: 'nowrap' }}
          >
            <Send size={12} /> {testing ? 'Sending...' : 'Send Test'}
          </button>
        </div>
      )}
    </div>
  )
}

function AddClientModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ business_name: '', owner_name: '', phone: '', trade: 'plumber', custom_message: '', monthly_fee: 49 })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!form.business_name || !form.phone) return
    setSaving(true)
    try { await api.post('/textback/clients', form); onSaved(); onClose() }
    catch (e) { alert(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: '#0c0c12', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 18, padding: 24, width: '100%', maxWidth: 440,
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>Add New Client</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {[
          { label: 'Business Name', key: 'business_name', placeholder: "Dave's Plumbing" },
          { label: 'Owner Name',    key: 'owner_name',    placeholder: 'Dave Smith' },
          { label: 'Business Phone', key: 'phone',        placeholder: '07700 900000' },
        ].map(f => (
          <div key={f.key}>
            <label style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 5, fontWeight: 500 }}>{f.label}</label>
            <input
              type="text"
              value={form[f.key]}
              onChange={e => setForm({ ...form, [f.key]: e.target.value })}
              placeholder={f.placeholder}
              style={{
                width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8, padding: '9px 12px', fontSize: 13, color: 'white', outline: 'none',
                fontFamily: 'Inter, sans-serif', boxSizing: 'border-box',
              }}
            />
          </div>
        ))}

        <div>
          <label style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 5, fontWeight: 500 }}>Trade</label>
          <select
            value={form.trade}
            onChange={e => setForm({ ...form, trade: e.target.value })}
            style={{
              width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8, padding: '9px 12px', fontSize: 13, color: 'rgba(255,255,255,0.8)',
              outline: 'none', fontFamily: 'Inter, sans-serif', cursor: 'pointer',
            }}
          >
            {TRADES.map(t => (
              <option key={t} value={t} style={{ background: '#0c0c12' }}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 5, fontWeight: 500 }}>
            Custom Message <span style={{ color: 'rgba(255,255,255,0.22)' }}>(optional)</span>
          </label>
          <textarea
            value={form.custom_message}
            onChange={e => setForm({ ...form, custom_message: e.target.value })}
            placeholder="Hi, missed your call! I'll ring back soon. — {name}"
            rows={3}
            style={{
              width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8, padding: '9px 12px', fontSize: 13, color: 'white', resize: 'none',
              outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box',
            }}
          />
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', marginTop: 4 }}>Use {'{name}'} to insert the owner's first name.</p>
        </div>

        <div>
          <label style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 5, fontWeight: 500 }}>Monthly Fee (£)</label>
          <input
            type="number"
            value={form.monthly_fee}
            onChange={e => setForm({ ...form, monthly_fee: parseFloat(e.target.value) })}
            style={{
              width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8, padding: '9px 12px', fontSize: 13, color: 'white', outline: 'none',
              fontFamily: 'Inter, sans-serif', boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
          <button onClick={onClose} className="btn-ghost" style={{ flex: 1, justifyContent: 'center' }}>Cancel</button>
          <button onClick={save} disabled={saving || !form.business_name || !form.phone} className="btn-gold" style={{ flex: 1, justifyContent: 'center' }}>
            {saving ? 'Saving...' : 'Add Client'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function MissedCall() {
  const [clients, setClients] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [toast, setToast] = useState(null)

  const showToastMsg = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const load = async () => {
    setLoading(true)
    try {
      const [c, s] = await Promise.all([api.get('/textback/clients'), api.get('/textback/stats')])
      setClients(c.clients || [])
      setStats(s)
    } catch (e) { showToastMsg(e.message, 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const toggleClient = async id => {
    try { const res = await api.post(`/textback/clients/${id}/toggle`); showToastMsg(res.active ? 'Client activated' : 'Client paused'); load() }
    catch (e) { showToastMsg(e.message, 'error') }
  }
  const deleteClient = async id => {
    if (!confirm('Delete this client? This cannot be undone.')) return
    try { await api.delete(`/textback/clients/${id}`); showToastMsg('Client deleted'); load() }
    catch (e) { showToastMsg(e.message, 'error') }
  }
  const testTextback = async (clientId, callerNumber) => {
    try { await api.post(`/textback/test/${clientId}`, null, { params: { caller_number: callerNumber } }); showToastMsg('Test SMS sent!') }
    catch (e) { showToastMsg(e.message, 'error') }
  }

  return (
    <div style={{ padding: '24px', maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {toast && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 50,
          padding: '10px 16px', borderRadius: 12, fontSize: 13, fontWeight: 500,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          background: toast.type === 'error' ? 'rgba(239,68,68,0.9)' : `linear-gradient(135deg, ${C.gold}, #F0C96A)`,
          color: toast.type === 'error' ? 'white' : 'black',
        }}>
          {toast.msg}
        </div>
      )}

      {showAdd && <AddClientModal onClose={() => setShowAdd(false)} onSaved={load} />}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.cyan, boxShadow: `0 0 8px ${C.cyan}`, animation: 'orbBreathe 2s ease-in-out infinite' }} />
            <span style={label()}>MISSED CALL TEXT-BACK</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: C.text }}>Text-Back System</h1>
          <p style={{ fontSize: 12, color: C.textMid, marginTop: 4 }}>Auto-reply SMS when tradespeople miss a call — £49/month per client</p>
        </div>
        <button onClick={() => setShowAdd(true)} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: `linear-gradient(135deg, ${C.gold}, #F0C96A)`,
          color: '#000', fontWeight: 700, fontSize: 12,
          padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
        }}>
          <Plus size={13} /> Add Client
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {[
            { lbl: 'Active Clients', value: stats.active_clients,   color: C.green },
            { lbl: 'Texts Today',    value: stats.sent_today,       color: C.gold },
            { lbl: 'This Month',     value: stats.sent_this_month,  color: C.cyan },
            { lbl: 'MRR',            value: `£${(stats.mrr || 0).toFixed(0)}`, color: C.green },
          ].map(s => (
            <div key={s.lbl} style={{ ...panel({ padding: '14px 16px', textAlign: 'center', position: 'relative', overflow: 'hidden' }) }}>
              <div style={{ ...label(), marginBottom: 6, fontSize: 7.5 }}>{s.lbl}</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: s.color, fontFamily: C.mono, letterSpacing: '-0.02em', textShadow: `0 0 16px ${s.color}50` }}>{s.value}</div>
              <div style={{ position: 'absolute', bottom: 0, right: 0, width: 50, height: 50, background: `radial-gradient(circle at 100% 100%, ${s.color}12 0%, transparent 70%)`, pointerEvents: 'none' }} />
            </div>
          ))}
        </div>
      )}

      {/* How it works */}
      <div style={{ background: `rgba(212,168,67,0.05)`, border: `1px solid rgba(212,168,67,0.2)`, borderRadius: 10, padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.gold, boxShadow: `0 0 6px ${C.gold}` }} />
          <span style={{ ...label(), color: C.gold, fontSize: 9 }}>HOW IT WORKS</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[
            { n: '1', text: 'Client misses a call on their business phone' },
            { n: '2', text: 'Twilio detects the missed call and hits our webhook instantly' },
            { n: '3', text: "Caller gets an SMS within seconds — client never loses a lead" },
          ].map(s => (
            <div key={s.n} style={{ display: 'flex', gap: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: C.gold, flexShrink: 0 }}>{s.n}.</span>
              <span style={{ fontSize: 12, color: C.textMid, lineHeight: 1.5 }}>{s.text}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.borderDim}`, fontSize: 11.5, color: C.textDim }}>
          <span style={{ color: C.textMid, fontWeight: 500 }}>Webhook URL:</span>{' '}
          <code style={{ color: `${C.gold}90`, background: 'rgba(212,168,67,0.08)', padding: '2px 7px', borderRadius: 5, fontSize: 10.5, fontFamily: C.mono }}>
            POST /api/textback/webhook/missed-call/{'{client_id}'}
          </code>
          {' '}— configure in Twilio for each client's number.
        </div>
      </div>

      {/* Clients */}
      {loading ? (
        <div style={{ textAlign: 'center', color: C.textMid, padding: '48px 0', fontSize: 13, fontFamily: C.mono, letterSpacing: '0.1em' }}>LOADING CLIENTS...</div>
      ) : clients.length === 0 ? (
        <div style={{ ...panel({ padding: '48px 24px', textAlign: 'center' }) }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: `rgba(212,168,67,0.08)`, border: `1px solid rgba(212,168,67,0.15)`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <Phone size={22} color={C.gold} style={{ opacity: 0.6 }} />
          </div>
          <div style={{ fontSize: 14, color: C.textMid, marginBottom: 6, fontWeight: 500 }}>No clients yet.</div>
          <div style={{ fontSize: 12, color: C.textDim, marginBottom: 18 }}>
            Pitch it as: "Never lose a lead from a missed call — £49/month."
          </div>
          <button onClick={() => setShowAdd(true)} style={{
            background: `linear-gradient(135deg, ${C.gold}, #F0C96A)`, color: '#000', fontWeight: 700,
            fontSize: 12, padding: '9px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
          }}>Add First Client</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.cyan, opacity: 0.5 }} />
            <span style={label()}>CLIENTS ({clients.length})</span>
          </div>
          {clients.map(c => (
            <ClientCard key={c.id} client={c} onToggle={toggleClient} onDelete={deleteClient} onTest={testTextback} />
          ))}
        </div>
      )}
    </div>
  )
}
