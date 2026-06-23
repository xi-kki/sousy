/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck — R3F + drei types lag behind three.js v0.184; runtime is fine.

/**
 * @file SousyRobot — 3D robot mascot built from Three.js primitives.
 * Floating, expressive, with state-driven animations and a greeting sequence.
 *
 * Design: retro-futuristic kitchen droid — dome head, crescent visor,
 * two articulated arms, antenna with glow. Eclipse design system colours.
 */

import { useRef, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Float, Html } from '@react-three/drei'
import type { AgentState } from '../types'
import { speak } from '../lib/speech'

/* ─── Props ────────────────────────────────────────────────── */

interface SousyRobotProps {
  state: AgentState
}

/* ─── Component ────────────────────────────────────────────── */

export default function SousyRobot({ state }: SousyRobotProps) {
  const groupRef = useRef<any>(null!)
  const headRef = useRef<any>(null!)
  const leftArmRef = useRef<any>(null!)
  const rightArmRef = useRef<any>(null!)
  const visorRef = useRef<any>(null!)
  const antennaGlowRef = useRef<any>(null!)

  const [showBubble, setShowBubble] = useState(false)
  const [bubbleText, setBubbleText] = useState('')

  /* ── Greeting sequence ───────────────────────────────────── */
  useEffect(() => {
    const t1 = setTimeout(() => {
      setBubbleText("Hi, I'm Sousy!")
      setShowBubble(true)
      speak("Hi, I'm Sousy, your voice line cook.")
    }, 800)

    const t2 = setTimeout(() => {
      setShowBubble(false)
      setBubbleText('')
    }, 5000)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [])

  /* ── Per-frame animation ─────────────────────────────────── */
  useFrame(() => {
    const group = groupRef.current
    const head = headRef.current
    const leftArm = leftArmRef.current
    const rightArm = rightArmRef.current
    const visor = visorRef.current
    const antenna = antennaGlowRef.current
    if (!group || !head || !leftArm || !rightArm || !visor || !antenna) return

    const t = Date.now() * 0.001
    const speed = 0.08

    let targetLean = 0
    let targetHeadTilt = 0
    let armSwingAmp = 0.1
    let visorIntensity = 0.4
    let antennaPulse = 0.3 + Math.sin(t * 2) * 0.15

    switch (state) {
      case 'listening': {
        targetLean = 0.06
        antennaPulse = 0.3 + Math.sin(t * 6) * 0.5
        visorIntensity = 0.6 + Math.sin(t * 3) * 0.2
        armSwingAmp = 0.05
        break
      }
      case 'thinking': {
        targetLean = -0.08
        targetHeadTilt = 0.2
        antennaPulse = 0.3 + Math.sin(t * 1.5) * 0.2
        visorIntensity = 0.5 + Math.sin(t * 1.2) * 0.15
        armSwingAmp = 0.02
        break
      }
      case 'speaking': {
        targetLean = 0.04
        antennaPulse = 0.3 + Math.sin(t * 4) * 0.3
        visorIntensity = 0.8 + Math.sin(t * 8) * 0.2
        armSwingAmp = 0.2
        break
      }
      default:
        break
    }

    // Smooth lerps
    group.rotation.x += (targetLean - group.rotation.x) * speed
    head.rotation.z += (targetHeadTilt - head.rotation.z) * speed

    // LEFT ARM — pointing toward "Get Started" button below-right
    leftArm.rotation.x += (-1.0 - leftArm.rotation.x) * 0.04
    leftArm.rotation.z += (0.4 - leftArm.rotation.z) * 0.04

    // RIGHT ARM — waving to greet the cook
    const waveAngle = Math.sin(t * 2.8) * 0.5
    rightArm.rotation.z += (waveAngle - rightArm.rotation.z) * 0.06
    rightArm.rotation.x += (Math.sin(t * 2.8 + Math.PI / 2) * 0.15 - rightArm.rotation.x) * 0.04

    // Visor glow
    visor.material.emissiveIntensity = visorIntensity

    // Antenna glow
    antenna.material.emissiveIntensity = antennaPulse
  })

  return (
    <Float
      speed={1.0}
      rotationIntensity={0.12}
      floatIntensity={0.35}
    >
      <group ref={groupRef} position={[0, -0.4, 0]}>
        {/* ═══ ANTENNA ═══ */}
        <group position={[0, 1.45, 0]}>
          <mesh position={[0, 0.25, 0]}>
            <cylinderGeometry args={[0.025, 0.035, 0.4, 8]} />
            <meshStandardMaterial color="#888680" metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh ref={antennaGlowRef} position={[0, 0.5, 0]}>
            <sphereGeometry args={[0.08, 16, 16]} />
            <meshStandardMaterial
              color="#a1fea0"
              emissive="#a1fea0"
              emissiveIntensity={0.4}
            />
          </mesh>
        </group>

        {/* ═══ HEAD ═══ */}
        <group ref={headRef} position={[0, 1.0, 0]}>
          {/* Dome */}
          <mesh position={[0, 0.15, 0]}>
            <sphereGeometry args={[0.45, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#302f2c" metalness={0.7} roughness={0.25} />
          </mesh>
          {/* Face plate */}
          <mesh position={[0, -0.05, 0.35]}>
            <planeGeometry args={[0.6, 0.35]} />
            <meshStandardMaterial color="#000000" metalness={0.8} roughness={0.2} />
          </mesh>
          {/* Visor — crescent glow */}
          <mesh ref={visorRef} position={[0, 0.05, 0.36]}>
            <ringGeometry args={[0.08, 0.18, 24, 1, 0, Math.PI]} />
            <meshBasicMaterial
              color="#a1fea0"
              transparent
              opacity={0.9}
            />
          </mesh>
          {/* Visor — small dot accent */}
          <mesh position={[0, -0.05, 0.36]}>
            <sphereGeometry args={[0.03, 8, 8]} />
            <meshBasicMaterial color="#a1fea0" />
          </mesh>
        </group>

        {/* ═══ NECK ═══ */}
        <mesh position={[0, 0.75, 0]}>
          <cylinderGeometry args={[0.12, 0.15, 0.1, 8]} />
          <meshStandardMaterial color="#888680" metalness={0.5} roughness={0.5} />
        </mesh>

        {/* ═══ BODY ═══ */}
        <group position={[0, 0.3, 0]}>
          {/* Main torso */}
          <mesh position={[0, 0.1, 0]}>
            <cylinderGeometry args={[0.45, 0.55, 0.7, 12]} />
            <meshStandardMaterial color="#302f2c" metalness={0.6} roughness={0.3} />
          </mesh>
          {/* Chest detail ring */}
          <mesh position={[0, 0.2, 0]}>
            <torusGeometry args={[0.4, 0.02, 8, 24]} />
            <meshStandardMaterial color="#a1fea0" emissive="#a1fea0" emissiveIntensity={0.2} />
          </mesh>
          {/* Chest accent dot */}
          <mesh position={[0, 0.1, 0.4]}>
            <sphereGeometry args={[0.04, 8, 8]} />
            <meshStandardMaterial color="#a1fea0" emissive="#a1fea0" emissiveIntensity={0.4} />
          </mesh>
          {/* Belt ring */}
          <mesh position={[0, -0.15, 0]}>
            <torusGeometry args={[0.42, 0.025, 8, 24]} />
            <meshStandardMaterial color="#888680" metalness={0.4} roughness={0.6} />
          </mesh>
        </group>

        {/* ═══ LEFT ARM ═══ */}
        <group ref={leftArmRef} position={[-0.5, 0.65, 0]}>
          <mesh position={[-0.15, -0.1, 0]} rotation={[0, 0, 0.2]}>
            <cylinderGeometry args={[0.05, 0.06, 0.5, 8]} />
            <meshStandardMaterial color="#302f2c" metalness={0.6} roughness={0.3} />
          </mesh>
          {/* Hand / pincer */}
          <mesh position={[-0.25, -0.4, 0]}>
            <sphereGeometry args={[0.06, 8, 8]} />
            <meshStandardMaterial color="#a1fea0" emissive="#a1fea0" emissiveIntensity={0.2} />
          </mesh>
        </group>

        {/* ═══ RIGHT ARM ═══ */}
        <group ref={rightArmRef} position={[0.5, 0.65, 0]}>
          <mesh position={[0.15, -0.1, 0]} rotation={[0, 0, -0.2]}>
            <cylinderGeometry args={[0.05, 0.06, 0.5, 8]} />
            <meshStandardMaterial color="#302f2c" metalness={0.6} roughness={0.3} />
          </mesh>
          {/* Hand / pincer */}
          <mesh position={[0.25, -0.4, 0]}>
            <sphereGeometry args={[0.06, 8, 8]} />
            <meshStandardMaterial color="#a1fea0" emissive="#a1fea0" emissiveIntensity={0.2} />
          </mesh>
        </group>

        {/* ═══ BASE / SKIRT ═══ */}
        <mesh position={[0, -0.1, 0]}>
          <cylinderGeometry args={[0.45, 0.6, 0.12, 12]} />
          <meshStandardMaterial color="#000000" metalness={0.5} roughness={0.6} />
        </mesh>

        {/* ── Speech bubble ── */}
        {showBubble && (
          <Html position={[0.7, 1.6, 0]} center>
            <div
              className="speech-bubble"
              style={{
                background: '#a1fea0',
                color: '#000000',
                fontFamily: "'Space Mono', monospace",
                fontSize: '14px',
                fontWeight: 700,
                padding: '10px 18px',
                borderRadius: '20px 20px 20px 4px',
                whiteSpace: 'nowrap',
                boxShadow: '0 0 30px rgba(161, 254, 160, 0.5)',
                animation: 'bubble-in 0.3s ease-out',
                pointerEvents: 'none',
                userSelect: 'none',
              }}
            >
              {bubbleText}
              <div
                style={{
                  position: 'absolute',
                  bottom: '-8px',
                  left: '20px',
                  width: 0,
                  height: 0,
                  borderLeft: '8px solid transparent',
                  borderRight: '8px solid transparent',
                  borderTop: '8px solid #a1fea0',
                }}
              />
            </div>
          </Html>
        )}
      </group>
    </Float>
  )
}
