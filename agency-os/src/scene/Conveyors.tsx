import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import {
  INTAKE_Z, INTAKE_START_X, INTAKE_END_X, SCANNER_X,
  ORDER_Z, ORDER_START_X, ORDER_END_X, GATE_X, DOOR_X,
} from '../sim/agents'
import { useAgency } from '../sim/store'
import { ZONE, RED, VIOLET } from '../theme'
import { FONT } from './Factory'

const BELT_Y = 0.5

// ── shared mats/geos ──
const frameMat = new THREE.MeshStandardMaterial({ color: '#2a2f3c', roughness: 0.4, metalness: 0.6 })
const boxGeo = new THREE.BoxGeometry(0.62, 0.5, 0.55)
const boxMat = new THREE.MeshStandardMaterial({ color: '#c09055', roughness: 0.75 })
const boxKilledMat = new THREE.MeshStandardMaterial({ color: '#6b4a33', roughness: 0.8 })
const parcelMat = new THREE.MeshStandardMaterial({ color: '#d9c9a8', roughness: 0.7 })

function beltTexture() {
  const c = document.createElement('canvas')
  c.width = 128; c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = '#171b26'; g.fillRect(0, 0, 128, 64)
  g.fillStyle = '#232a3a'
  g.fillRect(0, 0, 12, 64)
  g.fillRect(64, 0, 12, 64)
  g.strokeStyle = 'rgba(0,229,255,0.25)'; g.lineWidth = 3
  g.beginPath(); g.moveTo(0, 4); g.lineTo(128, 4); g.stroke()
  g.beginPath(); g.moveTo(0, 60); g.lineTo(128, 60); g.stroke()
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

function killedTexture() {
  const c = document.createElement('canvas')
  c.width = 256; c.height = 128
  const g = c.getContext('2d')!
  g.clearRect(0, 0, 256, 128)
  g.translate(128, 64)
  g.rotate(-0.18)
  g.strokeStyle = '#ff2244'
  g.lineWidth = 10
  g.strokeRect(-110, -44, 220, 88)
  g.fillStyle = '#ff2244'
  g.font = '900 58px sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('KILLED', 0, 2)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function Belt({ x0, x1, z, color }: { x0: number; x1: number; z: number; color: string }) {
  const tex = useMemo(beltTexture, [])
  const len = x1 - x0
  useMemo(() => { tex.repeat.set(len / 1.6, 1); tex.rotation = 0 }, [len, tex])
  useFrame((_, dt) => { tex.offset.x -= dt * 0.55 })
  return (
    <group position={[(x0 + x1) / 2, 0, z]}>
      {/* belt surface */}
      <mesh position={[0, BELT_Y, 0]} receiveShadow>
        <boxGeometry args={[len, 0.08, 1.15]} />
        <meshStandardMaterial map={tex} roughness={0.55} />
      </mesh>
      {/* side rails with glow line */}
      {[-0.66, 0.66].map((dz, i) => (
        <group key={i}>
          <mesh position={[0, BELT_Y - 0.06, dz]}>
            <boxGeometry args={[len, 0.22, 0.1]} />
            <meshStandardMaterial color="#333a4a" roughness={0.4} metalness={0.6} />
          </mesh>
          <mesh position={[0, BELT_Y + 0.06, dz]}>
            <boxGeometry args={[len, 0.035, 0.035]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.8} toneMapped={false} />
          </mesh>
        </group>
      ))}
      {/* legs */}
      {Array.from({ length: Math.floor(len / 3) + 1 }).map((_, i) => (
        <mesh key={i} material={frameMat} position={[-len / 2 + 0.8 + i * 3, BELT_Y / 2 - 0.05, 0]}>
          <boxGeometry args={[0.14, BELT_Y, 1.0]} />
        </mesh>
      ))}
    </group>
  )
}

// ─────────────────────── intake line + scanner + chute ───────────────────────

const CHUTE_Z = INTAKE_Z + 1.7    // reject chute on the aisle side of the belt
const CHUTE_X = SCANNER_X + 1.4

type IntakeBox = {
  x: number; state: 'run' | 'chute' | 'done'; verdict: 'none' | 'kill' | 'pass'
  cz: number; cy: number; stamp: number; delay: number
}

function IntakeLine() {
  const scan = useAgency((s) => s.scan)
  const paused = useAgency((s) => s.paused)
  const N = 6
  const boxes = useRef<IntakeBox[]>(
    Array.from({ length: N }, (_, i) => ({
      x: INTAKE_START_X, state: 'done', verdict: 'none', cz: 0, cy: 0, stamp: 0, delay: i * 2.2,
    }))
  )
  const meshes = useRef<(THREE.Group | null)[]>([])
  const decals = useRef<(THREE.Mesh | null)[]>([])
  const beamRef = useRef<THREE.Mesh>(null)
  const lampMat = useRef<THREE.MeshStandardMaterial>(null)
  const killTex = useMemo(killedTexture, [])
  const lampFlash = useRef({ t: 1, color: new THREE.Color(ZONE.cyan) })

  useFrame(({ clock }, dt) => {
    dt = Math.min(dt, 0.05)
    boxes.current.forEach((b, i) => {
      const g = meshes.current[i]
      if (!g) return
      if (b.state === 'done') {
        b.delay -= dt
        if (b.delay <= 0 && !paused) {
          b.state = 'run'; b.x = INTAKE_START_X; b.verdict = 'none'; b.cz = 0; b.cy = 0; b.stamp = 0
        } else { g.visible = false; return }
      }
      g.visible = true
      if (b.state === 'run') {
        b.x += dt * 1.7
        // scanner verdict
        if (b.verdict === 'none' && b.x >= SCANNER_X) {
          b.verdict = scan()
          lampFlash.current.t = 0
          lampFlash.current.color.set(b.verdict === 'kill' ? RED : ZONE.green)
          if (b.verdict === 'kill') b.stamp = 0.001
        }
        // killed boxes divert into the chute
        if (b.verdict === 'kill' && b.x >= CHUTE_X) b.state = 'chute'
        if (b.x >= INTAKE_END_X) { b.state = 'done'; b.delay = 1 + Math.random() * 2.5 }
      } else if (b.state === 'chute') {
        b.cz += dt * 2.6
        if (b.cz > 1.1) b.cy -= dt * 5
        if (b.cy < -2.2) { b.state = 'done'; b.delay = 1 + Math.random() * 2.5 }
      }
      // stamp pop-in animation
      const d = decals.current[i]
      if (d) {
        if (b.stamp > 0 && b.stamp < 1) b.stamp = Math.min(1, b.stamp + dt * 5)
        d.visible = b.verdict === 'kill'
        const s = b.stamp < 0.5 ? 1.8 - b.stamp * 1.6 : 1
        d.scale.setScalar(Math.max(0.01, s))
      }
      const mesh = g.children[0] as THREE.Mesh
      mesh.material = b.verdict === 'kill' ? boxKilledMat : boxMat
      g.position.set(b.x, BELT_Y + 0.32 + b.cy, INTAKE_Z + Math.min(b.cz, 1.35))
      g.rotation.z = b.state === 'chute' && b.cy < 0 ? Math.min(1.2, -b.cy) : 0
    })
    // scanner beam sweep + lamp fade
    if (beamRef.current) {
      const m = beamRef.current.material as THREE.MeshBasicMaterial
      m.opacity = 0.25 + 0.2 * Math.sin(clock.elapsedTime * 6)
    }
    if (lampMat.current) {
      lampFlash.current.t = Math.min(1, lampFlash.current.t + dt * 1.5)
      lampMat.current.emissive.copy(lampFlash.current.color)
      lampMat.current.emissiveIntensity = 1 + (1 - lampFlash.current.t) * 5
    }
  })

  return (
    <group>
      <Belt x0={INTAKE_START_X} x1={INTAKE_END_X} z={INTAKE_Z} color={ZONE.cyan} />
      {/* candidate boxes */}
      {Array.from({ length: N }).map((_, i) => (
        <group key={i} ref={(g) => { meshes.current[i] = g }} visible={false}>
          <mesh geometry={boxGeo} material={boxMat} castShadow />
          <mesh ref={(m) => { decals.current[i] = m }} position={[0, 0.26, 0]} rotation={[-Math.PI / 2, 0, 0.2]} visible={false}>
            <planeGeometry args={[0.58, 0.29]} />
            <meshBasicMaterial map={killTex} transparent toneMapped={false} depthWrite={false} />
          </mesh>
        </group>
      ))}
      {/* scanner arch */}
      <group position={[SCANNER_X, 0, INTAKE_Z]}>
        {[-0.95, 0.95].map((dz, i) => (
          <mesh key={i} material={frameMat} position={[0, 1.0, dz]} castShadow><boxGeometry args={[0.5, 2.0, 0.28]} /></mesh>
        ))}
        <mesh material={frameMat} position={[0, 2.1, 0]} castShadow><boxGeometry args={[0.5, 0.3, 2.2]} /></mesh>
        <mesh position={[0, 2.28, 0]}>
          <boxGeometry args={[0.52, 0.06, 2.0]} />
          <meshStandardMaterial color={RED} emissive={RED} emissiveIntensity={2} toneMapped={false} />
        </mesh>
        {/* verdict lamp */}
        <mesh position={[0, 2.5, 0]}>
          <sphereGeometry args={[0.14, 12, 12]} />
          <meshStandardMaterial ref={lampMat} color="#111" emissive={ZONE.cyan} emissiveIntensity={1} toneMapped={false} />
        </mesh>
        {/* scan beam */}
        <mesh ref={beamRef} position={[0, 1.05, 0]}>
          <planeGeometry args={[0.06, 1.9]} />
          <meshBasicMaterial color={RED} transparent opacity={0.35} side={THREE.DoubleSide} toneMapped={false} depthWrite={false} />
        </mesh>
        <Text font={FONT} position={[0, 2.75, 0]} rotation={[0, Math.PI / 2, 0]} fontSize={0.24} color={RED} anchorX="center" outlineWidth={0.01} outlineColor="#10131b">
          VALIDATION
        </Text>
      </group>
      {/* reject chute */}
      <group position={[CHUTE_X, 0, CHUTE_Z + 0.35]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <ringGeometry args={[0.62, 0.8, 24]} />
          <meshStandardMaterial color={RED} emissive={RED} emissiveIntensity={2.2} toneMapped={false} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.028, 0]}>
          <circleGeometry args={[0.62, 24]} />
          <meshBasicMaterial color="#07080d" />
        </mesh>
        {/* slide from belt into hole */}
        <mesh position={[0, 0.32, -0.75]} rotation={[0.6, 0, 0]}>
          <boxGeometry args={[1.1, 0.06, 1.1]} />
          <meshStandardMaterial color="#333a4a" roughness={0.3} metalness={0.6} />
        </mesh>
        <Text font={FONT} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 1.15]} fontSize={0.3} color={RED} anchorX="center">
          REJECTS
        </Text>
      </group>
    </group>
  )
}

