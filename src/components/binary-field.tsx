"use client";

import { useEffect, useRef } from "react";

const fract = (value: number) => value - Math.floor(value);
const hash = (x: number, y: number, seed: number) =>
  fract(Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453);

export default function BinaryField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let frame = 0;
    let disposed = false;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let columns = 0;
    let rows = 0;
    let lastFrame = 0;
    const cellX = 19;
    const cellY = 21;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      columns = Math.ceil(width / cellX) + 1;
      rows = Math.ceil(height / cellY) + 2;
    };

    const render = (now: number) => {
      if (disposed) return;
      if (!reduceMotion && now - lastFrame < 48) {
        frame = requestAnimationFrame(render);
        return;
      }
      lastFrame = now;
      ctx.clearRect(0, 0, width, height);
      ctx.font = "11px 'DM Mono', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const seconds = reduceMotion ? 0 : now / 1000;
      const drift = reduceMotion ? 0 : (seconds * 0.72) % cellY;
      const seed = Math.floor(seconds / 2.8);

      for (let col = 0; col < columns; col++) {
        const x = (col * cellX) / Math.max(1, width);
        const edgeFade = Math.min(1, x * 5.5, (1 - x) * 5.5);

        for (let row = -1; row < rows; row++) {
          const y = (row * cellY + drift) / Math.max(1, height);
          const centerBand = Math.exp(-Math.pow((y - 0.48) / 0.58, 2));
          const wave = 0.5 + 0.5 * Math.sin(col * 0.19 - row * 0.11 + seconds * 0.2);
          const secondaryWave = 0.5 + 0.5 * Math.sin(col * 0.075 + row * 0.17 - seconds * 0.13);
          const density = 0.16 + wave * 0.24 + secondaryWave * 0.12;
          const strength = centerBand * edgeFade * density;
          const variation = 0.72 + hash(col, row, 5) * 0.28;
          const alpha = Math.min(0.42, strength * variation);

          if (alpha < 0.025) continue;

          const digit = hash(col, row, seed) > 0.5 ? "1" : "0";
          ctx.fillStyle = `rgba(36, 75, 134, ${alpha})`;
          ctx.fillText(digit, col * cellX + cellX / 2, row * cellY + cellY / 2 + drift);
        }
      }

      if (!reduceMotion && !document.hidden) frame = requestAnimationFrame(render);
    };

    const start = () => {
      if (disposed || document.hidden || frame) return;
      frame = requestAnimationFrame(render);
    };

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else {
        lastFrame = 0;
        start();
      }
    };

    resize();
    start();
    const observer = new ResizeObserver(() => {
      resize();
      if (reduceMotion) {
        cancelAnimationFrame(frame);
        frame = 0;
        render(0);
      }
    });
    observer.observe(canvas);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className="binary-canvas" aria-hidden="true" />;
}
