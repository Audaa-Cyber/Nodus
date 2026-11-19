import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-white text-[#17191c] flex items-center justify-center px-6">
      <div className="w-full max-w-[560px]">
        <Link href="/" className="inline-flex items-center gap-3 text-lg font-semibold tracking-tight">
          <span className="grid h-9 w-9 place-items-center rounded-lg border border-[#17191c] text-sm">N</span>
          nodus<span className="text-[#929ba5]">.</span>
        </Link>
        <div className="mt-24 border-t border-[#e4e7ea] pt-8">
          <p className="font-mono text-[10px] tracking-[.2em] text-[#8b949e]">ERROR / 404</p>
          <h1 className="mt-5 text-5xl font-semibold tracking-[-.06em]">This page isn’t here.</h1>
          <p className="mt-5 max-w-md text-sm leading-7 text-[#737d88]">The address may be incorrect, or the page may have moved. Nothing to see here.</p>
          <Link href="/" className="mt-9 inline-flex items-center gap-3 rounded-md bg-[#17191c] px-5 py-3 text-xs font-semibold text-white">Back to Nodus <span aria-hidden="true">↗</span></Link>
        </div>
        <p className="mt-24 font-mono text-[9px] tracking-[.16em] text-[#a4abb3]">NODUS / BUSINESS PAYMENTS, MADE CLEAR</p>
      </div>
    </main>
  );
}
