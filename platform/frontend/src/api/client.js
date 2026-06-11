import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL || 'https://l-d-designss-production.up.railway.app/api'

const api = axios.create({
  baseURL: BASE,
  timeout: 60000,
})

api.interceptors.response.use(
  res => res.data,
  err => {
    const msg = err.response?.data?.detail || err.message || 'Request failed'
    return Promise.reject(new Error(typeof msg === 'string' ? msg : JSON.stringify(msg)))
  }
)

export const leads = {
  list: (params) => api.get('/leads/', { params }),
  get: (id) => api.get(`/leads/${id}`),
  create: (data) => api.post('/leads/', data),
  update: (id, data) => api.patch(`/leads/${id}`, data),
  delete: (id) => api.delete(`/leads/${id}`),
  doNotContact: (id) => api.post(`/leads/${id}/do-not-contact`),
  logReply: (lead_id, message) => api.post(`/webhooks/manual-reply/${lead_id}`, { message }),
}

export const outreach = {
  queue: (status) => api.get('/outreach/queue', { params: { status } }),
  queueByChannel: (channel, status) => api.get('/outreach/queue', { params: { status, channel } }),
  history: (limit) => api.get('/outreach/history', { params: { limit } }),
  generate: (lead_id, channel, sequence_day) =>
    api.post('/outreach/generate', null, { params: { lead_id, channel, sequence_day } }),
  approve: (id) => api.post(`/outreach/approve/${id}`),
  markSent: (id) => api.post(`/outreach/mark-sent/${id}`),
  reject: (id) => api.post(`/outreach/reject/${id}`),
  sendAllApproved: () => api.post('/outreach/send-all-approved'),
  clearInvalidWhatsapp: () => api.post('/outreach/clear-invalid-whatsapp'),
  logReply: (message_id, reply_text) => api.post(`/outreach/log-reply/${message_id}`, { reply_text }),
  generateWhatsappCampaign: () => api.post('/outreach/generate-whatsapp-campaign'),
  statsToday: () => api.get('/outreach/stats/today'),
  templateStats: () => api.get('/outreach/template-stats'),
  conversations: (limit = 5) => api.get('/outreach/conversations', { params: { limit } }),
}

export const previews = {
  generate: (lead_id) => api.post(`/previews/generate/${lead_id}`),
  list: (params) => api.get('/previews/', { params }),
  logView: (preview_id) => api.post(`/previews/view/${preview_id}`),
}

export const n8n = {
  opportunityScores: (limit = 20) => api.get('/n8n/opportunity-scores', { params: { limit } }),
  intentAlerts: (minutes = 25) => api.get('/n8n/intent-alerts', { params: { minutes } }),
  closingPriorities: () => api.get('/n8n/closing-priorities'),
  healthCheck: () => api.get('/n8n/health-check'),
  dailyStats: () => api.get('/n8n/daily-stats'),
  runDiscovery: () => api.post('/n8n/run-discovery'),
  runOutreachQueue: () => api.post('/n8n/run-outreach-queue'),
  checkIntent: () => api.post('/n8n/check-intent'),
  runClosingLoop: () => api.post('/n8n/run-closing-loop'),
  runSelfHealing: () => api.post('/n8n/run-self-healing'),
  runDailyOptimisation: () => api.post('/n8n/run-daily-optimisation'),
}

export const dashboard = {
  stats: () => api.get('/dashboard/stats'),
  notifications: (params) => api.get('/dashboard/notifications', { params }),
  markRead: () => api.post('/dashboard/notifications/mark-read'),
  activity: () => api.get('/dashboard/activity'),
  yesterday: () => api.get('/dashboard/yesterday'),
}

export const agents = {
  run: (agent, lead_id, params) => api.post('/agents/run', { agent, lead_id, params }),
  runPipeline: (lead_id) => api.post(`/agents/full-pipeline/${lead_id}`),
  logs: (agent, limit) => api.get('/agents/logs', { params: { agent, limit } }),
  status: () => api.get('/agents/status'),
  heartbeat: (agent) => api.post('/agents/heartbeat', { agent }),
  orchestrate: (task = 'auto') => api.post('/agents/orchestrate', null, { params: { task } }),
  sessions: () => api.get('/agents/orchestrate/sessions'),
  ceoStatus: () => api.get('/agents/ceo/status'),
  ceoDecisions: (limit = 20) => api.get('/agents/ceo/decisions', { params: { limit } }),
  waQueue: (limit = 10) => api.get('/agents/wa-queue', { params: { limit } }),
  chat: (agent, message, history) => api.post('/agents/chat', { agent, message, history }),
}

export const instagram = {
  queue: () => api.get('/outreach/queue', { params: { status: 'queued', channel: 'instagram' } }),
}

export const webhooks = {
  logReply: (lead_id, message) => api.post(`/webhooks/manual-reply/${lead_id}`, { message }),
}

export const payments = {
  createCheckout: (lead_id) => api.post(`/payments/create-checkout/${lead_id}`),
  getLink: (lead_id) => api.get(`/payments/link/${lead_id}`),
  getStatus: (lead_id) => api.get(`/payments/status/${lead_id}`),
}

export const publicStats = {
  live: () => api.get('/dashboard/live'),
}

