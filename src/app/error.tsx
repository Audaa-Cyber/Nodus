"use client";

import Link from "next/link";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="min-h-screen flex items-center justify-center bg-[#08090a] px-6 text-white"><div className="max-w-md text-center"><p className="font-mono text-[10px] tracking-[.18em] text-[#aeb7c2]">NODUS / 500</p><h1 className="mt-5 text-4xl font-medium tracking-[-.06em]">A momentary interruption.</h1><p className="mt-4 text-sm leading-7 text-[#aeb7c2]">Something went wrong while loading this page. Your payment and invoice records have not been changed by this screen.</p><div className="mt-8 flex justify-center gap-3"><button className="rounded-full bg-white px-5 py-3 text-xs font-medium text-black" onClick={reset}>Try again</button><Link className="rounded-full border border-white/30 px-5 py-3 text-xs" href="/">Return home</Link></div></div></main>;
}
