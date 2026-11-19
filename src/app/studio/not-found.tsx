import Link from "next/link";

export default function StudioNotFound() {
  return <main className="studio-root studio-system-state"><div className="studio-system-card"><span className="studio-overline">NODUS STUDIO / 404</span><h1>Workspace unavailable.</h1><p>This page does not exist, or this account does not have permission to access it.</p><Link href="/" className="studio-primary">Return to Nodus <span aria-hidden="true">↗</span></Link></div></main>;
}
