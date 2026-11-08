"use client";

import { useState, useTransition, useCallback } from "react";
import { updateBusinessProfileAction } from "@/app/actions/profile";
import { useDashboardLoader } from "./dashboard-shell-effects";

interface ProfileFormProps {
  businessName: string;
  receivingNetwork: string | null;
  receivingAddress: string | null;
  email: string;
  createdAt: string;
  updatedAt: string;
}

function formatDate(dateString: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(dateString));
  } catch {
    return dateString;
  }
}

export default function ProfileForm({
  businessName: initialBusinessName,
  receivingNetwork: initialReceivingNetwork,
  receivingAddress: initialReceivingAddress,
  email,
  createdAt,
  updatedAt,
}: ProfileFormProps) {
  const [businessName, setBusinessName] = useState(initialBusinessName || "");
  const [receivingNetwork, setReceivingNetwork] = useState(initialReceivingNetwork || "base");
  const [receivingAddress, setReceivingAddress] = useState(initialReceivingAddress || "");
  const [copyFeedback, setCopyFeedback] = useState("Copy address");
  const [kineticStatus, setKineticStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUpdatedDisplay, setLastUpdatedDisplay] = useState(formatDate(updatedAt));

  const [isPending, startTransition] = useTransition();
  const { triggerLoader } = useDashboardLoader();

  const isEvmValid = /^0x[a-fA-F0-9]{40}$/.test(receivingAddress.trim());
  const isDestinationConfigured = Boolean(receivingAddress.trim());

  // Copy address to clipboard
  const handleCopyWallet = useCallback(() => {
    const addr = receivingAddress.trim();
    if (!addr) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(addr).catch(() => {});
      }
    } catch {
      // fallback
    }
    const temp = document.createElement("textarea");
    temp.value = addr;
    temp.style.position = "fixed";
    temp.style.opacity = "0";
    document.body.appendChild(temp);
    temp.select();
    try {
      document.execCommand("copy");
    } catch {
      // ignore
    }
    document.body.removeChild(temp);

    setCopyFeedback("Copied ✓");
    setTimeout(() => {
      setCopyFeedback("Copy address");
    }, 1600);
  }, [receivingAddress]);

  // Form Submission
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setKineticStatus(null);
    triggerLoader(560);

    const formData = new FormData();
    formData.set("businessName", businessName.trim());
    formData.set("receivingNetwork", receivingNetwork.trim());
    formData.set("receivingAddress", receivingAddress.trim());

    startTransition(async () => {
      const res = await updateBusinessProfileAction({}, formData);
      if (res?.error) {
        setErrorMessage(res.error);
      } else {
        setLastUpdatedDisplay("Just now");
        setKineticStatus("Profile & destination saved ✓");
      }
    });
  };

  return (
    <div className="w-full max-w-[650px] mx-auto">
      {/* Section Header */}
      <div className="mb-6 stagger-item delay-1">
        <span id="pageEyebrow" className="block text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--text-muted)" }}>
          ACCOUNT
        </span>
        <h1 id="pageMainHeading" className="text-3xl sm:text-[34px] font-bold tracking-tight text-slate-900 mb-1.5">
          Business profile
        </h1>
        <p id="pageSubheading" className="text-xs sm:text-sm" style={{ color: "var(--text-secondary)" }}>
          Manage the details attached to your Nodus account.
        </p>
      </div>

      {/* Profile Card with 3D Tilt & Specular Chamfer Highlight */}
      <div id="view-business-profile" className="card-perspective">
        <div id="profileCard" className="aether-card p-6 sm:p-8 stagger-item delay-2">
          <div className="top-highlight" />

          <form id="businessProfileForm" onSubmit={handleSubmit} className="relative z-10" noValidate>
            {/* 1. Business Name */}
            <div className="mb-6 stagger-item delay-2">
              <label htmlFor="businessNameInput" className="block text-xs font-semibold mb-2 text-slate-800">
                Business name
              </label>
              <div className="nodus-input-wrap">
                <input
                  id="businessNameInput"
                  name="businessName"
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  required
                  maxLength={120}
                  className="nodus-input font-medium"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </span>
              </div>
            </div>

            {/* 2. Receiving Destination */}
            <div className="mb-6 stagger-item delay-3">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-semibold text-slate-900">
                  Receiving destination
                </h2>
                <span
                  id="routeStatusBadge"
                  className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full"
                  style={{
                    background: "var(--pill-bg)",
                    border: "1px solid var(--card-border)",
                    color: "var(--text-secondary)",
                  }}
                >
                  {isDestinationConfigured && (isEvmValid || !["base", "ethereum", "eth"].includes(receivingNetwork)) ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span className="text-emerald-600 font-semibold">Saved for quotes ✓</span>
                    </>
                  ) : (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      <span>Unverified route</span>
                    </>
                  )}
                </span>
              </div>
              <p className="text-xs leading-relaxed mb-4" style={{ color: "var(--text-secondary)" }}>
                Saved for future payment quotes. A configured destination does not mean this network or route is live or verified.
              </p>

              {/* Network Identifier */}
              <div className="mb-4">
                <label htmlFor="networkInput" className="block text-xs font-semibold mb-2 text-slate-800">
                  Network identifier
                </label>
                <div className="nodus-input-wrap">
                  <input
                    id="networkInput"
                    name="receivingNetwork"
                    type="text"
                    value={receivingNetwork}
                    onChange={(e) => setReceivingNetwork(e.target.value.toLowerCase())}
                    placeholder="For example: base"
                    maxLength={64}
                    className="nodus-input font-medium"
                  />
                  <span
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-[11px] font-mono-code px-2 py-0.5 rounded-md pointer-events-none"
                    style={{ background: "var(--pill-bg)", color: "var(--text-secondary)" }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    L2
                  </span>
                </div>
              </div>

              {/* Wallet Address */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="walletInput" className="block text-xs font-semibold text-slate-800">
                    Wallet address
                  </label>
                  <button
                    id="copyWalletBtn"
                    type="button"
                    onClick={handleCopyWallet}
                    className="text-[11px] font-medium flex items-center gap-1 hover:text-slate-900 transition-colors cursor-pointer"
                    style={{ color: "var(--text-secondary)" }}
                    title="Copy wallet address"
                  >
                    <span id="copyWalletText">{copyFeedback}</span>
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
                <div className="nodus-input-wrap">
                  <input
                    id="walletInput"
                    name="receivingAddress"
                    type="text"
                    value={receivingAddress}
                    onChange={(e) => setReceivingAddress(e.target.value)}
                    placeholder="Address on the selected network"
                    maxLength={256}
                    spellCheck={false}
                    className="nodus-input font-mono-code text-xs sm:text-[13px]"
                  />
                  {isEvmValid && (
                    <span
                      id="walletCheckBadge"
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-emerald-500 pointer-events-none"
                      title="Valid EVM checksum format"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <p className="text-xs text-rose-500 font-medium mb-4" role="alert">
                {errorMessage}
              </p>
            )}

            {/* Save Profile Button + Live Kinetic Status */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-7 stagger-item delay-4">
              <button
                id="saveProfileBtn"
                type="submit"
                disabled={isPending}
                className="btn-save-pill cursor-pointer disabled:opacity-60"
              >
                <span id="saveBtnLabel">{isPending ? "Saving..." : "Save profile"}</span>
              </button>
              {kineticStatus && (
                <div id="saveKineticStatus" className="text-xs font-mono-code" style={{ color: "var(--text-secondary)" }}>
                  {kineticStatus.split("").map((ch, i) => (
                    <span
                      key={i}
                      className="kinetic-char"
                      style={{ animationDelay: `${i * 12}ms` }}
                    >
                      {ch === " " ? "\u00A0" : ch}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* 3. Account Metadata Rows */}
            <div className="border-t stagger-item delay-5 text-xs" style={{ borderColor: "var(--card-border)" }}>
              <div className="grid grid-cols-1 sm:grid-cols-3 py-3.5 border-b items-center gap-1" style={{ borderColor: "var(--card-border)" }}>
                <span style={{ color: "var(--text-muted)" }}>Account email</span>
                <span className="sm:col-span-2 font-medium text-slate-900">{email}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 py-3.5 border-b items-center gap-1" style={{ borderColor: "var(--card-border)" }}>
                <span style={{ color: "var(--text-muted)" }}>Created</span>
                <span className="sm:col-span-2 font-medium text-slate-900">{formatDate(createdAt)}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 pt-3.5 items-center gap-1">
                <span style={{ color: "var(--text-muted)" }}>Last updated</span>
                <span id="lastUpdatedValue" className="sm:col-span-2 font-medium text-slate-900">
                  {lastUpdatedDisplay}
                </span>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
