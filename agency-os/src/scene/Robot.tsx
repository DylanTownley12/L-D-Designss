import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import type { AgentDef } from '../sim/types'
import { ZONE } from '../theme'

// Shared geometries/materials — every robot reuses these (perf)
const bodyGeo = new THREE.SphereGeometry(0.46, 24, 20)
const headGeo = new THREE.SphereGeometry(0.34, 24, 20)
const visorGeo = new THREE.SphereGeometry(0.3, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55)
const armGeo = new THREE.CapsuleGeometry(0.09, 0.42, 4, 10)
const handGeo = new THREE.SphereGeometry(0.12, 12, 12)
const footGeo = new THREE.SphereGeometry(0.16, 12, 10)
const antGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6)
const tipGeo = new THREE.SphereGeometry(0.06, 8, 8)
const shadowGeo = new THREE.CircleGeometry(0.55, 24)

const whiteMat = new THREE.MeshStandardMaterial({ color: '#f2f4f9', roughness: 0.18, metalness: 0.05 })
const jointMat = new THREE.MeshStandardMaterial({ color: '#2a2f3c', roughness: 0.35, metalness: 0.5 })
const visorMat = new THREE.MeshStandardMaterial({ color: '#10131b', roughness: 0.1, metalness: 0.4 })
const shadowMat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.28 })

const eyeMats: Record<string, THREE.MeshStandardMaterial> = {}
function eyeMat(color: string) {
  if (!eyeMats[color]) eyeMats[color] = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 3.2, toneMapped: false })
  return eyeMats[color]
}

