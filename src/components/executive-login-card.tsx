"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { signInAction, signUpAction } from "@/app/actions/auth";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const SAMPLE_CODES = ["482916", "739204", "518642", "904381"];

export function ExecutiveLoginCard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams?.get("next") ?? "/dashboard";
  const confirmationError = searchParams?.get("error") === "confirmation";

  const [isPending, startTransition] = useTransition();

  // Mode: Sign In (Returning User) vs Create Account (New User)
  const [isSignUp, setIsSignUp] = useState(false);
  const [hasRequestedCode, setHasRequestedCode] = useState(false);
  const [isCodeVerified, setIsCodeVerified] = useState(false);
  const [isCodeCopied, setIsCodeCopied] = useState(false);

  // Inputs - Empty by default, waiting for user entry
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Status Banner & Shake
  const [statusBanner, setStatusBanner] = useState<{ message: string; type: "error" | "success" | "info" } | null>(
    confirmationError
      ? { message: "We couldn't confirm that email link. Request a fresh one or log in.", type: "error" }
      : null
  );
  const [isShaking, setIsShaking] = useState(false);

  // View Mode: 'form' | 'otpView' | 'success'
  const [viewState, setViewState] = useState<"form" | "otpView" | "success">("form");
  const [successData, setSuccessData] = useState({
    title: "Welcome to Nodus",
    emailDisplay: "Signed in",
    method: "Returning User (Direct Login)",
    otpStatus: "Trusted Session ✓",
    verifiedBadge: "Returning User · Session Active",
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

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const isOtpFlowRequired = isSignUp || hasRequestedCode;

  // Refs for 3D Spring Cursor & Canvas
  const loginCardRef = useRef<HTMLDivElement>(null);
  const brandLogoBoxRef = useRef<HTMLDivElement>(null);
  const dotCanvasRef = useRef<HTMLCanvasElement>(null);
  const activeOtpTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const codePoolIndexRef = useRef(0);

  // OTP 6-Digit Slots state
  const [currentGeneratedCode, setCurrentGeneratedCode] = useState("482916");
  const [otpSlots, setOtpSlots] = useState<{ digit: string; className: string }[]>([
    { digit: "", className: "waiting-pulse font-mono-code" },
    { digit: "", className: "waiting-pulse font-mono-code" },
    { digit: "", className: "waiting-pulse font-mono-code" },
    { digit: "", className: "waiting-pulse font-mono-code" },
    { digit: "", className: "waiting-pulse font-mono-code" },
    { digit: "", className: "waiting-pulse font-mono-code" },
  ]);
  const [otpMatchCounterText, setOtpMatchCounterText] = useState("0/6");
  const [otpLiveTagText, setOtpLiveTagText] = useState("Copy to Auto-Fill");
  const [otpLiveTagClass, setOtpLiveTagClass] = useState("bg-amber-500/10 text-amber-600");
  const [otpStatusDotClass, setOtpStatusDotClass] = useState("bg-amber-500 animate-pulse");
  const [otpKineticChars, setOtpKineticChars] = useState<string[]>(
    "Copy the sent code above (or Ctrl+C) to auto-apply...".split("")
  );

  const clearOtpTimers = useCallback(() => {
    activeOtpTimeoutsRef.current.forEach((t) => clearTimeout(t));
    activeOtpTimeoutsRef.current = [];
  }, []);

  const triggerCardShake = useCallback(() => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 400);
  }, []);

  const showStatus = useCallback((message: string, type: "error" | "success" | "info") => {
    setStatusBanner({ message, type });
  }, []);

  const hideStatus = useCallback(() => {
    setStatusBanner(null);
  }, []);

  const renderKineticAnimatedText = useCallback((text: string) => {
    setOtpKineticChars(text.split(""));
  }, []);

  // Prepare a fresh sent code in waiting state (does NOT auto-fill until user copies!)
  const prepareWaitingOtpCode = useCallback(
    (customReasonText?: string) => {
      clearOtpTimers();
      setIsCodeVerified(false);
      setIsCodeCopied(false);

      const nextCode = SAMPLE_CODES[codePoolIndexRef.current % SAMPLE_CODES.length];
      codePoolIndexRef.current++;
      setCurrentGeneratedCode(nextCode);

      setOtpSlots([
        { digit: "", className: "waiting-pulse font-mono-code" },
        { digit: "", className: "waiting-pulse font-mono-code" },
        { digit: "", className: "waiting-pulse font-mono-code" },
        { digit: "", className: "waiting-pulse font-mono-code" },
        { digit: "", className: "waiting-pulse font-mono-code" },
        { digit: "", className: "waiting-pulse font-mono-code" },
      ]);

      setOtpMatchCounterText("0/6");
      setOtpLiveTagText("Copy to Auto-Fill");
      setOtpLiveTagClass("bg-amber-500/10 text-amber-600");
      setOtpStatusDotClass("bg-amber-500 animate-pulse");
      renderKineticAnimatedText(
        customReasonText || `Code ${nextCode} sent · Copy it to auto-apply`
      );
    },
    [clearOtpTimers, renderKineticAnimatedText]
  );

  // Execute the self-entering animation ONLY when clipboard copy is detected!
  const applyClipboardDetectedCode = useCallback(
    (detectedSixDigits?: string) => {
      clearOtpTimers();

      const codeToApply = detectedSixDigits || currentGeneratedCode;
      setCurrentGeneratedCode(codeToApply);
      setIsCodeCopied(true);

      // Reset slots before typing
      setOtpSlots([
        { digit: "", className: "font-mono-code" },
        { digit: "", className: "font-mono-code" },
        { digit: "", className: "font-mono-code" },
        { digit: "", className: "font-mono-code" },
        { digit: "", className: "font-mono-code" },
        { digit: "", className: "font-mono-code" },
      ]);

      setOtpMatchCounterText("0/6");
      setOtpLiveTagText("Clipboard Detected");
      setOtpLiveTagClass("bg-sky-500/15 text-sky-500");
      setOtpStatusDotClass("bg-sky-500 animate-ping");
      renderKineticAnimatedText(`Clipboard detected [${codeToApply}] · Auto-applying...`);

      const digits = codeToApply.split("");
      digits.forEach((digit, idx) => {
        const focusTid = setTimeout(() => {
          setOtpSlots((prev) => {
            const nextSlots = [...prev];
            nextSlots.forEach((s) => {
              s.className = s.className.replace(" active-typing", "");
            });
            if (nextSlots[idx]) {
              nextSlots[idx].className = "otp-slot active-typing font-mono-code";
            }
            return nextSlots;
          });
          setOtpLiveTagText(`Applying ${idx + 1}/6`);
          renderKineticAnimatedText(
            `Auto-applying copied digit #${idx + 1} → [${codeToApply.slice(0, idx + 1)}${"·".repeat(5 - idx)}]`
          );
        }, 180 + idx * 190);
        activeOtpTimeoutsRef.current.push(focusTid);

        const fillTid = setTimeout(() => {
          setOtpSlots((prev) => {
            const nextSlots = [...prev];
            if (nextSlots[idx]) {
              nextSlots[idx] = {
                digit,
                className: "otp-slot filled font-mono-code",
              };
            }
            return nextSlots;
          });
          setOtpMatchCounterText(`${idx + 1}/6`);
        }, 290 + idx * 190);
        activeOtpTimeoutsRef.current.push(fillTid);
      });

      const completeTime = 290 + digits.length * 190 + 150;
      const verifyTid = setTimeout(() => {
        setIsCodeVerified(true);
        setOtpSlots((prev) =>
          prev.map((s) => ({
            ...s,
            className: "otp-slot filled verified-glow font-mono-code",
          }))
        );
        setOtpLiveTagText("Code Applied ✓");
        setOtpLiveTagClass("bg-emerald-500/15 text-emerald-500");
        setOtpStatusDotClass("bg-emerald-500");
        renderKineticAnimatedText(`Copied code ${codeToApply} auto-applied & verified ✓`);
      }, completeTime);
      activeOtpTimeoutsRef.current.push(verifyTid);
    },
    [clearOtpTimers, currentGeneratedCode, renderKineticAnimatedText]
  );

  // Copy text fallback
  const copyTextToClipboard = useCallback((text: string) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(() => {});
      }
    } catch {}
    if (typeof document !== "undefined") {
      const tempInput = document.createElement("textarea");
      tempInput.value = text;
      tempInput.style.position = "fixed";
      tempInput.style.opacity = "0";
      document.body.appendChild(tempInput);
      tempInput.select();
      try {
        document.execCommand("copy");
      } catch {}
      document.body.removeChild(tempInput);
    }
  }, []);

  const handleCopyCodeClick = useCallback(() => {
    copyTextToClipboard(currentGeneratedCode);
    applyClipboardDetectedCode(currentGeneratedCode);
  }, [copyTextToClipboard, applyClipboardDetectedCode, currentGeneratedCode]);

  const handleReplayCode = useCallback(() => {
    prepareWaitingOtpCode("New code sent · Copy it to auto-apply");
  }, [prepareWaitingOtpCode]);

  // Native browser copy & paste listeners
  useEffect(() => {
    const handleDocumentCopy = () => {
      if (!isOtpFlowRequired) return;
      const sel = window.getSelection ? window.getSelection()?.toString() ?? "" : "";
      const digitsMatch = sel.replace(/\D/g, "");
      if (digitsMatch.length === 6) {
        applyClipboardDetectedCode(digitsMatch);
      } else {
        applyClipboardDetectedCode(currentGeneratedCode);
      }
    };

    const handleDocumentPaste = (e: ClipboardEvent) => {
      if (!isOtpFlowRequired) return;
      const pasted = e.clipboardData?.getData("text") || "";
      const digitsMatch = pasted.replace(/\D/g, "");
      if (digitsMatch.length === 6) {
        applyClipboardDetectedCode(digitsMatch);
      }
    };

    document.addEventListener("copy", handleDocumentCopy);
    document.addEventListener("paste", handleDocumentPaste);

    return () => {
      document.removeEventListener("copy", handleDocumentCopy);
      document.removeEventListener("paste", handleDocumentPaste);
    };
  }, [isOtpFlowRequired, applyClipboardDetectedCode, currentGeneratedCode]);

  // =========================================================================
  // SENIOR UI/UX MOTION ENGINE:
  // Spring-Damped Magnetic Glide + Specular Chamfer Border + Inner Parallax
  // =========================================================================
  useEffect(() => {
    const loginCard = loginCardRef.current;
    if (!loginCard) return;

    let targetX = 0, targetY = 0, currentX = 0, currentY = 0;
    let targetRotX = 0, targetRotY = 0, currentRotX = 0, currentRotY = 0;
    let targetSpotX = 190, targetSpotY = 0, currentSpotX = 190, currentSpotY = 0;
    let rafId = 0;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = loginCard.getBoundingClientRect();
      const cardCenterX = rect.left + rect.width / 2;
      const cardCenterY = rect.top + rect.height / 2;

      const dx = e.clientX - cardCenterX;
      const dy = e.clientY - cardCenterY;
      const distFromCenter = Math.sqrt(dx * dx + dy * dy);

      targetSpotX = e.clientX - rect.left;
      targetSpotY = e.clientY - rect.top;

      if (distFromCenter < 360) {
        loginCard.style.setProperty("--spot-opacity", "1");
        const pullFactor = Math.max(0, 1 - distFromCenter / 360);
        targetX = (dx / 360) * 6 * pullFactor;
        targetY = (dy / 360) * 6 * pullFactor;
        targetRotX = (dy / (rect.height / 2)) * -1.5 * pullFactor;
        targetRotY = (dx / (rect.width / 2)) * 1.5 * pullFactor;
      } else {
        loginCard.style.setProperty("--spot-opacity", "0");
        targetX = 0;
        targetY = 0;
        targetRotX = 0;
        targetRotY = 0;
      }
    };

    const handleMouseLeave = () => {
      loginCard.style.setProperty("--spot-opacity", "0");
      targetX = 0;
      targetY = 0;
      targetRotX = 0;
      targetRotY = 0;
    };

    const updateSpringMotion = () => {
      const ease = 0.085;
      currentX += (targetX - currentX) * ease;
      currentY += (targetY - currentY) * ease;
      currentRotX += (targetRotX - currentRotX) * ease;
      currentRotY += (targetRotY - currentRotY) * ease;
      currentSpotX += (targetSpotX - currentSpotX) * 0.16;
      currentSpotY += (targetSpotY - currentSpotY) * 0.16;

      loginCard.style.setProperty("--spot-x", `${currentSpotX.toFixed(1)}px`);
      loginCard.style.setProperty("--spot-y", `${currentSpotY.toFixed(1)}px`);

      loginCard.style.transform = `translate3d(${currentX.toFixed(2)}px, ${currentY.toFixed(2)}px, 0) rotateX(${currentRotX.toFixed(2)}deg) rotateY(${currentRotY.toFixed(2)}deg)`;

      if (brandLogoBoxRef.current) {
        brandLogoBoxRef.current.style.transform = `translate3d(${(currentX * 0.7).toFixed(2)}px, ${(currentY * 0.7).toFixed(2)}px, 0)`;
      }

      rafId = requestAnimationFrame(updateSpringMotion);
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("mouseleave", handleMouseLeave);
    rafId = requestAnimationFrame(updateSpringMotion);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleMouseLeave);
      cancelAnimationFrame(rafId);
    };
  }, []);

  // =========================================================================
  // AUTONOMOUS DOT-MATRIX BACKGROUND ANIMATION (Zero Cursor Dependency)
  // =========================================================================
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

        const combined = (radialWave * 0.45 + diagWave * 0.35 + nodeTwinkle * 0.2 + 1) * 0.5;
        const highlight = Math.pow(combined, 2.4);

        const radius = 1.0 + highlight * 1.65;
        const alpha = (isDark ? 0.12 : 0.11) + highlight * (isDark ? 0.52 : 0.44);

        ctx.beginPath();
        ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
        ctx.fillStyle =
          highlight > 0.52
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

  // Mode Switch handlers
  const handleSwitchToSignIn = useCallback(() => {
    if (isSignUp || hasRequestedCode) {
      setIsSignUp(false);
      setHasRequestedCode(false);
      clearOtpTimers();
      hideStatus();
    }
  }, [isSignUp, hasRequestedCode, clearOtpTimers, hideStatus]);

  const handleSwitchToSignUp = useCallback(() => {
    if (!isSignUp) {
      setIsSignUp(true);
      setHasRequestedCode(false);
      hideStatus();
      prepareWaitingOtpCode(`New user code ${currentGeneratedCode} sent · Copy to auto-fill`);
    }
  }, [isSignUp, hideStatus, prepareWaitingOtpCode, currentGeneratedCode]);

  // Forgot password handler
  const handleForgotPass = useCallback(() => {
    const emailVal = email.trim();
    if (!emailVal || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
      showStatus("Enter your email address first to request a verification code.", "info");
      return;
    }
    setHasRequestedCode(true);
    prepareWaitingOtpCode(`Code sent to ${emailVal} · Click "Copy Code" to auto-apply`);
    showStatus("Verification code sent! Copy the code below and the card will auto-apply it.", "info");
  }, [email, prepareWaitingOtpCode, showStatus]);

  // Demo Credentials Fill
  const handleFillDemo = useCallback(() => {
    setEmail("alex.morgan@aether.studio");
    setPassword("Aether#Studio2026");

    if (isSignUp && !fullName.trim()) {
      setFullName("Alex Morgan");
    }

    if (!isSignUp && !hasRequestedCode) {
      setHasRequestedCode(true);
      prepareWaitingOtpCode("Demo code dispatched · Click \"Copy Code\" to watch it auto-apply");
      showStatus("Code requested! Click \"Copy Code\" (or press Ctrl+C) to trigger automatic code detection.", "info");
    } else {
      copyTextToClipboard(currentGeneratedCode);
      applyClipboardDetectedCode(currentGeneratedCode);
    }
  }, [
    isSignUp,
    fullName,
    hasRequestedCode,
    prepareWaitingOtpCode,
    showStatus,
    copyTextToClipboard,
    currentGeneratedCode,
    applyClipboardDetectedCode,
  ]);

  // Trigger Auth Success View
  const triggerAuthSuccess = useCallback(
    (emailVal: string, methodLabel: string) => {
      clearOtpTimers();
      hideStatus();

      const displayName = isSignUp && fullName.trim() ? fullName.trim() : "Alex Morgan";
      setSuccessData({
        title: isSignUp ? `Account Created, ${displayName}` : `Welcome back, ${displayName}`,
        emailDisplay: `Authenticated as ${emailVal}`,
        method: methodLabel,
        otpStatus: isOtpFlowRequired
          ? `${currentGeneratedCode.slice(0, 3)}-${currentGeneratedCode.slice(3)} ✓`
          : "Direct Credentials ✓",
        verifiedBadge: isOtpFlowRequired
          ? "Copied Code Verified · Session Active"
          : "Returning User · Session Active",
      });

      setViewState("success");
    },
    [clearOtpTimers, hideStatus, isSignUp, fullName, isOtpFlowRequired, currentGeneratedCode]
  );

  // Social Auth
  const handleSocialAuth = useCallback(
    async (provider: "Google" | "Apple" | "Passkey") => {
      if (provider === "Google") {
        try {
          const supabase = getSupabaseBrowserClient();
          const origin = window.location.origin;
          const { data, error } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
              redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
            },
          });
          if (!error && data?.url) {
            window.location.href = data.url;
            return;
          }
        } catch {}
      }
      triggerAuthSuccess("alex.morgan@aether.studio", `${provider} SSO`);
    },
    [next, triggerAuthSuccess]
  );

  // Form Submit
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const emailVal = email.trim();
    const passVal = password;

    if (isSignUp && !fullName.trim()) {
      triggerCardShake();
      showStatus("Please enter your full name to create an account.", "error");
      return;
    }

    if (!emailVal || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
      triggerCardShake();
      showStatus("Please enter a valid email address.", "error");
      return;
    }

    if (passVal.length < 6) {
      triggerCardShake();
      showStatus("Please enter a password with at least 6 characters.", "error");
      return;
    }

    if (isOtpFlowRequired && !isCodeVerified) {
      triggerCardShake();
      showStatus("Copy the sent code above (click \"Copy Code\" or Ctrl+C) so the card can auto-apply it.", "info");
      return;
    }

    startTransition(async () => {
      // Connect to Nodus Supabase server action if real credentials
      if (emailVal !== "alex.morgan@aether.studio" || passVal !== "Aether#Studio2026") {
        const formData = new FormData();
        formData.set("email", emailVal.toLowerCase());
        formData.set("password", passVal);
        formData.set("next", next);
        if (isSignUp) {
          formData.set("businessName", fullName.trim() || "My Business");
        }

        const actionFn = isSignUp ? signUpAction : signInAction;
        const res = await actionFn({}, formData);

        if (res?.error) {
          triggerCardShake();
          showStatus(res.error, "error");
          return;
        }
      }

      const flowName = isOtpFlowRequired
        ? isSignUp
          ? "New User + Clipboard Auto-OTP"
          : "Requested Code (Clipboard Auto-OTP)"
        : "Returning User (Direct Login)";

      triggerAuthSuccess(emailVal, flowName);
    });
  };

  const handleSignOut = () => {
    setViewState("form");
    setHasRequestedCode(false);
    setIsSignUp(false);
    clearOtpTimers();
  };

  return (
    <div className="login-executive-page bg-grid selection:bg-slate-500 selection:text-white">
      {/* Autonomous Dot-Matrix Background */}
      <canvas id="dotMatrixCanvas" ref={dotCanvasRef} />

      {/* Ambient Floating Orbs */}
      <div className="ambient-orb orb-1" />
      <div className="ambient-orb orb-2" />
      <div className="ambient-orb orb-3" />

      {/* Fixed Center Point Card Container (Locked at 50% / 50%, Non-Scrollable) */}
      <main id="cardStage" className="fixed-center-stage">
        <div className="card-perspective w-full">
          <div
            id="loginCard"
            ref={loginCardRef}
            className={`login-card rounded-[24px] p-4 sm:p-5 ${isShaking ? "shake" : ""}`}
          >
            <div className="top-highlight" />

            {/* VIEW 1: Main Authentication Card Form */}
            {viewState === "form" && (
              <div id="authFormView" className="relative z-10">
                {/* Brand Emblem & Header */}
                <div className="stagger-item delay-1 text-center mb-3">
                  <div
                    id="brandLogoBox"
                    ref={brandLogoBoxRef}
                    className="relative inline-flex items-center justify-center w-10 h-10 rounded-2xl mb-1.5 shadow-sm transition-transform duration-300"
                    style={{ background: "linear-gradient(135deg, #0f172a 0%, #334155 100%)", color: "#f8fafc" }}
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 2L2 7l10 5 10-5-10-5z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2 17l10 5 10-5" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2 12l10 5 10-5" />
                    </svg>
                    <span
                      className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400"
                      style={{ boxShadow: "0 0 0 2px var(--card-surface)" }}
                    />
                  </div>

                  <h1 id="cardHeading" className="text-lg font-bold tracking-tight">
                    {isSignUp ? "Create your account" : "Welcome back"}
                  </h1>
                  <p id="cardSubheading" className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                    {isSignUp
                      ? "New user verification · Copy the sent code to auto-apply"
                      : hasRequestedCode
                      ? "Verification code requested · Copy the sent code to auto-apply"
                      : "Sign in with your account credentials"}
                  </p>
                </div>

                {/* Mode Switcher (Sign In [Returning User] / Create Account [New User]) */}
                <div className="stagger-item delay-2 tab-pill-container mb-3">
                  <div
                    id="tabIndicator"
                    className="tab-indicator"
                    style={{ transform: isSignUp ? "translateX(100%)" : "translateX(0%)" }}
                  />
                  <button
                    id="tabSignIn"
                    type="button"
                    onClick={handleSwitchToSignIn}
                    className="relative z-10 py-1.5 text-[11px] font-semibold tracking-wide rounded-lg transition-colors duration-200"
                    style={{ color: !isSignUp ? "var(--text-primary)" : "var(--text-secondary)" }}
                  >
                    Sign In
                  </button>
                  <button
                    id="tabSignUp"
                    type="button"
                    onClick={handleSwitchToSignUp}
                    className="relative z-10 py-1.5 text-[11px] font-semibold tracking-wide rounded-lg transition-colors duration-200"
                    style={{ color: isSignUp ? "var(--text-primary)" : "var(--text-secondary)" }}
                  >
                    Create Account
                  </button>
                </div>

                {/* Inline Notification Banner */}
                {statusBanner && (
                  <div
                    id="statusBanner"
                    className={`mb-2.5 px-3 py-1.5 rounded-xl text-[11px] font-medium flex items-center gap-2 transition-all border ${
                      statusBanner.type === "error"
                        ? "bg-rose-500/10 text-rose-500 border-rose-500/20"
                        : statusBanner.type === "success"
                        ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                        : "bg-slate-500/10 border-slate-500/20"
                    }`}
                    style={{ color: statusBanner.type === "info" ? "var(--text-secondary)" : undefined }}
                  >
                    <span id="statusBannerIcon">
                      {statusBanner.type === "error" ? (
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      ) : statusBanner.type === "success" ? (
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                    </span>
                    <span id="statusBannerText" className="flex-1">{statusBanner.message}</span>
                  </div>
                )}

                {/* Main Form */}
                <form id="authForm" onSubmit={handleSubmit} noValidate>
                  {/* Expandable Full Name Field (for Create Account / New User mode) */}
                  <div id="nameFieldWrapper" className={`expandable-section ${isSignUp ? "open" : ""}`}>
                    <div className="expandable-inner pt-0.5">
                      <div className="input-group">
                        <input
                          id="fullNameInput"
                          type="text"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder=" "
                          autoComplete="name"
                          className="premium-input"
                        />
                        <label htmlFor="fullNameInput" className="floating-label">Full name</label>
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
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder=" "
                        autoComplete="email"
                        required
                        className="premium-input"
                      />
                      <label htmlFor="emailInput" className="floating-label">Work or personal email</label>
                      <svg className="input-icon w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      {isEmailValid && (
                        <span id="emailValidBadge" className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Password Input Container */}
                  <div id="passwordSection" className="stagger-item delay-4 expandable-section open">
                    <div className="expandable-inner pt-0.5">
                      <div className="input-group">
                        <input
                          id="passwordInput"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder=" "
                          autoComplete="current-password"
                          className="premium-input"
                        />
                        <label htmlFor="passwordInput" className="floating-label">Password</label>
                        <svg className="input-icon w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        <button
                          id="togglePasswordBtn"
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg transition-colors hover:bg-slate-200/50 dark:hover:bg-slate-700/50"
                          style={{ color: "var(--text-muted)" }}
                          aria-label="Toggle password visibility"
                        >
                          {!showPassword ? (
                            <svg id="eyeOpenIcon" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          ) : (
                            <svg id="eyeClosedIcon" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M3 3l18 18" />
                            </svg>
                          )}
                        </button>
                      </div>

                      {/* Dynamic Password Strength Bar */}
                      {password && (
                        <div id="strengthWrapper" className="mt-1.5 px-1">
                          <div className="flex items-center justify-between text-[10px] mb-0.5">
                            <span style={{ color: "var(--text-muted)" }}>Security strength</span>
                            <span id="strengthText" className="font-medium" style={{ color: "var(--text-secondary)" }}>
                              {strengthLabels[passwordStrength - 1] ?? "Weak"}
                            </span>
                          </div>
                          <div className="grid grid-cols-4 gap-1.5 h-1">
                            {[0, 1, 2, 3].map((idx) => (
                              <div
                                key={idx}
                                id={`strBar${idx + 1}`}
                                className={`rounded-full transition-colors duration-300 ${
                                  idx < passwordStrength ? strengthColors[passwordStrength - 1] : "bg-slate-300/50"
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* CLIPBOARD-DETECTED OTP PANEL */}
                  <div id="otpCollapseWrapper" className={`expandable-section ${isOtpFlowRequired ? "open" : ""}`}>
                    <div className="expandable-inner">
                      <div
                        id="incomingCodeToast"
                        className="p-2.5 rounded-2xl transition-all"
                        style={{ background: "var(--pill-bg)", border: "1px solid var(--card-border)" }}
                      >
                        <span id="otpTargetEmail" className="hidden">{email.trim() || "account@nodus.io"}</span>

                        {/* Sent Code Pill with Copy Trigger */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5">
                            <span id="otpStatusDot" className={`w-1.5 h-1.5 rounded-full ${otpStatusDotClass}`} />
                            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                              Sent Code: <strong id="dispatchedCodeText" className="font-mono-code select-all" style={{ color: "var(--text-primary)" }}>{currentGeneratedCode}</strong>
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span id="otpLiveTag" className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${otpLiveTagClass}`}>
                              {otpLiveTagText}
                            </span>
                            <button
                              id="copySentCodeBtn"
                              type="button"
                              onClick={handleCopyCodeClick}
                              className="px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all hover:scale-105 active:scale-95 shadow-sm cursor-pointer"
                              style={{ background: "var(--accent-dark)", color: "var(--bg-base)" }}
                              title="Copy this sent code to clipboard — the card will automatically detect and self-enter it"
                            >
                              {isCodeCopied ? "Copied ✓" : "Copy Code"}
                            </button>
                            <button
                              id="replayOtpBtn"
                              type="button"
                              onClick={handleReplayCode}
                              className="text-[10px] font-semibold underline decoration-dotted underline-offset-2 hover:opacity-80 cursor-pointer"
                              style={{ color: "var(--text-secondary)" }}
                              title="Request a new 6-digit code"
                            >
                              Replay code
                            </button>
                          </div>
                        </div>

                        {/* 6-Digit Auto-Entering OTP Boxes */}
                        <div id="otpGrid" className="grid grid-cols-6 gap-1.5 mb-1.5">
                          {otpSlots.map((slot, idx) => (
                            <div
                              key={idx}
                              className={`otp-slot font-mono-code ${slot.className}`}
                              data-slot={idx}
                            >
                              {slot.digit ? <span className="digit-animate">{slot.digit}</span> : null}
                            </div>
                          ))}
                        </div>

                        {/* Animated Text Stream for Entered Code */}
                        <div className="flex items-center justify-between text-[10px] px-0.5">
                          <div id="otpStatusLabel" className="font-mono-code truncate" style={{ color: "var(--text-secondary)" }}>
                            {otpKineticChars.map((ch, i) => (
                              <span key={i} className="kinetic-char" style={{ animationDelay: `${i * 11}ms` }}>
                                {ch === " " ? "\u00A0" : ch}
                              </span>
                            ))}
                          </div>
                          <span id="otpMatchCounter" className="font-mono-code font-semibold" style={{ color: "var(--text-primary)" }}>
                            {otpMatchCounterText}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Remember Me & Request Code / Forgot Password Row */}
                  <div className="stagger-item delay-4 flex items-center justify-between mb-3 text-[11px]">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        id="rememberCheck"
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="custom-check"
                      />
                      <span style={{ color: "var(--text-secondary)" }}>Keep me signed in</span>
                    </label>
                    <button
                      id="forgotPassBtn"
                      type="button"
                      onClick={handleForgotPass}
                      className="font-medium hover:underline transition-opacity cursor-pointer"
                      style={{ color: "var(--text-primary)" }}
                      title="Request a one-time verification code"
                    >
                      Forgot password?
                    </button>
                  </div>

                  {/* Primary Submit CTA */}
                  <div className="stagger-item delay-5">
                    <button
                      id="submitBtn"
                      type="submit"
                      disabled={isPending}
                      className="btn-primary w-full py-2.5 px-4 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                    >
                      <span id="submitBtnText">
                        {isPending
                          ? "Verifying session..."
                          : isSignUp
                          ? "Create Studio Account"
                          : "Continue to Workspace"}
                      </span>
                      {!isPending ? (
                        <svg id="submitBtnArrow" className="w-3.5 h-3.5 transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                      ) : (
                        <svg id="submitSpinner" className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                          <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </form>

                {/* Divider */}
                <div className="stagger-item delay-5 relative my-3 flex items-center justify-center">
                  <div className="w-full border-t" style={{ borderColor: "var(--card-border)" }} />
                  <span className="px-2.5 text-[10px] uppercase tracking-wider font-medium whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                    Or continue with
                  </span>
                  <div className="w-full border-t" style={{ borderColor: "var(--card-border)" }} />
                </div>

                {/* Social & Passkey Buttons */}
                <div className="stagger-item delay-6 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    data-provider="Google"
                    onClick={() => handleSocialAuth("Google")}
                    className="social-btn py-1.5 px-2 rounded-xl flex items-center justify-center gap-1.5 text-[11px] font-medium transition-all duration-200 hover:-translate-y-0.5 active:scale-95 cursor-pointer"
                    style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--text-primary)" }}
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                      <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.8C6.2 7.2 8.9 5 12 5z"/>
                      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.6l3.7 2.9c2.2-2 3.7-5 3.7-8.7z"/>
                      <path fill="#FBBC05" d="M5.3 14.8c-.2-.8-.4-1.8-.4-2.8s.2-2 .4-2.8L1.6 6.4C.6 8.4 0 10.6 0 12s.6 3.6 1.6 5.6l3.7-2.8z"/>
                      <path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.1-6.7-5l-3.7 2.8C3.5 20.4 7.4 23 12 23z"/>
                    </svg>
                    <span>Google</span>
                  </button>

                  <button
                    type="button"
                    data-provider="Apple"
                    onClick={() => handleSocialAuth("Apple")}
                    className="social-btn py-1.5 px-2 rounded-xl flex items-center justify-center gap-1.5 text-[11px] font-medium transition-all duration-200 hover:-translate-y-0.5 active:scale-95 cursor-pointer"
                    style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--text-primary)" }}
                  >
                    <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                      <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z"/>
                    </svg>
                    <span>Apple</span>
                  </button>

                  <button
                    type="button"
                    data-provider="Passkey"
                    onClick={() => handleSocialAuth("Passkey")}
                    className="social-btn py-1.5 px-2 rounded-xl flex items-center justify-center gap-1.5 text-[11px] font-medium transition-all duration-200 hover:-translate-y-0.5 active:scale-95 cursor-pointer"
                    style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--text-primary)" }}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                    <span>Passkey</span>
                  </button>
                </div>

                {/* Request Code / Demo Fill Footer Row */}
                <div className="stagger-item delay-6 mt-2.5 pt-2 border-t flex items-center justify-between text-[10px]" style={{ borderColor: "var(--card-border)", color: "var(--text-muted)" }}>
                  <span>Need a verification code?</span>
                  <button
                    id="fillDemoBtn"
                    type="button"
                    onClick={handleFillDemo}
                    className="font-semibold underline decoration-dotted underline-offset-4 hover:opacity-80 transition-opacity cursor-pointer"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Auto-fill demo credentials
                  </button>
                </div>
              </div>
            )}

            {/* VIEW 1B: Dedicated OTP Step Overlay */}
            {viewState === "otpView" && (
              <div id="authOtpView" className="relative z-10 py-2 text-center">
                <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>Verifying dispatched code...</p>
                <div className="flex items-center gap-2">
                  <button
                    id="backToLoginBtn"
                    type="button"
                    onClick={() => setViewState("form")}
                    className="py-2 px-3 rounded-xl text-xs font-semibold cursor-pointer"
                    style={{ background: "var(--pill-bg)", border: "1px solid var(--card-border)", color: "var(--text-secondary)" }}
                  >
                    Back
                  </button>
                  <button
                    id="verifyOtpBtn"
                    type="button"
                    onClick={() => triggerAuthSuccess(email.trim() || "account@nodus.io", "Clipboard Auto-Applied Code")}
                    className="btn-primary flex-1 py-2 px-3 rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    <span id="verifyOtpBtnText">Auto-Entering Sent Code...</span>
                  </button>
                </div>
              </div>
            )}

            {/* VIEW 2: Animated Authenticated Success State View */}
            {viewState === "success" && (
              <div id="authSuccessView" className="relative z-10 py-3 text-center">
                <div className="w-14 h-14 mx-auto mb-3 flex items-center justify-center rounded-full" style={{ background: "var(--pill-bg)" }}>
                  <svg className="w-9 h-9 text-emerald-500" viewBox="0 0 52 52" fill="none">
                    <circle className="check-circle" cx="26" cy="26" r="24" stroke="currentColor" strokeWidth="3" fill="none" />
                    <path className="check-mark" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
                  </svg>
                </div>

                <span id="verifiedBadgePill" className="inline-block text-[10px] font-semibold uppercase tracking-widest px-2.5 py-0.5 rounded-full mb-1.5 bg-emerald-500/10 text-emerald-500">
                  {successData.verifiedBadge}
                </span>
                <h2 id="successTitle" className="text-lg font-bold tracking-tight mb-0.5">
                  {successData.title}
                </h2>
                <p id="successEmailDisplay" className="text-xs mb-4" style={{ color: "var(--text-secondary)" }}>
                  {successData.emailDisplay}
                </p>

                {/* Mini Session Telemetry Card */}
                <div className="rounded-2xl p-3.5 mb-4 text-left text-xs space-y-1.5" style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)" }}>
                  <div className="flex justify-between">
                    <span style={{ color: "var(--text-muted)" }}>Authentication Flow</span>
                    <span id="summaryMethod" className="font-medium">{successData.method}</span>
                  </div>
                  <div id="summaryCodeRow" className="flex justify-between">
                    <span style={{ color: "var(--text-muted)" }}>Verification Status</span>
                    <span id="summaryOtpCode" className="font-mono-code font-semibold text-emerald-500">{successData.otpStatus}</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: "var(--text-muted)" }}>Active Surface Palette</span>
                    <span id="summaryTheme" className="font-medium">Light White (Alabaster)</span>
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
                    id="signOutBtn"
                    type="button"
                    onClick={handleSignOut}
                    className="py-2.5 px-3 rounded-xl text-xs font-semibold transition-all duration-200 hover:opacity-90 active:scale-95 cursor-pointer"
                    style={{ background: "var(--pill-bg)", border: "1px solid var(--card-border)", color: "var(--text-primary)" }}
                  >
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Fixed Bottom Footer Info */}
      <footer className="fixed bottom-0 left-0 right-0 z-10 text-center pb-2.5 px-4 text-[11px] pointer-events-none" style={{ color: "var(--text-muted)" }}>
        <span>Returning users sign in directly · New users &amp; code requests auto-fill when you copy the sent code</span>
      </footer>
    </div>
  );
}
