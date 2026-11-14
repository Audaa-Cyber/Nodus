"use client";

import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Eye, EyeOff } from "lucide-react";
import { signInAction, signUpAction } from "@/app/actions/auth";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type StatusBanner = { message: string; type: "error" | "success" | "info" };

export function ExecutiveLoginCard({ initialMode = "signin" }: { initialMode?: "signin" | "signup" } = {}) {
  const searchParams = useSearchParams();
  const next = searchParams?.get("next") ?? "/dashboard";
  const modeParam = searchParams?.get("mode");
  const errorParam = searchParams?.get("error");
  const [isPending, startTransition] = useTransition();
  const [isSignUp, setIsSignUp] = useState(initialMode === "signup" || modeParam === "signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const dotCanvasRef = useRef<HTMLCanvasElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  const togglePasswordVisibility = () => {
    const input = passwordInputRef.current;
    const isCurrentlyFocused = typeof document !== "undefined" && document.activeElement === input;
    const selectionStart = input?.selectionStart;
    const selectionEnd = input?.selectionEnd;

    setShowPassword((shown) => !shown);

    if (isCurrentlyFocused && input) {
      requestAnimationFrame(() => {
        input.focus();
        if (
          selectionStart !== null &&
          selectionEnd !== null &&
          selectionStart !== undefined &&
          selectionEnd !== undefined
        ) {
          input.setSelectionRange(selectionStart, selectionEnd);
        }
      });
    }
  };

  const [statusBanner, setStatusBanner] = useState<StatusBanner | null>(
    errorParam === "confirmation"
      ? { message: "We couldn't confirm that email link. Request a fresh one or log in.", type: "error" }
      : errorParam === "expired"
      ? { message: "Authentication link expired or was already used. Please sign in again.", type: "error" }
      : errorParam === "auth_failed"
      ? { message: "Sign-in could not be completed. Please try again.", type: "error" }
      : null
  );

  // Autonomous Dot-Matrix Background Animation (Zero Cursor Dependency)
  useEffect(() => {
    const dotCanvas = dotCanvasRef.current;
    if (!dotCanvas) return;
    const ctx = dotCanvas.getContext("2d");
    if (!ctx) return;

    let animFrameId = 0;
    let gridPoints: { x: number; y: number; c: number; r: number; radialDist: number; phase: number }[] = [];
    let canvasW = 0;
    let canvasH = 0;
    const dotSpacing = 28;

    const rebuildDotGrid = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvasW = window.innerWidth;
      canvasH = window.innerHeight;
      dotCanvas.width = canvasW * dpr;
      dotCanvas.height = canvasH * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const cols = Math.ceil(canvasW / dotSpacing) + 1;
      const rows = Math.ceil(canvasH / dotSpacing) + 1;
      const centerCol = cols / 2;
      const centerRow = rows / 2;

      gridPoints = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const dc = c - centerCol;
          const dr = r - centerRow;
          const radialDist = Math.sqrt(dc * dc + dr * dr);
          const shimmerSeed = Math.sin(c * 12.9898 + r * 78.233) * 43758.5453;
          const phase = (shimmerSeed - Math.floor(shimmerSeed)) * Math.PI * 2;
          gridPoints.push({
            x: c * dotSpacing,
            y: r * dotSpacing,
            c,
            r,
            radialDist,
            phase,
          });
        }
      }
    };

    window.addEventListener("resize", rebuildDotGrid);
    rebuildDotGrid();

    const renderDotMatrix = (timestamp: number) => {
      ctx.clearRect(0, 0, canvasW, canvasH);

      const t = timestamp * 0.0028;
      const isDark = document.documentElement.getAttribute("data-theme") === "light-dark";
      const baseRGB = isDark ? "148, 163, 184" : "100, 116, 139";
      const activeRGB = isDark ? "248, 250, 252" : "15, 23, 42";

      const len = gridPoints.length;
      for (let i = 0; i < len; i++) {
        const pt = gridPoints[i];

        const radialWave = Math.sin(pt.radialDist * 0.42 - t * 1.35);
        const diagWave = Math.cos((pt.c * 0.25 + pt.r * 0.25) - t * 0.9);
        const nodeTwinkle = Math.sin(t * 1.9 + pt.phase);

        const composite = radialWave * 0.45 + diagWave * 0.35 + nodeTwinkle * 0.2;
        const norm = (composite + 1) * 0.5;

        const radius = 0.75 + norm * 1.1;
        const alpha = 0.08 + norm * 0.28;

        ctx.beginPath();
        ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
        ctx.fillStyle =
          norm > 0.65
            ? `rgba(${activeRGB}, ${alpha.toFixed(3)})`
            : `rgba(${baseRGB}, ${alpha.toFixed(3)})`;
        ctx.fill();
      }

      animFrameId = requestAnimationFrame(renderDotMatrix);
    };

    animFrameId = requestAnimationFrame(renderDotMatrix);

    return () => {
      window.removeEventListener("resize", rebuildDotGrid);
      cancelAnimationFrame(animFrameId);
    };
  }, []);

  const showStatus = (message: string, type: StatusBanner["type"]) => {
    setStatusBanner({ message, type });
  };

  const handleSocialAuth = async () => {
    if (isGoogleLoading) return;
    setIsGoogleLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const origin = window.location.origin;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
          queryParams: { prompt: "select_account" },
        },
      });

      if (error || !data?.url) {
        showStatus("Google sign-in could not be started. Please try again or use email sign-in.", "error");
        setIsGoogleLoading(false);
        return;
      }

      window.location.assign(data.url);
    } catch {
      showStatus("Google sign-in could not be started. Please try again or use email sign-in.", "error");
      setIsGoogleLoading(false);
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const emailValue = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
      showStatus("Enter a valid email address.", "error");
      return;
    }
    if (password.length < 8) {
      showStatus("Use a password with at least 8 characters.", "error");
      return;
    }
    if (isSignUp && !fullName.trim()) {
      showStatus("Enter your name to create an account.", "error");
      return;
    }

    setStatusBanner(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("email", emailValue);
      formData.set("password", password);
      formData.set("next", next);
      if (isSignUp) formData.set("businessName", fullName.trim());

      const action = isSignUp ? signUpAction : signInAction;
      const result = await action({}, formData);
      if (result?.error) {
        showStatus(result.error, "error");
      } else if (result?.success) {
        showStatus(result.success, "success");
      }
    });
  };

  return (
    <div className="login-executive-page bg-grid selection:bg-slate-500 selection:text-white">
      {/* Autonomous Dot-Matrix Background */}
      <canvas id="dotMatrixCanvas" ref={dotCanvasRef} aria-hidden="true" />

      <div className="ambient-orb orb-1" aria-hidden="true" />
      <div className="ambient-orb orb-2" aria-hidden="true" />
      <div className="ambient-orb orb-3" aria-hidden="true" />

      <main id="cardStage" className="fixed-center-stage">
        <div className="card-perspective w-full">
          <section
            id="loginCard"
            className="login-card rounded-[24px] p-5 sm:p-6 relative overflow-hidden"
            aria-labelledby="cardHeading"
          >
            <div className="top-highlight" aria-hidden="true" />
            <header className="relative z-10 flex items-center gap-3 mb-5">
              <Image src="/logo.svg" alt="Nodus logo" width={331} height={213} style={{ height: "36px", width: "auto", display: "inline-block" }} aria-hidden="true" />
              <div>
                <h1 id="cardHeading" className="text-lg font-bold tracking-tight">
                  {isSignUp ? "Create your account" : "Welcome back"}
                </h1>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                  {isSignUp ? "Create a Nodus workspace" : "Sign in with your account credentials"}
                </p>
              </div>
            </header>

            <div className="relative z-10 tab-pill-container mb-3">
              <div className="tab-indicator" style={{ transform: isSignUp ? "translateX(100%)" : "translateX(0%)" }} />
              <button
                type="button"
                onClick={() => { setIsSignUp(false); setShowPassword(false); setStatusBanner(null); }}
                className="relative z-10 py-1.5 text-[11px] font-semibold tracking-wide rounded-lg"
                style={{ color: !isSignUp ? "var(--text-primary)" : "var(--text-secondary)" }}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setIsSignUp(true); setShowPassword(false); setStatusBanner(null); }}
                className="relative z-10 py-1.5 text-[11px] font-semibold tracking-wide rounded-lg"
                style={{ color: isSignUp ? "var(--text-primary)" : "var(--text-secondary)" }}
              >
                Create Account
              </button>
            </div>

            {statusBanner && (
              <div
                className={`relative z-10 mb-3 px-3 py-2 rounded-xl text-[11px] font-medium border ${
                  statusBanner.type === "error"
                    ? "bg-rose-500/10 text-rose-600 border-rose-500/20"
                    : statusBanner.type === "success"
                    ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
                    : "bg-slate-500/10 border-slate-500/20"
                }`}
                role={statusBanner.type === "error" ? "alert" : "status"}
              >
                {statusBanner.message}
              </div>
            )}

            <form className="relative z-10 space-y-2.5" onSubmit={handleSubmit}>
              {isSignUp && (
                <div className="input-group">
                  <input
                    id="fullNameInput"
                    type="text"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder=" "
                    autoComplete="name"
                    className="premium-input"
                    required
                  />
                  <label htmlFor="fullNameInput" className="floating-label">Full name</label>
                </div>
              )}

              <div className="input-group">
                <input
                  id="emailInput"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder=" "
                  autoComplete="email"
                  className="premium-input"
                  required
                />
                <label htmlFor="emailInput" className="floating-label">Work or personal email</label>
              </div>

              <div className="input-group">
                <input
                  ref={passwordInputRef}
                  id="passwordInput"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder=" "
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  className="premium-input has-action"
                  required
                  minLength={8}
                />
                <label htmlFor="passwordInput" className="floating-label">Password</label>
                <button
                  type="button"
                  onClick={togglePasswordVisibility}
                  onMouseDown={(event) => {
                    if (document.activeElement === passwordInputRef.current) {
                      event.preventDefault();
                    }
                  }}
                  className="password-toggle-btn"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  aria-controls="passwordInput"
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4 transition-transform duration-150" aria-hidden="true" />
                  ) : (
                    <Eye className="w-4 h-4 transition-transform duration-150" aria-hidden="true" />
                  )}
                </button>
              </div>

              <div className="flex items-center justify-between text-[11px]">
                <span style={{ color: "var(--text-secondary)" }}>Use at least 8 characters</span>
                {!isSignUp && (
                  <Link href="/forgot-password" className="font-medium hover:underline" style={{ color: "var(--text-primary)" }}>
                    Forgot password?
                  </Link>
                )}
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="btn-primary w-full py-2.5 px-4 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 shadow-sm disabled:opacity-60"
              >
                {isPending ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
              </button>
            </form>

            {!isSignUp && (
              <div className="relative z-10 mt-4">
                <div className="flex items-center gap-3 mb-3 text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                  <span className="flex-1 border-t" style={{ borderColor: "var(--card-border)" }} />
                  <span>Or continue with</span>
                  <span className="flex-1 border-t" style={{ borderColor: "var(--card-border)" }} />
                </div>
                <button
                  type="button"
                  onClick={handleSocialAuth}
                  disabled={isPending || isGoogleLoading}
                  className="social-btn w-full py-2 px-3 rounded-xl flex items-center justify-center gap-2 text-xs font-medium transition-all disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
                  style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--text-primary)" }}
                >
                  {isGoogleLoading ? (
                    <>
                      <svg className="animate-spin w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Connecting to Google…</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                        <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.6l3.7 2.9c2.2-2 3.7-5 3.7-8.7z" />
                        <path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.1-6.7-5l-3.7 2.8C3.5 20.4 7.4 23 12 23z" />
                        <path fill="#FBBC05" d="M5.3 14.8c-.2-.8-.4-1.8-.4-2.8s.2-2 .4-2.8L1.6 6.4C.6 8.4 0 10.6 0 12s.6 3.6 1.6 5.6l3.7-2.8z" />
                        <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.8C6.2 7.2 8.9 5 12 5z" />
                      </svg>
                      Continue with Google
                    </>
                  )}
                </button>
              </div>
            )}

            <footer className="relative z-10 mt-4 text-center text-[10px]" style={{ color: "var(--text-muted)" }}>
              <Link href="/" className="hover:underline">Back to Nodus</Link>
            </footer>
          </section>
        </div>
      </main>
    </div>
  );
}
