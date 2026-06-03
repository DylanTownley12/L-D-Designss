import { useEffect, useRef } from 'react'

const FOV = 420
const ROTATION_SPEED = 0.0016
const WOBBLE_SPEED = 0.006

function initNodes() {
  const nodes = []

  // Central core
  nodes.push({ bx: 0, by: 0, bz: 0, r: 13, isCore: true, color: [0, 212, 255], phase: 0, speed: 1.4 })

  // Inner ring — 8 nodes
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const d = 90 + (i % 3) * 12
    nodes.push({
      bx: Math.cos(a) * d,
      by: Math.sin(a) * d * 0.58,
      bz: Math.sin(a + 0.9) * 52,
      r: 5 + (i % 3) * 1.4,
      isCore: false,
      color: [0, 130, 255],
      phase: i * 0.85, speed: 0.55 + i * 0.09,
    })
  }

  // Outer ring — 14 nodes
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.22
    const d = 172 + (i % 4) * 14
    nodes.push({
      bx: Math.cos(a) * d,
      by: Math.sin(a) * d * 0.52,
      bz: Math.cos(a * 1.35) * 78,
      r: 3 + (i % 4) * 0.8,
      isCore: false,
      color: [0, 55, 185],
      phase: i * 0.52, speed: 0.28 + i * 0.04,
    })
  }

  // Scattered satellites
  ;[
    { bx: -235, by: -65, bz: 35, r: 3.5 },
    { bx: 248, by: 75, bz: -42, r: 3.2 },
    { bx: 65, by: -125, bz: 105, r: 4 },
    { bx: -85, by: 95, bz: -115, r: 3 },
  ].forEach((s, i) => {
    nodes.push({ ...s, isCore: false, color: [0, 75, 200], phase: i * 1.3, speed: 0.22 })
  })

  return nodes
}

function buildConnections(nodes) {
  const conns = []
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const ni = nodes[i], nj = nodes[j]
      const d = Math.sqrt((ni.bx - nj.bx) ** 2 + (ni.by - nj.by) ** 2 + (ni.bz - nj.bz) ** 2)
      const thresh = (ni.isCore || nj.isCore) ? 330 : 235
      if (d < thresh) conns.push({ i, j })
    }
  }
  return conns
}

