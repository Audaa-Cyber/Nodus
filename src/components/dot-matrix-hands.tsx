"use client";

import { useEffect, useRef } from "react";

const SHEET_URL =
  "https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20261030_025250_100df7b8-31fd-4614-aa4a-c1b7d5b6b273.png&w=1600&q=85";

type Side = "left" | "right";
type Tile = HTMLCanvasElement;

const SOURCES = {
  leftA: [0, 0.06, 0.47, 0.4],
  rightA: [0.53, 0.06, 0.47, 0.4],
  leftB: [0, 0.55, 0.47, 0.4],
  rightB: [0.53, 0.55, 0.47, 0.4],
} as const;

const fract = (n: number) => n - Math.floor(n);
const hash = (a: number, b: number) =>
  fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
const smooth = (a: number, b: number, x: number) => {
  const v = clamp((x - a) / (b - a), 0, 1);
  return v * v * (3 - 2 * v);
};
const mixAt = (t: number, on: number, off: number, duration: number) =>
  smooth(on, on + duration, t) * (1 - smooth(off, off + duration, t));

function makeTile(
  image: HTMLImageElement,
  rect: readonly number[],
): Tile {
  const [x, y, w, h] = rect;
  const tile = document.createElement("canvas");
  tile.width = 420;
  tile.height = Math.round((420 * h * 1520) / (w * 2688));
  const ctx = tile.getContext("2d");
  if (ctx) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      image,
      x * image.naturalWidth,
      y * image.naturalHeight,
      w * image.naturalWidth,
      h * image.naturalHeight,
      0,
      0,
      tile.width,
      tile.height,
    );
  }
  return tile;
}

function drawHand(
  ctx: CanvasRenderingContext2D,
  tile: Tile,
  side: Side,
  time: number,
  width: number,
  height: number,
  fieldWidth: number,
  fieldHeight: number,
) {
  const phase = side === "left" ? 0 : Math.PI;
  const angle = (Math.PI * 2 * time) / 20;
  const reach =
    (0.035 * Math.sin(angle + phase) +
      0.012 * Math.sin(2 * angle + 1.3 + phase)) *
    width;
  const handWidth = width * (height > width ? 0.66 : 0.53);
  const handHeight = handWidth * (tile.height / tile.width);
  const centerY = height * (height > width ? 0.66 : 0.61);
  const x =
    side === "left"
      ? reach - width * 0.045
      : width - handWidth + width * 0.045 - reach;
  const rotation =
    (side === "left" ? 1 : -1) *
    0.045 *
    Math.sin(angle + 2.1 + phase);
  const scale = 1 + 0.07 * Math.sin(angle + 0.9 + phase);

  ctx.save();
  ctx.setTransform(fieldWidth / width, 0, 0, fieldHeight / height, 0, 0);
  const pivotX = side === "left" ? 0 : width;
  ctx.translate(pivotX, centerY);
  ctx.rotate(rotation);
  ctx.scale(scale, scale);
  ctx.translate(-pivotX, -centerY);
  ctx.drawImage(tile, x, centerY - handHeight / 2, handWidth, handHeight);
  ctx.restore();
}

