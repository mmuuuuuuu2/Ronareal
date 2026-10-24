import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { emailStatus, formatWhen, validateEmailChange, validateNewPassword } from "../src/lib/account/account.ts";
import { mapAuthError } from "../src/lib/auth/errors.ts";
import { mapEditorError } from "../src/lib/editor/errors.ts";
import { normalizeSiteUrl, resolveSiteUrl } from "../src/lib/env.ts";
import { SETTINGS_TABS, parseSettingsTab } from "../src/lib/settings/tabs.ts";
import { safeNextPath } from "../src/lib/validation/redirect.ts";
import { USERNAME_PATTERN } from "../src/lib/validation/username.ts";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("validateEmailChange", () => {
  assert.equal(validateEmailChange("bukan-email", "a@b.co").ok, false);
  assert.equal(validateEmailChange("A@B.co", "a@b.co").ok, false); // sama (case-insensitive)
  const r = validateEmailChange("  Baru@Contoh.com ", "a@b.co");
  assert.ok(r.ok && r.value.email === "baru@contoh.com");
});

test("validateNewPassword", () => {
  assert.equal(validateNewPassword("pendek", "pendek").ok, false);
  const m = validateNewPassword("kata-sandi-panjang", "beda");
  assert.ok(!m.ok && m.errors.confirmPassword);
  assert.equal(validateNewPassword("kata-sandi-panjang", "kata-sandi-panjang").ok, true);
  assert.equal(validateNewPassword(undefined, undefined).ok, false);
});

test("emailStatus: email berubah hanya setelah dikonfirmasi (new_email = menunggu)", () => {
  assert.deepEqual(emailStatus({ email: "a@b.co", new_email: "c@d.co" }), { current: "a@b.co", pending: "c@d.co" });
  assert.deepEqual(emailStatus({ email: "a@b.co" }), { current: "a@b.co", pending: null });
  assert.equal(emailStatus({ email: "a@b.co", new_email: "a@b.co" }).pending, null);
});

test("formatWhen toleran", () => {
  assert.equal(formatWhen("bukan tanggal"), null);
  assert.equal(formatWhen(null), null);
  assert.match(formatWhen("2026-10-21T05:00:00Z") ?? "", /2026/);
});

test("mapAuthError: konteks akun tidak membocorkan keberadaan email & tak meneruskan pesan mentah", () => {
  assert.match(mapAuthError({ code: "email_exists" }, "email-change"), /tidak dapat digunakan/);
  assert.match(mapAuthError({ code: "same_password" }, "password-change"), /berbeda/);
  assert.match(mapAuthError({ code: "reauthentication_needed" }, "password-change"), /masuk ulang/);
  assert.match(mapAuthError({ code: "weak_password" }, "password-change"), /lemah/);
  assert.doesNotMatch(mapAuthError({ code: "x", message: "token=abc secret" }, "reset"), /token|secret/);
});

test("mapEditorError: galat Phase 7", () => {
  assert.equal(mapEditorError({ message: "username_recently_released" }).field, "username");
  assert.match(mapEditorError({ message: "draft_conflict_seo" }).message, /SEO/);
  assert.match(mapEditorError({ message: "seo_invalid" }).message, /SEO/);
  assert.match(mapEditorError({ message: "draft_conflict_profile" }).message, /tab atau perangkat lain/);
});

test("resolveSiteUrl: hanya konfigurasi; produksi tanpa konfigurasi -> null", () => {
  assert.equal(resolveSiteUrl("https://rona.example/path/", "production"), "https://rona.example");
  assert.equal(resolveSiteUrl("", "production"), null);
  assert.equal(resolveSiteUrl("javascript:alert(1)", "production"), null);
  assert.equal(resolveSiteUrl(undefined, "development"), "http://localhost:3000");
  assert.equal(normalizeSiteUrl("ftp://x"), null);
});

test("tab pengaturan", () => {
  assert.equal(SETTINGS_TABS.length, 5);
  assert.equal(parseSettingsTab("seo"), "seo");
  assert.equal(parseSettingsTab("<script>"), "akun");
  assert.equal(parseSettingsTab(undefined), "akun");
});

test("pola username di migration Phase 7 sama dengan aplikasi", () => {
  const sql = read("supabase/migrations/20261021000000_phase7_account_page_settings.sql");
  assert.ok(sql.includes(USERNAME_PATTERN.source.replace(/\\\//g, "/")));
});

test("`next` untuk callback ganti email/reset hanya path internal", () => {
  assert.equal(safeNextPath("/dashboard/settings"), "/dashboard/settings");
  assert.equal(safeNextPath("https://evil.example"), "/dashboard");
  assert.equal(safeNextPath("//evil.example"), "/dashboard");
});

test("kontrak action pengaturan: identitas dari sesi, tidak ada service-role, tidak mencatat kata sandi", () => {
  const a = code("src/app/dashboard/settings/actions.ts");
  assert.doesNotMatch(a, /service_role|SERVICE_ROLE/);
  assert.doesNotMatch(a, /console\.(log|error|warn)/);
  assert.doesNotMatch(a, /headers\(\)|get\("host"\)|get\("origin"\)/); // base URL tidak dari header
  assert.match(a, /getTrustedSiteUrl\(\)/);
  assert.doesNotMatch(a, /input\??\.(userId|user_id|ownerId)/);
  // username lama dibaca dari DB sesi, lalu URL lama dan baru sama-sama di-revalidate
  assert.match(a, /from\("profiles"\)\.select\("username"\)\.eq\("id", s\.user\.id\)/);
  assert.match(a, /revalidatePath\(publicPath\(previous\)\)/);
  assert.match(a, /revalidatePath\(publicPath\(username\)\)/);
  // SEO draft tidak meng-invalidasi halaman publik
  const seo = a.slice(a.indexOf("export async function saveSeoAction"), a.indexOf("export async function requestEmailChangeAction"));
  assert.doesNotMatch(seo, /publicPath/);
  // email dari sesi untuk reset, bukan dari client
  const reset = a.slice(a.indexOf("export async function sendPasswordResetAction"));
  assert.match(reset, /s\.user\.email/);
  assert.doesNotMatch(reset.slice(0, reset.indexOf("signOutOthers")), /input/);
});

test("kontrak halaman publik: tanpa cookies()/headers(), metadata lewat builder tepercaya", () => {
  const p = code("src/app/[username]/page.tsx");
  assert.doesNotMatch(p, /cookies\(\)|headers\(\)/);
  assert.match(p, /buildPageMetadata\(result\.page, getTrustedSiteUrl\(\)\)/);
});

test("callback menerima email_change dan recovery", () => {
  const c = code("src/app/auth/callback/route.ts");
  assert.match(c, /"email_change"/);
  assert.match(c, /"recovery"/);
});

test("halaman pengaturan dinamis & dijaga sesi", () => {
  const p = code("src/app/dashboard/settings/page.tsx");
  assert.match(p, /force-dynamic/);
  assert.match(p, /redirect\("\/login/);
  const l = read("supabase/migrations/20261016000000_foundation.sql");
  assert.match(l, /\('settings'\)/); // 'settings' reserved
});
