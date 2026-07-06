import { useMemo } from 'react'
import * as THREE from 'three'
import { Text } from '@react-three/drei'
import { BG, ZONE, WHITE } from '../theme'
import type { ZoneKey } from '../theme'

export const FONT = '/fonts/inter-bold.ttf'

// World extents
export const FLOOR_W = 48
export const FLOOR_D = 36

// District rectangles: [x0, z0, x1, z1]
export const DISTRICTS: { key: ZoneKey; num: string; name: string; rect: [number, number, number, number] }[] = [
  { key: 'cyan',    num: '1', name: 'RESEARCH INTAKE', rect: [-22.5, -14.5, -3, -1.5] },
  { key: 'magenta', num: '2', name: 'CREATIVE STUDIO', rect: [3, -14.5, 22.5, -1.5] },
  { key: 'green',   num: '4', name: 'OPS & FINANCE',   rect: [-22.5, 1.5, -3, 15] },
  { key: 'amber',   num: '3', name: 'STORE & SHIP',    rect: [3, 1.5, 22.5, 15] },
]

// world (x,z) -> canvas px
const TEX_W = 2048
const TEX_H = 1536
const wx = (x: number) => ((x + FLOOR_W / 2) / FLOOR_W) * TEX_W
const wz = (z: number) => ((z + FLOOR_D / 2) / FLOOR_D) * TEX_H

