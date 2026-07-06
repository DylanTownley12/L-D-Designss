import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import { AGENTS } from '../sim/agents'
import { onSimEvent, useAgency } from '../sim/store'
import { ZONE, RED, WHITE } from '../theme'
import type { AgentDef } from '../sim/types'
import { Robot } from './Robot'
import { FONT } from './Factory'
import { useEffect } from 'react'

// ── shared materials ──
const steel = new THREE.MeshStandardMaterial({ color: '#2a2f3c', roughness: 0.4, metalness: 0.6 })
const steelLight = new THREE.MeshStandardMaterial({ color: '#4a5163', roughness: 0.45, metalness: 0.5 })
const cardboard = new THREE.MeshStandardMaterial({ color: '#b98a55', roughness: 0.8 })
const cardboardDark = new THREE.MeshStandardMaterial({ color: '#9a6f42', roughness: 0.85 })
const screenDark = new THREE.MeshStandardMaterial({ color: '#0b0e15', roughness: 0.2, metalness: 0.3 })
function glow(color: string, i = 2) {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: i, toneMapped: false })
}

function Pad({ color, code, face }: { color: string; code: string; face: number }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.95, 1.12, 32]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} toneMapped={false} transparent opacity={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <circleGeometry args={[0.95, 32]} />
        <meshStandardMaterial color="#1c212c" transparent opacity={0.5} />
      </mesh>
      {/* cancel the station rotation so the number always reads upright from the camera */}
      <group rotation={[0, -face, 0]}>
        <Text font={FONT} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 1.62]} fontSize={0.62} color={color} anchorX="center" anchorY="middle" outlineWidth={0.015} outlineColor="#10131b">
          {code}
        </Text>
      </group>
    </group>
  )
}

// ───────────────────────── station props ─────────────────────────

function Radar() {
  const dish = useRef<THREE.Group>(null)
  useFrame(({ clock }) => { if (dish.current) dish.current.rotation.y = clock.elapsedTime * 1.4 })
  return (
    <group position={[0, 0, 1.6]}>
      <mesh material={steel} position={[0, 0.8, 0]} castShadow><cylinderGeometry args={[0.09, 0.14, 1.6, 8]} /></mesh>
      <mesh material={steel} position={[0, 0.06, 0]}><cylinderGeometry args={[0.5, 0.6, 0.12, 12]} /></mesh>
      <group ref={dish} position={[0, 1.7, 0]}>
        <mesh material={steelLight} rotation={[0.6, 0, 0]} castShadow>
          <sphereGeometry args={[0.6, 20, 10, 0, Math.PI * 2, 0, Math.PI / 3]} />
        </mesh>
        <mesh material={glow(ZONE.cyan, 3)} rotation={[0.6, 0, 0]} position={[0, 0.28, 0.18]}>
          <cylinderGeometry args={[0.025, 0.025, 0.55, 6]} />
        </mesh>
        <mesh material={glow(ZONE.cyan, 4)} rotation={[0.6, 0, 0]} position={[0, 0.55, 0.34]}>
          <sphereGeometry args={[0.07, 8, 8]} />
        </mesh>
      </group>
      {/* sweep ring on floor */}
      <SweepRing color={ZONE.cyan} />
    </group>
  )
}

function SweepRing({ color }: { color: string }) {
  const m = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    const t = (clock.elapsedTime % 2.4) / 2.4
    if (m.current) {
      m.current.scale.setScalar(0.3 + t * 2.2)
      ;(m.current.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - t)
    }
  })
  return (
    <mesh ref={m} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
      <ringGeometry args={[0.9, 1, 32]} />
      <meshBasicMaterial color={color} transparent opacity={0.4} toneMapped={false} />
    </mesh>
  )
}

