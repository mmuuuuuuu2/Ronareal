import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNextPath } from "../src/lib/validation/redirect.ts";

test("safeNextPath: path internal yang diizinkan lolos", () => {
  assert.equal(safeNextPath("/dashboard"), "/dashboard");
  assert.equal(safeNextPath("/dashboard/pengaturan"), "/dashboard/pengaturan");
  assert.equal(safeNextPath("/onboarding"), "/onboarding");
  assert.equal(safeNextPath("/dashboard?tab=1"), "/dashboard?tab=1");
});

test("safeNextPath: open redirect dan trik umum ditolak -> fallback", () => {
  const attacks = [
    "https://evil.com",
    "//evil.com",
    "///evil.com",
    "/\\evil.com",
    "\\\\evil.com",
    "javascript:alert(1)",
    "data:text/html,x",
    "evil.com",
    "",
    "/dashboard\r\nSet-Cookie: x=1",
    "/dashboardx",
    "/login",
    "/auth/callback",
    "/%2F%2Fevil.com",
  ];
  for (const a of attacks) {
    assert.equal(safeNextPath(a), "/dashboard", JSON.stringify(a));
  }
});

test("safeNextPath: bukan string dan fallback kustom", () => {
  assert.equal(safeNextPath(undefined), "/dashboard");
  assert.equal(safeNextPath(null), "/dashboard");
  assert.equal(safeNextPath(["/dashboard"]), "/dashboard");
  assert.equal(safeNextPath("https://x.co", "/onboarding"), "/onboarding");
});
