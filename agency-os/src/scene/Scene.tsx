import { Suspense, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Environment, Lightformer } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import { Factory } from './Factory'
import { HermesTower, Trails } from './Hermes'
import { Stations } from './Stations'
import { Conveyors } from './Conveyors'
import { useAgency } from '../sim/store'
import { BG, VIOLET } from '../theme'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'

function ClampedControls() {
  const controls = useRef<OrbitControlsImpl>(null)
  useFrame(() => {
    const c = controls.current
    if (!c) return
    // clamp pan so the factory never leaves view
    c.target.x = THREE.MathUtils.clamp(c.target.x, -14, 14)
    c.target.z = THREE.MathUtils.clamp(c.target.z, -10, 12)
    c.target.y = THREE.MathUtils.clamp(c.target.y, 0, 4)
  })
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={[0, 0, 1.5]}
      minDistance={14}
      maxDistance={46}
      minPolarAngle={0.35}
      maxPolarAngle={1.12}
      minAzimuthAngle={-0.85}
      maxAzimuthAngle={0.85}
      enableDamping
      dampingFactor={0.08}
      zoomSpeed={0.7}
    />
  )
}

export function Scene() {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, 27, 24], fov: 42, near: 1, far: 160 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onPointerMissed={() => useAgency.getState().select(null)}
      style={{ position: 'absolute', inset: 0 }}
    >
      <color attach="background" args={[BG]} />
      <fog attach="fog" args={[BG, 46, 105]} />

      {/* lighting */}
      <ambientLight intensity={0.38} color="#dbe2ff" />
      <hemisphereLight intensity={0.25} color="#eef1ff" groundColor="#3a4256" />
      <directionalLight
        position={[14, 26, 12]}
        intensity={1.15}
        color="#fff4e2"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-28}
        shadow-camera-right={28}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
        shadow-camera-far={80}
        shadow-bias={-0.0002}
        shadow-normalBias={0.06}
      />
      <directionalLight position={[-16, 14, -8]} intensity={0.25} color="#8fa8ff" />
      <pointLight position={[0, 10, 0]} intensity={5} color={VIOLET} distance={28} decay={2} />

      {/* local studio-style env for glossy reflections (no network fetch) */}
      <Environment resolution={64} frames={1}>
        <Lightformer intensity={1.4} position={[0, 8, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[18, 18, 1]} color="#dfe6ff" />
        <Lightformer intensity={1.1} position={[-12, 4, 6]} rotation={[0, Math.PI / 3, 0]} scale={[8, 4, 1]} color="#00e5ff" />
        <Lightformer intensity={1.1} position={[12, 4, 6]} rotation={[0, -Math.PI / 3, 0]} scale={[8, 4, 1]} color="#ff3df0" />
        <Lightformer intensity={0.9} position={[0, 3, -14]} scale={[14, 3, 1]} color="#8b5cf6" />
      </Environment>

      <Suspense fallback={null}>
        <Factory />
        <HermesTower />
        <Trails />
        <Stations />
        <Conveyors />
      </Suspense>

      <ClampedControls />

      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur intensity={0.65} luminanceThreshold={1.1} luminanceSmoothing={0.2} />
        <Vignette eskil={false} offset={0.14} darkness={0.62} />
      </EffectComposer>
    </Canvas>
  )
}
