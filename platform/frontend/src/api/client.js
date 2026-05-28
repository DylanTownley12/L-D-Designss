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
}

export const outreach = {
  queue: (status) => api.get('/outreach/queue', { params: { status } }),
  history: (limit) => api.get('/outreach/history', { params: { limit } }),
  generate: (lead_id, channel, sequence_day) =>
    api.post('/outreach/generate', null, { params: { lead_id, channel, sequence_day } }),
  approve: (id) => api.post(`/outreach/approve/${id}`),
  reject: (id) => api.post(`/outreach/reject/${id}`),
  sendAllApproved: () => api.post('/outreach/send-all-approved'),
  statsToday: () => api.get('/outreach/stats/today'),
}

export const previews = {
  generate: (lead_id) => api.post(`/previews/generate/${lead_id}`),
  list: () => api.get('/previews/'),
}

export const dashboard = {
  stats: () => api.get('/dashboard/stats'),
  notifications: (params) => api.get('/dashboard/notifications', { params }),
  markRead: () => api.post('/dashboard/notifications/mark-read'),
  activity: () => api.get('/dashboard/activity'),
}

export const agents = {
  run: (agent, lead_id, params) => api.post('/agents/run', { agent, lead_id, params }),
  runPipeline: (lead_id) => api.post(`/agents/full-pipeline/${lead_id}`),
  logs: (agent) => api.get('/agents/logs', { params: { agent } }),
}

export const webhooks = {
  logReply: (lead_id, message) => api.post(`/webhooks/manual-reply/${lead_id}`, { message }),
}

export default api
