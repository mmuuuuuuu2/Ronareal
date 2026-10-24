import { test } from "node:test";
import assert from "node:assert/strict";
import { mapAuthError, mapProfileError } from "../src/lib/auth/errors.ts";

test("mapAuthError: kode Supabase -> pesan Indonesia", () => {
  assert.match(mapAuthError({ code: "invalid_credentials", status: 400 }, "login"), /salah/);
  assert.match(mapAuthError({ code: "email_not_confirmed", status: 400 }, "login"), /belum dikonfirmasi/);
  assert.match(mapAuthError({ code: "over_request_rate_limit", status: 429 }, "login"), /Terlalu banyak/);
  assert.match(mapAuthError({ status: 429 }, "register"), /Terlalu banyak/);
  assert.match(mapAuthError({ code: "weak_password" }, "register"), /lemah/);
  assert.match(mapAuthError({ name: "AuthRetryableFetchError", status: 0 }, "login"), /terhubung/);
  assert.match(mapAuthError({ status: 503 }, "login"), /Layanan/);
});

test("mapAuthError: tidak membocorkan keberadaan email atau pesan mentah", () => {
  const msg = mapAuthError({ code: "user_already_exists", message: "User already registered: a@b.co" }, "register");
  assert.doesNotMatch(msg, /already registered|a@b\.co/);
  assert.doesNotMatch(msg, /sudah terdaftar/);
  const generic = mapAuthError({ code: "aneh", message: "stacktrace rahasia" }, "login");
  assert.doesNotMatch(generic, /rahasia/);
  assert.ok(mapAuthError(null, "login").length > 0);
});

test("mapProfileError: pesan exception database -> galat per field", () => {
  assert.equal(mapProfileError({ message: "username_taken" }).field, "username");
  assert.equal(mapProfileError({ message: "username_reserved" }).field, "username");
  assert.equal(mapProfileError({ message: "username_invalid" }).field, "username");
  assert.equal(mapProfileError({ message: "display_name_invalid" }).field, "displayName");
  assert.equal(mapProfileError({ message: "profile_exists" }).alreadyOnboarded, true);
  assert.match(mapProfileError({ message: "not_authenticated" }).message, /Sesi/);
  assert.match(mapProfileError({ message: "TypeError: fetch failed" }).message, /terhubung/);
  const unknown = mapProfileError({ message: "relation \"x\" does not exist" });
  assert.equal(unknown.field, undefined);
  assert.doesNotMatch(unknown.message, /relation/);
});
