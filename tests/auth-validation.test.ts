import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeEmail,
  validateDisplayName,
  validateLogin,
  validateRegistration,
} from "../src/lib/validation/auth.ts";

test("normalizeEmail: trim + lowercase", () => {
  assert.equal(normalizeEmail("  User@Example.COM "), "user@example.com");
  assert.equal(normalizeEmail(null), "");
});

test("validateLogin: sukses dan galat per field", () => {
  assert.deepEqual(validateLogin({ email: " A@b.co ", password: "x" }), {
    ok: true,
    value: { email: "a@b.co", password: "x" },
  });
  const bad = validateLogin({ email: "bukan-email", password: "" });
  assert.equal(bad.ok, false);
  if (!bad.ok) {
    assert.ok(bad.errors.email);
    assert.ok(bad.errors.password);
  }
  assert.equal(validateLogin({ email: undefined, password: undefined }).ok, false);
});

test("validateRegistration: aturan kata sandi", () => {
  const ok = validateRegistration({ email: "a@b.co", password: "kata-sandi-9", confirmPassword: "kata-sandi-9" });
  assert.equal(ok.ok, true);

  const short = validateRegistration({ email: "a@b.co", password: "pendek", confirmPassword: "pendek" });
  assert.equal(short.ok, false);
  if (!short.ok) assert.match(short.errors.password ?? "", /minimal 8/);

  const mismatch = validateRegistration({ email: "a@b.co", password: "kata-sandi-9", confirmPassword: "beda-sekali-9" });
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) assert.ok(mismatch.errors.confirmPassword);

  // batas 72 byte (bcrypt): 73 karakter ASCII ditolak, 72 diterima
  const ok72 = "a".repeat(72);
  assert.equal(validateRegistration({ email: "a@b.co", password: ok72, confirmPassword: ok72 }).ok, true);
  const bad73 = "a".repeat(73);
  assert.equal(validateRegistration({ email: "a@b.co", password: bad73, confirmPassword: bad73 }).ok, false);
  // karakter multi-byte dihitung per byte
  const multi = "é".repeat(37); // 74 byte
  assert.equal(validateRegistration({ email: "a@b.co", password: multi, confirmPassword: multi }).ok, false);
});

test("validateRegistration: format email", () => {
  for (const email of ["", "a", "a@", "a@b", "a b@c.co", "@b.co"]) {
    const r = validateRegistration({ email, password: "kata-sandi-9", confirmPassword: "kata-sandi-9" });
    assert.equal(r.ok, false, email);
  }
  const long = `${"a".repeat(250)}@b.co`;
  assert.equal(validateRegistration({ email: long, password: "kata-sandi-9", confirmPassword: "kata-sandi-9" }).ok, false);
});

test("validateDisplayName: rapikan spasi, batas 80, tolak karakter kontrol", () => {
  assert.deepEqual(validateDisplayName("  Nadia   Rahma  "), { ok: true, value: "Nadia Rahma" });
  assert.equal(validateDisplayName("").ok, false);
  assert.equal(validateDisplayName("   ").ok, false);
  assert.equal(validateDisplayName(undefined).ok, false);
  assert.equal(validateDisplayName("x".repeat(80)).ok, true);
  assert.equal(validateDisplayName("x".repeat(81)).ok, false);
  assert.equal(validateDisplayName("Bo\u0007bi").ok, false);
  // emoji dihitung per code point, bukan per UTF-16 unit
  assert.equal(validateDisplayName("😀".repeat(80)).ok, true);
  assert.equal(validateDisplayName("😀".repeat(81)).ok, false);
});
