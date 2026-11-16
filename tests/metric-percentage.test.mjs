import test from "node:test";
import assert from "node:assert/strict";

const motion = await import("../src/lib/dashboard/data-motion.ts");

function clock() {
  let now = 0;
  let nextId = 0;
  const frames = new Map();
  const timers = new Map();
  return {
    now: () => now,
    request: (fn) => { frames.set(++nextId, fn); return nextId; },
    cancel: (id) => frames.delete(id),
    delay: (fn, ms) => { timers.set(++nextId, { fn, at: now + ms }); return nextId; },
    clear: (id) => timers.delete(id),
    advance(ms) {
      now += ms;
      const batch = [...frames.values()];
      frames.clear();
      batch.forEach((fn) => fn(now));
      for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.fn(); }
    },
    pending: () => frames.size + timers.size,
  };
}

function percentageAnimator(initial = "50") {
  const time = clock();
  const values = [];
  const feedback = [];
  const controller = motion.createIntegerAnimator({
    value: BigInt(initial),
    identity: "percentage-test",
    duration: 550,
    onValue: (v) => values.push(v),
    onChange: (v) => feedback.push(v),
    scheduler: time,
  });
  return { controller, time, values, feedback };
}

function calculatePercentage(val, total) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((val / total) * 100)));
}

test("Category percentage calculation handles zero and exact distributions", () => {
  // Empty business: 0 total invoices
  assert.equal(calculatePercentage(0, 0), 0, "0 total yields 0% without NaN");
  assert.equal(calculatePercentage(5, 0), 0, "guards against divide by zero");

  // Real distributions
  const total = 10;
  assert.equal(calculatePercentage(6, total), 60);
  assert.equal(calculatePercentage(3, total), 30);
  assert.equal(calculatePercentage(1, total), 10);
  assert.equal(calculatePercentage(0, total), 0);

  // Rounding fractions
  assert.equal(calculatePercentage(1, 3), 33);
  assert.equal(calculatePercentage(2, 3), 67);
});

test("Increasing percentage smoothly animates upwards with live feedback highlight", () => {
  const { controller, time, values, feedback } = percentageAnimator("50");

  // Paid invoices percentage increases from 50% to 60%
  controller.update(60n, "percentage-test", false);

  // Midpoint interpolation
  time.advance(275);
  const mid = values.at(-1);
  assert.ok(mid >= 50n && mid <= 60n, "midpoint value is between 50 and 60");
  assert.equal(feedback.at(-1), true, "highlight is active during transition");

  // Reaches target
  time.advance(275);
  assert.equal(values.at(-1), 60n, "reaches 60%");

  // Feedback clears after highlight duration
  time.advance(650);
  assert.equal(feedback.at(-1), false, "highlight returns to normal");
  assert.equal(time.pending(), 0);
});

test("Decreasing percentage smoothly animates downwards with live feedback highlight", () => {
  const { controller, time, values, feedback } = percentageAnimator("50");

  // Open invoices percentage decreases from 50% to 40%
  controller.update(40n, "percentage-test", false);

  time.advance(275);
  const mid = values.at(-1);
  assert.ok(mid <= 50n && mid >= 40n, "midpoint value eases downward");
  assert.equal(feedback.at(-1), true);

  time.advance(275);
  assert.equal(values.at(-1), 40n, "reaches 40%");

  time.advance(650);
  assert.equal(feedback.at(-1), false);
  assert.equal(time.pending(), 0);
});

test("Unchanged percentage during re-render triggers no animation", () => {
  const { controller, time, values, feedback } = percentageAnimator("60");

  // Polling revalidation returns same 60%
  controller.update(60n, "percentage-test", false);
  controller.update(60n, "percentage-test", false);

  assert.equal(time.pending(), 0, "no frames or timers scheduled");
  assert.deepEqual(values, [], "no intermediate values emitted");
  assert.deepEqual(feedback, [], "no feedback active");
});

test("Reduced motion snaps percentage immediately without animation", () => {
  const { controller, time, values, feedback } = percentageAnimator("50");

  controller.update(75n, "percentage-test", true);

  assert.equal(values.at(-1), 75n, "snaps directly to 75%");
  assert.equal(feedback.at(-1), false, "feedback is false");
  assert.equal(time.pending(), 0, "no frames scheduled");
});
