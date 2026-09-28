"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

import { getDashboardParticleSettings } from "./star_orbit_model.js";

function createSeededRandom(seed: number) {
  let current = seed;

  return () => {
    current = (current * 48271) % 2147483647;
    return (current - 1) / 2147483646;
  };
}

function createParticleField(particleCount: number) {
  const random = createSeededRandom(20260803);
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  const color = new THREE.Color();

  for (let index = 0; index < particleCount; index += 1) {
    const pointIndex = index * 3;
    const isGoldParticle = random() > 0.88;

    positions[pointIndex] = (random() - 0.5) * 18;
    positions[pointIndex + 1] = (random() - 0.5) * 12;
    positions[pointIndex + 2] = (random() - 0.5) * 3;
    color.set(isGoldParticle ? "#f1c96b" : "#65e0b0");
    colors[pointIndex] = color.r;
    colors[pointIndex + 1] = color.g;
    colors[pointIndex + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: 0.024,
      transparent: true,
      opacity: 0.5,
      sizeAttenuation: true,
      vertexColors: true
    })
  );
}

export function DashboardParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    const settings = getDashboardParticleSettings({
      viewportWidth: window.innerWidth,
      prefersReducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches
    });
    let renderer: THREE.WebGLRenderer;

    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
    } catch {
      return undefined;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 100);
    const particles = createParticleField(settings.particleCount);
    const timer = new THREE.Timer();
    let frameId = 0;

    camera.position.z = 5;
    scene.add(particles);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.pixelRatioCap));

    const resizeScene = () => {
      const { width, height } = canvas.getBoundingClientRect();
      if (!width || !height) {
        return;
      }

      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    timer.connect(document);

    const renderScene = (timestamp?: number) => {
      timer.update(timestamp);
      const elapsed = timer.getElapsed();
      if (settings.motionEnabled) {
        particles.rotation.z = elapsed * 0.012;
        particles.rotation.y = Math.sin(elapsed * 0.1) * 0.08;
        frameId = window.requestAnimationFrame(renderScene);
      }
      renderer.render(scene, camera);
    };

    const observer = new ResizeObserver(resizeScene);
    observer.observe(canvas);
    resizeScene();
    renderScene();

    return () => {
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
      timer.dispose();
      particles.geometry.dispose();
      particles.material.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div className="dashboard-particle-field" aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}
