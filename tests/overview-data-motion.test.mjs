import test from "node:test";
import assert from "node:assert/strict";

const motion = await import("../src/lib/dashboard/data-motion.ts");

test("a one-micro-USDC correction finishes at the exact returned base unit", () => {
  const { controller, time, values } = animator("12000001");
  controller.update(12000000n, "base", false);
  time.advance(650);
  assert.equal(values.at(-1), 12000000n);
});

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

function animator(initial = "12000000", duration = 650) {
  assert.equal(typeof motion.createIntegerAnimator, "function");
  const time = clock();
  const values = [];
  const feedback = [];
  const controller = motion.createIntegerAnimator({
    value: BigInt(initial), identity: "base", duration,
    onValue: (v) => values.push(v), onChange: (v) => feedback.push(v), scheduler: time,
  });
  return { controller, time, values, feedback };
}

// Test A — Balance increases
test("Test A — Balance increases: from 12 USDC to 24 USDC smoothly animates to the new value", () => {
  const { controller, time, values, feedback } = animator("12000000", 650);
  controller.update(24000000n, "base", false);

  // At midpoint (325ms), value is smoothly easing upward
  time.advance(325);
  assert.equal(values.at(-1), 22500000n);
  assert.equal(feedback.at(-1), true, "feedback highlight is active during transition");

  // At completion (650ms), value reaches exactly 24 USDC
  time.advance(325);
  assert.equal(values.at(-1), 24000000n);

  // After highlight duration (1200ms total), highlight returns to normal
  time.advance(550);
  assert.equal(feedback.at(-1), false, "feedback returns to normal");
  assert.equal(time.pending(), 0, "no dangling frames or timers");
});

// Test B — Balance unchanged
test("Test B — Balance unchanged: refresh returns 24 USDC again, no numerical animation occurs", () => {
  const { controller, time, values, feedback } = animator("24000000", 650);
  // Polling cycle 1: unchanged
  controller.update(24000000n, "base", false);
  // Polling cycle 2: unchanged
  controller.update(24000000n, "base", false);

  assert.equal(time.pending(), 0, "no frames scheduled on unchanged balance");
  assert.deepEqual(values, [], "no intermediate values emitted");
  assert.deepEqual(feedback, [], "no feedback highlight emitted");
});

// Test C — Balance decreases
test("Test C — Balance decreases: genuine correction from 24 USDC to 12 USDC smoothly animates downward", () => {
  const { controller, time, values, feedback } = animator("24000000", 650);
  controller.update(12000000n, "base", false);

  // At midpoint, value has smoothly eased downward
  time.advance(325);
  assert.equal(values.at(-1), 13500000n);
  assert.equal(feedback.at(-1), true);

  // At completion, value reaches exact target without floating point drift
  time.advance(325);
  assert.equal(values.at(-1), 12000000n);

  // Feedback highlight clears
  time.advance(550);
  assert.equal(feedback.at(-1), false);
  assert.equal(time.pending(), 0);
});

test("Test C — Balance decreases: preserves six-decimal precision beyond Number.MAX_SAFE_INTEGER", () => {
  const { controller, time, values } = animator("9007199254740993123456", 650);
  controller.update(9007199254740992123455n, "base", false);
  time.advance(325);
  assert.ok(values.at(-1) < 9007199254740993123456n);
  assert.ok(values.at(-1) > 9007199254740992123455n);
  time.advance(325);
  assert.equal(values.at(-1), 9007199254740992123455n);
});

// Test D — Invoice paid
test("Test D — Invoice paid: count metrics transition and corresponding invoice row receives temporary highlight", () => {
  // 1. Metric counter transitions for paid count (e.g. 3 -> 4) and open count (e.g. 5 -> 4)
  const paidMetric = animator("3", 550);
  paidMetric.controller.update(4n, "base", false);
  paidMetric.time.advance(275);
  assert.ok(paidMetric.values.at(-1) >= 3n && paidMetric.values.at(-1) <= 4n);
  paidMetric.time.advance(275);
  assert.equal(paidMetric.values.at(-1), 4n);
  assert.equal(paidMetric.feedback.at(-1), true);

  const openMetric = animator("5", 550);
  openMetric.controller.update(4n, "base", false);
  openMetric.time.advance(550);
  assert.equal(openMetric.values.at(-1), 4n);

  // 2. Snapshot tracker identifies only the invoice that transitioned from unpaid to paid
  const tracker = motion.createSnapshotTracker("paid");
  // Initial snapshot with unpaid invoice
  assert.deepEqual(tracker.update([
    { id: "inv-paid-1", status: "open" },
    { id: "inv-other", status: "open" },
  ]), []);

  // Update arrives: inv-paid-1 is now paid, inv-other is still open
  const highlights = tracker.update([
    { id: "inv-paid-1", status: "paid" },
    { id: "inv-other", status: "open" },
  ]);
  assert.deepEqual(highlights, ["inv-paid-1"], "only the paid invoice is highlighted");

  // Subsequent render with same state does not re-highlight
  assert.deepEqual(tracker.update([
    { id: "inv-paid-1", status: "paid" },
    { id: "inv-other", status: "open" },
  ]), []);
});

