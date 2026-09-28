"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

import { getStarOrbitSettings } from "./star_orbit_model.js";

function createSeededRandom(seed: number) {
  let current = seed;

  return () => {
    current = (current * 16807) % 2147483647;
    return (current - 1) / 2147483646;
  };
}

function createStarField(starCount: number) {
  const random = createSeededRandom(20260802);
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);
  const starColor = new THREE.Color();

  for (let index = 0; index < starCount; index += 1) {
    const radius = 1.3 + random() * 2.3;
    const theta = random() * Math.PI * 2;
    const verticalOffset = (random() - 0.5) * 2.8;
    const pointIndex = index * 3;

    positions[pointIndex] = Math.cos(theta) * radius;
    positions[pointIndex + 1] = verticalOffset;
    positions[pointIndex + 2] = Math.sin(theta) * radius - 0.9;

    starColor.set(random() > 0.72 ? "#f1c96b" : "#8fd9ff");
    colors[pointIndex] = starColor.r;
    colors[pointIndex + 1] = starColor.g;
    colors[pointIndex + 2] = starColor.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: 0.028,
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: true,
      vertexColors: true
    })
  );
}

function createOrbit(radius: number, verticalRadius: number, color: string, rotation: number) {
  const points = Array.from({ length: 96 }, (_, index) => {
    const angle = (index / 95) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * verticalRadius, 0);
  });
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const orbit = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.52 })
  );

  orbit.rotation.x = rotation;
  orbit.rotation.y = rotation * 0.34;
  return orbit;
}

export function StarOrbitScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const settings = getStarOrbitSettings({
      viewportWidth: window.innerWidth,
      prefersReducedMotion: reducedMotionQuery.matches
    });
    let renderer: THREE.WebGLRenderer;

    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    } catch {
      return undefined;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    const sceneGroup = new THREE.Group();
    const timer = new THREE.Timer();
    let frameId = 0;

    camera.position.set(0, 0, 5.2);
    scene.add(sceneGroup);
    sceneGroup.add(createStarField(settings.starCount));

    const innerOrbit = createOrbit(1.2, 0.52, "#65e0b0", -0.34);
    const outerOrbit = createOrbit(1.72, 0.66, "#7fc7ff", 0.52);
    const orbitingStar = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 12, 12),
      new THREE.MeshBasicMaterial({ color: "#f1c96b" })
    );

    sceneGroup.add(innerOrbit, outerOrbit, orbitingStar);
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
        sceneGroup.rotation.y = elapsed * 0.11;
        innerOrbit.rotation.z = elapsed * 0.18;
        outerOrbit.rotation.z = -elapsed * 0.11;
        orbitingStar.position.set(Math.cos(elapsed * 0.72) * 1.2, Math.sin(elapsed * 0.72) * 0.5, 0);
        frameId = window.requestAnimationFrame(renderScene);
      } else {
        orbitingStar.position.set(1.2, 0, 0);
      }

      renderer.render(scene, camera);
    };

    const observer = new ResizeObserver(resizeScene);
    observer.observe(canvas);
    resizeScene();
    setIsReady(true);
    renderScene();

    return () => {
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
      timer.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
    };
  }, []);

  return (
    <div className="star-orbit-scene" aria-hidden="true" data-ready={isReady}>
      <canvas ref={canvasRef} />
      {!isReady ? (
        <>
          <span className="orbit-fallback-ring orbit-fallback-ring-one" />
          <span className="orbit-fallback-ring orbit-fallback-ring-two" />
        </>
      ) : null}
    </div>
  );
}
