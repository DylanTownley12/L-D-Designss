import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { capture } from '../api/client'

// Public, homeowner-facing lead-capture form. "Editorial Light" palette:
// stone white, ink, deep-navy accent — trustworthy for a 35-45yo homeowner.
const C = {
  stone: '#F6F4EF', ink: '#15171C', navy: '#1C3D5E',
  line: 'rgba(21,23,28,0.12)', muted: '#5b5f66', white: '#ffffff',
}

export default function Capture() {
  const { token } = useParams()
  const [info, setInfo] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', postcode: '', job_description: '' })
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    capture.info(token).then(setInfo).catch(() => setNotFound(true))
  }, [token])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.phone || form.phone.trim().length < 7) {
      setError('Please enter a valid phone number so they can call you back.')
      return
    }
    setSending(true)
    try {
      const res = await capture.submit(token, form)
      setDone(res.message || 'Thanks! They have your details and will be in touch shortly.')
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setSending(false)
    }
  }

  const wrap = {
    minHeight: '100vh', background: C.stone, color: C.ink,
    fontFamily: 'Inter, system-ui, sans-serif', display: 'flex',
    alignItems: 'center', justifyContent: 'center', padding: '24px',
  }
  const card = {
    background: C.white, width: '100%', maxWidth: 460, borderRadius: 16,
    border: `1px solid ${C.line}`, padding: '36px 30px',
    boxShadow: '0 10px 40px rgba(21,23,28,0.08)',
  }
  const label = { display: 'block', fontSize: 13, fontWeight: 600, color: C.muted, margin: '16px 0 6px' }
  const input = {
    width: '100%', padding: '13px 14px', borderRadius: 10, border: `1px solid ${C.line}`,
    fontSize: 16, color: C.ink, background: C.stone, outline: 'none', boxSizing: 'border-box',
  }
  const serif = { fontFamily: 'Fraunces, Georgia, serif' }

  if (notFound) return (
    <div style={wrap}><div style={card}>
      <h1 style={{ ...serif, fontSize: 24, margin: 0 }}>Form not found</h1>
      <p style={{ color: C.muted, marginTop: 10 }}>This enquiry link isn’t valid. Please double-check the address.</p>
    </div></div>
  )

  if (done) return (
    <div style={wrap}><div style={{ ...card, textAlign: 'center' }}>
      <div style={{ fontSize: 44, marginBottom: 8 }}>✓</div>
      <h1 style={{ ...serif, fontSize: 26, margin: '0 0 10px' }}>Message sent</h1>
      <p style={{ color: C.muted, fontSize: 16, lineHeight: 1.5 }}>{done}</p>
    </div></div>
  )

  return (
    <div style={wrap}>
      <form style={card} onSubmit={submit}>
        <div style={{ fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase', color: C.navy, fontWeight: 700 }}>
          {info?.trade ? `${info.trade}${info?.town ? ` · ${info.town}` : ''}` : 'Request a callback'}
        </div>
        <h1 style={{ ...serif, fontSize: 28, margin: '6px 0 4px', lineHeight: 1.15 }}>
          {info?.business_name || 'Get in touch'}
        </h1>
        <p style={{ color: C.muted, fontSize: 15, margin: '0 0 6px' }}>
          Leave your details and they’ll call you straight back — usually within the hour.
        </p>

        <label style={label}>Your name</label>
        <input style={input} value={form.name} placeholder="e.g. Sarah Jones"
          onChange={e => setForm({ ...form, name: e.target.value })} />

        <label style={label}>Phone number *</label>
        <input style={input} value={form.phone} placeholder="07…" inputMode="tel"
          onChange={e => setForm({ ...form, phone: e.target.value })} />

        <label style={label}>Postcode</label>
        <input style={input} value={form.postcode} placeholder="e.g. WN1 1AA"
          onChange={e => setForm({ ...form, postcode: e.target.value })} />

        <label style={label}>What do you need? </label>
        <textarea style={{ ...input, minHeight: 90, resize: 'vertical' }} value={form.job_description}
          placeholder="Briefly describe the job…"
          onChange={e => setForm({ ...form, job_description: e.target.value })} />

        {error && <div style={{ color: '#b3261e', fontSize: 14, marginTop: 14 }}>{error}</div>}

        <button type="submit" disabled={sending} style={{
          width: '100%', marginTop: 22, padding: '15px', borderRadius: 10, border: 'none',
          background: sending ? '#3a566f' : C.navy, color: '#fff', fontSize: 16, fontWeight: 600,
          cursor: sending ? 'default' : 'pointer',
        }}>
          {sending ? 'Sending…' : 'Request a callback'}
        </button>
        <p style={{ textAlign: 'center', color: C.muted, fontSize: 12, marginTop: 16 }}>
          No spam. Your details only go to {info?.business_name || 'the business'}.
        </p>
      </form>
    </div>
  )
}
