import test from "node:test";
import assert from "node:assert/strict";

let trap, lock;
try { ({ trapPayerDialogFocus: trap, lockPayerDialogBackground: lock } = await import("../src/components/wallet/payer-dialog.ts")); } catch {}

function fixture() {
  const document = { activeElement: null };
  const first = { focus: () => { document.activeElement = first; } };
  const last = { focus: () => { document.activeElement = last; } };
  const background = [{ inert: false }, { inert: false }];
  const dialog = {
    ownerDocument: document,
    querySelectorAll: () => [first, last],
    contains: value => value === first || value === last || value === dialog,
    closest: () => ({ querySelectorAll: () => background }),
    focus: () => { document.activeElement = dialog; },
  };
  return { document, dialog, first, last, background };
}

test("ShiftTab from the dialog itself wraps to the last control", () => {
  assert.equal(typeof trap, "function");
  const state = fixture(); state.document.activeElement = state.dialog;
  let prevented = false;
  trap({ key: "Tab", shiftKey: true, preventDefault: () => { prevented = true; } }, state.dialog);
  assert.equal(state.document.activeElement, state.last);
  assert.equal(prevented, true);
});

test("Tab from outside a modal returns to its first control", () => {
  assert.equal(typeof trap, "function");
  const state = fixture(); state.document.activeElement = {};
  trap({ key: "Tab", shiftKey: false, preventDefault() {} }, state.dialog);
  assert.equal(state.document.activeElement, state.first);
});

test("overlapping modal cleanup cannot unlock the sheet or dock too soon", () => {
  assert.equal(typeof lock, "function");
  const state = fixture(); const releaseOptions = lock(state.dialog); const releaseExecution = lock(state.dialog);
  assert.ok(state.background.every(element => element.inert));
  releaseOptions(); assert.ok(state.background.every(element => element.inert));
  releaseExecution(); assert.ok(state.background.every(element => !element.inert));
});
