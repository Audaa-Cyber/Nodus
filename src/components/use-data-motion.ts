"use client";

import { useEffect, useRef, useState } from "react";
import { createIntegerAnimator, createSnapshotTracker } from "@/lib/dashboard/data-motion";

export function useReducedDataMotion() {
  // No animation before the browser's actual preference has been read.
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      setReduced(false);
      return;
    }
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

export function useAnimatedInteger(value: bigint, identity: string, duration: number, countFromZero = false) {
  const reduced = useReducedDataMotion();
  const [displayed, setDisplayed] = useState(value);
  const [changed, setChanged] = useState(false);
  const controller = useRef<ReturnType<typeof createIntegerAnimator> | null>(null);
  const initial = useRef({ value, identity, duration });
  const previousIdentity = useRef(identity);
  useEffect(() => {
    controller.current = createIntegerAnimator({
      ...initial.current,
      onValue: setDisplayed, onChange: setChanged,
      scheduler: {
        now: () => performance.now(), request: (fn) => requestAnimationFrame(fn),
        cancel: (id) => cancelAnimationFrame(id),
        delay: (fn, ms) => window.setTimeout(fn, ms), clear: (id) => window.clearTimeout(id),
      },
    });
    return () => { controller.current?.dispose(); controller.current = null; };
  }, []);
  const identityChanged = previousIdentity.current !== identity;
  useEffect(() => {
    previousIdentity.current = identity;
    controller.current?.update(value, identity, reduced, countFromZero);
  }, [value, identity, reduced, countFromZero]);
  return {
    displayed: reduced ? value : identityChanged ? countFromZero ? 0n : value : displayed,
    changed: !reduced && !identityChanged && changed,
  };
}

export function useSnapshotHighlights(rows: readonly { id: string; status?: string }[] | null, mode: "paid" | "arrival") {
  const reduced = useReducedDataMotion();
  const [tracker] = useState(() => createSnapshotTracker(mode));
  const [active, setActive] = useState<Set<string>>(new Set());
  const timers = useRef(new Map<string, number>());
  useEffect(() => {
    const changes = tracker.update(rows);
    if (reduced) {
      timers.current.forEach((timer) => window.clearTimeout(timer));
      timers.current.clear();
      setActive((current) => current.size ? new Set() : current);
      return;
    }
    if (!changes.length) return;
    setActive((current) => new Set([...current, ...changes]));
    for (const id of changes) {
      window.clearTimeout(timers.current.get(id));
      timers.current.set(id, window.setTimeout(() => {
        timers.current.delete(id);
        setActive((current) => { const next = new Set(current); next.delete(id); return next; });
      }, 1400));
    }
  }, [rows, tracker, reduced]);
  useEffect(() => {
    const pending = timers.current;
    return () => { pending.forEach((timer) => window.clearTimeout(timer)); pending.clear(); };
  }, []);
  return reduced ? new Set<string>() : active;
}
