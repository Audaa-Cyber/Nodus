"use client";

import { useEffect, useRef } from "react";

export default function BinaryRain() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let raf = 0, width = 0, height = 0, dpr = 1, last = 0;
    const fontSize = 11;
    let streams: { x: number; y: number; speed: number; length: number; phase: number }[] = [];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const resize = () => {
      width = window.innerWidth; height = window.innerHeight; dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = width * dpr; canvas.height = height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.max(18, Math.floor(width / 34));
      streams = Array.from({ length: count }, (_, i) => ({ x: (i + .5) * width / count, y: Math.random() * height, speed: 16 + Math.random() * 22, length: 6 + Math.floor(Math.random() * 9), phase: Math.random() * 100 }));
    };
    const draw = (now: number) => {
      if (now - last < 45) { raf = requestAnimationFrame(draw); return; }
      const dt = Math.min(.08, (now - (last || now)) / 1000); last = now;
      ctx.clearRect(0, 0, width, height);
      ctx.font = `${fontSize}px ui-monospace, monospace`; ctx.textAlign = "center";
      streams.forEach((stream, index) => {
        stream.y += stream.speed * dt;
        if (stream.y - stream.length * 15 > height) stream.y = -Math.random() * height * .35;
        for (let k = 0; k < stream.length; k++) {
          const y = stream.y - k * 14;
          if (y < -12 || y > height + 12) continue;
          const digit = Math.sin(now * .0007 + stream.phase + k * 2.1) > 0 ? "1" : "0";
          const fade = (1 - k / stream.length) * (.48 + .2 * Math.sin(now * .0004 + index));
          ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0, fade)})`;
          ctx.fillText(digit, stream.x + Math.sin(now * .00015 + stream.phase) * 2, y);
        }
      });
      if (!reduced && !document.hidden) raf = requestAnimationFrame(draw);
    };
    const visibility = () => { if (document.hidden) cancelAnimationFrame(raf); else if (!reduced) raf = requestAnimationFrame(draw); };
    resize();
    if (reduced) { draw(performance.now()); } else raf = requestAnimationFrame(draw);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", visibility);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  return <canvas ref={ref} className="binary-rain" aria-hidden="true" />;
}
