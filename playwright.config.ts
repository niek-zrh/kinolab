import { defineConfig } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const port = new URL(baseURL).port || "3000";
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseURL).hostname)) {
  throw new Error(
    "Browser regression tests create data and must target a local test deployment.",
  );
}

// A localhost frontend can still be connected to a live backend. Check both.
const localEnv = existsSync(".env.local")
  ? readFileSync(".env.local", "utf8")
  : "";
const backendURL =
  process.env.NEXT_PUBLIC_CONVEX_URL ??
  localEnv.match(/^NEXT_PUBLIC_CONVEX_URL=(.+)$/m)?.[1]?.trim();
if (
  !backendURL ||
  !["localhost", "127.0.0.1", "[::1]"].includes(new URL(backendURL).hostname)
) {
  throw new Error(
    "Browser regression tests require a verified loopback NEXT_PUBLIC_CONVEX_URL, not a live backend.",
  );
}

/**
 * E2E suite for Slate. Assumes the dev servers are running (`pnpm dev`);
 * `reuseExistingServer` means it will not try to spawn its own when :3000
 * is already serving.
 */
export default defineConfig({
  testDir: "./e2e/tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 3,
  retries: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    actionTimeout: 15_000,
  },
  webServer: {
    command: process.env.CI
      ? `pnpm start --port ${port}`
      : `pnpm dev:frontend --port ${port}`,
    url: `${baseURL}/sign-in`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
