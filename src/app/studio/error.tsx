"use client";

export default function StudioError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="studio-root studio-system-state"><div className="studio-system-card"><span className="studio-overline">NODUS STUDIO / 500</span><h1>Something interrupted the workspace.</h1><p>The error was contained inside Studio. Saved revisions remain stored separately from this screen.</p><button className="studio-primary" onClick={reset}>Try again</button></div></main>;
}