/** 02 — beside the scanner arch: verdict console + warning beacon */
function KillerPost() {
  const lamp = useRef<THREE.MeshStandardMaterial>(null)
  useEffect(() => onSimEvent((e) => {
    if (e.type === 'kill' && lamp.current) {
      lamp.current.emissiveIntensity = 6
    }
  }), [])
  useFrame((_, dt) => { if (lamp.current && lamp.current.emissiveIntensity > 1) lamp.current.emissiveIntensity = Math.max(1, lamp.current.emissiveIntensity - dt * 6) })
  return (
    <group position={[0, 0, 1.3]}>
      <mesh material={steel} position={[0, 0.5, 0]} castShadow><boxGeometry args={[0.9, 1.0, 0.5]} /></mesh>
      <mesh position={[0, 1.06, 0]} rotation={[-0.5, 0, 0]}>
        <boxGeometry args={[0.8, 0.5, 0.05]} />
        <meshStandardMaterial color={RED} emissive={RED} emissiveIntensity={1.2} toneMapped={false} />
      </mesh>
      <mesh material={steel} position={[0.6, 0.9, 0]}><cylinderGeometry args={[0.04, 0.04, 1.8, 6]} /></mesh>
      <mesh position={[0.6, 1.9, 0]}>
        <sphereGeometry args={[0.13, 10, 10]} />
        <meshStandardMaterial ref={lamp} color={RED} emissive={RED} emissiveIntensity={1} toneMapped={false} />
      </mesh>
    </group>
  )
}

function CrateDock() {
  return (
    <group position={[0, 0, 1.5]}>
      {/* pallet */}
      <mesh material={cardboardDark} position={[0, 0.08, 0]}><boxGeometry args={[2.2, 0.16, 1.6]} /></mesh>
      {[[-0.55, 0.55, -0.3], [0.55, 0.55, -0.3], [0, 0.55, 0.45], [-0.3, 1.4, 0], [0.6, 1.35, 0.2]].map(([x, y, z], i) => (
        <group key={i} position={[x, y, z]} rotation={[0, i * 0.4, 0]}>
          <mesh material={cardboard} castShadow><boxGeometry args={[0.78, 0.78, 0.78]} /></mesh>
          <mesh material={steel} position={[0, 0, 0]} scale={[1.01, 0.12, 1.01]}><boxGeometry args={[0.78, 0.78, 0.78]} /></mesh>
        </group>
      ))}
    </group>
  )
}

function chartTexture(color: string) {
  const c = document.createElement('canvas')
  c.width = 512; c.height = 320
  const g = c.getContext('2d')!
  g.fillStyle = '#0d1019'; g.fillRect(0, 0, 512, 320)
  g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 2
  for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(0, i * 64); g.lineTo(512, i * 64); g.stroke() }
  g.strokeStyle = color; g.lineWidth = 8; g.lineJoin = 'round'
  g.beginPath(); g.moveTo(20, 270)
  const pts = [[90, 240], [160, 250], [230, 190], [300, 150], [370, 160], [480, 60]]
  pts.forEach(([x, y]) => g.lineTo(x, y))
  g.stroke()
  g.fillStyle = color
  g.beginPath(); g.arc(480, 60, 14, 0, Math.PI * 2); g.fill()
  g.font = 'bold 44px sans-serif'; g.fillStyle = color; g.fillText('MARGIN %', 24, 52)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return t
}

function ProfitBoard() {
  const tex = useMemo(() => chartTexture(ZONE.amber), [])
  return (
    <group position={[0, 0, 1.5]} rotation={[0, Math.PI, 0]}>
      <mesh material={steel} position={[-0.9, 0.8, 0]}><cylinderGeometry args={[0.05, 0.07, 1.6, 6]} /></mesh>
      <mesh material={steel} position={[0.9, 0.8, 0]}><cylinderGeometry args={[0.05, 0.07, 1.6, 6]} /></mesh>
      <mesh position={[0, 1.35, 0]} castShadow>
        <boxGeometry args={[2.1, 1.3, 0.08]} />
        <meshStandardMaterial color="#141822" roughness={0.3} />
      </mesh>
      <mesh position={[0, 1.35, 0.05]}>
        <planeGeometry args={[1.95, 1.15]} />
        <meshStandardMaterial map={tex} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={0.9} toneMapped={false} />
      </mesh>
    </group>
  )
}

