"use client";

import { useEffect, useRef } from "react";

const SOURCE = "https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20261030_025250_100df7b8-31fd-4614-aa4a-c1b7d5b6b273.png&w=1600&q=85";
const fract = (n: number) => n - Math.floor(n);
const hash = (x: number, y: number) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
const smooth = (a: number, b: number, x: number) => { const v = Math.max(0, Math.min(1, (x - a) / (b - a))); return v * v * (3 - 2 * v); };
const mixAt = (t: number, on: number, off: number, duration: number) => smooth(on, on + duration, t) * (1 - smooth(off, off + duration, t));

export default function DotMatrixHands() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = SOURCE;
    let raf = 0, disposed = false, width = 0, height = 0, dpr = 1, cols = 0, rows = 0;
    let step = 6.4, rowStep = 13.1, radius = 2.9;
    let fieldA = document.createElement("canvas"), fieldB = document.createElement("canvas");
    let aCtx = fieldA.getContext("2d", { willReadFrequently: true })!;
    let bCtx = fieldB.getContext("2d", { willReadFrequently: true })!;
    let start = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rects = [[0, .06, .47, .40], [.53, .06, .47, .40], [0, .55, .47, .40], [.53, .55, .47, .40]];

    const resize = () => {
      const box = canvas.getBoundingClientRect();
      width = Math.max(1, box.width); height = Math.max(1, box.height);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      step = Math.max(5.8, width / 245); rowStep = step * 2.05; radius = step * .43;
      cols = Math.ceil(width / step); rows = Math.ceil(height / rowStep);
      fieldA = document.createElement("canvas"); fieldB = document.createElement("canvas");
      fieldA.width = fieldB.width = cols; fieldA.height = fieldB.height = rows;
      aCtx = fieldA.getContext("2d", { willReadFrequently: true })!;
      bCtx = fieldB.getContext("2d", { willReadFrequently: true })!;
    };

    const drawPose = (target: CanvasRenderingContext2D, leftRect: number[], rightRect: number[], t: number) => {
      target.setTransform(cols / width, 0, 0, rows / height, 0, 0);
      target.fillStyle = "#fff"; target.fillRect(0, 0, width, height);
      const portrait = height > width;
      const hw = width * (portrait ? .66 : .53);
      const hh = hw * (.40 * 1520) / (.47 * 2688);
      const cy = height * (portrait ? .66 : .56);
      const loop = t * Math.PI * 2 / 24;
      const drawHand = (rect: number[], left: boolean) => {
        const phase = left ? 0 : Math.PI;
        const reach = (.025 * Math.sin(loop + phase) + .009 * Math.sin(2 * loop + 1.3 + phase)) * width;
        const x = left ? reach - width * .045 : width - hw + width * .045 - reach;
        const rot = (left ? 1 : -1) * .035 * Math.sin(loop + 2.1 + phase);
        const scale = 1 + .045 * Math.sin(loop + .9 + phase);
        const [rx, ry, rw, rh] = rect;
        target.save();
        target.translate(left ? 0 : width, cy);
        target.rotate(rot); target.scale(scale, scale);
        target.translate(left ? 0 : -width, -cy);
        target.drawImage(image, rx * image.width, ry * image.height, rw * image.width, rh * image.height, x, cy - hh / 2, hw, hh);
        target.restore();
      };
      drawHand(leftRect, true); drawHand(rightRect, false);
    };

    const render = (now: number) => {
      if (disposed || !image.complete || !image.naturalWidth) return;
      if (!start) start = now;
      const t = reduced ? 0 : ((now - start) / 1000) % 24;
      drawPose(aCtx, rects[0], rects[1], t);
      drawPose(bCtx, rects[2], rects[3], t);
      const a = aCtx.getImageData(0, 0, cols, rows).data;
      const b = bCtx.getImageData(0, 0, cols, rows).data;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#101010";
      const tick = Math.floor(t * 5);
      for (let j = 0; j < rows; j++) {
        const leftMix = mixAt(t, 7.1, 17.2, 2.1);
        const rightMix = mixAt(t, 3.1, 12.8, 2.1);
        const m = j < rows / 2 ? leftMix : rightMix;
        const rowGlitch = hash(j, tick) > .984 ? Math.round((hash(tick, j) - .5) * 5) : 0;
        for (let i = 0; i < cols; i++) {
          const sample = Math.max(0, Math.min(cols - 1, i - rowGlitch));
          const seed = .55 * hash(i, j) + .45 * hash(j * 3.1, 7.7);
          const useB = seed < m;
          const data = useB ? b : a;
          let v = Math.max(0, Math.min(1, (1 - data[(j * cols + sample) * 4] / 255 - .13) / .39));
          if (!v) continue;
          const cx = Math.abs((i + .5) / cols - .5);
          v *= smooth(.025, .095, cx);
          const centerX = cx / (portraitWidth() ? .44 : .2);
          const centerY = ((j + .5) * rowStep / height - (portraitWidth() ? .36 : .40)) / .105;
          v *= smooth(.85, 1.3, Math.hypot(centerX, centerY));
          if (m > .001 && m < .999 && Math.abs(seed - m) < .13) v *= Math.abs(seed - m) / .13 * (hash(i + tick, j) > .4 ? 1 : .28);
          v *= .91 + .09 * Math.sin(t * 2.1 + seed * 35);
          const levels = [.25, .5, .75, 1];
          let level = 0;
          for (const candidate of levels) if (v >= candidate - .12) level = candidate;
          if (!level) continue;
          ctx.beginPath();
          ctx.arc((i + .5) * step, (j + .5) * rowStep, radius * (level === .25 ? .42 : level), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (!reduced && !document.hidden) raf = requestAnimationFrame(render);
    };
    const portraitWidth = () => height > width;
    const onVisibility = () => { if (document.hidden) cancelAnimationFrame(raf); else if (!reduced) raf = requestAnimationFrame(render); };
    const onLoad = () => { resize(); if (reduced) render(0); else raf = requestAnimationFrame(render); };
    image.addEventListener("load", onLoad);
    const observer = new ResizeObserver(() => { resize(); if (image.complete && image.naturalWidth && reduced) render(0); });
    observer.observe(canvas);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { disposed = true; cancelAnimationFrame(raf); observer.disconnect(); image.removeEventListener("load", onLoad); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);

  return <canvas ref={ref} className="hands-canvas" />;
}
