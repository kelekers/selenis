import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { USDLoader } from 'three/examples/jsm/loaders/USDLoader.js';
import { detectWebGL2 } from '../utils/renderQuality';
import { SpaceBackground } from './3d/SpaceBackground';

const MOON_MODEL_URL = '/models/moon_landing_page.usdz';

const FEATURES = [
  '3D Crater Shadow Sim',
  '360° Lander POV Horizon',
  'Earth Libration & DTE',
  'Planner & Explorer Modes',
];

function LandingMoonModel({ isLaunching, onLaunchComplete }) {
  const source = useLoader(USDLoader, MOON_MODEL_URL);
  const spinGroupRef = useRef(null);
  const tiltGroupRef = useRef(null);
  const launchProgressRef = useRef(0);
  const completedRef = useRef(false);
  const { size, camera } = useThree();

  const { normalizedMoon, disposeMaterials } = useMemo(() => {
    const root = source.clone(true);
    root.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(root, true);
    const center = box.getCenter(new THREE.Vector3());
    const v = new THREE.Vector3();
    let maxRadius = 0;
    const createdMaterials = [];

    root.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = false;
        child.receiveShadow = false;
        const pos = child.geometry?.attributes?.position;
        if (pos) {
          for (let i = 0; i < pos.count; i += 1) {
            const d = v.fromBufferAttribute(pos, i).applyMatrix4(child.matrixWorld).distanceTo(center);
            if (d > maxRadius) maxRadius = d;
          }
        }
        const srcMat = Array.isArray(child.material) ? child.material[0] : child.material;
        if (srcMat) {
          const matte = new THREE.MeshStandardMaterial({
            map: srcMat.map ?? null,
            normalMap: srcMat.normalMap ?? null,
            roughnessMap: srcMat.roughnessMap ?? null,
            bumpMap: srcMat.bumpMap ?? null,
            metalness: 0.0,
            roughness: 0.92,
            color: new THREE.Color(1.08, 1.08, 1.08),
          });
          if (srcMat.normalScale) matte.normalScale.copy(srcMat.normalScale);
          createdMaterials.push(matte);
          child.material = matte;
        }
      }
    });

    const centered = new THREE.Group();
    centered.add(root);
    centered.position.copy(center).negate();

    const unit = new THREE.Group();
    unit.add(centered);
    unit.scale.setScalar(maxRadius > 0 ? 1 / maxRadius : 1);

    return {
      normalizedMoon: unit,
      disposeMaterials: () => createdMaterials.forEach((m) => m.dispose()),
    };
  }, [source]);

  useEffect(() => disposeMaterials, [disposeMaterials]);

  // Compute world-space radius and vertical offset so the moon sits in the exact hero position
  // inside a full-viewport canvas (so it can never be clipped by a small canvas container!)
  const fovRad = (camera.fov * Math.PI) / 180;
  const visibleHeightAtZero = 2 * Math.tan(fovRad / 2) * camera.position.z;
  // Target pixel diameter: clamp(320px, min(44vw, 60vh), 550px)
  const targetDiameterPx = Math.max(
    320,
    Math.min(550, Math.min(size.width * 0.44, size.height * 0.6))
  );
  const baseRadiusWorld = ((targetDiameterPx / size.height) * visibleHeightAtZero) / 2;
  // Place moon center slightly below screen center so its top overlaps the bottom of "selenis"
  const baseYWorld = -0.055 * visibleHeightAtZero;

  useFrame((_, delta) => {
    if (spinGroupRef.current) {
      // Continuous axial rotation, speeding up smoothly during launch
      const spinSpeed = isLaunching ? 0.52 : 0.14;
      spinGroupRef.current.rotation.y += delta * spinSpeed;
    }

    if (tiltGroupRef.current) {
      if (isLaunching) {
        launchProgressRef.current = Math.min(1, launchProgressRef.current + delta / 1.45);
        const t = launchProgressRef.current;
        // Smooth cubic ease-in-out
        const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

        // 1. Rotate Moon upward (-X axis) so the South Pole (-Y) swings up to face the top/viewer
        tiltGroupRef.current.rotation.x = -ease * (Math.PI * 0.56);

        // 2. Smoothly center & zoom in toward the Moon as the horizon curve wipes away
        tiltGroupRef.current.position.y = THREE.MathUtils.lerp(baseYWorld, 0, ease);
        const zoomScale = baseRadiusWorld * (1 + ease * 0.58);
        tiltGroupRef.current.scale.setScalar(zoomScale);

        if (t >= 1 && !completedRef.current) {
          completedRef.current = true;
          onLaunchComplete?.();
        }
      } else {
        tiltGroupRef.current.position.y = baseYWorld;
        tiltGroupRef.current.scale.setScalar(baseRadiusWorld);
      }
    }
  });

  return (
    <group ref={tiltGroupRef} position={[0, baseYWorld, 0]} scale={baseRadiusWorld}>
      <group ref={spinGroupRef}>
        <primitive object={normalizedMoon} />
      </group>
    </group>
  );
}