export default function DotMatrixHands() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const visible = canvas?.getContext("2d");
    if (!canvas || !visible) return;

    let frame = 0;
    let disposed = false;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let cols = 0;
    let rows = 0;
    let step = 7;
    let rowStep = 14;
    const fieldA = document.createElement("canvas");
    const fieldB = document.createElement("canvas");
    const ctxA = fieldA.getContext("2d", { willReadFrequently: true })!;
    const ctxB = fieldB.getContext("2d", { willReadFrequently: true })!;
    let pixelsA = new Uint8ClampedArray(0);
    let pixelsB = new Uint8ClampedArray(0);
    let tiles: Record<string, Tile> | null = null;
    let start = 0;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      visible.setTransform(dpr, 0, 0, dpr, 0, 0);
      step = Math.max(5, width / 205);
      rowStep = step * 2.05;
      cols = Math.ceil(width / step);
      rows = Math.ceil(height / rowStep);
      fieldA.width = fieldB.width = cols;
      fieldA.height = fieldB.height = rows;
    };

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (disposed) return;
      tiles = {
        leftA: makeTile(image, SOURCES.leftA),
        rightA: makeTile(image, SOURCES.rightA),
        leftB: makeTile(image, SOURCES.leftB),
        rightB: makeTile(image, SOURCES.rightB),
      };
      start = performance.now();
      resize();
      if (!document.hidden && !frame) frame = requestAnimationFrame(render);
    };
    image.onerror = () => {
      canvas.classList.add("dots-failed");
    };
    image.src = SHEET_URL;

    function render(now: number) {
      if (disposed || !tiles) return;
      const elapsed = reduceMotion ? 0 : (now - start) / 1000;
      const time = elapsed % 20;

      ctxA.fillStyle = "#fff";
      ctxB.fillStyle = "#fff";
      ctxA.fillRect(0, 0, cols, rows);
      ctxB.fillRect(0, 0, cols, rows);
      drawHand(ctxA, tiles.leftA, "left", time, width, height, cols, rows);
      drawHand(ctxA, tiles.rightA, "right", time, width, height, cols, rows);
      drawHand(ctxB, tiles.leftB, "left", time, width, height, cols, rows);
      drawHand(ctxB, tiles.rightB, "right", time, width, height, cols, rows);
      pixelsA = ctxA.getImageData(0, 0, cols, rows).data;
      pixelsB = ctxB.getImageData(0, 0, cols, rows).data;

      visible.clearRect(0, 0, width, height);
      visible.fillStyle = "#0d0d0d";
      const tick = Math.floor(time * 7);
      const levels = [0, 0.26, 0.52, 0.78, 1];

      for (let j = 0; j < rows; j++) {
        const rowGlitch = hash(j, tick) > 0.965;
        const shift = rowGlitch
          ? Math.round((hash(tick, j) - 0.5) * 8)
          : 0;
        for (let i = 0; i < cols; i++) {
          const sampleI = clamp(i - shift, 0, cols - 1);
          const index = (j * cols + sampleI) * 4;
          const sideMix =
            i < cols / 2
              ? mixAt(time, 6.2, 14.6, 1.6)
              : mixAt(time, 2.4, 10.4, 1.6);
          const seed = 0.55 * hash(i, j) + 0.45 * hash(j * 3.1, 7.7);
          const useB = seed < sideMix;
          const lum = (useB ? pixelsB : pixelsA)[index] / 255;
          let value = clamp((1 - lum - 0.16) / 0.42, 0, 1);
          value *= 0.86 + 0.14 * Math.sin(time * 3.2 + seed * 40);

          const centerX = Math.abs((i + 0.5) / cols - 0.5);
          value *= smooth(0.035, 0.11, centerX);
          const quietX = centerX / (height > width ? 0.44 : 0.2);
          const quietY =
            ((j + 0.5) * rowStep / height -
              (height > width ? 0.33 : 0.385)) / 0.085;
          value *= smooth(0.85, 1.25, Math.hypot(quietX, quietY));

          if (sideMix > 0.001 && sideMix < 0.999 && Math.abs(seed - sideMix) < 0.12) {
            value *= Math.abs(seed - sideMix) / 0.12;
            if (hash(i + tick, j) <= 0.4) value *= 0.3;
          }

          let level = 0;
          for (const candidate of levels) {
            if (value >= candidate - 0.13) level = candidate;
          }
          if (level === 0) continue;
          const radius = step * 0.46 * (level === 0.26 ? 0.38 : level);
          visible.beginPath();
          visible.arc((i + 0.5) * step, (j + 0.5) * rowStep, radius, 0, Math.PI * 2);
          visible.fill();
        }
      }

      if (!reduceMotion && !document.hidden) {
        frame = requestAnimationFrame(render);
      }
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
        return;
      }
      if (tiles && !frame) {
        start = performance.now();
        frame = requestAnimationFrame(render);
      }
    };

    resize();
    const observer = new ResizeObserver(() => {
      resize();
      if (reduceMotion && tiles && !document.hidden && !frame) {
        frame = requestAnimationFrame(render);
      }
    });
    observer.observe(canvas);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return <canvas ref={canvasRef} className="dot-matrix-canvas" aria-hidden="true" />;
}
