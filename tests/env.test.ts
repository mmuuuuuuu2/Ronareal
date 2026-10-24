import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSiteUrl, parseSupabaseEnv } from "../src/lib/env.ts";

// JWT palsu hanya untuk uji (bukan kunci sungguhan).
function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.c2lnbmF0dXJlLXRlcy1zYWph`;
}
const anon = fakeJwt({ role: "anon", ref: "abc" });

test("parseSupabaseEnv: konfigurasi valid, slash akhir dirapikan", () => {
  const r = parseSupabaseEnv({ url: "https://abc.supabase.co/", anonKey: anon });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.url, "https://abc.supabase.co");
});

test("parseSupabaseEnv: http hanya untuk localhost", () => {
  assert.equal(parseSupabaseEnv({ url: "http://localhost:54321", anonKey: anon }).ok, true);
  assert.equal(parseSupabaseEnv({ url: "http://abc.supabase.co", anonKey: anon }).ok, false);
});

test("parseSupabaseEnv: nilai kosong/salah menghasilkan masalah yang jelas", () => {
  const empty = parseSupabaseEnv({});
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.equal(empty.problems.length, 2);
  assert.equal(parseSupabaseEnv({ url: "bukan url", anonKey: anon }).ok, false);
  assert.equal(parseSupabaseEnv({ url: "https://abc.supabase.co/rest/v1", anonKey: anon }).ok, false);
});

test("parseSupabaseEnv: service_role/secret key ditolak dan nilainya tidak bocor di pesan", () => {
  const svc = fakeJwt({ role: "service_role" });
  const r1 = parseSupabaseEnv({ url: "https://abc.supabase.co", anonKey: svc });
  assert.equal(r1.ok, false);
  if (!r1.ok) assert.doesNotMatch(r1.problems.join(" "), new RegExp(svc.slice(0, 20)));
  const secret = ["sb_secret", "abcdefghijklmnop"].join("_"); // disusun saat runtime agar pemindai secret tidak terpicu
  const r2 = parseSupabaseEnv({ url: "https://abc.supabase.co", anonKey: secret });
  assert.equal(r2.ok, false);
  if (!r2.ok) assert.doesNotMatch(r2.problems.join(" "), /abcdefghijklmnop/);
});

test("normalizeSiteUrl: origin saja, skema terbatas", () => {
  assert.equal(normalizeSiteUrl("https://rona.vercel.app/"), "https://rona.vercel.app");
  assert.equal(normalizeSiteUrl("https://rona.vercel.app/path?x=1"), "https://rona.vercel.app");
  assert.equal(normalizeSiteUrl("http://localhost:3000"), "http://localhost:3000");
  for (const bad of ["", "   ", "javascript:alert(1)", "ftp://x.co", "bukan url", undefined, null]) {
    assert.equal(normalizeSiteUrl(bad as string | null | undefined), null, String(bad));
  }
});
