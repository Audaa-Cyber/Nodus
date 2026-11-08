"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { signInAction, signUpAction } from "@/app/actions/auth";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function ExecutiveLoginCard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams?.get("next") ?? "/dashboard";
  const confirmationError = searchParams?.get("error") === "confirmation";

  const [isPending, startTransition] = useTransition();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Mode: Sign In vs Create Account
  const [isSignUp, setIsSignUp] = useState(false);

  // Inputs - Starts completely empty ready for user input
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Status Banner & Shake
  const [banner, setBanner] = useState<{ message: string; type: "error" | "success" | "info" } | null>(
    confirmationError
      ? { message: "We couldn't confirm that email link. Request a fresh one or log in.", type: "error" }
      : null
  );
  const [isShaking, setIsShaking] = useState(false);

  // Success Telemetry View
  const [isSuccess, setIsSuccess] = useState(false);
  const [successData, setSuccessData] = useState({
    email: "",
    method: "Nodus Authentication",
    code: "Verified",
    displayName: "Nodus Member",
  });

  // Password strength calculation
  const [passwordStrength, setPasswordStrength] = useState(0);
  const strengthLabels = ["Weak", "Fair", "Good", "Strong"];
  const strengthColors = ["bg-rose-500", "bg-amber-500", "bg-sky-500", "bg-emerald-500"];

  useEffect(() => {
    if (!password) {
      setPasswordStrength(0);
      return;
    }
    let score = 0;
    if (password.length >= 6) score++;
    if (password.length >= 10) score++;
    if (/[A-Z]/.test(password) && /[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    setPasswordStrength(Math.max(1, score));
  }, [password]);

  // Email validity check
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  // Refs for 3D Spring Cursor & Canvas
  const cardRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // OTP 6-Digit Code State (Auto-Detect from Keyboard / Clipboard)
  const [otpSlots, setOtpSlots] = useState<string[]>(["", "", "", "", "", ""]);
  const [activeSlot, setActiveSlot] = useState<number>(-1);
  const [filledSlots, setFilledSlots] = useState<number>(0);
  const [isVerifiedGlow, setIsVerifiedGlow] = useState(false);
  const [otpLiveTag, setOtpLiveTag] = useState("Awaiting Code");
  const [otpStatusText, setOtpStatusText] = useState("Copy 6-digit access code to clipboard to auto-fill");
  const lastClipboardCodeRef = useRef<string>("");
  const otpInputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const triggerCardShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 400);
  };

  // =========================================================================
  // 1. CLIPBOARD CODE AUTO-DETECTION & KEYBOARD FILLING
  // =========================================================================
  const fillCodeFromDigits = (rawCode: string, sourceLabel: "clipboard" | "paste" | "manual" = "clipboard") => {
    const digits = rawCode.replace(/\D/g, "").slice(0, 6);
    if (digits.length !== 6) return;

    const arr = digits.split("");
    setOtpSlots(arr);
    setFilledSlots(6);
    setActiveSlot(-1);
    setIsVerifiedGlow(true);
    const formatted = `${digits.slice(0, 3)} ${digits.slice(3)}`;
    setOtpLiveTag(sourceLabel === "clipboard" ? "Clipboard Auto-Detected ✓" : "Code Filled ✓");
    setOtpStatusText(`Code ${formatted} detected from ${sourceLabel} & populated ✓`);
  };

  // Auto-detect when code is copied to clipboard upon window / tab focus
  useEffect(() => {
    let isMounted = true;

    const checkClipboardOnFocus = async () => {
      try {
        if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.readText) {
          if (document.hasFocus()) {
            const text = await navigator.clipboard.readText();
            if (!text) return;
            const digits = text.replace(/\D/g, "");
            // Detect exactly 6 digits copied to clipboard
            if (digits.length === 6 && digits !== lastClipboardCodeRef.current && isMounted) {
              lastClipboardCodeRef.current = digits;
              fillCodeFromDigits(digits, "clipboard");
            }
          }
        }
      } catch {
        // Clipboard read permission might be blocked by browser policy without explicit gesture; fail gracefully
      }
    };

    window.addEventListener("focus", checkClipboardOnFocus);
    return () => {
      isMounted = false;
      window.removeEventListener("focus", checkClipboardOnFocus);
    };
  }, []);

  // Intercept paste on OTP container or slots
  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text");
    if (!text) return;
    const digits = text.replace(/\D/g, "").slice(0, 6);
    if (digits.length === 6) {
      e.preventDefault();
      lastClipboardCodeRef.current = digits;
      fillCodeFromDigits(digits, "paste");
    }
  };

  // Manual Paste from Clipboard Button (explicit user gesture always permitted by browsers)
  const handleDetectClipboardClick = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        const digits = text ? text.replace(/\D/g, "") : "";
        if (digits.length === 6) {
          lastClipboardCodeRef.current = digits;
          fillCodeFromDigits(digits, "clipboard");
          return;
        }
      }
      setOtpStatusText("No 6-digit code found in clipboard. Copy code (e.g. 482916) and retry.");
    } catch {
      setOtpStatusText("Clipboard access blocked. Please press Ctrl+V to paste directly.");
    }
  };

  // Manual interactive typing for individual slots
  const handleSlotChange = (index: number, val: string) => {
    const clean = val.replace(/\D/g, "");
    if (!clean) {
      const nextSlots = [...otpSlots];
      nextSlots[index] = "";
      setOtpSlots(nextSlots);
      setFilledSlots(nextSlots.filter(Boolean).length);
      setIsVerifiedGlow(false);
      setOtpLiveTag("Awaiting Code");
      return;
    }

    // If user pasted or typed multiple digits in a single input
    if (clean.length >= 6) {
      fillCodeFromDigits(clean, "manual");
      return;
    }

    const char = clean.slice(-1);
    const nextSlots = [...otpSlots];
    nextSlots[index] = char;
    setOtpSlots(nextSlots);
    const count = nextSlots.filter(Boolean).length;
    setFilledSlots(count);

    if (char && index < 5) {
      otpInputsRef.current[index + 1]?.focus();
    }

    if (count === 6) {
      setIsVerifiedGlow(true);
      setOtpLiveTag("Code Ready ✓");
      const codeStr = nextSlots.join("");
      setOtpStatusText(`Code ${codeStr.slice(0, 3)} ${codeStr.slice(3)} authenticated ✓`);
    } else {
      setIsVerifiedGlow(false);
      setOtpLiveTag(`${count}/6 entered`);
    }
  };

  const handleSlotKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otpSlots[index] && index > 0) {
      otpInputsRef.current[index - 1]?.focus();
    } else if (e.key === "ArrowLeft" && index > 0) {
      otpInputsRef.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      otpInputsRef.current[index + 1]?.focus();
    }
  };

  const handleClearOtp = () => {
    setOtpSlots(["", "", "", "", "", ""]);
    setFilledSlots(0);
    setIsVerifiedGlow(false);
    setOtpLiveTag("Awaiting Code");
    setOtpStatusText("Copy 6-digit access code to clipboard to auto-fill");
    lastClipboardCodeRef.current = "";
    otpInputsRef.current[0]?.focus();
  };

  // =========================================================================
  // 2. SPRING-DAMPED MAGNETIC GLIDE & SPECULAR CHAMFER BORDER
  // =========================================================================
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    let targetX = 0, targetY = 0, currentX = 0, currentY = 0;
    let targetRotX = 0, targetRotY = 0, currentRotX = 0, currentRotY = 0;
    let targetSpotX = 190, targetSpotY = 0, currentSpotX = 190, currentSpotY = 0;
    let rafId = 0;

    const onMouseMove = (e: MouseEvent) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const midX = rect.width / 2;
      const midY = rect.height / 2;

      targetRotY = ((x - midX) / midX) * 4;
      targetRotX = -((y - midY) / midY) * 4;
      targetX = ((x - midX) / midX) * 3.5;
      targetY = ((y - midY) / midY) * 3.5;
      targetSpotX = x;
      targetSpotY = y;
    };

    const onMouseLeave = () => {
      targetRotX = 0;
      targetRotY = 0;
      targetX = 0;
      targetY = 0;
      targetSpotX = card.clientWidth / 2;
      targetSpotY = 0;
    };

    const springLoop = () => {
      currentRotX += (targetRotX - currentRotX) * 0.12;
      currentRotY += (targetRotY - currentRotY) * 0.12;
      currentX += (targetX - currentX) * 0.12;
      currentY += (targetY - currentY) * 0.12;
      currentSpotX += (targetSpotX - currentSpotX) * 0.15;
      currentSpotY += (targetSpotY - currentSpotY) * 0.15;

      card.style.transform = `perspective(1400px) rotateX(${currentRotX.toFixed(2)}deg) rotateY(${currentRotY.toFixed(2)}deg) translate3d(${currentX.toFixed(1)}px, ${currentY.toFixed(1)}px, 0px)`;
      card.style.setProperty("--mouse-x", `${currentSpotX.toFixed(1)}px`);
      card.style.setProperty("--mouse-y", `${currentSpotY.toFixed(1)}px`);

      if (logoRef.current) {
        logoRef.current.style.transform = `translate3d(${(currentX * 0.35).toFixed(1)}px, ${(currentY * 0.35).toFixed(1)}px, 12px)`;
      }

      rafId = requestAnimationFrame(springLoop);
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    card.addEventListener("mouseleave", onMouseLeave);
    rafId = requestAnimationFrame(springLoop);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      card.removeEventListener("mouseleave", onMouseLeave);
      cancelAnimationFrame(rafId);
    };
  }, []);

  // =========================================================================
  // 3. AUTONOMOUS DOT-MATRIX BACKGROUND CANVAS
  // =========================================================================
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);
    const spacing = 36;
    let cols = Math.floor(w / spacing);
    let rows = Math.floor(h / spacing);
    let tick = 0;
    let animId = 0;

    const resize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
      cols = Math.floor(w / spacing);
      rows = Math.floor(h / spacing);
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      tick += 0.018;

      const isDark = document.documentElement.getAttribute("data-theme") === "light-dark" ||
        window.matchMedia("(prefers-color-scheme: dark)").matches;
      const baseAlpha = isDark ? 0.14 : 0.09;
      const dotColor = isDark ? "203, 213, 225" : "15, 23, 42";

      for (let i = 0; i <= cols; i++) {
        for (let j = 0; j <= rows; j++) {
          const x = i * spacing;
          const y = j * spacing;
          const wave = Math.sin(tick + i * 0.22 + j * 0.18);
          const alpha = baseAlpha + wave * 0.055;
          const radius = 1 + wave * 0.35;

          ctx.beginPath();
          ctx.arc(x, y, Math.max(0.6, radius), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${dotColor}, ${alpha.toFixed(3)})`;
          ctx.fill();
        }
      }

      animId = requestAnimationFrame(draw);
    };

    window.addEventListener("resize", resize);
    animId = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animId);
    };
  }, []);

  // =========================================================================
  // 4. GOOGLE OAUTH SIGN-IN HANDLER
  // =========================================================================
  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    setBanner(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const origin = window.location.origin;
      const redirectUri = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectUri,
        },
      });

      if (error) {
        triggerCardShake();
        setBanner({ message: error.message || "Failed to initialize Google Sign-In.", type: "error" });
        setIsGoogleLoading(false);
      } else if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err: unknown) {
      triggerCardShake();
      const msg = err instanceof Error ? err.message : "Could not connect to Google.";
      setBanner({ message: msg, type: "error" });
      setIsGoogleLoading(false);
    }
  };

  // =========================================================================
  // 5. EMAIL & PASSWORD FORM SUBMISSION
  // =========================================================================
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBanner(null);

    if (isSignUp && !fullName.trim()) {
      triggerCardShake();
      setBanner({ message: "Please enter your full name or business name.", type: "error" });
      return;
    }

    if (!email.trim() || !isEmailValid) {
      triggerCardShake();
      setBanner({ message: "Please enter a valid email address.", type: "error" });
      return;
    }

    if (!password || password.length < 6) {
      triggerCardShake();
      setBanner({ message: "Please enter a password with at least 6 characters.", type: "error" });
      return;
    }

    // Execute server action transition
    startTransition(async () => {
      const formData = new FormData();
      formData.set("email", email.trim().toLowerCase());
      formData.set("password", password);
      formData.set("next", next);
      if (isSignUp) {
        formData.set("businessName", fullName.trim() || "My Business");
      }

      const actionFn = isSignUp ? signUpAction : signInAction;
      const res = await actionFn({}, formData);

      if (res?.error) {
        triggerCardShake();
        setBanner({ message: res.error, type: "error" });
      } else if (res?.success) {
        setBanner({ message: res.success, type: "success" });
        setSuccessData({
          email: email.trim().toLowerCase(),
          method: isSignUp ? "Account Registration" : "Email & Password",
          code: otpSlots.join("") || "Verified",
          displayName: fullName.trim() || email.split("@")[0] || "Nodus Member",
        });
      }
    });
  };

  return (
    <div className="login-executive-page bg-grid selection:bg-slate-500 selection:text-white">
      {/* Autonomous Dot-Matrix Background Canvas */}
      <canvas ref={canvasRef} id="dotMatrixCanvas" aria-hidden="true" />

      {/* Ambient Floating Orbs */}
      <div className="ambient-orb orb-1" aria-hidden="true" />
      <div className="ambient-orb orb-2" aria-hidden="true" />
      <div className="ambient-orb orb-3" aria-hidden="true" />

      {/* Centered Login Card Container (Fluid on mobile, centered on desktop) */}
      <main className="fixed-center-stage">
        <div className="card-perspective w-full">
          <div
            ref={cardRef}
            className={`login-card ${isShaking ? "shake" : ""}`}
            style={{ minHeight: isSignUp ? "590px" : "550px" }}
          >
            {/* Specular border chamfer & top highlight */}
            <div className="chamfer-border" />
            <div className="top-highlight" />

            {!isSuccess ? (
              /* VIEW 1: Main Authentication Card Form */
              <div className="relative z-10">
                {/* Brand Emblem & Header */}
                <div className="stagger-item delay-1 text-center mb-3">
                  <Link
                    href="/"
                    className="inline-block group focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 rounded-2xl"
                    aria-label="Nodus Home"
                  >
                    <div
                      ref={logoRef}
                      className="relative inline-flex items-center justify-center w-11 h-11 rounded-2xl mb-1.5 shadow-sm transition-transform duration-300 group-hover:scale-105 select-none"
                      style={{
                        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
                        color: "#f8fafc",
                        boxShadow: "0 8px 18px -4px rgba(15, 23, 42, 0.25), inset 0 1px 1px rgba(255, 255, 255, 0.15)",
                      }}
                    >
                      <span className="font-sans font-bold text-2xl tracking-tighter lowercase leading-none text-white -mt-0.5">
                        n
                      </span>
                      <span
                        className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-white dark:ring-slate-900"
                        title="Nodus Network Active"
                      />
                    </div>
                  </Link>

                  <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                    {isSignUp ? "Create Your Nodus Account" : "Welcome Back To Nodus"}
                  </h1>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                    {isSignUp
                      ? "Create your merchant profile and start accepting frictionless crypto payments."
                      : "Sign in to manage invoices, payments, and checkout settings."}
                  </p>
                </div>

                {/* Mode Switcher (Sign In / Create Account) */}
                <div className="stagger-item delay-2 tab-pill-container mb-3">
                  <div
                    className="tab-indicator"
                    style={{ transform: isSignUp ? "translateX(100%)" : "translateX(0%)" }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setIsSignUp(false);
                      setBanner(null);
                    }}
                    className="relative z-10 py-1.5 text-xs font-semibold tracking-wide rounded-lg transition-colors duration-200"
                    style={{ color: !isSignUp ? "var(--text-primary)" : "var(--text-secondary)" }}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSignUp(true);
                      setBanner(null);
                    }}
                    className="relative z-10 py-1.5 text-xs font-semibold tracking-wide rounded-lg transition-colors duration-200"
                    style={{ color: isSignUp ? "var(--text-primary)" : "var(--text-secondary)" }}
                  >
                    Create Account
                  </button>
                </div>

                {/* Google Sign In Option */}
                <div className="stagger-item delay-2 mb-3">
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={isGoogleLoading || isPending}
                    className="google-btn w-full py-2.5 px-3.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2.5 shadow-xs disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isGoogleLoading ? (
                      <span className="w-4 h-4 border-2 border-slate-600 dark:border-slate-300 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                        />
                      </svg>
                    )}
                    <span>
                      {isGoogleLoading
                        ? "Connecting to Google..."
                        : isSignUp
                        ? "Sign up with Google"
                        : "Continue with Google"}
                    </span>
                  </button>
                </div>

                {/* Elegant Hairline Divider */}
                <div className="stagger-item delay-2 relative flex items-center justify-center mb-3">
                  <div className="w-full border-t" style={{ borderColor: "var(--card-border)" }} />
                  <span
                    className="px-2.5 text-[10px] uppercase tracking-wider font-semibold whitespace-nowrap"
                    style={{ color: "var(--text-muted)", background: "var(--card-surface)" }}
                  >
                    or with credentials
                  </span>
                  <div className="w-full border-t" style={{ borderColor: "var(--card-border)" }} />
                </div>

                {/* Inline Notification Banner */}
                {banner && (
                  <div
                    className={`mb-2.5 px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-2 border ${
                      banner.type === "error"
                        ? "bg-rose-500/10 text-rose-500 border-rose-500/20"
                        : banner.type === "success"
                        ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                        : "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20"
                    }`}
                    role="alert"
                  >
                    {banner.type === "error" ? (
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    <span className="flex-1">{banner.message}</span>
                  </div>
                )}

                {/* Main Form */}
                <form onSubmit={handleSubmit} noValidate>
                  {/* Expandable Full Name Field (for Create Account mode) */}
                  <div className={`expandable-section ${isSignUp ? "open" : ""}`}>
                    <div className="expandable-inner pt-0.5">
                      <div className="input-group">
                        <input
                          id="fullNameInput"
                          name="fullName"
                          type="text"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder=" "
                          autoComplete="name"
                          className="premium-input"
                        />
                        <label htmlFor="fullNameInput" className="floating-label">Full name or business name</label>
                        <svg className="input-icon w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Email Input */}
                  <div className="stagger-item delay-3 mb-2.5">
                    <div className="input-group">
                      <input
                        id="emailInput"
                        name="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder=" "
                        autoComplete="email"
                        required
                        className="premium-input"
                      />
                      <label htmlFor="emailInput" className="floating-label">Email address</label>
                      <svg className="input-icon w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      {isEmailValid && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Password Input Container */}
                  <div className="stagger-item delay-4 expandable-section open">
                    <div className="expandable-inner pt-0.5">
                      <div className="input-group relative">
                        <input
                          id="passwordInput"
                          name="password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder=" "
                          autoComplete={isSignUp ? "new-password" : "current-password"}
                          className="premium-input pr-11"
                        />
                        <label htmlFor="passwordInput" className="floating-label">Password</label>
                        <svg className="input-icon w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>

                        {/* Responsive Show/Hide Password Button */}
                        <button
                          type="button"
                          onClick={() => setShowPassword((prev) => !prev)}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg transition-all text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 cursor-pointer"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          title={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M3 3l18 18" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          )}
                        </button>
                      </div>

                      {/* Dynamic Password Strength Bar */}
                      {password && (
                        <div className="mt-1.5 px-1">
                          <div className="flex items-center justify-between text-[10px] mb-0.5">
                            <span style={{ color: "var(--text-muted)" }}>Security strength</span>
                            <span className="font-medium" style={{ color: "var(--text-secondary)" }}>
                              {strengthLabels[passwordStrength - 1] ?? "Weak"}
                            </span>
                          </div>
                          <div className="grid grid-cols-4 gap-1.5 h-1">
                            {[0, 1, 2, 3].map((idx) => (
                              <div
                                key={idx}
                                className={`rounded-full transition-colors duration-300 ${
                                  idx < passwordStrength
                                    ? strengthColors[passwordStrength - 1]
                                    : "bg-slate-300/50 dark:bg-slate-700/50"
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 6-DIGIT CODE SECTION: KEYBOARD / CLIPBOARD AUTO-DETECTION */}
                  <div
                    className="stagger-item delay-4 mb-3 p-2.5 rounded-2xl transition-all"
                    style={{ background: "var(--pill-bg)", border: "1px solid var(--card-border)" }}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isVerifiedGlow ? "bg-emerald-500" : "bg-sky-500 animate-pulse"
                          }`}
                        />
                        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                          6-Digit Access Code
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                            isVerifiedGlow
                              ? "bg-emerald-500/15 text-emerald-500"
                              : "bg-sky-500/10 text-sky-500"
                          }`}
                        >
                          {otpLiveTag}
                        </span>
                        {filledSlots > 0 ? (
                          <button
                            type="button"
                            onClick={handleClearOtp}
                            className="text-[10px] font-semibold underline decoration-dotted underline-offset-2 hover:opacity-80 cursor-pointer"
                            style={{ color: "var(--text-muted)" }}
                          >
                            Clear
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handleDetectClipboardClick}
                            className="text-[10px] font-semibold underline decoration-dotted underline-offset-2 hover:opacity-80 flex items-center gap-1 cursor-pointer"
                            style={{ color: "var(--text-primary)" }}
                            title="Paste 6-digit code from clipboard"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                            </svg>
                            Paste
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 6-Digit Interactive Slots with Auto-Advance & Paste detection */}
                    <div
                      className="grid grid-cols-6 gap-1.5 mb-1.5"
                      onPaste={handleOtpPaste}
                    >
                      {otpSlots.map((digit, idx) => (
                        <div
                          key={idx}
                          onClick={() => otpInputsRef.current[idx]?.focus()}
                          className={`otp-slot font-mono-code cursor-text ${
                            activeSlot === idx ? "active-typing" : ""
                          } ${digit ? "filled" : ""} ${isVerifiedGlow ? "verified-glow" : ""}`}
                        >
                          <input
                            ref={(el) => {
                              otpInputsRef.current[idx] = el;
                            }}
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={1}
                            value={digit}
                            onChange={(e) => handleSlotChange(idx, e.target.value)}
                            onKeyDown={(e) => handleSlotKeyDown(idx, e)}
                            onFocus={() => setActiveSlot(idx)}
                            onBlur={() => setActiveSlot(-1)}
                            className="w-full h-full text-center bg-transparent outline-none font-mono-code font-bold text-[0.98rem] text-inherit cursor-text"
                            aria-label={`Digit ${idx + 1}`}
                          />
                        </div>
                      ))}
                    </div>

                    {/* Animated Text Stream for Entered Code */}
                    <div className="flex items-center justify-between text-[10px] px-0.5">
                      <div className="font-mono-code truncate text-[10px]" style={{ color: "var(--text-secondary)" }}>
                        {otpStatusText}
                      </div>
                      <span className="font-mono-code font-semibold ml-2" style={{ color: "var(--text-primary)" }}>
                        {filledSlots}/6
                      </span>
                    </div>
                  </div>

                  {/* Remember Me & Forgot Password Row */}
                  <div className="stagger-item delay-4 flex items-center justify-between mb-3 text-xs">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="custom-check"
                      />
                      <span style={{ color: "var(--text-secondary)" }}>Keep me signed in</span>
                    </label>
                    <Link
                      href="/forgot-password"
                      className="font-medium hover:underline transition-opacity"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Forgot password?
                    </Link>
                  </div>

                  {/* Primary Submit CTA */}
                  <div className="stagger-item delay-5">
                    <button
                      type="submit"
                      disabled={isPending}
                      className="btn-primary w-full py-2.5 px-4 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 shadow-sm disabled:opacity-65 cursor-pointer"
                    >
                      <span>
                        {isPending
                          ? "Authenticating…"
                          : isSignUp
                          ? "Create Nodus Account"
                          : "Sign in to Nodus"}
                      </span>
                      {!isPending ? (
                        <svg className="w-3.5 h-3.5 transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                          <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </form>

                {/* Footer Switcher */}
                <p className="mt-3.5 text-center text-xs" style={{ color: "var(--text-secondary)" }}>
                  {isSignUp ? (
                    <>
                      Already have an account?{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setIsSignUp(false);
                          setBanner(null);
                        }}
                        className="font-semibold underline underline-offset-2 hover:opacity-80 cursor-pointer"
                        style={{ color: "var(--text-primary)" }}
                      >
                        Sign in
                      </button>
                    </>
                  ) : (
                    <>
                      New to Nodus?{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setIsSignUp(true);
                          setBanner(null);
                        }}
                        className="font-semibold underline underline-offset-2 hover:opacity-80 cursor-pointer"
                        style={{ color: "var(--text-primary)" }}
                      >
                        Create an account
                      </button>
                    </>
                  )}
                </p>
              </div>
            ) : (
              /* VIEW 2: Animated Authenticated Success State View */
              <div className="relative z-10 py-3 text-center">
                <div
                  className="w-14 h-14 mx-auto mb-3 flex items-center justify-center rounded-full"
                  style={{ background: "var(--pill-bg)" }}
                >
                  <svg className="w-9 h-9 text-emerald-500" viewBox="0 0 52 52" fill="none">
                    <circle className="check-circle" cx="26" cy="26" r="24" stroke="currentColor" strokeWidth="3" fill="none" />
                    <path className="check-mark" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
                  </svg>
                </div>

                <span className="inline-block text-[10px] font-semibold uppercase tracking-widest px-2.5 py-0.5 rounded-full mb-1.5 bg-emerald-500/10 text-emerald-500">
                  Authentication Verified · Active Session
                </span>
                <h2 className="text-lg font-bold tracking-tight mb-0.5">Welcome to Nodus</h2>
                <p className="text-xs mb-4" style={{ color: "var(--text-secondary)" }}>
                  {successData.email ? `Signed in as ${successData.email}` : "Cryptographic session established."}
                </p>

                {/* Mini Session Telemetry Card */}
                <div
                  className="rounded-2xl p-3.5 mb-4 text-left text-xs space-y-1.5"
                  style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)" }}
                >
                  <div className="flex justify-between">
                    <span style={{ color: "var(--text-muted)" }}>Authentication Method</span>
                    <span className="font-medium">{successData.method}</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: "var(--text-muted)" }}>Security Status</span>
                    <span className="font-mono-code font-semibold text-emerald-500">Verified ✓</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: "var(--text-muted)" }}>Destination</span>
                    <span className="font-medium">{next}</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => router.push(next)}
                    className="btn-primary flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    Enter Workspace →
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSuccess(false);
                      handleClearOtp();
                    }}
                    className="py-2.5 px-3 rounded-xl text-xs font-semibold hover:opacity-90 cursor-pointer"
                    style={{ background: "var(--pill-bg)", border: "1px solid var(--card-border)", color: "var(--text-primary)" }}
                  >
                    Reset
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Responsive Footer Links */}
      <footer
        className="relative z-10 text-center pt-5 pb-2 px-4 text-xs pointer-events-auto"
        style={{ color: "var(--text-muted)" }}
      >
        <div className="flex items-center justify-center gap-3 text-[11px]">
          <Link href="/" className="hover:underline transition-opacity">
            ← Home
          </Link>
          <span>·</span>
          <Link href="/pay/demo" className="hover:underline transition-opacity">
            Checkout Demo
          </Link>
          <span>·</span>
          <span>© {new Date().getFullYear()} Nodus</span>
        </div>
      </footer>
    </div>
  );
}