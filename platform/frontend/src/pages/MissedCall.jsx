import { useState, useEffect } from 'react'
import api from '../api/client'

const TRADES = ['plumber', 'electrician', 'builder', 'carpenter', 'painter', 'decorator', 'roofer', 'plasterer', 'tiler', 'landscaper', 'other']

function ClientCard({ client, onToggle, onDelete, onTest }) {
  const [testing, setTesting] = useState(false)
  const [testPhone, setTestPhone] = useState('')
  const [showTest, setShowTest] = useState(false)

  const runTest = async () => {
    if (!testPhone) return
    setTesting(true)
    try {
      await onTest(client.id, testPhone)
      setShowTest(false)
      setTestPhone('')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className={`card rounded-xl p-4 border ${client.active ? 'border-emerald-500/20' : 'border-white/6 opacity-60'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold">{client.business_name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              client.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'
            }`}>
              {client.active ? 'Active' : 'Paused'}
            </span>
          </div>
          <div className="text-white/40 text-sm">{client.owner_name} · {client.trade}</div>
          <div className="text-white/30 text-xs mt-1">{client.phone}</div>
          <div className="flex items-center gap-4 mt-2">
            <span className="text-xs text-white/30">
              Today: <span className="text-gold font-medium">{client.events_today || 0}</span>
            </span>
            <span className="text-xs text-white/30">
              Total: <span className="text-white/60 font-medium">{client.total_textbacks_sent || 0}</span>
            </span>
            <span className="text-xs text-emerald-400 font-medium">
              £{(client.monthly_fee || 49).toFixed(0)}/mo
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => onToggle(client.id)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
              client.active
                ? 'bg-white/8 hover:bg-white/12 text-white/60'
                : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400'
            }`}
          >
            {client.active ? 'Pause' : 'Resume'}
          </button>
          <button
            onClick={() => setShowTest(!showTest)}
            className="text-xs px-3 py-1.5 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 transition-colors"
          >
            Test
          </button>
          <button
            onClick={() => onDelete(client.id)}
            className="text-xs px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {showTest && (
        <div className="mt-3 pt-3 border-t border-white/6 flex gap-2">
          <input
            type="tel"
            value={testPhone}
            onChange={e => setTestPhone(e.target.value)}
            placeholder="07700 900000"
            className="flex-1 bg-white/6 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-gold/50"
          />
          <button
            onClick={runTest}
            disabled={testing || !testPhone}
            className="btn-gold py-1.5 px-4 text-sm disabled:opacity-50"
          >
            {testing ? 'Sending…' : 'Send Test'}
          </button>
        </div>
      )}
    </div>
  )
}

function AddClientModal({ onClose, onSaved }) {
  const [form, setForm] = useState({
    business_name: '',
    owner_name: '',
    phone: '',
    trade: 'plumber',
    custom_message: '',
    monthly_fee: 49,
  })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!form.business_name || !form.phone) return
    setSaving(true)
    try {
      await api.post('/textback/clients', form)
      onSaved()
      onClose()
    } catch (e) {
      alert(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="card rounded-2xl p-6 w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">Add New Client</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white text-xl">×</button>
        </div>

        {[
          { label: 'Business Name', key: 'business_name', placeholder: 'Dave\'s Plumbing' },
          { label: 'Owner Name', key: 'owner_name', placeholder: 'Dave Smith' },
          { label: 'Business Phone', key: 'phone', placeholder: '07700 900000' },
        ].map(f => (
          <div key={f.key}>
            <label className="text-xs text-white/40 mb-1 block">{f.label}</label>
            <input
              type="text"
              value={form[f.key]}
              onChange={e => setForm({ ...form, [f.key]: e.target.value })}
              placeholder={f.placeholder}
              className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-gold/50"
            />
          </div>
        ))}

        <div>
          <label className="text-xs text-white/40 mb-1 block">Trade</label>
          <select
            value={form.trade}
            onChange={e => setForm({ ...form, trade: e.target.value })}
            className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/50"
          >
            {TRADES.map(t => <option key={t} value={t} className="bg-dark">{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs text-white/40 mb-1 block">Custom Message (optional — leave blank for default)</label>
          <textarea
            value={form.custom_message}
            onChange={e => setForm({ ...form, custom_message: e.target.value })}
            placeholder="Hi, missed your call! I'll ring back soon. — {name}"
            rows={3}
            className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-gold/50 resize-none"
          />
          <p className="text-white/25 text-xs mt-1">Use {'{name}'} to insert the owner's first name.</p>
        </div>

        <div>
          <label className="text-xs text-white/40 mb-1 block">Monthly Fee (£)</label>
          <input
            type="number"
            value={form.monthly_fee}
            onChange={e => setForm({ ...form, monthly_fee: parseFloat(e.target.value) })}
            className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/50"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn-ghost flex-1 py-2">Cancel</button>
          <button onClick={save} disabled={saving || !form.business_name || !form.phone}
                  className="btn-gold flex-1 py-2 disabled:opacity-50">
            {saving ? 'Saving…' : 'Add Client'}
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

  const showToastMsg = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = async () => {
    setLoading(true)
    try {
      const [c, s] = await Promise.all([
        api.get('/textback/clients'),
        api.get('/textback/stats'),
      ])
      setClients(c.clients || [])
      setStats(s)
    } catch (e) {
      showToastMsg(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const toggleClient = async (id) => {
    try {
      const res = await api.post(`/textback/clients/${id}/toggle`)
      showToastMsg(res.active ? 'Client activated' : 'Client paused')
      load()
    } catch (e) { showToastMsg(e.message, 'error') }
  }

  const deleteClient = async (id) => {
    if (!confirm('Delete this client? This cannot be undone.')) return
    try {
      await api.delete(`/textback/clients/${id}`)
      showToastMsg('Client deleted')
      load()
    } catch (e) { showToastMsg(e.message, 'error') }
  }

  const testTextback = async (clientId, callerNumber) => {
    try {
      await api.post(`/textback/test/${clientId}`, null, { params: { caller_number: callerNumber } })
      showToastMsg('Test SMS sent!')
    } catch (e) { showToastMsg(e.message, 'error') }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-xl ${
          toast.type === 'error' ? 'bg-red-500/90 text-white' : 'bg-gold text-black'
        }`}>{toast.msg}</div>
      )}

      {showAdd && <AddClientModal onClose={() => setShowAdd(false)} onSaved={load} />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Missed Call Text-Back</h1>
          <p className="text-white/40 text-sm mt-0.5">Auto-reply SMS when tradespeople miss a call</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-gold">
          + Add Client
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Active Clients', value: stats.active_clients, color: 'text-emerald-400' },
            { label: 'Texts Today',    value: stats.sent_today,     color: 'text-gold' },
            { label: 'This Month',     value: stats.sent_this_month, color: 'text-blue-400' },
            { label: 'MRR',           value: `£${(stats.mrr || 0).toFixed(0)}`, color: 'text-emerald-400' },
          ].map(s => (
            <div key={s.label} className="card p-4 rounded-xl text-center">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-white/40 text-xs mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* How it works */}
      <div className="card p-5 rounded-xl border border-gold/10 bg-gold/3">
        <h3 className="font-semibold text-gold mb-2 text-sm">How it works</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-white/50">
          <div className="flex gap-3">
            <span className="text-gold font-bold text-base">1.</span>
            <span>Client misses a call on their business phone</span>
          </div>
          <div className="flex gap-3">
            <span className="text-gold font-bold text-base">2.</span>
            <span>Twilio detects the missed call and hits our webhook instantly</span>
          </div>
          <div className="flex gap-3">
            <span className="text-gold font-bold text-base">3.</span>
            <span>Caller gets an SMS within seconds — client never loses a lead</span>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-white/6 text-xs text-white/30">
          <span className="font-medium text-white/50">Webhook URL:</span>{' '}
          <code className="bg-white/6 px-2 py-0.5 rounded text-gold/70">
            POST /api/textback/webhook/missed-call/{'{'}{'{'}client_id{'}'}{'}'}
          </code>
          {' '}— configure this in Twilio for each client's number.
        </div>
      </div>

      {/* Clients list */}
      {loading ? (
        <div className="text-white/30 text-sm text-center py-12">Loading clients…</div>
      ) : clients.length === 0 ? (
        <div className="card rounded-xl p-12 text-center">
          <div className="text-5xl mb-4">📞</div>
          <div className="text-white/40 text-sm mb-2">No clients yet.</div>
          <div className="text-white/25 text-xs">Add your first client to get started. Pitch it as: <em>"Never lose a lead from a missed call — £49/month."</em></div>
          <button onClick={() => setShowAdd(true)} className="btn-gold mt-4">
            Add First Client
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="text-sm text-white/40 font-medium uppercase tracking-wider">
            Clients ({clients.length})
          </h2>
          {clients.map(c => (
            <ClientCard
              key={c.id}
              client={c}
              onToggle={toggleClient}
              onDelete={deleteClient}
              onTest={testTextback}
            />
          ))}
        </div>
      )}
    </div>
  )
}
