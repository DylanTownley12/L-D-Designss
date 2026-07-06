import { useEffect } from 'react'
import { useAgency, startSimEngine } from './store'
import type { Kpis, Proposal, FeedItem } from './types'

/**
 * useAgencyData — the ONLY place the UI gets data from.
 *
 * mode 'sim'  (default): the in-memory simulation drives everything.
 * mode 'live': polls ./status/*.json every 3s and writes the same shapes
 *              into the store. Point your real agent system at:
 *                status/kpis.json      -> Kpis
 *                status/proposals.json -> Proposal[]
 *                status/feed.json      -> FeedItem[]
 *              The UI has no idea which mode is feeding it.
 *
 * Select mode with ?mode=live in the URL or VITE_DATA_MODE=live.
 */
export function useAgencyData() {
  const mode = useAgency((s) => s.mode)
  const kpis = useAgency((s) => s.kpis)
  const proposals = useAgency((s) => s.proposals)
  const feed = useAgency((s) => s.feed)
  const approve = useAgency((s) => s.approve)
  const reject = useAgency((s) => s.reject)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const wanted =
      params.get('mode') === 'live' || import.meta.env.VITE_DATA_MODE === 'live' ? 'live' : 'sim'
    useAgency.getState().setMode(wanted)

    if (wanted === 'sim') {
      startSimEngine()
      return
    }

    let alive = true
    const poll = async () => {
      try {
        const [k, p, f] = await Promise.all([
          fetch('./status/kpis.json').then((r) => (r.ok ? r.json() : null)),
          fetch('./status/proposals.json').then((r) => (r.ok ? r.json() : null)),
          fetch('./status/feed.json').then((r) => (r.ok ? r.json() : null)),
        ])
        if (!alive) return
        useAgency.getState().setLiveSnapshot({
          ...(k ? { kpis: k as Kpis } : {}),
          ...(p ? { proposals: p as Proposal[] } : {}),
          ...(f ? { feed: f as FeedItem[] } : {}),
        })
      } catch {
        /* status files not there yet — keep last snapshot */
      }
    }
    poll()
    const t = setInterval(poll, 3000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  return { mode, kpis, proposals, feed, approve, reject }
}