// ─────────────────────── order line + gate + door + drones ───────────────────────

type OrderBox = {
  x: number; y: number; state: 'idle' | 'run' | 'lift'; cooldown: number
  droneY: number; liftT: number
}

function OrderLine() {
  const claimOrder = useAgency((s) => s.claimOrder)
  const ship = useAgency((s) => s.ship)
  const gateOpen = useAgency((s) => s.gateOpen)
  const N = 4
  const boxes = useRef<OrderBox[]>(
    Array.from({ length: N }, (_, i) => ({ x: 0, y: 0, state: 'idle', cooldown: i * 1.4, droneY: 7, liftT: 0 }))
  )
  const groups = useRef<(THREE.Group | null)[]>([])
  const drones = useRef<(THREE.Group | null)[]>([])
  const doorL = useRef<THREE.Mesh>(null)
  const doorR = useRef<THREE.Mesh>(null)
  const gateLamp = useRef<THREE.MeshStandardMaterial>(null)
  const gateProgress = useRef(0)

  useFrame((_, dt) => {
    dt = Math.min(dt, 0.05)
    let wantOpen = false
    boxes.current.forEach((b, i) => {
      const g = groups.current[i]
      const dr = drones.current[i]
      if (!g || !dr) return
      if (b.state === 'idle') {
        b.cooldown -= dt
        g.visible = false
        dr.visible = false
        if (b.cooldown <= 0) {
          if (claimOrder()) { b.state = 'run'; b.x = ORDER_START_X; b.y = 0; b.droneY = 7; b.liftT = 0 }
          else b.cooldown = 0.8
        }
        return
      }
      g.visible = true
      if (b.state === 'run') {
        // queue before the gate if it's somehow shut
        const nearGate = b.x > GATE_X - 2.2 && b.x < GATE_X + 0.4
        if (nearGate) wantOpen = true
        const blocked = nearGate && !gateOpen && b.x > GATE_X - 1.1
        if (!blocked) b.x += dt * 1.5
        g.position.set(b.x, BELT_Y + 0.28, ORDER_Z)
        dr.visible = false
        if (b.x >= DOOR_X) { b.state = 'lift'; b.liftT = 0; ship() }
      } else if (b.state === 'lift') {
        b.liftT += dt
        dr.visible = true
        // drone drops to the parcel, grabs, lifts away
        if (b.liftT < 0.9) {
          b.droneY = THREE.MathUtils.lerp(7, BELT_Y + 1.05, b.liftT / 0.9)
        } else {
          const t2 = b.liftT - 0.9
          b.droneY = BELT_Y + 1.05 + t2 * 3.2
          b.y = t2 * 3.2
          b.x += t2 * dt * 4
        }
        g.position.set(b.x, BELT_Y + 0.28 + b.y, ORDER_Z)
        dr.position.set(b.x, b.droneY, ORDER_Z)
        if (b.droneY > 9) { b.state = 'idle'; b.cooldown = 0.6 + Math.random() * 1.2 }
      }
    })
    // gate doors
    const target = wantOpen && gateOpen ? 1 : gateOpen ? 0.15 : 0
    gateProgress.current = THREE.MathUtils.lerp(gateProgress.current, target, dt * 4)
    const off = gateProgress.current * 0.85
    if (doorL.current) doorL.current.position.z = -0.45 - off
    if (doorR.current) doorR.current.position.z = 0.45 + off
    if (gateLamp.current) {
      gateLamp.current.emissive.set(gateOpen ? ZONE.green : RED)
      gateLamp.current.emissiveIntensity = gateOpen ? 3 : 1.6
    }
  })

  return (
    <group>
      <Belt x0={ORDER_START_X} x1={ORDER_END_X} z={ORDER_Z} color={ZONE.amber} />
      {/* parcels + their drones */}
      {Array.from({ length: N }).map((_, i) => (
        <group key={i}>
          <group ref={(g) => { groups.current[i] = g }} visible={false}>
            <mesh geometry={boxGeo} material={parcelMat} castShadow />
            <mesh position={[0, 0.01, 0]} scale={[1.02, 1.02, 0.16]} geometry={boxGeo}>
              <meshStandardMaterial color={ZONE.amber} roughness={0.5} />
            </mesh>
          </group>
          <Drone ref={(g: THREE.Group | null) => { drones.current[i] = g }} />
        </group>
      ))}
      {/* approval gate */}
      <group position={[GATE_X, 0, ORDER_Z]}>
        {[-1.0, 1.0].map((dz, i) => (
          <mesh key={i} material={frameMat} position={[0, 1.05, dz]} castShadow><boxGeometry args={[0.45, 2.1, 0.32]} /></mesh>
        ))}
        <mesh material={frameMat} position={[0, 2.2, 0]} castShadow><boxGeometry args={[0.45, 0.32, 2.3]} /></mesh>
        {/* sliding doors */}
        <mesh ref={doorL} position={[0, 1.0, -0.45]}>
          <boxGeometry args={[0.1, 1.9, 0.9]} />
          <meshPhysicalMaterial color={ZONE.green} transparent opacity={0.45} roughness={0.1} emissive={ZONE.green} emissiveIntensity={0.5} />
        </mesh>
        <mesh ref={doorR} position={[0, 1.0, 0.45]}>
          <boxGeometry args={[0.1, 1.9, 0.9]} />
          <meshPhysicalMaterial color={ZONE.green} transparent opacity={0.45} roughness={0.1} emissive={ZONE.green} emissiveIntensity={0.5} />
        </mesh>
        <mesh position={[0, 2.42, 0]}>
          <sphereGeometry args={[0.13, 12, 12]} />
          <meshStandardMaterial ref={gateLamp} color="#111" emissive={RED} emissiveIntensity={1.6} toneMapped={false} />
        </mesh>
        <Text font={FONT} position={[0, 2.7, 0]} rotation={[0, Math.PI / 2, 0]} fontSize={0.24} color={ZONE.green} anchorX="center" outlineWidth={0.01} outlineColor="#10131b">
          APPROVAL GATE
        </Text>
      </group>
      {/* shipping door */}
      <group position={[DOOR_X + 1.6, 0, ORDER_Z]}>
        <mesh material={frameMat} position={[0, 1.5, -1.3]} castShadow><boxGeometry args={[0.4, 3.0, 0.4]} /></mesh>
        <mesh material={frameMat} position={[0, 1.5, 1.3]} castShadow><boxGeometry args={[0.4, 3.0, 0.4]} /></mesh>
        <mesh material={frameMat} position={[0, 3.1, 0]} castShadow><boxGeometry args={[0.4, 0.4, 3.0]} /></mesh>
        <mesh position={[0, 1.55, 0]}>
          <planeGeometry args={[2.4, 2.9]} />
          <meshBasicMaterial color={ZONE.amber} transparent opacity={0.14} side={THREE.DoubleSide} toneMapped={false} depthWrite={false} />
        </mesh>
        <mesh position={[0, 3.36, 0]}>
          <boxGeometry args={[0.44, 0.08, 3.0]} />
          <meshStandardMaterial color={ZONE.amber} emissive={ZONE.amber} emissiveIntensity={2.4} toneMapped={false} />
        </mesh>
        <Text font={FONT} position={[0, 3.7, 0]} rotation={[0, Math.PI / 2, 0]} fontSize={0.28} color={ZONE.amber} anchorX="center" outlineWidth={0.01} outlineColor="#10131b">
          SHIPPING
        </Text>
      </group>
    </group>
  )
}