function Desk({ accent }: { accent: string }) {
  return (
    <group position={[0, 0, 1.3]} rotation={[0, Math.PI, 0]}>
      <mesh material={steelLight} position={[0, 0.72, 0]} castShadow><boxGeometry args={[1.7, 0.08, 0.8]} /></mesh>
      <mesh material={steel} position={[-0.75, 0.36, 0]}><boxGeometry args={[0.08, 0.72, 0.7]} /></mesh>
      <mesh material={steel} position={[0.75, 0.36, 0]}><boxGeometry args={[0.08, 0.72, 0.7]} /></mesh>
      {/* laptop */}
      <mesh material={screenDark} position={[0, 0.78, 0.1]} rotation={[0.1, 0, 0]}><boxGeometry args={[0.6, 0.04, 0.4]} /></mesh>
      <mesh position={[0, 0.98, -0.08]} rotation={[-0.35, 0, 0]}>
        <boxGeometry args={[0.6, 0.42, 0.03]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.5} toneMapped={false} />
      </mesh>
      {/* mug */}
      <mesh position={[0.55, 0.82, 0.2]}><cylinderGeometry args={[0.06, 0.05, 0.12, 10]} /><meshStandardMaterial color={WHITE} /></mesh>
    </group>
  )
}

function Turntable() {
  const disc = useRef<THREE.Group>(null)
  const rig = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (disc.current) disc.current.rotation.y = clock.elapsedTime * 0.8
    if (rig.current) rig.current.rotation.y = -clock.elapsedTime * 0.4
  })
  return (
    <group position={[0, 0, 1.6]}>
      <mesh material={steel} position={[0, 0.25, 0]}><cylinderGeometry args={[0.7, 0.8, 0.5, 20]} /></mesh>
      <group ref={disc} position={[0, 0.55, 0]}>
        <mesh material={glow(ZONE.magenta, 1.2)}><cylinderGeometry args={[0.66, 0.66, 0.08, 24]} /></mesh>
        <mesh material={cardboard} position={[0, 0.35, 0]} castShadow><boxGeometry args={[0.5, 0.5, 0.5]} /></mesh>
      </group>
      {/* orbiting camera rig */}
      <group ref={rig} position={[0, 0.9, 0]}>
        <group position={[1.15, 0, 0]}>
          <mesh material={steel} position={[0, -0.35, 0]}><cylinderGeometry args={[0.035, 0.05, 0.9, 6]} /></mesh>
          <mesh material={screenDark} rotation={[0, Math.PI / 2, 0]} position={[0, 0.12, 0]} castShadow><boxGeometry args={[0.34, 0.22, 0.22]} /></mesh>
          <mesh material={glow(ZONE.magenta, 3)} position={[-0.18, 0.12, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.07, 0.09, 0.1, 12]} /></mesh>
        </group>
      </group>
      {/* ring light */}
      <mesh position={[0, 1.0, -1.0]} rotation={[0, 0, 0]}>
        <torusGeometry args={[0.42, 0.045, 10, 32]} />
        <meshStandardMaterial color="#fff6e8" emissive="#ffe9c4" emissiveIntensity={2.4} toneMapped={false} />
      </mesh>
      <mesh material={steel} position={[0, 0.45, -1.0]}><cylinderGeometry args={[0.035, 0.05, 0.95, 6]} /></mesh>
    </group>
  )
}

