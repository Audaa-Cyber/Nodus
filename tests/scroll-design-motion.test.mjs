import test from "node:test";
import assert from "node:assert/strict";

async function api() {
  try { return await import("../src/components/scroll-motion.ts"); }
  catch (error) { assert.fail(`Approved scroll motion is not implemented: ${error.message}`); }
}

test("Open paper remains tucked exactly one pixel under the right spindle throughout travel", async () => {
  const { scrollGeometry } = await api();
  for (const progress of [0, 0.01, 0.25, 0.5, 0.75, 1]) {
    const frame = scrollGeometry(progress, 48, 764);
    assert.equal(frame.paperWidth + 48 - frame.rightSpindleLeft, 1);
    assert.equal(frame.scrollWidth - frame.rightSpindleLeft, 48);
  }
  assert.equal(scrollGeometry(1, 48, 764).turnDegrees, 720);
  assert.equal(scrollGeometry(0.5, 48, 764).curlWidth, 124);
  assert.equal(scrollGeometry(0, 48, 764).curlOpacity, "0.000");
});

test("A mid-unroll reversal starts from the current position and uses proportional duration", async () => {
  const { createScrollMotion } = await api();
  let now = 0, callback;
  const states = [];
  const motion = createScrollMotion({ reduce: false, now: () => now,
    requestFrame: fn => { callback = fn; return 1; }, cancelFrame: () => {},
    render: () => {}, sync: state => states.push(state) });
  motion.go(1);
  now = 425; callback(now);
  assert.ok(Math.abs(motion.progress - 0.5) < 1e-10);
  motion.go(0);
  assert.ok(Math.abs(motion.progress - 0.5) < 1e-10);
  now = 637.5; callback(now);
  assert.ok(Math.abs(motion.progress - 0.25) < 1e-10);
  now = 850; callback(now);
  assert.equal(motion.progress, 0);
  assert.equal(states.at(-1).state, "closed");
  motion.destroy();
});

test("Reduced motion reaches the target in the approved 120ms and cleanup cancels an active frame", async () => {
  const { createScrollMotion } = await api();
  let callback, cancelled = 0;
  const motion = createScrollMotion({ reduce: true, now: () => 0,
    requestFrame: fn => { callback = fn; return 4; }, cancelFrame: id => { cancelled = id; },
    render: () => {}, sync: () => {} });
  motion.go(1); callback(120);
  assert.equal(motion.progress, 1);
  motion.go(0); motion.destroy();
  assert.equal(cancelled, 4);
});

test("Only the intentional review hash unrolls the scroll, and hash listeners are cleaned up", async () => {
  const { mountApprovedScroll } = await api();
  const saved = new Map();
  const globals = { window: new EventTarget(), document: new EventTarget(), Node: EventTarget,
    matchMedia: () => ({ matches: false }), getComputedStyle: () => ({ getPropertyValue: () => "48" }) };
  let now = 0, nextFrame = 0;
  const frames = new Map();
  globals.performance = { now: () => now };
  globals.requestAnimationFrame = callback => { frames.set(++nextFrame, callback); return nextFrame; };
  globals.cancelAnimationFrame = id => frames.delete(id);
  globals.window.location = { hash: "" };
  globals.document.documentElement = { clientWidth: 1024 };
  globals.document.activeElement = null;
  function element() {
    const target = new EventTarget();
    Object.assign(target, { style: {}, dataset: {}, inert: true, children: [],
      classList: { toggle: () => {} }, setAttribute: () => {}, removeAttribute: () => {}, focus: () => {},
      contains: () => false, querySelector: () => null,
      appendChild(child) { this.children.push(child); child.parent = this; },
      remove() { this.parent.children.splice(this.parent.children.indexOf(this), 1); } });
    return target;
  }
  globals.document.createElement = element;
  for (const [name, value] of Object.entries(globals)) {
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const scroll = element(), paper = element(), sheet = element(), curl = element(), back = element();
  const leftSpindle = element(), rightSpindle = element(), leftRod = element(), rightRod = element();
  leftSpindle.querySelector = () => leftRod;
  rightSpindle.querySelector = () => rightRod;
  sheet.querySelector = selector => selector === "#receipt-review-section" ? element() : null;
  let cleanup;
  try {
    cleanup = mountApprovedScroll({ scroll, paper, sheet, curl, leftSpindle, rightSpindle, back });
    assert.equal(scroll.dataset.state, "closed");
    assert.equal(frames.size, 0, "Normal receipt visits remain rolled closed");
    globals.window.location.hash = "#receipt-review-section";
    globals.window.dispatchEvent(new Event("hashchange"));
    assert.equal(scroll.dataset.state, "opening");
    const callback = frames.values().next().value;
    frames.clear(); now = 850; callback(now);
    assert.equal(scroll.dataset.state, "open");
    assert.equal(sheet.inert, false);
    assert.equal(scroll.style.width, "880px");
    cleanup(); cleanup = null;
    globals.window.dispatchEvent(new Event("hashchange"));
    assert.equal(frames.size, 0);
    assert.equal(leftRod.children.length + rightRod.children.length, 0);
    cleanup = mountApprovedScroll({ scroll, paper, sheet, curl, leftSpindle, rightSpindle, back });
    assert.equal(scroll.dataset.state, "opening", "Opening the review QR destination initially uses the same unroll animation");
  } finally {
    cleanup?.();
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
    }
  }
});