import { forwardRef } from 'react'

const droneBody = new THREE.MeshStandardMaterial({ color: '#f2f4f9', roughness: 0.2, metalness: 0.1 })
const droneDark = new THREE.MeshStandardMaterial({ color: '#2a2f3c', roughness: 0.4, metalness: 0.6 })

const Drone = forwardRef<THREE.Group>(function Drone(_, ref) {
  const props = useRef<THREE.Mesh[]>([])
  useFrame(({ clock }) => {
    props.current.forEach((p, i) => { if (p) p.rotation.y = clock.elapsedTime * 30 + i })
  })
  return (
    <group ref={ref} visible={false}>
      <mesh material={droneBody} castShadow><sphereGeometry args={[0.22, 14, 12]} /></mesh>
      <mesh material={droneDark} position={[0, -0.12, 0]}><cylinderGeometry args={[0.04, 0.04, 0.5, 6]} /></mesh>
      {[[-0.3, 0.12, -0.3], [0.3, 0.12, -0.3], [-0.3, 0.12, 0.3], [0.3, 0.12, 0.3]].map(([x, y, z], i) => (
        <group key={i} position={[x, y, z]}>
          <mesh material={droneDark}><cylinderGeometry args={[0.03, 0.03, 0.1, 6]} /></mesh>
          <mesh ref={(m) => { if (m) props.current[i] = m }} position={[0, 0.07, 0]}>
            <boxGeometry args={[0.34, 0.015, 0.05]} />
            <meshStandardMaterial color="#9aa3b8" transparent opacity={0.85} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0, 0.2]}>
        <sphereGeometry args={[0.045, 8, 8]} />
        <meshStandardMaterial color={ZONE.amber} emissive={ZONE.amber} emissiveIntensity={3} toneMapped={false} />
      </mesh>
    </group>
  )
})

/** Parked spare drones in the south aisle — fills the empty floor between districts */
function DroneBay() {
  const bob = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (bob.current) bob.current.position.y = 0.55 + Math.sin(clock.elapsedTime * 1.8) * 0.06
  })
  return (
    <group position={[0, 0, 12.6]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[1.5, 1.66, 6]} />
        <meshStandardMaterial color={VIOLET} emissive={VIOLET} emissiveIntensity={1.3} toneMapped={false} />
      </mesh>
      {[-0.8, 0.8].map((x, i) => (
        <group key={i} position={[x, 0, 0]}>
          <mesh material={frameMat} position={[0, 0.14, 0]}><cylinderGeometry args={[0.42, 0.5, 0.28, 8]} /></mesh>
          {i === 0 ? (
            <group position={[0, 0.5, 0]}>
              <StaticDrone />
            </group>
          ) : (
            <group ref={bob}>
              <StaticDrone spin />
            </group>
          )}
        </group>
      ))}
      <Text font={FONT} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 2.2]} fontSize={0.34} letterSpacing={0.2} color="#b9a8ee" anchorX="center">
        DRONE BAY
      </Text>
    </group>
  )
}