function CalendarWall() {
  const cells = useRef<THREE.MeshStandardMaterial[]>([])
  useFrame(({ clock }) => {
    cells.current.forEach((m, i) => {
      const on = Math.sin(clock.elapsedTime * 0.8 + i * 2.1) > 0.55
      m.emissiveIntensity = on ? 2.4 : 0.25
    })
  })
  const grid: [number, number][] = []
  for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) grid.push([c, r])
  return (
    <group position={[0, 0, 1.5]} rotation={[0, Math.PI, 0]}>
      <mesh position={[0, 1.3, 0]} castShadow>
        <boxGeometry args={[2.4, 1.7, 0.1]} />
        <meshStandardMaterial color="#141822" roughness={0.35} />
      </mesh>
      {grid.map(([c, r], i) => (
        <mesh key={i} position={[-0.88 + c * 0.44, 1.75 - r * 0.44, 0.06]}>
          <planeGeometry args={[0.34, 0.34]} />
          <meshStandardMaterial
            ref={(m) => { if (m) cells.current[i] = m }}
            color={ZONE.magenta} emissive={ZONE.magenta} emissiveIntensity={0.3} toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  )
}

function AdsConsole() {
  const btn = useRef<THREE.MeshStandardMaterial>(null)
  useFrame(({ clock }) => { if (btn.current) btn.current.emissiveIntensity = 1.6 + Math.sin(clock.elapsedTime * 3) * 1.2 })
  return (
    <group position={[0, 0, 1.3]} rotation={[0, Math.PI, 0]}>
      <mesh material={steel} position={[0, 0.45, 0]} castShadow><boxGeometry args={[1.9, 0.9, 0.8]} /></mesh>
      <mesh position={[0, 0.94, -0.05]} rotation={[-0.4, 0, 0]}>
        <boxGeometry args={[1.7, 0.5, 0.06]} />
        <meshStandardMaterial color={ZONE.magenta} emissive={ZONE.magenta} emissiveIntensity={0.9} toneMapped={false} />
      </mesh>
      {[-0.6, -0.3, 0, 0.3].map((x, i) => (
        <mesh key={i} material={glow(i % 2 ? ZONE.cyan : ZONE.green, 1.8)} position={[x, 0.92, 0.26]} rotation={[-0.4, 0, 0]}>
          <boxGeometry args={[0.14, 0.06, 0.1]} />
        </mesh>
      ))}
      <mesh position={[0.65, 0.94, 0.26]} rotation={[-0.4, 0, 0]}>
        <cylinderGeometry args={[0.11, 0.13, 0.08, 14]} />
        <meshStandardMaterial ref={btn} color={RED} emissive={RED} emissiveIntensity={2} toneMapped={false} />
      </mesh>
    </group>
  )
}

function ScaleKillLever() {
  const arm = useRef<THREE.Group>(null)
  useFrame(({ clock }) => { if (arm.current) arm.current.rotation.x = Math.sin(clock.elapsedTime * 1.1) * 0.7 })
  return (
    <group position={[0, 0, 1.4]} rotation={[0, Math.PI, 0]}>
      <mesh material={steel} position={[0, 0.45, 0]} castShadow><boxGeometry args={[1.0, 0.9, 0.7]} /></mesh>
      <group ref={arm} position={[0, 0.9, 0]}>
        <mesh material={steelLight} position={[0, 0.4, 0]}><cylinderGeometry args={[0.045, 0.045, 0.8, 8]} /></mesh>
        <mesh material={glow('#ffffff', 2)} position={[0, 0.85, 0]}><sphereGeometry args={[0.13, 12, 12]} /></mesh>
      </group>
      <Text font={FONT} position={[0, 1.05, 0.38]} rotation={[0, 0, 0]} fontSize={0.17} color={ZONE.green} anchorX="center">SCALE</Text>
      <Text font={FONT} position={[0, 0.75, 0.38]} fontSize={0.17} color={RED} anchorX="center">KILL</Text>
      <mesh material={glow(ZONE.green, 2.4)} position={[-0.42, 1.0, 0.36]}><sphereGeometry args={[0.06, 8, 8]} /></mesh>
      <mesh material={glow(RED, 2.4)} position={[-0.42, 0.75, 0.36]}><sphereGeometry args={[0.06, 8, 8]} /></mesh>
    </group>
  )
}

function ShopWindow() {
  return (
    <group position={[0, 0, 1.7]} rotation={[0, Math.PI, 0]}>
      {/* facade */}
      <mesh position={[0, 1.1, -0.1]} castShadow>
        <boxGeometry args={[2.8, 2.2, 0.16]} />
        <meshStandardMaterial color="#1a1f2b" roughness={0.4} />
      </mesh>
      {/* window glass */}
      <mesh position={[0, 0.95, 0]}>
        <planeGeometry args={[2.2, 1.3]} />
        <meshPhysicalMaterial color="#7dd3fc" transparent opacity={0.18} roughness={0.05} metalness={0.2} />
      </mesh>
      {/* window frame glow */}
      {[[0, 1.62, 2.24, 0.06], [0, 0.28, 2.24, 0.06]].map(([x, y, w, h], i) => (
        <mesh key={i} material={glow(ZONE.amber, 1.6)} position={[x, y, 0.02]}><boxGeometry args={[w, h, 0.04]} /></mesh>
      ))}
      {/* shelf + tiny products */}
      <mesh material={steelLight} position={[0, 0.62, 0.05]}><boxGeometry args={[2.0, 0.05, 0.3]} /></mesh>
      {[-0.7, -0.25, 0.2, 0.65].map((x, i) => (
        <mesh key={i} position={[x, 0.78, 0.05]} castShadow>
          <boxGeometry args={[0.22, 0.26, 0.18]} />
          <meshStandardMaterial color={['#f472b6', '#60a5fa', '#facc15', '#34d399'][i]} roughness={0.35} />
        </mesh>
      ))}
      {/* awning */}
      <mesh position={[0, 1.85, 0.35]} rotation={[0.5, 0, 0]}>
        <boxGeometry args={[2.5, 0.06, 0.8]} />
        <meshStandardMaterial color={ZONE.amber} roughness={0.6} />
      </mesh>
      <Text font={FONT} position={[0, 2.35, 0.05]} fontSize={0.3} letterSpacing={0.2} color={ZONE.amber} anchorX="center" outlineWidth={0.012} outlineColor="#10131b">
        STORE
      </Text>
    </group>
  )
}

function PackingTable() {
  return (
    <group position={[0, 0, 1.3]} rotation={[0, Math.PI, 0]}>
      <mesh material={steelLight} position={[0, 0.6, 0]} castShadow><boxGeometry args={[1.9, 0.08, 0.9]} /></mesh>
      <mesh material={steel} position={[-0.85, 0.3, 0]}><boxGeometry args={[0.08, 0.6, 0.8]} /></mesh>
      <mesh material={steel} position={[0.85, 0.3, 0]}><boxGeometry args={[0.08, 0.6, 0.8]} /></mesh>
      <mesh material={cardboard} position={[-0.4, 0.82, 0]} castShadow><boxGeometry args={[0.55, 0.36, 0.5]} /></mesh>
      {/* flat-pack stack */}
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} material={cardboardDark} position={[0.55, 0.68 + i * 0.045, 0.05]} rotation={[0, i * 0.12, 0]}>
          <boxGeometry args={[0.6, 0.035, 0.45]} />
        </mesh>
      ))}
      {/* tape gun */}
      <mesh material={glow(ZONE.amber, 1.4)} position={[0.1, 0.68, -0.28]}><boxGeometry args={[0.2, 0.08, 0.08]} /></mesh>
    </group>
  )
}

