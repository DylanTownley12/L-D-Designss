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
}

export const strategy = {
  getBrief: () => api.get('/strategy/brief'),
  runBrief: () => api.post('/strategy/brief/run'),
}

export default api
