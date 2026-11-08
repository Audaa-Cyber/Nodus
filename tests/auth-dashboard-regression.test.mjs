import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Google OAuth failures remain errors instead of becoming local success", async () => {
  const login = await read("../src/components/executive-login-card.tsx");
  const oauthHandler = login.match(/const handleSocialAuth = async\s*\(\)\s*=>\s*\{([\s\S]*?)\n  \};/);

  assert.ok(oauthHandler, "Google OAuth handler exists");
  assert.match(oauthHandler[1], /signInWithOAuth\(/, "Google uses the Supabase OAuth provider");
  assert.match(oauthHandler[1], /provider: "google"/, "Google provider is selected explicitly");
  assert.doesNotMatch(oauthHandler[1], /triggerAuthSuccess\(/, "OAuth failure cannot synthesize success");
  assert.match(oauthHandler[1], /showStatus\(/, "OAuth failures are shown to the user");
});

test("login has no local OTP or demo-credential authentication shortcuts", async () => {
  const login = await read("../src/components/executive-login-card.tsx");

  assert.doesNotMatch(
    login,
    /SAMPLE_CODES|triggerAuthSuccess|alex\.morgan@aether\.studio|verifyOtpBtn/,
    "login contains no mock OTP or demo-auth path"
  );
  assert.match(login, /isSignUp \? signUpAction : signInAction/, "all password auth uses server actions");
});

test("dashboard route transitions use the route loader without a second shell overlay", async () => {
  const shell = await read("../src/components/dashboard-shell-effects.tsx");
  const nav = await read("../src/components/dashboard-nav.tsx");
  const logout = await read("../src/components/logout-button.tsx");
  const profile = await read("../src/components/profile-form.tsx");
  const routeLoader = await read("../src/app/dashboard/loading.tsx");

  assert.doesNotMatch(shell, /sectionLoaderOverlay|loader-capsule/, "shell does not render another loader");
  assert.doesNotMatch(nav, /useDashboardLoader|triggerLoader/, "nav does not start a second loader");
  assert.doesNotMatch(logout, /useDashboardLoader|triggerLoader/, "logout does not start a second loader");
  assert.doesNotMatch(profile, /useDashboardLoader|triggerLoader/, "profile save does not start a second loader");
  assert.match(logout, /signOutAction/, "dashboard logout calls the real sign-out action");
  assert.match(routeLoader, /PageLoader/, "Next route boundary keeps the dashboard loader");
});

test("dashboard background canvas is fixed and cannot add document-flow height", async () => {
  const styles = await read("../src/app/globals.css");

  const canvasRule = styles.match(/\.dashboard-executive\s+#dotMatrixCanvas\s*\{[^}]*\}/s)?.[0] ?? "";
  assert.match(canvasRule, /position:\s*fixed/, "dashboard canvas is removed from document flow");
  assert.match(canvasRule, /height:\s*100%/, "dashboard canvas fills the viewport");
});

test("dashboard dot matrix is a static texture with no animation loop", async () => {
  const shell = await read("../src/components/dashboard-shell-effects.tsx");
  const backgroundEffect = shell.match(/\/\/ 2\. Static Dot-Matrix Background Texture([\s\S]*?)\n\s*return \(/)?.[1] ?? "";

  assert.ok(backgroundEffect, "dashboard background effect exists");
  assert.doesNotMatch(backgroundEffect, /requestAnimationFrame/, "background does not schedule continuous frames");
  assert.match(backgroundEffect, /const t = 0/, "dot pattern uses a stable phase");
  assert.match(backgroundEffect, /renderDotMatrix\(\)/, "pattern redraws when its canvas is initialized or resized");
});
