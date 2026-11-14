"use client";

import { useEffect, useState, type ReactNode } from "react";

export function DashboardSidebar({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <div className="mobile-sidebar-bar">
        <button
          type="button"
          className="mobile-sidebar-toggle"
          aria-label={open ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={open}
          aria-controls="dashboard-sidebar"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? (
            <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" /></svg>
          )}
        </button>
        <span className="mobile-sidebar-title">Menu</span>
        <span className="mobile-sidebar-brand">nodus<span>.</span></span>
      </div>
      {open && <button type="button" className="mobile-sidebar-backdrop" aria-label="Close navigation menu" onClick={() => setOpen(false)} />}
      <div
        id="dashboard-sidebar"
        className={`dashboard-sidebar-host${open ? " is-open" : ""}`}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("a")) setOpen(false);
        }}
      >
        {children}
      </div>
    </>
  );
}
