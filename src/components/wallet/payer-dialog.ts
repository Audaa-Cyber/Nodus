const backgroundLocks = new WeakMap<HTMLElement, { count: number; original: boolean }>();

/** Keep both dialogs' locks until the last owner releases them. */
export function lockPayerDialogBackground(dialog: HTMLElement) {
  const elements = Array.from(dialog.closest("main")?.querySelectorAll<HTMLElement>("article.sheet, section.dock") ?? []);
  for (const element of elements) {
    const lock = backgroundLocks.get(element) ?? { count: 0, original: element.inert };
    lock.count += 1;
    backgroundLocks.set(element, lock);
    element.inert = true;
  }
  return () => {
    for (const element of elements) {
      const lock = backgroundLocks.get(element);
      if (!lock) continue;
      lock.count -= 1;
      if (lock.count === 0) { element.inert = lock.original; backgroundLocks.delete(element); }
    }
  };
}

export function trapPayerDialogFocus(event: KeyboardEvent, dialog: HTMLElement) {
  if (event.key !== "Tab") return;
  const controls = dialog.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled]), input:not([disabled]), a[href], [tabindex="0"]');
  const current = dialog.ownerDocument.activeElement;
  if (!controls.length) { event.preventDefault(); dialog.focus(); return; }
  const first = controls[0], last = controls[controls.length - 1];
  const outside = current === dialog || !dialog.contains(current);
  if (event.shiftKey && (outside || current === first)) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && (outside || current === last)) { event.preventDefault(); first.focus(); }
}
