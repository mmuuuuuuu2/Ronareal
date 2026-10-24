import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  USERNAME_PATTERN,
  normalizeUsername,
  validateUsername,
} from "../src/lib/validation/username.ts";

test("normalizeUsername: trim + huruf kecil, bukan string -> kosong", () => {
  assert.equal(normalizeUsername("  Nadia-Rahma "), "nadia-rahma");
  assert.equal(normalizeUsername(undefined), "");
  assert.equal(normalizeUsername(42), "");
  assert.equal(normalizeUsername("ＡＢＣ"), "abc"); // fullwidth -> ASCII (NFKC)
});

test("validateUsername: username valid", () => {
  for (const ok of ["abc", "a1b", "nadia-rahma", "user_name", "a".repeat(30), "a-b_c-9"]) {
    const r = validateUsername(ok);
    assert.equal(r.ok, true, ok);
  }
  const r = validateUsername("  MixedCase ");
  assert.deepEqual(r, { ok: true, value: "mixedcase" });
});

test("validateUsername: kode galat yang tepat", () => {
  const cases: Array<[unknown, string]> = [
    ["", "empty"],
    ["   ", "empty"],
    [null, "empty"],
    ["ab", "too_short"],
    ["a".repeat(31), "too_long"],
    ["bad name", "invalid_chars"],
    ["emoji😀x", "invalid_chars"],
    ["a.b.c", "invalid_chars"],
    ["-abc", "invalid_edge"],
    ["abc_", "invalid_edge"],
    ["_abc", "invalid_edge"],
  ];
  for (const [input, code] of cases) {
    const r = validateUsername(input);
    assert.equal(r.ok, false, String(input));
    if (!r.ok) assert.equal(r.code, code, `${String(input)} -> ${code}`);
  }
});

test("validateUsername: konsisten dengan USERNAME_PATTERN pada kasus acak", () => {
  const alphabet = "abcXYZ019_- .@";
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 2000; i++) {
    const len = Math.floor(rnd() * 34);
    let s = "";
    for (let j = 0; j < len; j++) s += alphabet[Math.floor(rnd() * alphabet.length)];
    const normalized = normalizeUsername(s);
    const r = validateUsername(s);
    assert.equal(r.ok, USERNAME_PATTERN.test(normalized), JSON.stringify(s));
  }
});

test("anti-drift: pola username identik dengan yang ada di migration SQL", () => {
  const dir = join(import.meta.dirname, "..", "supabase", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql"));
  const sqlLiteral = /'(\^\[a-z0-9\]\(\?:\[a-z0-9_-\]\{1,28\}\)\[a-z0-9\]\$)'/g;
  let found = 0;
  for (const f of files) {
    const text = readFileSync(join(dir, f), "utf8");
    for (const m of text.matchAll(sqlLiteral)) {
      found++;
      assert.equal(m[1], USERNAME_PATTERN.source, `${f}: pola berbeda dari USERNAME_PATTERN`);
    }
  }
  // foundation(check) + phase1(is_username_available, claim_username) + phase2(claim_profile)
  assert.ok(found >= 4, `hanya ${found} kemunculan pola di migration; diharapkan >= 4`);
});
