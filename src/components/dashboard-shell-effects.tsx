"use client";

import { createContext, useContext, useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

interface DashboardLoaderContextType {
  triggerLoader: (durationMs?: number) => void;
  isLoaderActive: boolean;
}

const DashboardLoaderContext = createContext<DashboardLoaderContextType>({
  triggerLoader: () => {},
  isLoaderActive: false,
});

export function useDashboardLoader() {
  return useContext(DashboardLoaderContext);
}

export function DashboardShellEffects({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isLoaderActive, setIsLoaderActive] = useState(false);
  const loaderTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dotCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Trigger loader with a duration (defaults to 700ms within the 0.6s - 1.0s window)
  const triggerLoader = useCallback((durationMs = 700) => {
    if (loaderTimeoutRef.current) clearTimeout(loaderTimeoutRef.current);
    setIsLoaderActive(true);
    loaderTimeoutRef.current = setTimeout(() => {
      setIsLoaderActive(false);
    }, durationMs);
  }, []);

  // Automatically trigger smooth transition loader when route pathname changes
  const prevPathnameRef = useRef(pathname);
  useEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname;
      triggerLoader(680);
    }
  }, [pathname, triggerLoader]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (loaderTimeoutRef.current) clearTimeout(loaderTimeoutRef.current);
    };
  }, []);

  // 1. Spring-damped cursor glide & specular chamfer border for all .aether-card elements
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    let animFrameId = 0;
    const cards = Array.from(document.querySelectorAll<HTMLElement>(".aether-card"));
    if (cards.length === 0) return;

    const cardStates = cards.map((el) => ({
      el,
      tx: 0, ty: 0, cx: 0, cy: 0,
      trx: 0, try_: 0, crx: 0, cry: 0,
      tsx: 260, tsy: 0, csx: 260, csy: 0,
    }));

    const onMouseMove = (e: MouseEvent) => {
      cardStates.forEach((st) => {
        const rect = st.el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const dx = e.clientX - centerX;
        const dy = e.clientY - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        st.tsx = e.clientX - rect.left;
        st.tsy = e.clientY - rect.top;

        if (dist < 440) {
          st.el.style.setProperty("--spot-opacity", "1");
          const pull = Math.max(0, 1 - dist / 440);
          st.tx = (dx / 440) * 5 * pull;
          st.ty = (dy / 440) * 5 * pull;
          st.trx = (dy / (rect.height / 2)) * -1.15 * pull;
          st.try_ = (dx / (rect.width / 2)) * 1.15 * pull;
        } else {
          st.el.style.setProperty("--spot-opacity", "0");
          st.tx = 0; st.ty = 0; st.trx = 0; st.try_ = 0;
        }
      });
    };

    const animateCardsSpring = () => {
      const ease = 0.088;
      cardStates.forEach((st) => {
        st.cx += (st.tx - st.cx) * ease;
        st.cy += (st.ty - st.cy) * ease;
        st.crx += (st.trx - st.crx) * ease;
        st.cry += (st.try_ - st.cry) * ease;
        st.csx += (st.tsx - st.csx) * 0.16;
        st.csy += (st.tsy - st.csy) * 0.16;

        st.el.style.setProperty("--spot-x", st.csx.toFixed(1) + "px");
        st.el.style.setProperty("--spot-y", st.csy.toFixed(1) + "px");
        st.el.style.transform =
          "translate3d(" + st.cx.toFixed(2) + "px, " + st.cy.toFixed(2) + "px, 0) " +
          "rotateX(" + st.crx.toFixed(2) + "deg) rotateY(" + st.cry.toFixed(2) + "deg)";
      });
      animFrameId = requestAnimationFrame(animateCardsSpring);
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    animFrameId = requestAnimationFrame(animateCardsSpring);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      if (animFrameId) cancelAnimationFrame(animFrameId);
    };
  }, [pathname]);

  // 2. Autonomous Dot-Matrix Background Canvas Animation
  useEffect(() => {
    const canvas = dotCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animFrameId = 0;
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

    window.addEventListener("resize", rebuildDotGrid, { passive: true });
    rebuildDotGrid();

    const renderDotMatrix = (timestamp: number) => {
      ctx.clearRect(0, 0, canvasW, canvasH);

      const t = timestamp * 0.0028;
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

        const radius = 1.0 + highlight * 1.65;
        const alpha = 0.11 + highlight * 0.44;

        ctx.beginPath();
        ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
        ctx.fillStyle =
          highlight > 0.52
            ? "rgba(" + activeRGB + ", " + alpha.toFixed(3) + ")"
            : "rgba(" + baseRGB + ", " + alpha.toFixed(3) + ")";
        ctx.fill();
      }

      animFrameId = requestAnimationFrame(renderDotMatrix);
    };

    animFrameId = requestAnimationFrame(renderDotMatrix);

    return () => {
      window.removeEventListener("resize", rebuildDotGrid);
      if (animFrameId) cancelAnimationFrame(animFrameId);
    };
  }, []);

  return (
    <DashboardLoaderContext.Provider value={{ triggerLoader, isLoaderActive }}>
      {/* Autonomous Dot-Matrix Background Canvas */}
      <canvas id="dotMatrixCanvas" ref={dotCanvasRef} aria-hidden="true" />

      {/* Ambient Floating Orbs */}
      <div className="ambient-orb orb-1" aria-hidden="true" />
      <div className="ambient-orb orb-2" aria-hidden="true" />
      <div className="ambient-orb orb-3" aria-hidden="true" />

      {/* Matching Zero-Text Floating Glass Capsule Loader (Appears on Nav / Save) */}
      <div
        id="sectionLoaderOverlay"
        className={isLoaderActive ? "active" : ""}
        aria-hidden="true"
      >
        <div className="loader-capsule">
          <div className="capsule-shimmer" />
          <div className="iso-stack">
            <div className="iso-layer iso-top" />
            <div className="iso-layer iso-mid" />
            <div className="iso-layer iso-bot" />
          </div>
          <div className="pulse-node" />
          <div className="wave-bars">
            <span className="wave-pill" />
            <span className="wave-pill" />
            <span className="wave-pill" />
            <span className="wave-pill" />
            <span className="wave-pill" />
          </div>
        </div>
      </div>

      {children}
    </DashboardLoaderContext.Provider>
  );
}

