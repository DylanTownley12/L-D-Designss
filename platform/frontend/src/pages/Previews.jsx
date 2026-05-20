import { useState, useEffect } from 'react'
import { previews as previewsApi, agents } from '../api/client'

export default function Previews() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = () =>
    previewsApi.list()
      .then(d => setData(d.previews || []))
      .catch(e => showToast(e.message, 'error'))
      .finally(() => setLoading(false))

  useEffect(() => { load() }, [])

  const generateBatch = async () => {
    try {
      const res = await agents.run('website_analyzer')
      showToast('Analysis running in background. Refresh in a moment.')
      setTimeout(load, 5000)
    } catch (e) { showToast(e.message, 'error') }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-xl ${
          toast.type === 'error' ? 'bg-red-500/90 text-white' : 'bg-gold text-black'
        }`}>{toast.msg}</div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Previews</h1>
          <p className="text-white/40 text-sm mt-0.5">{data.length} generated — these are what you send to leads</p>
        </div>
        <div className="flex gap-2">
          <button onClick={generateBatch} className="btn-ghost text-xs">Generate Batch</button>
          <button onClick={load} className="btn-ghost text-xs">↻ Refresh</button>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-white/30 py-12">Loading...</div>
      ) : data.length === 0 ? (
        <div className="card rounded-xl p-12 text-center">
          <div className="text-5xl mb-4">🌐</div>
          <h2 className="font-semibold mb-2">No Previews Yet</h2>
          <p className="text-white/40 text-sm mb-6">
            Go to Leads, find a lead with no website, and click the 🌐 preview button.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {data.map(preview => (
            <div key={preview.id} className="card rounded-xl overflow-hidden hover:border-gold/20 transition-colors group">
              {/* Mini preview thumbnail */}
              <div className="bg-dark-3 h-36 flex items-center justify-center relative overflow-hidden">
                <div className="text-5xl opacity-30">🌐</div>
                <div className="absolute inset-0 bg-gradient-to-br from-gold/5 to-transparent"></div>
                <div className="absolute bottom-2 right-2">
                  <a
                    href={preview.preview_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs bg-gold text-black font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    Open →
                  </a>
                </div>
              </div>

              <div className="p-4">
                <div className="font-semibold text-sm mb-1 truncate">
                  {preview.leads?.business_name || preview.personalization_data?.business_name || 'Unknown'}
                </div>
                <div className="text-white/40 text-xs mb-3">
                  {preview.personalization_data?.city || preview.leads?.city || '—'}
                </div>

                <div className="text-white/30 text-xs truncate mb-3 font-mono">
                  {preview.preview_url}
                </div>

                <div className="flex gap-2">
                  <a
                    href={preview.preview_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-gold flex-1 text-center py-1.5 text-xs"
                  >
                    Preview Site →
                  </a>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(preview.preview_url)
                      showToast('URL copied!')
                    }}
                    className="btn-ghost px-3 py-1.5 text-xs"
                    title="Copy URL"
                  >
                    📋
                  </button>
                </div>

                <div className="text-white/20 text-xs mt-2">
                  {new Date(preview.created_at).toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'short', year: 'numeric'
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