export function Robot({ agent }: { agent: AgentDef }) {
  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const phase = agent.id * 1.7
  const color = ZONE[agent.zone]

  useFrame(({ clock }) => {
    const t = clock.elapsedTime + phase
    if (!body.current || !head.current || !armL.current || !armR.current) return
    // universal idle: hover-bob + tiny sway
    body.current.position.y = 0.72 + Math.sin(t * 2.1) * 0.045
    body.current.rotation.z = Math.sin(t * 1.3) * 0.03
    head.current.rotation.set(0, 0, 0)
    // work loops
    switch (agent.anim) {
      case 'radar':
        head.current.rotation.y = Math.sin(t * 0.9) * 0.9
        armR.current.rotation.set(-1.9, 0, -0.3)
        armL.current.rotation.set(0.3 + Math.sin(t * 2) * 0.1, 0, 0.35)
        break
      case 'stamp': {
        const s = Math.pow(Math.max(0, Math.sin(t * 2.4)), 6)
        armR.current.rotation.set(-2.2 + s * 2.4, 0, -0.2)
        armL.current.rotation.set(0.4, 0, 0.5)
        head.current.rotation.x = s * 0.25
        break
      }
      case 'lift': {
        const l = Math.sin(t * 1.6) * 0.5
        armL.current.rotation.set(-1.2 + l, 0, 0.3)
        armR.current.rotation.set(-1.2 + l, 0, -0.3)
        body.current.rotation.x = 0.08 + l * 0.06
        break
      }
      case 'point':
        armR.current.rotation.set(-1.5 + Math.sin(t * 1.2) * 0.35, 0, -0.9)
        armL.current.rotation.set(0.3, 0, 0.4)
        head.current.rotation.y = Math.sin(t * 1.2) * 0.2
        break
      case 'type':
        armL.current.rotation.set(-1.1 + Math.sin(t * 9) * 0.12, 0, 0.25)
        armR.current.rotation.set(-1.1 + Math.cos(t * 9) * 0.12, 0, -0.25)
        head.current.rotation.x = 0.28
        break
      case 'film':
        armR.current.rotation.set(-1.7, 0, -0.5)
        armL.current.rotation.set(-1.7, 0, 0.5)
        head.current.rotation.y = Math.sin(t * 0.6) * 0.4
        break
      case 'calendar': {
        const r = Math.sin(t * 1.4)
        armR.current.rotation.set(-2.3 + r * 0.3, 0, -0.4 + r * 0.3)
        armL.current.rotation.set(0.3, 0, 0.4)
        head.current.rotation.x = -0.25
        break
      }
      case 'console': {
        const burst = Math.pow(Math.max(0, Math.sin(t * 0.7)), 8)
        armL.current.rotation.set(-1.0 + Math.sin(t * 7) * 0.1 - burst * 1.6, 0, 0.3)
        armR.current.rotation.set(-1.0 + Math.cos(t * 7) * 0.1 - burst * 1.6, 0, -0.3)
        break
      }
      case 'lever': {
        const pull = Math.sin(t * 1.1)
        armR.current.rotation.set(-1.6 + pull * 0.7, 0, -0.2)
        armL.current.rotation.set(-1.6 + pull * 0.7, 0, 0.2)
        body.current.rotation.x = pull * 0.12
        break
      }
      case 'greet':
        armR.current.rotation.set(-2.6, 0, Math.sin(t * 4) * 0.35)
        armL.current.rotation.set(0.35, 0, 0.4)
        break
      case 'pack':
        armL.current.rotation.set(-0.9 + Math.sin(t * 4) * 0.5, 0, 0.3)
        armR.current.rotation.set(-0.9 - Math.sin(t * 4) * 0.5, 0, -0.3)
        head.current.rotation.x = 0.3
        break
      case 'headset':
        armR.current.rotation.set(-2.5, 0, -1.15)
        armL.current.rotation.set(-1.0, 0, 0.5 + Math.sin(t * 2.4) * 0.25)
        head.current.rotation.z = Math.sin(t * 1.1) * 0.08
        break
      case 'coins': {
        const c = Math.sin(t * 1.8)
        armR.current.rotation.set(-1.1 + c * 0.6, 0, -0.3)
        armL.current.rotation.set(0.3, 0, 0.4)
        body.current.rotation.x = 0.1 + c * 0.05
        break
      }
      case 'shield':
        armR.current.rotation.set(-1.5, 0, -0.4 + Math.sin(t * 1.3) * 0.7)
        armL.current.rotation.set(0.3, 0, 0.45)
        head.current.rotation.y = Math.sin(t * 1.3) * 0.4
        break
      case 'server':
        head.current.rotation.x = 0.15 + Math.sin(t * 2.6) * 0.12
        armR.current.rotation.set(-1.3 + Math.sin(t * 2.6) * 0.2, 0, -0.3)
        armL.current.rotation.set(0.4, 0, 0.4)
        break
    }
  })

  // NB: parent station group applies position/rotation; robot renders at local origin
  return (
    <group ref={root}>
      {/* blob shadow */}
      <mesh geometry={shadowGeo} material={shadowMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]} />
      <group ref={body}>
        {/* torso */}
        <mesh geometry={bodyGeo} material={whiteMat} scale={[1, 0.92, 0.9]} castShadow />
        {/* chest light */}
        <mesh position={[0, 0.05, 0.4]}>
          <circleGeometry args={[0.09, 12]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.5} toneMapped={false} />
        </mesh>
        {/* head */}
        <group ref={head} position={[0, 0.62, 0]}>
          <mesh geometry={headGeo} material={whiteMat} castShadow />
          <mesh geometry={visorGeo} material={visorMat} rotation={[Math.PI / 2.6, 0, 0]} position={[0, 0.02, 0.06]} />
          {/* eyes */}
          <mesh position={[-0.11, 0.06, 0.28]} material={eyeMat(color)}><sphereGeometry args={[0.055, 10, 10]} /></mesh>
          <mesh position={[0.11, 0.06, 0.28]} material={eyeMat(color)}><sphereGeometry args={[0.055, 10, 10]} /></mesh>
          {/* antenna */}
          <mesh geometry={antGeo} material={jointMat} position={[0, 0.42, 0]} />
          <mesh geometry={tipGeo} material={eyeMat(color)} position={[0, 0.58, 0]} />
        </group>
        {/* arms (pivot at shoulder) */}
        <group ref={armL} position={[-0.42, 0.18, 0]}>
          <mesh geometry={armGeo} material={whiteMat} position={[0, -0.28, 0]} castShadow />
          <mesh geometry={handGeo} material={jointMat} position={[0, -0.55, 0]} />
        </group>
        <group ref={armR} position={[0.42, 0.18, 0]}>
          <mesh geometry={armGeo} material={whiteMat} position={[0, -0.28, 0]} castShadow />
          <mesh geometry={handGeo} material={jointMat} position={[0, -0.55, 0]} />
        </group>
        {/* feet */}
        <mesh geometry={footGeo} material={jointMat} position={[-0.2, -0.5, 0]} />
        <mesh geometry={footGeo} material={jointMat} position={[0.2, -0.5, 0]} />
      </group>
    </group>
  )
}
