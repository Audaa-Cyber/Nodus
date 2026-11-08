import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Google OAuth failures remain errors instead of becoming local success", async () => {
  const login = await read("../src/components/executive-login-card.tsx");
  const oauthHandler = login.match(/const handleSocialAuth = useCallback\(([\s\S]*?)\n  \/\/ Form Submit/);

  assert.ok(oauthHandler, "Google OAuth handler exists");
  assert.doesNotMatch(oauthHandler[1], /triggerAuthSuccess\(/);
  assert.match(oauthHandler[1], /showStatus\(/);
});

test("login has no local OTP or demo-credential authentication shortcuts", async () => {
  const login = await read("../src/components/executive-login-card.tsx");

  assert.doesNotMatch(login, /SAMPLE_CODES|triggerAuthSuccess|alex\.morgan@aether\.studio|verifyOtpBtn/);
});

test("dashboard route transitions use the route loader without a second shell overlay", async () => {
  const shell = await read("../src/components/dashboard-shell-effects.tsx");
  const nav = await read("../src/components/dashboard-nav.tsx");
  const routeLoader = await read("../src/app/dashboard/loading.tsx");

  assert.doesNotMatch(shell, /sectionLoaderOverlay|loader-capsule/);
  assert.doesNotMatch(nav, /useDashboardLoader|triggerLoader/);
  assert.match(routeLoader, /PageLoader/);
});

test("dashboard background canvas is fixed and cannot add document-flow height", async () => {
  const styles = await read("../src/app/globals.css");

  assert.match(styles, /\.dashboard-executive\s+#dotMatrixCanvas\s*\{[^}]*position:\s*fixed/s);
  assert.match(styles, /\.dashboard-executive\s+#dotMatrixCanvas\s*\{[^}]*height:\s*100%/s);
});
