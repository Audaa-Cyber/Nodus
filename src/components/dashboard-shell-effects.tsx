"use client";

import { useEffect, useRef } from "react";

export function DashboardShellEffects({ children }: { children: React.ReactNode }) {
  const dotCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Static Dot-Matrix Background Texture
  useEffect(() => {
    const canvas = dotCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let gridPoints: { x: number; y: number; c: number; r: number; radialDist: number; phase: number }[] = [];
    let canvasW = 0;
    let canvasH = 0;
    const dotSpacing = 28;

    const rebuildDotGrid = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvasW = window.innerWidth;
      canvasH = window.innerHeight;
      canvas.width = canvasW * dpr;
      canvas.height = canvasH * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

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
          gridPoints.push({
            x: c * dotSpacing,
            y: r * dotSpacing,
            c,
            r,
            radialDist,
            phase,
          });
        }
      }
    };

    const renderDotMatrix = () => {
      ctx.clearRect(0, 0, canvasW, canvasH);

      const t = 0;
      const baseRGB = "100, 116, 139";
      const activeRGB = "15, 23, 42";

      const len = gridPoints.length;
      for (let i = 0; i < len; i++) {
        const pt = gridPoints[i];

        const radialWave = Math.sin(pt.radialDist * 0.42 - t * 1.35);
        const diagWave = Math.cos(pt.c * 0.25 + pt.r * 0.25 - t * 0.9);
        const nodeTwinkle = Math.sin(t * 1.9 + pt.phase);

        const combined = (radialWave * 0.45 + diagWave * 0.35 + nodeTwinkle * 0.2 + 1) * 0.5;
        const highlight = Math.pow(combined, 2.4);

        const radius = 0.8 + highlight * 0.65;
        const alpha = 0.035 + highlight * 0.075;

        ctx.beginPath();
        ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
        ctx.fillStyle =
          highlight > 0.72
            ? "rgba(" + activeRGB + ", " + alpha.toFixed(3) + ")"
            : "rgba(" + baseRGB + ", " + alpha.toFixed(3) + ")";
        ctx.fill();
      }

    };

    const redrawDotMatrix = () => {
      rebuildDotGrid();
      renderDotMatrix();
    };

    window.addEventListener("resize", redrawDotMatrix, { passive: true });
    redrawDotMatrix();

    return () => {
      window.removeEventListener("resize", redrawDotMatrix);
    };
  }, []);

  return (
    <>
      {/* Autonomous Dot-Matrix Background Canvas */}
      <canvas id="dotMatrixCanvas" ref={dotCanvasRef} aria-hidden="true" />

      {/* Ambient Floating Orbs */}
      <div className="ambient-orb orb-1" aria-hidden="true" />
      <div className="ambient-orb orb-2" aria-hidden="true" />
      <div className="ambient-orb orb-3" aria-hidden="true" />

      {children}
    </>
  );
}