function HelpDesk() {
  const b1 = useRef<THREE.Group>(null)
  const b2 = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (b1.current) b1.current.position.y = 1.7 + Math.sin(t * 1.6) * 0.08
    if (b2.current) b2.current.position.y = 2.0 + Math.sin(t * 1.6 + 1.5) * 0.08
  })
  return (
    <group position={[0, 0, 1.4]} rotation={[0, Math.PI, 0]}>
      <mesh position={[0, 0.55, 0]} castShadow>
        <cylinderGeometry args={[0.9, 0.95, 1.1, 20, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color="#202634" roughness={0.5} />
      </mesh>
      <mesh material={glow(ZONE.amber, 1.4)} position={[0, 1.12, 0]}>
        <cylinderGeometry args={[0.92, 0.92, 0.05, 20, 1, false, 0, Math.PI]} />
      </mesh>
      <group ref={b1} position={[-0.35, 1.7, 0.2]}>
        <mesh material={glow(ZONE.cyan, 1.6)}><sphereGeometry args={[0.16, 10, 10]} /></mesh>
        <Text font={FONT} position={[0, 0, 0.17]} fontSize={0.18} color="#10131b">?</Text>
      </group>
      <group ref={b2} position={[0.4, 2.0, 0.2]}>
        <mesh material={glow(ZONE.green, 1.6)}><sphereGeometry args={[0.16, 10, 10]} /></mesh>
        <Text font={FONT} position={[0, 0, 0.17]} fontSize={0.18} color="#10131b">!</Text>
      </group>
    </group>
  )
}

/** 13 — coin stacks grow with every sale + vault */
function FinanceVault() {
  const coins = useRef<THREE.InstancedMesh>(null)
  const count = useRef(0)
  const wheel = useRef<THREE.Mesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const MAX = 48
  useEffect(() => onSimEvent((e) => {
    if (e.type !== 'coin' || !coins.current) return
    const n = Math.min(MAX, count.current + 2)
    for (let i = count.current; i < n; i++) {
      const stack = i % 6
      const level = Math.floor(i / 6)
      dummy.position.set(-0.75 + stack * 0.3, 0.045 + level * 0.09, 0.5 + (stack % 2) * 0.3)
      dummy.rotation.y = i * 0.6
      dummy.updateMatrix()
      coins.current.setMatrixAt(i, dummy.matrix)
    }
    count.current = n
    coins.current.count = n
    coins.current.instanceMatrix.needsUpdate = true
  }), [dummy])
  useFrame(({ clock }) => { if (wheel.current) wheel.current.rotation.z = Math.sin(clock.elapsedTime * 0.5) * 0.8 })
  return (
    <group position={[0, 0, 1.6]} rotation={[0, Math.PI, 0]}>
      {/* vault */}
      <mesh material={steel} position={[0, 0.75, -0.4]} castShadow><cylinderGeometry args={[0.75, 0.8, 1.5, 12]} /></mesh>
      <mesh ref={wheel} position={[0, 0.8, 0.38]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.28, 0.05, 8, 20]} />
        <meshStandardMaterial color="#c9a84c" metalness={0.8} roughness={0.25} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} material={steelLight} position={[0.28 * Math.cos((i * Math.PI * 2) / 3), 0.8 + 0.28 * Math.sin((i * Math.PI * 2) / 3), 0.4]} rotation={[Math.PI / 2, 0, (i * Math.PI * 2) / 3]}>
          <cylinderGeometry args={[0.03, 0.03, 0.5, 6]} />
        </mesh>
      ))}
      <mesh material={glow(ZONE.green, 2)} position={[0, 1.62, -0.1]}><sphereGeometry args={[0.08, 8, 8]} /></mesh>
      {/* growing coin stacks (instanced) */}
      <instancedMesh ref={coins} args={[undefined, undefined, MAX]} count={0} castShadow>
        <cylinderGeometry args={[0.13, 0.13, 0.08, 14]} />
        <meshStandardMaterial color="#f5c84c" emissive="#8a6a1a" emissiveIntensity={0.35} metalness={0.85} roughness={0.25} />
      </instancedMesh>
    </group>
  )
}

