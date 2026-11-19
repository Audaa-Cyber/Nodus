"use client";

export default function ControlError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="control-error"><div className="control-error-inner"><span className="control-error-code">500 / CONTROL</span><h1>Something went wrong.</h1><p>The control workspace hit an unexpected error. Your saved content remains in the database. Try again, and contact the system owner if it keeps happening.</p><button className="control-button" type="button" onClick={reset} style={{ marginTop: 22 }}>Try again</button></div></div>;
}