function StaticDrone({ spin }: { spin?: boolean }) {
  const props = useRef<THREE.Mesh[]>([])
  useFrame(({ clock }) => {
    if (spin) props.current.forEach((p, i) => { if (p) p.rotation.y = clock.elapsedTime * 26 + i })
  })
  return (
    <group>
      <mesh material={droneBody} castShadow><sphereGeometry args={[0.22, 14, 12]} /></mesh>
      {[[-0.3, 0.12, -0.3], [0.3, 0.12, -0.3], [-0.3, 0.12, 0.3], [0.3, 0.12, 0.3]].map(([x, y, z], i) => (
        <group key={i} position={[x, y, z]}>
          <mesh material={droneDark}><cylinderGeometry args={[0.03, 0.03, 0.1, 6]} /></mesh>
          <mesh ref={(m) => { if (m) props.current[i] = m }} position={[0, 0.07, 0]}>
            <boxGeometry args={[0.34, 0.015, 0.05]} />
            <meshStandardMaterial color="#9aa3b8" transparent opacity={0.85} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0, 0.2]}>
        <sphereGeometry args={[0.045, 8, 8]} />
        <meshStandardMaterial color={VIOLET} emissive={VIOLET} emissiveIntensity={2.6} toneMapped={false} />
      </mesh>
    </group>
  )
}

export function Conveyors() {
  return (
    <group>
      <IntakeLine />
      <OrderLine />
      <DroneBay />
    </group>
  )
}