// Test E — Unrelated invoice
test("Test E — Unrelated invoice: unchanged invoices do not receive payment animation", () => {
  const tracker = motion.createSnapshotTracker("paid");
  // Initial snapshot: invoice a is open, invoice b was already paid before mount
  assert.deepEqual(tracker.update([
    { id: "a", status: "open" },
    { id: "b", status: "paid" },
  ]), []);

  // Refresh occurs: invoice c arrives already paid, b is still paid, a is still open
  const highlights = tracker.update([
    { id: "a", status: "open" },
    { id: "b", status: "paid" },
    { id: "c", status: "paid" },
  ]);
  // Neither previously paid (b), unchanged open (a), nor newly arrived already-paid (c) get animated
  assert.deepEqual(highlights, [], "unrelated invoices receive no payment highlight");
});

// Test F — Reduced motion
test("Test F — Reduced motion: animations are disabled while all data updates continue working", () => {
  const { controller, time, values, feedback } = animator("12000000", 650);

  // Update with reduced motion enabled
  controller.update(24000000n, "base", true);
  assert.equal(values.at(-1), 24000000n, "value immediately snaps to 24 USDC");
  assert.equal(feedback.at(-1), false, "no feedback animation is triggered");
  assert.equal(time.pending(), 0, "no animation frames or timers scheduled");

  // Subsequent decrease with reduced motion
  controller.update(15000000n, "base", true);
  assert.equal(values.at(-1), 15000000n, "subsequent decrease also snaps immediately");
  assert.equal(time.pending(), 0);

  // Mid-animation reduced motion cancels work and snaps immediately
  const active = animator("100", 650);
  active.controller.update(200n, "base", false);
  active.time.advance(100);
  assert.ok(active.time.pending() > 0, "animation in progress");

  active.controller.update(200n, "base", true);
  assert.equal(active.values.at(-1), 200n, "snaps to target value");
  assert.equal(active.feedback.at(-1), false);
  assert.equal(active.time.pending(), 0, "cancelled all active animation work");
});

test("network changes snap directly without animation and rapid updates continue smoothly", () => {
  const { controller, time, values, feedback } = animator("12000000", 650);
  controller.update(24000000n, "base", false);
  time.advance(200);
  const displayed = values.at(-1);

  // Rapid update before first one completes
  controller.update(5000000n, "base", false);
  assert.equal(values.at(-1), displayed, "continues from currently displayed value");
  time.advance(650);
  assert.equal(values.at(-1), 5000000n);

  // Network switch: must snap directly without animating
  controller.update(99000000n, "arc", false);
  assert.equal(values.at(-1), 99000000n, "snapped directly on network switch");
  assert.equal(feedback.at(-1), false);
  assert.equal(time.pending(), 0);
});

test("verified settlement arrivals animate newly added entries without replaying old ones", () => {
  const tracker = motion.createSnapshotTracker("arrival");
  assert.deepEqual(tracker.update(null), [], "null response preserves state without error");
  assert.deepEqual(tracker.update([{ id: "settlement-old" }]), [], "initial snapshot does not animate");
  assert.deepEqual(tracker.update(null), [], "temporary error does not reset seen entries");
  assert.deepEqual(
    tracker.update([{ id: "settlement-new" }, { id: "settlement-old" }]),
    ["settlement-new"],
    "only the newly arrived verified settlement is animated",
  );
  assert.deepEqual(
    tracker.update([{ id: "settlement-new" }, { id: "settlement-old" }]),
    [],
    "subsequent refresh does not replay animation",
  );
});

test("unmount cleanly cancels frames and timers", () => {
  const { controller, time, values } = animator();
  controller.update(24000000n, "base", false);
  controller.dispose();
  time.advance(2000);
  assert.deepEqual(values, []);
  assert.equal(time.pending(), 0);
});
