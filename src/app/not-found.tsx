import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white px-4">
      <h1 className="text-4xl font-bold mb-4 font-mono">404</h1>
      <p className="text-neutral-400 mb-8">The page you are looking for does not exist.</p>
      <Link
        href="/"
        className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium transition"
      >
        Return Home
      </Link>
    </div>
  );
}
