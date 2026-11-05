"use client";

import { useEffect, useRef } from "react";

const fract = (value: number) => value - Math.floor(value);
const hash = (x: number, y: number, seed: number) =>
  fract(Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453);
const smooth = (a: number, b: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

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
    const cellX = 22;
    const cellY = 23;
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
      rows = Math.ceil(height / cellY) + 1;
    };

    const render = (now: number) => {
      if (disposed) return;
      if (!reduceMotion && now - lastFrame < 42) {
        frame = requestAnimationFrame(render);
        return;
      }
      lastFrame = now;

      ctx.clearRect(0, 0, width, height);
      ctx.font = "12px 'DM Mono', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const seconds = reduceMotion ? 0 : now / 1000;
      const seed = Math.floor(seconds / 1.35);
      const drift = reduceMotion ? 0 : (seconds * 3.2) % cellY;

      for (let row = -1; row < rows; row++) {
        for (let col = 0; col < columns; col++) {
          const x = (col * cellX + cellX / 2) / width;
          const y = (row * cellY + drift) / height;

          const leftStroke = Math.abs(x - 0.17);
          const rightStroke = Math.abs(x - 0.83);
          const diagonalY = 0.88 - ((x - 0.17) / 0.66) * 0.72;
          const diagonalStroke =
            x >= 0.17 && x <= 0.83 ? Math.abs(y - diagonalY) : 1;
          const distance = Math.min(leftStroke, rightStroke, diagonalStroke);
          const letter = 1 - smooth(0.018, 0.095, distance);
          const verticalFade = smooth(0.02, 0.2, y) * (1 - smooth(0.84, 1.08, y));
          const edgeFade = smooth(0.02, 0.12, x) * (1 - smooth(0.88, 0.98, x));
          const wave = 0.72 + 0.28 * Math.sin(seconds * 0.22 + col * 0.17 + row * 0.08);
          const strength = letter * verticalFade * edgeFade * wave;

          if (strength < 0.045 || hash(col, row, 3) < 0.16) continue;

          const digit = hash(col, row, seed) > 0.5 ? "1" : "0";
          const alpha = Math.min(0.62, strength * (0.34 + hash(row, col, 9) * 0.32));
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
