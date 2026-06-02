'use client';

import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, MeshDistortMaterial } from '@react-three/drei';
import * as THREE from 'three';

function TorusKnot() {
  const mesh = useRef<THREE.Mesh>(null!);

  useFrame(({ clock }) => {
    if (mesh.current) {
      mesh.current.rotation.x = clock.elapsedTime * 0.18;
      mesh.current.rotation.z = clock.elapsedTime * 0.12;
    }
  });

  return (
    <Float speed={1.5} rotationIntensity={0.4} floatIntensity={0.6}>
      <mesh ref={mesh}>
        <torusKnotGeometry args={[1, 0.32, 128, 16]} />
        <MeshDistortMaterial
          color="#4c7273"
          emissive="#86b9b0"
          emissiveIntensity={0.35}
          metalness={0.85}
          roughness={0.15}
          distort={0.25}
          speed={2.5}
        />
      </mesh>
    </Float>
  );
}

export default function HeroMesh() {
  return (
    <div style={{ width: '16rem', height: '11rem', flexShrink: 0 }}>
      <Canvas
        camera={{ position: [0, 0, 4], fov: 50 }}
        frameloop="always"
        gl={{ alpha: true, antialias: true }}
        style={{ width: '100%', height: '100%' }}
      >
        <ambientLight intensity={0.5} />
        <pointLight position={[8, 8, 8]} color="#86b9b0" intensity={2} />
        <pointLight position={[-6, -4, 4]} color="#4c7273" intensity={1} />
        <TorusKnot />
      </Canvas>
    </div>
  );
}