export function LandingPage({ onLaunch }) {
  const [isLaunching, setIsLaunching] = React.useState(false);
  const [webgl] = React.useState(() => detectWebGL2());

  useEffect(() => {
    useLoader.preload(USDLoader, MOON_MODEL_URL);
  }, []);

  const handleLaunchClick = () => {
    if (isLaunching) return;
    if (!webgl.supported) {
      onLaunch?.();
      return;
    }
    setIsLaunching(true);
  };

  return (
    <div
      data-testid="landing-page"
      className="font-jakarta relative flex h-screen w-screen flex-col justify-between overflow-hidden bg-black text-white select-none"
    >
      {/* Smooth multi-layered atmospheric radial glow behind title & moon */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 z-0 transition-all duration-1000 ease-in-out ${
          isLaunching ? 'scale-125 opacity-0' : 'scale-100 opacity-100'
        }`}
        style={{
          background: [
            'radial-gradient(ellipse 46% 38% at 50% 46%, rgba(255,255,255,0.28) 0%, rgba(215,218,225,0.16) 32%, rgba(140,143,152,0.07) 58%, rgba(40,42,48,0.02) 78%, rgba(0,0,0,0) 100%)',
            'radial-gradient(ellipse 72% 52% at 50% 49%, rgba(200,203,210,0.14) 0%, rgba(120,123,130,0.07) 42%, rgba(45,47,52,0.025) 70%, rgba(0,0,0,0) 95%)',
            'radial-gradient(ellipse 85% 32% at 38% 28%, rgba(56, 98, 175, 0.14) 0%, rgba(92, 52, 138, 0.08) 48%, rgba(0,0,0,0) 85%)',
            'radial-gradient(ellipse 70% 28% at 68% 36%, rgba(120, 68, 145, 0.11) 0%, rgba(35, 82, 128, 0.06) 52%, rgba(0,0,0,0) 85%)',
          ].join(', '),
        }}
      />

      {/* Extra Gaussian-blurred core halo directly behind the moon disc */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute left-1/2 top-[49%] z-0 -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-1000 ease-in-out ${
          isLaunching ? 'scale-150 opacity-0' : 'scale-100 opacity-100'
        }`}
        style={{
          width: 'clamp(360px, 58vw, 760px)',
          height: 'clamp(300px, 48vh, 560px)',
          background:
            'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.24) 0%, rgba(210,212,218,0.12) 45%, rgba(0,0,0,0) 75%)',
          filter: 'blur(52px)',
        }}
      />

      {/* Upper Typography Stage: Subtitle & "selenis" (wipes/zooms upward & fades out on launch) */}
      <header
        className={`relative z-10 flex w-full flex-col items-center justify-start pt-[10.5vh] -mt-12 transition-all duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)] sm:pt-[12vh] ${
          isLaunching
            ? 'pointer-events-none -translate-y-[18vh] scale-110 opacity-0'
            : 'translate-y-0 scale-100 opacity-100'
        }`}
      >
        <p className="font-jakarta relative z-10 text-center text-[clamp(0.95rem,1.95vw,1.4rem)] font-normal tracking-[0.015em] text-[#aeaeae]">
          Where Eternal Light Meets Perpetual Shadow
        </p>

        <h1
          className="font-selenis relative z-10 mt-0.5 text-center font-semibold leading-[0.86] tracking-[-0.015em] text-white"
          style={{
            fontSize: 'clamp(4.5rem, min(15.6vw, 22vh), 11.2rem)',
          }}
        >
          selenis
        </h1>
      </header>

      {/* Full-Viewport 3D Lunar Canvas Layer (z-20: sits in front of "selenis" and behind the horizon curve, never clipping the Moon during rotation or zoom) */}
      <div
        data-testid="landing-moon-3d"
        className="pointer-events-none fixed inset-0 z-20 flex items-center justify-center -mt-4"
      >
        {/* Subtle fallback sphere while the 35MB USDZ streams in */}
        <div
          aria-hidden="true"
          className={`pointer-events-none rounded-full transition-all duration-700 ${
            isLaunching ? 'scale-125 opacity-0' : 'scale-100 opacity-100'
          }`}
          style={{
            width: 'clamp(310px, min(43vw, 58vh), 535px)',
            height: 'clamp(310px, min(43vw, 58vh), 535px)',
            transform: 'translateY(5.5vh)',
            background:
              'radial-gradient(circle at 34% 28%, #9b9794 0%, #545053 38%, #1d1c1f 68%, #09090b 92%)',
            boxShadow: '0 -8px 48px rgba(255,255,255,0.14)',
          }}
        />

        {webgl.supported && (
          <div className="absolute inset-0">
            <Canvas
              dpr={[1, 2]}
              gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
              camera={{ position: [0, 0, 3.2], fov: 40, near: 0.1, far: 25 }}
              onCreated={({ gl }) => {
                gl.toneMapping = THREE.ACESFilmicToneMapping;
                gl.toneMappingExposure = 1.12;
              }}
              className="h-full w-full"
            >
              <SpaceBackground radius={18} starCount={2600} fullSphere={true} showDome={false} />
              <ambientLight intensity={0.05} />
              <directionalLight position={[-3.4, 3.6, 2.0]} intensity={3.3} color="#fffcf5" />
              <directionalLight position={[2.2, -1.5, -1.5]} intensity={0.1} color="#94a3b8" />
              <Suspense fallback={null}>
                <LandingMoonModel isLaunching={isLaunching} onLaunchComplete={onLaunch} />
              </Suspense>
            </Canvas>
          </div>
        )}
      </div>

      {/* Bottom Foreground Section: Deeper Concave Curve + Curved Glow + Polygonal Halftone + CTA + Lower Feature Bar
          Wipes downward & zooms out out of frame when Launch is clicked */}
      <div
        className={`relative z-30 flex w-full flex-col items-center justify-end transition-all duration-1000 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          isLaunching
            ? 'pointer-events-none translate-y-[110%] scale-105 opacity-0'
            : 'translate-y-0 scale-100 opacity-100'
        }`}
      >
        <div className="relative flex w-full flex-col items-center">
          {/* SVG Deeper Concave Horizon Curve with Curved Atmospheric Glow along its upper rim */}
          <svg
            viewBox="0 0 1024 230"
            preserveAspectRatio="none"
            className="pointer-events-none relative z-10 block h-[115px] w-full overflow-visible sm:h-[148px] md:h-[176px]"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="curveRimGlowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(255, 255, 255, 0.18)" />
                <stop offset="22%" stopColor="rgba(255, 255, 255, 0.42)" />
                <stop offset="50%" stopColor="rgba(255, 255, 255, 0.68)" />
                <stop offset="78%" stopColor="rgba(255, 255, 255, 0.42)" />
                <stop offset="100%" stopColor="rgba(255, 255, 255, 0.18)" />
              </linearGradient>
              <filter id="curveGlowBlurWide" x="-20%" y="-80%" width="140%" height="260%">
                <feGaussianBlur stdDeviation="24" />
              </filter>
              <filter id="curveGlowBlurSoft" x="-15%" y="-60%" width="130%" height="220%">
                <feGaussianBlur stdDeviation="10" />
              </filter>
            </defs>

            {/* Wide diffused glow following the exact concave curve above the horizon */}
            <path
              d="M -40,12 Q 512,372 1064,12"
              fill="none"
              stroke="url(#curveRimGlowGrad)"
              strokeWidth="44"
              filter="url(#curveGlowBlurWide)"
              opacity="0.85"
            />
            {/* Tighter, brighter rim glow hugging the horizon curve */}
            <path
              d="M -20,20 Q 512,378 1044,20"
              fill="none"
              stroke="url(#curveRimGlowGrad)"
              strokeWidth="16"
              filter="url(#curveGlowBlurSoft)"
              opacity="0.9"
            />

            {/* Solid Black Concave Horizon Cutout */}
            <path
              d="M 0,24 Q 512,380 1024,24 L 1024,230 L 0,230 Z"
              fill="#000000"
            />
          </svg>

          {/* Black Foreground Area below the curve */}
          <div className="relative z-10 -mt-px flex w-full flex-col items-center bg-black px-4 pb-[1.8vh] pt-[2.2vh] sm:pb-[6vh] sm:pt-[2.8vh]">
            {/* Polygonal Halftone Dot Matrix */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 -top-[70px] bottom-0 z-0 overflow-hidden sm:-top-[92px]"
              style={{
                clipPath:
                  'polygon(0% 10%, 6% 32%, 12.5% 60%, 27.5% 42%, 41% 62%, 50% 62%, 59% 62%, 70% 42%, 85.5% 68%, 94% 32%, 100% 6%, 100% 100%, 0% 100%)',
              }}
            >
              <div
                className="h-full w-full"
                style={{
                  backgroundImage:
                    'radial-gradient(circle, rgba(255, 255, 255, 0.20) 1.2px, transparent 1.35px)',
                  backgroundSize: '18px 18px',
                  backgroundPosition: 'center bottom',
                  maskImage:
                    'linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.85) 45%, rgba(0,0,0,1) 100%)',
                  WebkitMaskImage:
                    'linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.85) 45%, rgba(0,0,0,1) 100%)',
                }}
              />
            </div>

            {/* Launch 3D Navigator CTA Pill Button */}
            <button
              type="button"
              onClick={handleLaunchClick}
              disabled={isLaunching}
              data-testid="launch-navigator-btn"
              className="font-jakarta relative z-10 mb-[6vh] inline-flex h-[52px] min-w-[248px] cursor-pointer items-center justify-center rounded-full bg-[#cb7c0a] px-9 text-[16px] font-semibold tracking-[0.01em] text-white transition duration-200 hover:bg-[#dc8910] active:scale-[0.98] disabled:cursor-wait disabled:opacity-90 sm:mb-[6.8vh] sm:h-[54px] sm:min-w-[254px] sm:text-[16.5px]"
            >
              Launch 3D Navigator
            </button>

            {/* Bottom Feature Ticker (pushed lower toward the bottom edge of the screen) */}
            <footer className="font-jakarta relative z-10 flex w-full max-w-[920px] flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] font-normal tracking-[0.02em] text-[#9fa3ac] sm:justify-between sm:text-[12.5px]">
              {FEATURES.map((item, index) => (
                <React.Fragment key={item}>
                  <span className="whitespace-nowrap">{item}</span>
                  {index < FEATURES.length - 1 && (
                    <span
                      aria-hidden="true"
                      className="inline-block h-[4.5px] w-[4.5px] rounded-full bg-white"
                    />
                  )}
                </React.Fragment>
              ))}
            </footer>
          </div>
        </div>
      </div>

      {/* Smooth final fade-to-dark overlay right at the end of the zoom-in launch transition */}
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed inset-0 z-40 bg-[#05070b] transition-opacity duration-500 ease-in ${
          isLaunching ? 'delay-900 opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  );
}
