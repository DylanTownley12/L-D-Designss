import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import { AGENTS } from '../sim/agents'
import { ZONE, VIOLET, VIOLET_DEEP } from '../theme'
import { FONT } from './Factory'
import { useAgency } from '../sim/store'

export function HermesTower() {
  const core = useRef<THREE.Mesh>(null)
  const coreMat = useRef<THREE.MeshStandardMaterial>(null)
  const ring1 = useRef<THREE.Mesh>(null)
  const ring2 = useRef<THREE.Mesh>(null)
  const light = useRef<THREE.PointLight>(null)

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const pulse = 0.75 + 0.45 * Math.sin(t * 2.2) + 0.1 * Math.sin(t * 7)
    if (core.current) core.current.scale.setScalar(1 + 0.08 * Math.sin(t * 2.2))
    if (coreMat.current) coreMat.current.emissiveIntensity = 1.5 + pulse * 0.6
    if (light.current) light.current.intensity = 9 + pulse * 4
    if (ring1.current) ring1.current.rotation.y = t * 0.5
    if (ring2.current) { ring2.current.rotation.y = -t * 0.34; ring2.current.rotation.x = 0.15 * Math.sin(t * 0.7) }
  })

  return (
    <group>
      {/* base plinth */}
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[3.1, 3.5, 0.6, 8]} />
        <meshStandardMaterial color="#232836" roughness={0.5} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0.62, 0]}>
        <cylinderGeometry args={[2.85, 2.85, 0.08, 8]} />
        <meshStandardMaterial color="#241a3f" emissive={VIOLET} emissiveIntensity={0.55} toneMapped={false} />
      </mesh>
      {/* glass tower — tapered octagonal shaft */}
      <mesh position={[0, 3.6, 0]} castShadow>
        <cylinderGeometry args={[1.5, 2.5, 6.2, 8, 1, true]} />
        <meshPhysicalMaterial
          color={VIOLET_DEEP}
          transparent opacity={0.34}
          roughness={0.08} metalness={0.1}
          transmission={0}
          side={THREE.DoubleSide}
          emissive={VIOLET_DEEP} emissiveIntensity={0.25}
        />
      </mesh>
      {/* glowing edge ribs on the shaft */}
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8
        return (
          <group key={i} rotation={[0, a, 0]}>
            <mesh position={[2.0, 3.6, 0]} rotation={[0, 0, 0.16]}>
              <boxGeometry args={[0.07, 6.3, 0.07]} />
              <meshStandardMaterial color={VIOLET} emissive={VIOLET} emissiveIntensity={1.5} toneMapped={false} />
            </mesh>
          </group>
        )
      })}
      {/* floor rings inside glass */}
      {[1.4, 2.6, 3.8, 5.0].map((y, i) => (
        <mesh key={i} position={[0, y, 0]}>
          <cylinderGeometry args={[2.5 - y * 0.16, 2.5 - y * 0.16, 0.06, 8]} />
          <meshStandardMaterial color="#3b2f63" emissive="#8b5cf6" emissiveIntensity={0.5} transparent opacity={0.9} />
        </mesh>
      ))}
      {/* pulsing core */}
      <mesh ref={core} position={[0, 3.7, 0]}>
        <icosahedronGeometry args={[0.7, 1]} />
        <meshStandardMaterial ref={coreMat} color="#b184ff" emissive="#a374ff" emissiveIntensity={2} toneMapped={false} />
      </mesh>
      <pointLight ref={light} position={[0, 3.9, 0]} color={VIOLET} intensity={30} distance={26} decay={1.8} />
      {/* orbiting halo rings */}
      <mesh ref={ring1} position={[0, 3.7, 0]} rotation={[Math.PI / 2.4, 0, 0]}>
        <torusGeometry args={[1.5, 0.045, 8, 48]} />
        <meshStandardMaterial color={VIOLET} emissive={VIOLET} emissiveIntensity={2.4} toneMapped={false} />
      </mesh>
      <mesh ref={ring2} position={[0, 3.7, 0]} rotation={[Math.PI / 1.8, 0.4, 0]}>
        <torusGeometry args={[1.95, 0.035, 8, 48]} />
        <meshStandardMaterial color="#c4b5fd" emissive="#c4b5fd" emissiveIntensity={1.8} toneMapped={false} />
      </mesh>
      {/* crown + beacon */}
      <mesh position={[0, 6.85, 0]} castShadow>
        <cylinderGeometry args={[1.35, 1.55, 0.35, 8]} />
        <meshStandardMaterial color="#3d3358" roughness={0.35} metalness={0.7} />
      </mesh>
      <mesh position={[0, 7.05, 0]}>
        <cylinderGeometry args={[1.36, 1.36, 0.07, 8]} />
        <meshStandardMaterial color="#2b2440" emissive={VIOLET} emissiveIntensity={1.1} toneMapped={false} />
      </mesh>
      <mesh position={[0, 7.35, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.18, 0.6, 8]} />
        <meshStandardMaterial color="#3d3358" roughness={0.4} metalness={0.7} />
      </mesh>
      <mesh position={[0, 7.75, 0]}>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshStandardMaterial color="#f5f3ff" emissive="#c4b5fd" emissiveIntensity={3.4} toneMapped={false} />
      </mesh>
      {/* HERMES label */}
      <Text font={FONT} position={[0, 8.6, 0]} fontSize={0.72} letterSpacing={0.3} color="#e9d5ff" anchorX="center" outlineWidth={0.03} outlineColor="#3b1a6e">
        HERMES
      </Text>
      <ClickPad />
    </group>
  )
}

