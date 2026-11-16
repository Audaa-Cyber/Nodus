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
    let step = 6.4, rowStep = 13.1;
    let fieldA = document.createElement("canvas"), fieldB = document.createElement("canvas");
    let aCtx = fieldA.getContext("2d", { willReadFrequently: true })!;
    let bCtx = fieldB.getContext("2d", { willReadFrequently: true })!;
    let start = 0, lastFrameTime = 0, inView = false;
    const targetInterval = 1000 / 30; // Cap at 30fps for smooth performance without thread locking
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rects = [[0, .06, .47, .40], [.53, .06, .47, .40], [0, .55, .47, .40], [.53, .55, .47, .40]];

    const resize = () => {
      const box = canvas.getBoundingClientRect();
      width = Math.max(1, box.width); height = Math.max(1, box.height);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      step = Math.max(5.8, width / 245); rowStep = step * 2.05;
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
      if (!inView && !reduced) return;
      if (now - lastFrameTime < targetInterval) {
        if (!reduced && !document.hidden && inView) raf = requestAnimationFrame(render);
        return;
      }
      lastFrameTime = now;
      if (!start) start = now;
      const elapsed = reduced ? 0 : (now - start) / 1000;
      const t = elapsed % 24;
      const phase = reduced ? 6 : elapsed % 12;
      drawPose(aCtx, rects[0], rects[1], t);
      drawPose(bCtx, rects[2], rects[3], t);
      const a = aCtx.getImageData(0, 0, cols, rows).data;
      const b = bCtx.getImageData(0, 0, cols, rows).data;
      ctx.clearRect(0, 0, width, height);
      const tick = Math.floor(t * 5);

      // Small rain streaks travel down each active column and dissolve into
      // the hand pixels at the exact point where the build pass reaches them.
      if (!reduced && phase < 6.65) {
        ctx.save();
        ctx.lineCap = "round";
        for (let i = 1; i < cols; i += 3) {
          const columnDelay = hash(Math.floor(i / 3), 19) * .72;
          const progress = (phase - columnDelay) / 5.4;
          if (progress < 0 || progress > 1) continue;
          const y = progress * height;
          const row = Math.max(0, Math.min(rows - 1, Math.floor(y / rowStep)));
          const source = row < rows / 2 ? a : b;
          const mask = 1 - source[(row * cols + i) * 4] / 255;
          if (mask < .48) continue;
          const x = (i + .5) * step;
          const streakLength = 5 + hash(i, tick) * 9;
          const fade = (1 - Math.abs(progress - .5) * .7) * Math.min(1, (6.65 - phase) * 1.8);
          ctx.strokeStyle = `rgba(255, 255, 255, ${.72 * fade})`;
          ctx.lineWidth = .8 + hash(i, tick + 4) * .7;
          ctx.beginPath();
          ctx.moveTo(x, y - streakLength * .55);
          ctx.lineTo(x, y + streakLength * .45);
          ctx.stroke();
          ctx.fillStyle = `rgba(255, 255, 255, ${.9 * fade})`;
          ctx.beginPath();
          ctx.arc(x, y + streakLength * .45, 1.05, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      ctx.lineWidth = .65;
      ctx.strokeStyle = "rgba(255, 255, 255, .52)";
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

          // Each column has its own falling-rain delay. Dots light up as the
          // rain reaches them, then dissolve downward once the hands are formed.
          const columnDelay = hash(Math.floor(i / 3), 19) * .72;
          const revealAt = (j / Math.max(1, rows)) * 5.4 + columnDelay;
          const build = reduced ? 1 : smooth(revealAt, revealAt + .22, phase);
          const dissolveAt = 7.25 + (j / Math.max(1, rows)) * 1.8 + hash(i, j + 91) * .35;
          const dissolve = reduced ? 0 : smooth(dissolveAt, dissolveAt + .48, phase);
          const alpha = build * (1 - dissolve);
          if (alpha <= .015) continue;

          ctx.beginPath();
          ctx.arc((i + .5) * step, (j + .5) * rowStep, step * .43 * (level === .25 ? .42 : level), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
          ctx.fill();
          ctx.stroke();
        }
      }
      if (!reduced && !document.hidden && inView) raf = requestAnimationFrame(render);
    };
    const portraitWidth = () => height > width;
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      if (inView && !reduced && !document.hidden) {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(render);
      } else {
        cancelAnimationFrame(raf);
      }
    }, { rootMargin: "100px" });
    intersectionObserver.observe(canvas);
    const onVisibility = () => { if (document.hidden) cancelAnimationFrame(raf); else if (!reduced && inView) raf = requestAnimationFrame(render); };
    const onLoad = () => { resize(); if (reduced) render(0); else raf = requestAnimationFrame(render); };
    image.addEventListener("load", onLoad);
    const observer = new ResizeObserver(() => { resize(); if (image.complete && image.naturalWidth && reduced) render(0); });
    observer.observe(canvas);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { disposed = true; cancelAnimationFrame(raf); observer.disconnect(); intersectionObserver.disconnect(); image.removeEventListener("load", onLoad); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);

  return <canvas ref={ref} className="hands-canvas" />;
}
