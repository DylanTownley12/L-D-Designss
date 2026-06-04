import { Key, Database, Mail, Phone, Sliders, ExternalLink, DollarSign } from 'lucide-react'

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

const sections = [
  {
    Icon: Mail,
    title: 'Gmail',
    items: [
      { label: 'GMAIL_ADDRESS',      value: 'Set in backend/.env', note: 'Your Gmail address' },
      { label: 'GMAIL_APP_PASSWORD', value: '••••••••••••••••',   note: 'App Password from Google Account → Security → App Passwords' },
    ],
  },
  {
    Icon: Key,
    title: 'OpenAI',
    items: [
      { label: 'OPENAI_API_KEY', value: 'sk-...', note: 'From platform.openai.com — uses gpt-4o-mini (~£0.001 per message)' },
    ],
  },
  {
    Icon: Database,
    title: 'Supabase',
    items: [
      { label: 'SUPABASE_URL',         value: 'https://xxx.supabase.co', note: 'From supabase.com → Project Settings → API' },
      { label: 'SUPABASE_SERVICE_KEY', value: 'eyJ...', note: 'Service role key — NOT the anon key' },
    ],
  },
  {
    Icon: Phone,
    title: 'Twilio SMS (Optional)',
    items: [
      { label: 'TWILIO_ACCOUNT_SID',  value: 'ACxxx...', note: 'From twilio.com/console — leave blank to disable SMS' },
      { label: 'TWILIO_AUTH_TOKEN',   value: '...',       note: 'Auth token from Twilio console' },
      { label: 'TWILIO_FROM_NUMBER',  value: '+441234567890', note: 'Your Twilio phone number' },
    ],
  },
  {
    Icon: Sliders,
    title: 'Behaviour',
    items: [
      { label: 'REQUIRE_APPROVAL',    value: 'true',  note: 'Set to false to auto-send without your approval (not recommended yet)' },
      { label: 'MAX_EMAILS_PER_DAY',  value: '50',    note: 'Stay under 500 to avoid Gmail spam flags. Start at 20–30.' },
      { label: 'MAX_SMS_PER_DAY',     value: '20',    note: 'Each SMS costs ~£0.04 with Twilio' },
    ],
  },
]

const costs = [
  { item: 'OpenAI (1,000 outreach emails)', cost: '~£0.15', period: 'one-time' },
  { item: 'Twilio SMS (per message)',        cost: '~£0.04', period: 'per SMS' },
  { item: 'Supabase',                        cost: 'Free',   period: 'up to 500MB / 50k rows' },
  { item: 'Railway backend hosting',         cost: '~£5',    period: 'per month' },
  { item: 'Vercel frontend hosting',         cost: 'Free',   period: 'hobby tier' },
  { item: 'Total to start',                  cost: '~£5-10', period: 'per month', highlight: true },
]

const links = [
  ['API Docs (local)',    'http://localhost:8000/docs'],
  ['Supabase Dashboard', 'https://app.supabase.com'],
  ['OpenAI Usage',       'https://platform.openai.com/usage'],
  ['Twilio Console',     'https://console.twilio.com'],
  ['Railway (backend)',  'https://railway.app'],
  ['Vercel (frontend)',  'https://vercel.com'],
]