function ShieldScanner() {
  const shield = useRef<THREE.Group>(null)
  const ring = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (shield.current) { shield.current.rotation.y = t * 0.9; shield.current.position.y = 1.35 + Math.sin(t * 1.4) * 0.08 }
    if (ring.current) ring.current.position.y = 0.7 + ((t * 0.6) % 1.3)
  })
  return (
    <group position={[0, 0, 1.5]}>
      <mesh material={steel} position={[0, 0.2, 0]}><cylinderGeometry args={[0.55, 0.65, 0.4, 12]} /></mesh>
      <mesh material={glow(ZONE.green, 1.2)} position={[0, 0.42, 0]}><cylinderGeometry args={[0.5, 0.5, 0.04, 12]} /></mesh>
      <group ref={shield} position={[0, 1.35, 0]}>
        <mesh rotation={[0, 0, 0]} scale={[1, 1.25, 0.3]}>
          <octahedronGeometry args={[0.5, 0]} />
          <meshPhysicalMaterial color={ZONE.green} transparent opacity={0.4} roughness={0.1} emissive={ZONE.green} emissiveIntensity={0.8} />
        </mesh>
      </group>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 1, 0]}>
        <ringGeometry args={[0.55, 0.6, 24]} />
        <meshBasicMaterial color={ZONE.green} transparent opacity={0.6} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

