// @ts-nocheck — R3F + drei types lag behind three.js v0.184; runtime is fine.

/**
 * @file RobotHero — 3D Canvas wrapper for the Sousy robot mascot.
 * Provides lighting, environment, bloom post-processing, and a
 * performance‑sensitive render loop.
 */

import { Suspense, lazy } from 'react'
import { Canvas } from '@react-three/fiber'
import { Environment } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'
import type { AgentState } from '../types'

// Lazy-load the heavy 3D model so the main bundle stays lean
const SousyRobot = lazy(() => import('./SousyRobot'))

interface RobotHeroProps {
  state: AgentState
}

export default function RobotHero({ state }: RobotHeroProps) {
  return (
    <div
      className="relative w-full"
      style={{ height: 'min(70vh, 520px)' }}
    >
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 0.3, 3.8], fov: 40 }}
        gl={{ antialias: true, alpha: false }}
        style={{ background: '#000000' }}
      >
        {/* ── Lighting ─────────────────────────────────── */}
        <ambientLight intensity={0.4} />
        <directionalLight
          position={[3, 4, 2]}
          intensity={1.2}
          color="#ffffff"
        />
        <directionalLight
          position={[-2, 1, -2]}
          intensity={0.4}
          color="#a1fea0"
        />
        <pointLight position={[0, 2, 1]} intensity={0.3} color="#a1fea0" />

        {/* ── Environment (subtle reflections) ─────────── */}
        <Environment preset="city" />

        {/* ── Scene ────────────────────────────────────── */}
        <Suspense fallback={null}>
          <SousyRobot state={state} />
        </Suspense>

        {/* ── Ground glow ring ─────────────────────────── */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.35, 0]}>
          <ringGeometry args={[0.6, 1.2, 32]} />
          <meshBasicMaterial
            color="#a1fea0"
            transparent
            opacity={0.08}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* ── Post-processing ──────────────────────────── */}
        <EffectComposer>
          <Bloom
            luminanceThreshold={0.3}
            luminanceSmoothing={0.1}
            intensity={0.6}
          />
        </EffectComposer>
      </Canvas>
    </div>
  )
}
