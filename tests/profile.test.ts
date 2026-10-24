import assert from "node:assert/strict";
import { test } from "node:test";
import { BIO_MAX_LENGTH, validateProfileInput } from "../src/lib/validation/profile.ts";

test("profil valid dinormalisasi", () => {
  const r = validateProfileInput({ displayName: "  Nadia  ", bio: "Halo\r\ndunia ", username: " Nadia-R " });
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.value, { displayName: "Nadia", bio: "Halo\ndunia", username: "nadia-r" });
});

test("bio kosong boleh; bio terlalu panjang atau berisi karakter kontrol ditolak", () => {
  assert.equal(validateProfileInput({ displayName: "A", bio: "", username: "abc" }).ok, true);
  assert.equal(validateProfileInput({ displayName: "A", bio: "x".repeat(BIO_MAX_LENGTH), username: "abc" }).ok, true);
  assert.equal(validateProfileInput({ displayName: "A", bio: "x".repeat(BIO_MAX_LENGTH + 1), username: "abc" }).ok, false);
  assert.equal(validateProfileInput({ displayName: "A", bio: "a\u0000b", username: "abc" }).ok, false);
});

test("username dan nama tampilan divalidasi", () => {
  const r = validateProfileInput({ displayName: "", bio: "", username: "-x-" });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.ok(r.errors.displayName);
    assert.ok(r.errors.username);
  }
  assert.equal(validateProfileInput({ displayName: "A", bio: 3, username: "ab" }).ok, false);
});
