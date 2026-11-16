"use client";

import { useEffect, useRef } from "react";

export type PageLoaderVariant = "fullscreen" | "content" | "inline";

interface PageLoaderProps {
  /**
   * fullscreen: fixed, viewport-anchored overlay (used for standalone routes like /pay/[token]/loading.tsx).
   * content: fills the main content region of the dashboard, keeping the sidebar steady.
   * inline: compact container centered in its parent box (used for Suspense fallbacks inside auth/checkout cards).
   */
  variant?: PageLoaderVariant;
  /** Accessible announcement for screen readers and visible sub-caption, e.g. "Loading invoices". */
  label?: string;
}

/**
 * Kinetic morphing page-transition loader: glass capsule with a 3D isometric
 * morphing prism, kinetic wave bars, specular cursor tracking, and an
 * optimized batch-rendered dot-matrix background (fullscreen variant only).
 *
 * Styles live in src/app/globals.css under the ".page-loader" scope.
 */
export function PageLoader({ variant = "fullscreen", label = "Loading" }: PageLoaderProps) {
  const capsuleRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const capsule = capsuleRef.current;
    const canvas = dotsRef.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let springRaf = 0;
    let canvasRaf = 0;

    // =========================================================================
    // 1. SPRING-DAMPED CURSOR GLIDE & SPECULAR CHAMFER BORDER
    // =========================================================================
    let onMouseMove: ((event: MouseEvent) => void) | null = null;
    if (capsule && !reduced) {
      let targetX = 0, targetY = 0, currentX = 0, currentY = 0;
      let targetRotX = 0, targetRotY = 0, currentRotX = 0, currentRotY = 0;
      let targetSpotX = 98, targetSpotY = 34, currentSpotX = 98, currentSpotY = 34;

      onMouseMove = (event: MouseEvent) => {
        const rect = capsule.getBoundingClientRect();
        const cardCenterX = rect.left + rect.width / 2;
        const cardCenterY = rect.top + rect.height / 2;

        const dx = event.clientX - cardCenterX;
        const dy = event.clientY - cardCenterY;
        const distFromCenter = Math.sqrt(dx * dx + dy * dy);

        targetSpotX = event.clientX - rect.left;
        targetSpotY = event.clientY - rect.top;

        if (distFromCenter < 280) {
          capsule.style.setProperty("--spot-opacity", "1");
          const pullFactor = Math.max(0, 1 - distFromCenter / 280);
          targetX = (dx / 280) * 6 * pullFactor;
          targetY = (dy / 280) * 6 * pullFactor;
          targetRotX = (dy / (rect.height / 2)) * -2.2 * pullFactor;
          targetRotY = (dx / (rect.width / 2)) * 2.2 * pullFactor;
        } else {
          capsule.style.setProperty("--spot-opacity", "0");
          targetX = 0;
          targetY = 0;
          targetRotX = 0;
          targetRotY = 0;
        }
      };

      const updateSpringMotion = () => {
        const ease = 0.09;
        currentX += (targetX - currentX) * ease;
        currentY += (targetY - currentY) * ease;
        currentRotX += (targetRotX - currentRotX) * ease;
        currentRotY += (targetRotY - currentRotY) * ease;
        currentSpotX += (targetSpotX - currentSpotX) * 0.16;
        currentSpotY += (targetSpotY - currentSpotY) * 0.16;

        capsule.style.setProperty("--spot-x", currentSpotX.toFixed(1) + "px");
        capsule.style.setProperty("--spot-y", currentSpotY.toFixed(1) + "px");

        capsule.style.transform =
          "translate3d(" + currentX.toFixed(2) + "px, " + currentY.toFixed(2) + "px, 0) " +
          "rotateX(" + currentRotX.toFixed(2) + "deg) rotateY(" + currentRotY.toFixed(2) + "deg)";
        if (logoRef.current) {
          logoRef.current.style.transform =
            "translate3d(" + (currentX * 0.45).toFixed(2) + "px, " + (currentY * 0.45).toFixed(2) + "px, 0)";
        }
        springRaf = requestAnimationFrame(updateSpringMotion);
      };

      window.addEventListener("mousemove", onMouseMove);
      springRaf = requestAnimationFrame(updateSpringMotion);
    }

    // =========================================================================
    // 2. HIGH-PERFORMANCE BATCH-RENDERED DOT-MATRIX (fullscreen variant only)
    // =========================================================================
    let gridPoints: { x: number; y: number; c: number; r: number; radialDist: number; phase: number }[] = [];
    let canvasW = 0;
    let canvasH = 0;
    const dotSpacing = 38; // Increased spacing for airy modern feel and minimal CPU
    let rebuildDotGrid: (() => void) | null = null;
    let onVisibility: (() => void) | null = null;

    if (canvas && !reduced) {
      const renderDotMatrix = (timestamp: number) => {
        const context = canvas.getContext("2d");
        if (!context) return;
        context.clearRect(0, 0, canvasW, canvasH);

        const t = timestamp * 0.0024;
        const len = gridPoints.length;

        // Path batching: 2 draw calls total per frame instead of thousands
        const basePath = new Path2D();
        const activePath = new Path2D();

        for (let i = 0; i < len; i++) {
          const pt = gridPoints[i];

          const radialWave = Math.sin(pt.radialDist * 0.42 - t * 1.35);
          const diagWave = Math.cos(pt.c * 0.25 + pt.r * 0.25 - t * 0.9);
          const nodeTwinkle = Math.sin(t * 1.9 + pt.phase);

          const combined = (radialWave * 0.45 + diagWave * 0.35 + nodeTwinkle * 0.2 + 1) * 0.5;
          const isHigh = combined > 0.62;
          const radius = isHigh ? 2.0 : 1.1;

          const target = isHigh ? activePath : basePath;
          target.moveTo(pt.x + radius, pt.y);
          target.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
        }

        context.fillStyle = "rgba(100, 116, 139, 0.16)";
        context.fill(basePath);

        context.fillStyle = "rgba(15, 23, 42, 0.50)";
        context.fill(activePath);

        canvasRaf = requestAnimationFrame(renderDotMatrix);
      };

      const stopCanvasLoop = () => {
        if (canvasRaf) cancelAnimationFrame(canvasRaf);
        canvasRaf = 0;
      };

      const startCanvasLoop = () => {
        stopCanvasLoop();
        canvasRaf = requestAnimationFrame(renderDotMatrix);
      };

      rebuildDotGrid = () => {
        const context = canvas.getContext("2d");
        if (!context) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvasW = window.innerWidth;
        canvasH = window.innerHeight;
        canvas.width = canvasW * dpr;
        canvas.height = canvasH * dpr;
        context.setTransform(dpr, 0, 0, dpr, 0, 0);

        const cols = Math.ceil(canvasW / dotSpacing) + 1;
        const rows = Math.ceil(canvasH / dotSpacing) + 1;
        const centerCol = cols / 2;
        const centerRow = rows / 2;

        gridPoints = [];
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const dc = c - centerCol;
            const dr = r - centerRow;
            const radialDist = Math.sqrt(dc * dc + dr * dr);
            const shimmerSeed = Math.sin(c * 12.9898 + r * 78.233) * 43758.5453;
            const phase = (shimmerSeed - Math.floor(shimmerSeed)) * Math.PI * 2;
            gridPoints.push({ x: c * dotSpacing, y: r * dotSpacing, c, r, radialDist, phase });
          }
        }
      };

      rebuildDotGrid();
      startCanvasLoop();
      window.addEventListener("resize", rebuildDotGrid);

      onVisibility = () => {
        if (document.hidden) stopCanvasLoop();
        else startCanvasLoop();
      };
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      if (springRaf) cancelAnimationFrame(springRaf);
      if (canvasRaf) cancelAnimationFrame(canvasRaf);
      if (onMouseMove) window.removeEventListener("mousemove", onMouseMove);
      if (rebuildDotGrid) window.removeEventListener("resize", rebuildDotGrid);
      if (onVisibility) document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const capsule = (
    <div ref={capsuleRef} className="loader-capsule">
      <div className="capsule-shimmer" />

      {/* 3D Isometric Stacked Morphing Layers */}
      <div ref={logoRef} className="iso-stack">
        <div className="iso-layer iso-top" />
        <div className="iso-layer iso-mid" />
        <div className="iso-layer iso-bot" />
      </div>

      {/* Emerald Sync Pulse Node */}
      <div className="pulse-node" />

      {/* 5-Bar Kinetic Fluid Wave */}
      <div className="wave-bars">
        <span className="wave-pill" />
        <span className="wave-pill" />
        <span className="wave-pill" />
        <span className="wave-pill" />
        <span className="wave-pill" />
      </div>
    </div>
  );

  const stage = (
    <div className="pl-stage" aria-hidden="true">
      {capsule}
      {label && <p className="sr-only">{label}…</p>}
    </div>
  );

  if (variant === "inline") {
    return (
      <div className="page-loader page-loader--inline" role="status" aria-label={label} aria-live="polite">
        {stage}
      </div>
    );
  }

  if (variant === "content") {
    return (
      <div className="page-loader page-loader--content" role="status" aria-label={label} aria-live="polite">
        {stage}
      </div>
    );
  }

  return (
    <div className="page-loader page-loader--fullscreen" role="status" aria-label={label} aria-live="polite">
      <canvas ref={dotsRef} className="pl-dots" aria-hidden="true" />
      <div className="pl-orb pl-orb-1" aria-hidden="true" />
      <div className="pl-orb pl-orb-2" aria-hidden="true" />
      {stage}
    </div>
  );
}