function ClickPad() {
  const select = useAgency((s) => s.select)
  return (
    <mesh
      position={[0, 3.5, 0]}
      visible={false}
      onClick={(e) => { e.stopPropagation(); select(0) }}
      onPointerOver={() => (document.body.style.cursor = 'pointer')}
      onPointerOut={() => (document.body.style.cursor = 'auto')}
    >
      <cylinderGeometry args={[2.7, 2.7, 8, 8]} />
    </mesh>
  )
}

/** Light trails: bezier arcs from the tower core to every station, with travelling pulses. */
export function Trails() {
  const curves = useMemo(
    () =>
      AGENTS.map((a) => {
        const from = new THREE.Vector3(0, 6.4, 0)
        const to = new THREE.Vector3(a.pos[0], 0.9, a.pos[2])
        const mid = from.clone().lerp(to, 0.5)
        mid.y = 6.8 + to.distanceTo(from) * 0.16
        return { agent: a, curve: new THREE.QuadraticBezierCurve3(from, mid, to) }
      }),
    []
  )
  return (
    <group>
      {curves.map(({ agent, curve }, i) => (
        <Trail key={agent.id} curve={curve} color={ZONE[agent.zone]} phase={i * 0.37} />
      ))}
    </group>
  )
}

function Trail({ curve, color, phase }: { curve: THREE.QuadraticBezierCurve3; color: string; phase: number }) {
  const geo = useMemo(() => new THREE.BufferGeometry().setFromPoints(curve.getPoints(36)), [curve])
  const pulse = useRef<THREE.Mesh>(null)
  const pulse2 = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    const t1 = (clock.elapsedTime * 0.22 + phase) % 1
    const t2 = (clock.elapsedTime * 0.22 + phase + 0.5) % 1
    if (pulse.current) pulse.current.position.copy(curve.getPoint(t1))
    if (pulse2.current) pulse2.current.position.copy(curve.getPoint(t2))
  })
  return (
    <group>
      {/* @ts-ignore — three line element */}
      <line geometry={geo}>
        <lineBasicMaterial color={color} transparent opacity={0.45} toneMapped={false} />
      </line>
      <mesh ref={pulse}>
        <sphereGeometry args={[0.11, 8, 8]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh ref={pulse2}>
        <sphereGeometry args={[0.075, 8, 8]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
    </group>
  )
}
