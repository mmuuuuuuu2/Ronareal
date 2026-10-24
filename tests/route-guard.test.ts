import { test } from "node:test";
import assert from "node:assert/strict";
import { decideRoute } from "../src/lib/auth/route-guard.ts";

test("tanpa sesi: dashboard dan onboarding diarahkan ke login dengan next", () => {
  assert.deepEqual(decideRoute("/dashboard", false), { action: "redirect", to: "/login?next=%2Fdashboard" });
  assert.deepEqual(decideRoute("/dashboard/pengaturan", false), {
    action: "redirect",
    to: "/login?next=%2Fdashboard%2Fpengaturan",
  });
  assert.deepEqual(decideRoute("/onboarding", false), { action: "redirect", to: "/login?next=%2Fonboarding" });
});

test("tanpa sesi: rute publik dan halaman auth tetap terbuka", () => {
  for (const p of ["/", "/login", "/register", "/auth/callback", "/dashboardx", "/onboardingx", "/nadia"]) {
    assert.deepEqual(decideRoute(p, false), { action: "next" }, p);
  }
});

test("dengan sesi: login/register dialihkan ke dashboard, rute lain lolos", () => {
  assert.deepEqual(decideRoute("/login", true), { action: "redirect", to: "/dashboard" });
  assert.deepEqual(decideRoute("/register", true), { action: "redirect", to: "/dashboard" });
  for (const p of ["/", "/dashboard", "/onboarding", "/dashboard/apa-saja"]) {
    assert.deepEqual(decideRoute(p, true), { action: "next" }, p);
  }
});