export const ops = {
  actionQueue: (limit = 50) => api.get('/ops/action-queue', { params: { limit } }),
  blockers: () => api.get('/ops/blockers'),
  // Run a blocker's declared one-click fix (path/method/body come from the backend)
  runFix: (fixButton) => {
    const path = (fixButton?.path || '').replace(/^\/api/, '')
    const method = (fixButton?.method || 'POST').toLowerCase()
    return api[method](path, fixButton?.body || undefined)
  },
}

// The 9 OpenClaw agents (scout → chief) — coordination + control room
export const team = {
  controlRoom: () => api.get('/team/control-room'),
  summary: () => api.get('/team/summary'),
  approvals: (status = 'pending') => api.get('/team/approvals', { params: { status } }),
  decide: (id, decision) => api.post(`/team/approvals/${id}/decide`, { decision }),
  messages: (limit = 30) => api.get('/team/messages', { params: { unread: false, limit } }),
  postMessage: (body) => api.post('/team/messages', body),
  retryTask: (id) => api.post(`/team/tasks/${id}/retry`),
  retryStuck: () => api.post('/team/retry-stuck'),
  seedBacklog: (limit = 8) => api.post('/team/seed-backlog', null, { params: { limit } }),
}

export const strategy = {
  getBrief: () => api.get('/strategy/brief'),
  runBrief: () => api.post('/strategy/brief/run'),
}

// ── Trades lead-capture product ───────────────────────────────────────
// Public, token-gated capture form (homeowner-facing).
export const capture = {
  info: (token) => api.get(`/capture/${token}`),
  submit: (token, data) => api.post(`/capture/${token}`, data),
  uploadPhoto: (token, file) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post(`/capture/${token}/photo`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
}

// Public, token-gated client dashboard (trade client sees their leads).
export const portal = {
  dashboard: (token) => api.get(`/portal/${token}`),
  setLeadStatus: (token, leadId, status) =>
    api.post(`/portal/${token}/leads/${leadId}/status`, { status }),
}

// Internal Mission Control + the sales agents (founders only — ops key).
// `mode` is 'real' (default) or 'demo' — the UI toggle; never mixed server-side.
export const salesOps = {
  board: (key, mode = 'real') => api.get('/sales/board', { params: { key, mode } }),
  prospects: (key, params = {}) => api.get('/sales/prospects', { params: { ...params, key } }),
  scout: (key, body) => api.post('/sales/scout', body, { params: { key } }),
  importProspects: (key, body) => api.post('/sales/import', body, { params: { key } }),
  requalify: (key, mode = 'real') => api.post('/sales/requalify', null, { params: { key, mode } }),
  addProspect: (key, body) => api.post('/sales/prospects', body, { params: { key } }),
  log: (key, id, body) => api.post(`/sales/prospects/${id}/log`, body, { params: { key } }),
  prep: (key, id) => api.post(`/sales/prospects/${id}/prep`, null, { params: { key } }),
  convert: (key, id, body = {}) => api.post(`/sales/prospects/${id}/convert`, body, { params: { key } }),
  setWebsiteStatus: (key, id, body) => api.post(`/sales/prospects/${id}/website-status`, body, { params: { key } }),
  scoreOverride: (key, id, body) => api.post(`/sales/prospects/${id}/score-override`, body, { params: { key } }),
  buildPreview: (key, id) => api.post(`/sales/prospects/${id}/preview`, null, { params: { key } }),
  buildPreviews: (key, mode = 'real') => api.post('/sales/build-previews', null, { params: { key, mode } }),
  qaPreview: (key, id) => api.post(`/sales/prospects/${id}/preview/qa`, null, { params: { key } }),
  approvePreview: (key, id) => api.post(`/sales/prospects/${id}/preview/approve`, null, { params: { key } }),
  createClient: (key, body) => api.post('/sales/clients', body, { params: { key } }),
  markBuildPaid: (key, id) => api.post(`/sales/clients/${id}/build-paid`, null, { params: { key } }),
  report: (key, weekly = false) => api.get('/sales/report', { params: { key, weekly } }),
  seedDemo: (key) => api.post('/sales/seed-demo', null, { params: { key } }),
  wipeSeed: (key) => api.post('/sales/wipe-demo', null, { params: { key } }),
  agentEvents: (key, limit = 40) => api.get('/sales/agent-events', { params: { key, limit } }),
  runAgent: (key, agent, mode = 'real') => api.post('/sales/run-agent', null, { params: { key, agent, mode } }),
  tasks: (key, owner) => api.get('/sales/tasks', { params: { key, owner } }),
  taskDone: (key, id) => api.post(`/sales/tasks/${id}/done`, null, { params: { key } }),
  alerts: (key, mode = 'real') => api.get('/sales/alerts', { params: { key, mode } }),
  resolveAlert: (key, id) => api.post(`/sales/alerts/${id}/resolve`, null, { params: { key } }),
  brief: (key, mode = 'real') => api.post('/sales/brief', null, { params: { key, mode } }),
  // Browser-facing JARVIS brain (same answers as the Telegram bot).
  command: (key, text, founder = 'D') => api.post('/jarvis/command', { text, founder }, { params: { key } }),
}

// Manual triggers for the 08:00 / 18:00 cron jobs.
export const cron = {
  morning: (key) => api.post('/cron/morning', null, { params: { key } }),
  evening: (key) => api.post('/cron/evening', null, { params: { key } }),
}

export default api