function makeFloorTexture() {
  const c = document.createElement('canvas')
  c.width = TEX_W
  c.height = TEX_H
  const g = c.getContext('2d')!

  // base — clean light concrete
  const base = g.createRadialGradient(TEX_W / 2, TEX_H / 2, 120, TEX_W / 2, TEX_H / 2, TEX_W * 0.72)
  base.addColorStop(0, '#ccd1dc')
  base.addColorStop(0.7, '#b7bdca')
  base.addColorStop(1, '#99a0af')
  g.fillStyle = base
  g.fillRect(0, 0, TEX_W, TEX_H)

  // faint tile grid
  g.strokeStyle = 'rgba(90,100,120,0.16)'
  g.lineWidth = 2
  for (let x = -24; x <= 24; x += 3) { g.beginPath(); g.moveTo(wx(x), 0); g.lineTo(wx(x), TEX_H); g.stroke() }
  for (let z = -18; z <= 18; z += 3) { g.beginPath(); g.moveTo(0, wz(z)); g.lineTo(TEX_W, wz(z)); g.stroke() }

  // painted district zones
  for (const d of DISTRICTS) {
    const [x0, z0, x1, z1] = d.rect
    const col = ZONE[d.key]
    // tinted fill
    g.fillStyle = col + '14'
    g.fillRect(wx(x0), wz(z0), wx(x1) - wx(x0), wz(z1) - wz(z0))
    // bold painted border
    g.strokeStyle = col
    g.globalAlpha = 0.85
    g.lineWidth = 10
    g.strokeRect(wx(x0) + 6, wz(z0) + 6, wx(x1) - wx(x0) - 12, wz(z1) - wz(z0) - 12)
    // inner dashed line
    g.globalAlpha = 0.4
    g.lineWidth = 4
    g.setLineDash([26, 18])
    g.strokeRect(wx(x0) + 26, wz(z0) + 26, wx(x1) - wx(x0) - 52, wz(z1) - wz(z0) - 52)
    g.setLineDash([])
    g.globalAlpha = 1
  }

  // hermes centre pad — violet rings
  const cx = wx(0), cz = wz(0)
  for (const [r, a, lw] of [[220, 0.9, 12], [190, 0.35, 4], [255, 0.3, 5]] as const) {
    g.beginPath()
    g.strokeStyle = `rgba(139,92,246,${a})`
    g.lineWidth = lw
    g.arc(cx, cz, r, 0, Math.PI * 2)
    g.stroke()
  }
  g.fillStyle = 'rgba(139,92,246,0.10)'
  g.beginPath(); g.arc(cx, cz, 218, 0, Math.PI * 2); g.fill()

  // hazard stripes near reject chute + shipping lane
  const hazard = (px: number, pz: number, w: number, h: number) => {
    g.save()
    g.beginPath(); g.rect(px, pz, w, h); g.clip()
    for (let i = -h; i < w + h; i += 26) {
      g.strokeStyle = i % 52 === 0 ? 'rgba(255,176,32,0.75)' : 'rgba(30,34,44,0.75)'
      g.lineWidth = 13
      g.beginPath(); g.moveTo(px + i, pz + h + 10); g.lineTo(px + i + h + 20, pz - 10); g.stroke()
    }
    g.restore()
  }
  hazard(wx(-13.6), wz(-5.6), wx(-11.4) - wx(-13.6), wz(-4.4) - wz(-5.6))   // under reject chute
  hazard(wx(17.5), wz(6.4), wx(21.5) - wx(17.5), wz(7.0) - wz(6.4))        // shipping lane top
  hazard(wx(17.5), wz(9.0), wx(21.5) - wx(17.5), wz(9.6) - wz(9.0))        // shipping lane bottom

  // walkway arrows down the central aisles
  g.fillStyle = 'rgba(70,80,100,0.35)'
  const arrow = (px: number, pz: number, rot: number) => {
    g.save(); g.translate(px, pz); g.rotate(rot)
    g.beginPath(); g.moveTo(0, -16); g.lineTo(13, 8); g.lineTo(-13, 8); g.closePath(); g.fill()
    g.restore()
  }
  for (let z = -12; z <= 12; z += 4) arrow(wx(0), wz(z), z < 0 ? Math.PI : 0)
  for (let x = -18; x <= 18; x += 5) if (Math.abs(x) > 4) arrow(wx(x), wz(0), x < 0 ? -Math.PI / 2 : Math.PI / 2)

  const tex = new THREE.CanvasTexture(c)
  tex.anisotropy = 8
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function NeonFrame({ rect, color }: { rect: [number, number, number, number]; color: string }) {
  const [x0, z0, x1, z1] = rect
  const w = x1 - x0
  const d = z1 - z0
  const cx = (x0 + x1) / 2
  const cz = (z0 + z1) / 2
  const bar = 0.09
  const y = 0.055
  return (
    <group>
      {/* glowing floor edge bars */}
      <mesh position={[cx, y, z0]}><boxGeometry args={[w, bar, bar]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.2} toneMapped={false} /></mesh>
      <mesh position={[cx, y, z1]}><boxGeometry args={[w, bar, bar]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.2} toneMapped={false} /></mesh>
      <mesh position={[x0, y, cz]}><boxGeometry args={[bar, bar, d]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.2} toneMapped={false} /></mesh>
      <mesh position={[x1, y, cz]}><boxGeometry args={[bar, bar, d]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.2} toneMapped={false} /></mesh>
      {/* corner posts */}
      {([[x0, z0], [x1, z0], [x0, z1], [x1, z1]] as const).map(([px, pz], i) => (
        <group key={i} position={[px, 0, pz]}>
          <mesh position={[0, 0.55, 0]}><cylinderGeometry args={[0.09, 0.13, 1.1, 8]} /><meshStandardMaterial color="#2a2f3c" roughness={0.4} metalness={0.6} /></mesh>
          <mesh position={[0, 1.16, 0]}><sphereGeometry args={[0.14, 12, 12]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} toneMapped={false} /></mesh>
        </group>
      ))}
    </group>
  )
}

function DistrictLabel({ d }: { d: (typeof DISTRICTS)[number] }) {
  const [x0, z0, x1, z1] = d.rect
  const cx = (x0 + x1) / 2
  // top districts label just south of their edge, bottom districts just north — no overlap
  const zPos = z0 < 0 ? z1 + 0.72 : z0 - 0.68
  return (
    <group position={[cx, 0.02, zPos]} rotation={[-Math.PI / 2, 0, 0]}>
      <Text font={FONT} fontSize={0.66} letterSpacing={0.24} color={ZONE[d.key]} anchorX="center" anchorY="middle" outlineWidth={0.02} outlineColor="#10131b" fillOpacity={0.95}>
        {`${d.num} · ${d.name}`}
      </Text>
    </group>
  )
}

export function Factory() {
  const floorTex = useMemo(makeFloorTexture, [])
  return (
    <group>
      {/* factory floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[FLOOR_W, FLOOR_D]} />
        <meshStandardMaterial map={floorTex} roughness={0.55} metalness={0.08} />
      </mesh>
      {/* dark void ground outside the factory */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]}>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color={BG} roughness={1} />
      </mesh>
      {/* floor plinth (slab thickness at the edges) — top kept below y=0 to avoid z-fighting */}
      <mesh position={[0, -0.42, 0]}>
        <boxGeometry args={[FLOOR_W + 0.6, 0.8, FLOOR_D + 0.6]} />
        <meshStandardMaterial color="#232836" roughness={0.8} />
      </mesh>
      {/* low perimeter wall with light strip */}
      {([
        [0, -FLOOR_D / 2, FLOOR_W + 1, true],
        [0, FLOOR_D / 2, FLOOR_W + 1, true],
        [-FLOOR_W / 2, 0, FLOOR_D + 1, false],
        [FLOOR_W / 2, 0, FLOOR_D + 1, false],
      ] as const).map(([px, pz, len, horiz], i) => (
        <group key={i} position={[px as number, 0, pz as number]}>
          <mesh position={[0, 0.7, 0]} castShadow>
            <boxGeometry args={horiz ? [len as number, 1.4, 0.5] : [0.5, 1.4, len as number]} />
            <meshStandardMaterial color="#1d222e" roughness={0.7} metalness={0.3} />
          </mesh>
          <mesh position={[0, 1.42, 0]}>
            <boxGeometry args={horiz ? [len as number, 0.06, 0.1] : [0.1, 0.06, len as number]} />
            <meshStandardMaterial color={WHITE} emissive="#aeb8ff" emissiveIntensity={1.6} toneMapped={false} />
          </mesh>
        </group>
      ))}
      {/* neon district frames + labels */}
      {DISTRICTS.map((d) => (
        <group key={d.key}>
          <NeonFrame rect={d.rect} color={ZONE[d.key]} />
          <DistrictLabel d={d} />
        </group>
      ))}
    </group>
  )
}
