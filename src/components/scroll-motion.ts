// Animation constants and geometry transcribed from the approved Thank You Scroll.
const N = 10, DUR = 850, TURNS = 720;
const ease = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

export function scrollGeometry(progress: number, spindleWidth: number, innerWidth: number) {
  const width = progress * innerWidth;
  const shadow = Math.sin(Math.PI * progress);
  return {
    scrollWidth: 2 * spindleWidth + width,
    paperWidth: width + 1,
    rightSpindleLeft: spindleWidth + width,
    turnDegrees: progress * TURNS,
    curlOpacity: (progress > 0 ? .45 + .55 * shadow : 0).toFixed(3),
    curlWidth: 34 + 90 * shadow,
  };
}

type ScrollState = { state: "closed" | "opening" | "open" | "closing"; open: boolean };
type MotionOptions = {
  reduce: boolean;
  now: () => number;
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (id: number) => void;
  render: (progress: number) => void;
  sync: (state: ScrollState) => void;
};

export function createScrollMotion(options: MotionOptions) {
  let p = 0, target = 0, raf = 0;
  let anim: { from: number; to: number; start: number; dur: number } | null = null;
  let disposed = false;
  function sync() {
    const open = target === 1;
    options.sync({ state: anim ? (open ? "opening" : "closing") : (open ? "open" : "closed"), open });
  }
  function tick(now: number) {
    if (!anim || disposed) { raf = 0; return; }
    const t = Math.min(1, (now - anim.start) / anim.dur);
    p = anim.from + (anim.to - anim.from) * ease(t);
    options.render(p);
    if (t < 1) { raf = options.requestFrame(tick); return; }
    p = anim.to; options.render(p); anim = null; raf = 0; sync();
  }
  return {
    get progress() { return p; },
    get target() { return target; },
    go(t: 0 | 1) {
      if (disposed || (t === target && (anim || p === t))) return;
      target = t;
      const dist = Math.abs(t - p);
      if (dist < 1e-4) { p = t; anim = null; options.render(p); sync(); return; }
      anim = { from: p, to: t, start: options.now(), dur: options.reduce ? 120 : DUR * dist };
      sync();
      if (!raf) raf = options.requestFrame(tick);
    },
    sync,
    destroy() {
      disposed = true;
      if (raf) options.cancelFrame(raf);
      raf = 0; anim = null;
    },
  };
}

type ScrollElements = {
  scroll: HTMLDivElement;
  paper: HTMLDivElement;
  sheet: HTMLElement;
  curl: HTMLDivElement;
  leftSpindle: HTMLDivElement;
  rightSpindle: HTMLDivElement;
  back: HTMLButtonElement;
};

export function mountApprovedScroll({ scroll, paper, sheet, curl, leftSpindle: spL, rightSpindle: spR, back }: ScrollElements) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let SP = 48, INNER = 764;
  let restoreFocus = false;
  const bands = new Map<HTMLDivElement, HTMLElement[]>();
  [spL, spR].forEach(sp => {
    const rod = sp.querySelector(".rod")!;
    const inlays: HTMLElement[] = [];
    for (let k = 0; k < N; k++) {
      const band = document.createElement("i");
      rod.appendChild(band); inlays.push(band);
    }
    bands.set(sp, inlays);
  });
  function rotate(sp: HTMLDivElement, deg: number) {
    bands.get(sp)!.forEach((band, k) => {
      const a = (deg + k * 360 / N) * Math.PI / 180, c = Math.cos(a);
      if (c < 0.03) { band.style.opacity = "0"; return; }
      band.style.opacity = String(Math.min(1, c * 1.5));
      band.style.transform = `translateX(${SP / 2 * (1 + Math.sin(a)) - 3}px) scaleX(${c})`;
    });
  }
  function render(progress: number) {
    const frame = scrollGeometry(progress, SP, INNER);
    scroll.style.width = frame.scrollWidth + "px";
    paper.style.width = frame.paperWidth + "px";
    spR.style.left = frame.rightSpindleLeft + "px";
    rotate(spR, frame.turnDegrees); rotate(spL, 0);
    curl.style.opacity = frame.curlOpacity;
    curl.style.width = frame.curlWidth + "px";
  }
  const motion = createScrollMotion({
    reduce, now: () => performance.now(), requestFrame: callback => requestAnimationFrame(callback), cancelFrame: id => cancelAnimationFrame(id),
    render,
    sync({ state, open }) {
      if (!open && document.activeElement && sheet.contains(document.activeElement)) restoreFocus = true;
      scroll.dataset.state = state;
      sheet.inert = !open;
      scroll.setAttribute("aria-expanded", String(open));
      if (open) { scroll.removeAttribute("role"); scroll.tabIndex = -1; }
      else { scroll.setAttribute("role", "button"); scroll.tabIndex = 0; }
      if (state === "closed" && restoreFocus) { scroll.focus(); restoreFocus = false; }
    },
  });
  function measure() {
    SP = parseFloat(getComputedStyle(scroll).getPropertyValue("--sp")) || 48;
    const open = Math.min(880, document.documentElement.clientWidth - 24);
    INNER = Math.max(250, open - 2 * SP);
    sheet.style.width = INNER + "px";
    sheet.classList.toggle("narrow", INNER < 580);
    render(motion.progress);
  }
  const onClick = (event: MouseEvent) => {
    if (event.target instanceof Node && sheet.contains(event.target)) return;
    if (motion.target === 0) motion.go(1);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if ((event.key === "Enter" || event.key === " ") && motion.target === 0 && event.target === scroll) {
      event.preventDefault(); motion.go(1);
    }
  };
  const onEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && motion.target === 1) motion.go(0); };
  const onBack = () => motion.go(0);
  const onHashChange = () => {
    if (window.location.hash === "#receipt-review-section" && sheet.querySelector("#receipt-review-section")) motion.go(1);
  };
  scroll.addEventListener("click", onClick);
  scroll.addEventListener("keydown", onKeyDown);
  document.addEventListener("keydown", onEscape);
  back.addEventListener("click", onBack);
  window.addEventListener("resize", measure);
  window.addEventListener("hashchange", onHashChange);
  measure(); motion.sync(); onHashChange();
  return () => {
    motion.destroy();
    scroll.removeEventListener("click", onClick);
    scroll.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("keydown", onEscape);
    back.removeEventListener("click", onBack);
    window.removeEventListener("resize", measure);
    window.removeEventListener("hashchange", onHashChange);
    bands.forEach(inlays => inlays.forEach(band => band.remove()));
  };
}