function ServerRacks() {
  const leds = useRef<THREE.MeshStandardMaterial[]>([])
  useFrame(({ clock }) => {
    leds.current.forEach((m, i) => {
      m.emissiveIntensity = Math.sin(clock.elapsedTime * (2 + (i % 5)) + i * 3.7) > 0 ? 2.6 : 0.15
    })
  })
  let led = 0
  return (
    <group position={[0, 0, 1.6]} rotation={[0, Math.PI / 2, 0]}>
      {[-0.85, 0, 0.85].map((x, r) => (
        <group key={r} position={[x, 0, 0]}>
          <mesh material={steel} position={[0, 0.85, 0]} castShadow><boxGeometry args={[0.72, 1.7, 0.7]} /></mesh>
          {[0, 1, 2, 3, 4].map((row) =>
            [0, 1, 2].map((col) => {
              const idx = led++
              return (
                <mesh key={`${row}-${col}`} position={[-0.18 + col * 0.18, 0.35 + row * 0.3, 0.36]}>
                  <planeGeometry args={[0.07, 0.05]} />
                  <meshStandardMaterial
                    ref={(m) => { if (m) leds.current[idx] = m }}
                    color={col === 1 ? ZONE.green : ZONE.cyan}
                    emissive={col === 1 ? ZONE.green : ZONE.cyan}
                    emissiveIntensity={1} toneMapped={false}
                  />
                </mesh>
              )
            })
          )}
        </group>
      ))}
    </group>
  )
}

function Prop({ agent }: { agent: AgentDef }) {
  switch (agent.id) {
    case 1: return <Radar />
    case 2: return <KillerPost />
    case 3: return <CrateDock />
    case 4: return <ProfitBoard />
    case 5: return <Desk accent={ZONE.magenta} />
    case 6: return <Turntable />
    case 7: return <CalendarWall />
    case 8: return <AdsConsole />
    case 9: return <ScaleKillLever />
    case 10: return <ShopWindow />
    case 11: return <PackingTable />
    case 12: return <HelpDesk />
    case 13: return <FinanceVault />
    case 14: return <ShieldScanner />
    case 15: return <ServerRacks />
    default: return null
  }
}

function Station({ agent }: { agent: AgentDef }) {
  const select = useAgency((s) => s.select)
  return (
    <group position={agent.pos} rotation={[0, agent.face, 0]}>
      <Pad color={ZONE[agent.zone]} code={agent.code} face={agent.face} />
      <Robot agent={agent} />
      <Prop agent={agent} />
      {/* click target */}
      <mesh
        position={[0, 1.2, 0.6]}
        visible={false}
        onClick={(e) => { e.stopPropagation(); select(agent.id) }}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = 'auto')}
      >
        <boxGeometry args={[2.6, 2.6, 3.4]} />
      </mesh>
    </group>
  )
}

export function Stations() {
  return (
    <group>
      {AGENTS.map((a) => (
        <Station key={a.id} agent={a} />
      ))}
    </group>
  )
}