export default function Settings() {
  return (
    <div style={{ padding: '24px', maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div style={{ marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.cyan, boxShadow: `0 0 8px ${C.cyan}`, animation: 'orbBreathe 2s ease-in-out infinite' }} />
          <span style={label()}>SYSTEM CONFIGURATION</span>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: C.text }}>Settings</h1>
        <p style={{ fontSize: 12, color: C.textMid, marginTop: 4 }}>
          All settings live in{' '}
          <code style={{ fontSize: 11, background: 'rgba(0,212,255,0.07)', border: `1px solid ${C.border}`, padding: '1px 6px', borderRadius: 5, color: C.gold, fontFamily: C.mono }}>
            platform/backend/.env
          </code>
        </p>
      </div>

      {/* How to change notice */}
      <div style={{ background: 'rgba(212,168,67,0.06)', border: '1px solid rgba(212,168,67,0.2)', borderRadius: 10, padding: '12px 16px' }}>
        <div style={{ ...label(), color: C.gold, marginBottom: 5, fontSize: 9 }}>HOW TO CHANGE SETTINGS</div>
        <p style={{ fontSize: 12.5, color: C.textMid, margin: 0, lineHeight: 1.6 }}>
          Edit <code style={{ color: C.gold, background: 'rgba(212,168,67,0.1)', padding: '1px 5px', borderRadius: 4, fontSize: 11, fontFamily: C.mono }}>platform/backend/.env</code> directly.
          Never commit to GitHub. Restart backend after changes. Railway Variables override .env in production.
        </p>
      </div>

      {/* Stripe notice */}
      <div style={{ background: 'rgba(0,212,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 16px' }}>
        <div style={{ ...label(), color: C.cyan, marginBottom: 5, fontSize: 9 }}>STRIPE PAYMENTS — REQUIRED TO TAKE DEPOSITS</div>
        <p style={{ fontSize: 12.5, color: C.textMid, margin: 0, lineHeight: 1.6 }}>
          Add <code style={{ color: C.cyan, background: 'rgba(0,212,255,0.1)', padding: '1px 5px', borderRadius: 4, fontSize: 11, fontFamily: C.mono }}>STRIPE_SECRET_KEY</code> and{' '}
          <code style={{ color: C.cyan, background: 'rgba(0,212,255,0.1)', padding: '1px 5px', borderRadius: 4, fontSize: 11, fontFamily: C.mono }}>STRIPE_WEBHOOK_SECRET</code> to Railway Variables.
          Set the webhook URL to <code style={{ fontSize: 10, color: C.textMid, fontFamily: C.mono }}>https://l-d-designss-production.up.railway.app/api/webhooks/stripe</code>
        </p>
      </div>

      {sections.map(section => {
        const Icon = section.Icon
        return (
          <div key={section.title} style={{ ...panel(), overflow: 'hidden' }}>
            <div style={{
              padding: '12px 18px', borderBottom: `1px solid ${C.borderDim}`,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.cyan, opacity: 0.5 }} />
              <Icon size={13} color={C.textMid} />
              <span style={{ ...label(), color: C.textMid, fontSize: 9 }}>{section.title}</span>
            </div>
            <div>
              {section.items.map((item, i) => (
                <div key={item.label} style={{
                  padding: '12px 18px',
                  borderBottom: i < section.items.length - 1 ? `1px solid ${C.borderDim}` : 'none',
                  display: 'flex', alignItems: 'flex-start', gap: 16,
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: C.gold, marginBottom: 3, fontFamily: C.mono }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: 11.5, color: C.textMid, lineHeight: 1.5 }}>{item.note}</div>
                  </div>
                  <div style={{ fontSize: 11, color: C.textDim, flexShrink: 0, marginTop: 1, fontFamily: C.mono }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {/* Cost breakdown */}
      <div style={{ ...panel(), overflow: 'hidden' }}>
        <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.borderDim}`, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.gold, opacity: 0.6 }} />
          <DollarSign size={13} color={C.textMid} />
          <span style={{ ...label(), color: C.textMid, fontSize: 9 }}>RUNNING COSTS</span>
        </div>
        <div>
          {costs.map((c, i) => (
            <div key={c.item} style={{
              padding: '10px 18px',
              borderBottom: i < costs.length - 1 ? `1px solid ${C.borderDim}` : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: c.highlight ? 'rgba(212,168,67,0.04)' : 'transparent',
            }}>
              <span style={{ fontSize: 13, color: c.highlight ? C.text : C.textMid, fontWeight: c.highlight ? 600 : 400 }}>
                {c.item}
              </span>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: c.highlight ? C.gold : C.text, fontFamily: C.mono, textShadow: c.highlight ? `0 0 10px ${C.gold}50` : 'none' }}>{c.cost}</div>
                <div style={{ fontSize: 10.5, color: C.textDim }}>{c.period}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Useful links */}
      <div style={{ ...panel(), padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.cyan, opacity: 0.5 }} />
          <ExternalLink size={13} color={C.textMid} />
          <span style={{ ...label(), color: C.textMid, fontSize: 9 }}>USEFUL LINKS</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {links.map(([lbl, url]) => (
            <a key={lbl} href={url} target="_blank" rel="noopener noreferrer" style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 12.5, color: C.textMid, textDecoration: 'none',
              padding: '7px 10px', borderRadius: 8,
              border: `1px solid ${C.borderDim}`,
              background: 'rgba(0,212,255,0.02)',
              transition: 'all 0.15s ease',
            }}>
              <ExternalLink size={11} color={C.textDim} />
              {lbl}
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
