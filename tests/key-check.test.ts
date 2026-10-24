import { test } from "node:test";
import assert from "node:assert/strict";
import { inspectSupabaseKey } from "../src/lib/supabase/key-check.ts";

// JWT palsu hanya untuk uji (bukan kunci sungguhan): header.payload.signature dengan payload yang dikontrol tes.
function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.c2lnbmF0dXJlLXRlcy1zYWph`;
}

test("kunci anon JWT diterima", () => {
  assert.deepEqual(inspectSupabaseKey(fakeJwt({ role: "anon", ref: "abc" })), { ok: true });
  assert.deepEqual(inspectSupabaseKey(`  ${fakeJwt({ role: "anon" })}\n`), { ok: true });
});

test("kunci publishable baru diterima", () => {
  assert.deepEqual(inspectSupabaseKey("sb_publishable_contoh123"), { ok: true });
});

test("service_role dan secret key ditolak", () => {
  const svc = inspectSupabaseKey(fakeJwt({ role: "service_role" }));
  assert.equal(svc.ok, false);
  const sec = inspectSupabaseKey("sb_secret_contoh123");
  assert.equal(sec.ok, false);
  if (!sec.ok) assert.match(sec.reason, /secret key/);
});

test("format tak dikenal, kosong, dan role lain ditolak", () => {
  for (const bad of ["", "   ", "bukan-jwt", "a.b.c", "x.y"]) {
    assert.equal(inspectSupabaseKey(bad).ok, false, JSON.stringify(bad));
  }
  assert.equal(inspectSupabaseKey(fakeJwt({ role: "authenticated" })).ok, false);
  assert.equal(inspectSupabaseKey(fakeJwt({})).ok, false);
});