export default function NeuralCore() {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const rafRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const ctx = canvas.getContext('2d')
    const nodes = initNodes()
    const connections = buildConnections(nodes)

    const particles = connections
      .filter((_, idx) => idx % 2 === 0)
      .slice(0, 35)
      .map(c => ({ ...c, t: Math.random(), speed: 0.0035 + Math.random() * 0.005, dir: Math.random() > 0.5 ? 1 : -1 }))

    const resize = () => {
      const { width, height } = container.getBoundingClientRect()
      canvas.width = width || 600
      canvas.height = height || 420
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(container)

    let angle = 0, wobble = 0, time = 0

    const project = (x, y, z) => {
      const W = canvas.width, H = canvas.height
      const sc = FOV / (FOV + z)
      return { px: W / 2 + x * sc, py: H / 2 + y * sc, scale: sc, depth: sc }
    }

    const getProjected = () => nodes.map(n => {
      const cosA = Math.cos(angle), sinA = Math.sin(angle)
      const rx = n.bx * cosA - n.bz * sinA
      const rz = n.bx * sinA + n.bz * cosA

      const cosW = Math.cos(wobble * 0.45), sinW = Math.sin(wobble * 0.45)
      const ry = n.by * cosW - rz * sinW * 0.08
      const rz2 = n.by * sinW * 0.08 + rz * cosW

      const { px, py, scale, depth } = project(rx, ry, rz2)
      return { ...n, rx, ry, rz: rz2, px, py, scale, depth }
    })

    const draw = () => {
      const W = canvas.width, H = canvas.height
      ctx.clearRect(0, 0, W, H)

      // Background
      ctx.fillStyle = 'rgba(1, 1, 14, 1)'
      ctx.fillRect(0, 0, W, H)

      // Subtle dot grid
      ctx.save()
      ctx.fillStyle = 'rgba(0, 80, 160, 0.07)'
      const gs = 38
      for (let gx = gs / 2; gx < W; gx += gs) {
        for (let gy = gs / 2; gy < H; gy += gs) {
          ctx.beginPath(); ctx.arc(gx, gy, 0.6, 0, Math.PI * 2); ctx.fill()
        }
      }
      ctx.restore()

      // Center ambient glow
      ctx.save()
      const cx = W / 2, cy = H / 2
      const ag = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * 0.42)
      ag.addColorStop(0, 'rgba(0, 80, 200, 0.12)')
      ag.addColorStop(0.5, 'rgba(0, 40, 120, 0.05)')
      ag.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = ag
      ctx.fillRect(0, 0, W, H)
      ctx.restore()

      const projected = getProjected()

      // Update particles
      particles.forEach(p => {
        p.t += p.speed * p.dir
        if (p.t >= 1) p.t = 0
        if (p.t <= 0) p.t = 1
      })

      // Connections
      connections.forEach(({ i, j }) => {
        const ni = projected[i], nj = projected[j]
        const isCoreLine = ni.isCore || nj.isCore
        const avgDepth = (ni.depth + nj.depth) / 2
        const opacity = Math.max(0.012, avgDepth * (isCoreLine ? 0.38 : 0.16))

        ctx.save()
        ctx.beginPath()
        ctx.moveTo(ni.px, ni.py)
        ctx.lineTo(nj.px, nj.py)
        if (isCoreLine) { ctx.shadowBlur = 5; ctx.shadowColor = 'rgba(0, 180, 255, 0.4)' }
        ctx.strokeStyle = isCoreLine
          ? `rgba(0, 180, 255, ${opacity * 2})`
          : `rgba(0, 75, 200, ${opacity})`
        ctx.lineWidth = isCoreLine ? 0.8 : 0.4
        ctx.stroke()
        ctx.restore()
      })

      // Particles
      particles.forEach(p => {
        const ni = projected[p.i], nj = projected[p.j]
        const px = ni.px + (nj.px - ni.px) * p.t
        const py = ni.py + (nj.py - ni.py) * p.t
        const depth = (ni.depth + nj.depth) / 2

        const size = 2.8 * depth
        const a = depth * 0.95

        ctx.save()
        ctx.beginPath()
        const pg = ctx.createRadialGradient(px, py, 0, px, py, size * 3.5)
        pg.addColorStop(0, `rgba(0, 220, 255, ${a})`)
        pg.addColorStop(0.4, `rgba(0, 140, 255, ${a * 0.35})`)
        pg.addColorStop(1, 'rgba(0, 60, 255, 0)')
        ctx.fillStyle = pg
        ctx.arc(px, py, size * 3.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      })

      // Nodes (back to front)
      const sorted = [...projected].sort((a, b) => a.rz - b.rz)
      sorted.forEach(n => {
        const pulse = n.isCore
          ? 1 + Math.sin(time * 1.85 + n.phase) * 0.2
          : 1 + Math.sin(time * n.speed + n.phase) * 0.13

        const r = n.r * n.scale * pulse
        const op = Math.max(0.08, Math.min(1, n.depth * 0.95))

        if (n.isCore) {
          // Multi-layer glow corona
          for (let layer = 5; layer >= 0; layer--) {
            const lr = r * (1 + layer * 4.8)
            const la = op * 0.048 * (6 - layer) * (0.85 + Math.sin(time * 1.6) * 0.15)
            ctx.save()
            const g = ctx.createRadialGradient(n.px, n.py, 0, n.px, n.py, lr)
            g.addColorStop(0, `rgba(0, 220, 255, ${la * 1.6})`)
            g.addColorStop(0.3, `rgba(0, 100, 255, ${la})`)
            g.addColorStop(1, 'rgba(0, 30, 180, 0)')
            ctx.fillStyle = g
            ctx.beginPath()
            ctx.arc(n.px, n.py, lr, 0, Math.PI * 2)
            ctx.fill()
            ctx.restore()
          }
          // Core solid
          ctx.save()
          ctx.shadowBlur = 22
          ctx.shadowColor = 'rgba(0, 212, 255, 0.95)'
          const cg = ctx.createRadialGradient(n.px, n.py, 0, n.px, n.py, r)
          cg.addColorStop(0, `rgba(255, 255, 255, ${op})`)
          cg.addColorStop(0.2, `rgba(100, 235, 255, ${op * 0.95})`)
          cg.addColorStop(0.65, `rgba(0, 155, 255, ${op * 0.7})`)
          cg.addColorStop(1, `rgba(0, 45, 200, ${op * 0.2})`)
          ctx.fillStyle = cg
          ctx.beginPath()
          ctx.arc(n.px, n.py, r, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()

        } else {
          const [cr, cg_col, cb] = n.color
          // Halo
          ctx.save()
          const halo = ctx.createRadialGradient(n.px, n.py, 0, n.px, n.py, r * 3.8)
          halo.addColorStop(0, `rgba(${cr}, ${cg_col}, ${cb}, ${op * 0.32})`)
          halo.addColorStop(0.45, `rgba(${cr}, ${cg_col}, ${cb}, ${op * 0.07})`)
          halo.addColorStop(1, `rgba(${cr}, ${cg_col}, ${cb}, 0)`)
          ctx.fillStyle = halo
          ctx.beginPath()
          ctx.arc(n.px, n.py, r * 3.8, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()

          // Node
          ctx.save()
          ctx.shadowBlur = 7
          ctx.shadowColor = `rgba(${cr}, ${cg_col}, ${cb}, 0.85)`
          const ng = ctx.createRadialGradient(n.px, n.py, 0, n.px, n.py, r)
          ng.addColorStop(0, `rgba(255, 255, 255, ${op * 0.88})`)
          ng.addColorStop(0.45, `rgba(${cr}, ${cg_col}, ${cb}, ${op * 0.78})`)
          ng.addColorStop(1, `rgba(${Math.round(cr * 0.5)}, ${Math.round(cg_col * 0.5)}, ${cb}, ${op * 0.25})`)
          ctx.fillStyle = ng
          ctx.beginPath()
          ctx.arc(n.px, n.py, r, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
        }
      })

      time += 0.016
      angle += ROTATION_SPEED
      wobble += WOBBLE_SPEED

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(rafRef.current)
      ro.disconnect()
    }
  }, [])

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  )
}
