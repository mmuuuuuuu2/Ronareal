// Tes kontrak: menjaga kode TypeScript tetap sejalan dengan migration SQL dan memastikan aturan keamanan server action.
// Tes statis (membaca source), bukan eksekusi terhadap Supabase asli.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { validateLinkUrl } from "../src/lib/validation/url.ts";
import { LINK_DESCRIPTION_MAX, LINK_TITLE_MAX, MAX_LINKS_PER_PAGE } from "../src/lib/validation/link.ts";
import { BIO_MAX_LENGTH } from "../src/lib/validation/profile.ts";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const foundation = read("supabase/migrations/20261016000000_foundation.sql");
const phase3 = read("supabase/migrations/20261016030000_phase3_editor.sql");
const actions = read("src/app/dashboard/editor/actions.ts");

test("anti-drift: batas panjang TS = constraint tabel", () => {
  assert.match(foundation, new RegExp(`title text not null check \\(char_length\\(title\\) between 1 and ${LINK_TITLE_MAX}\\)`));
  assert.match(foundation, new RegExp(`description text check \\(char_length\\(description\\) <= ${LINK_DESCRIPTION_MAX}\\)`));
  assert.match(foundation, new RegExp(`profiles_bio_len check \\(char_length\\(bio\\) <= ${BIO_MAX_LENGTH}\\)`));
  assert.match(phase3, new RegExp(`v_count >= ${MAX_LINKS_PER_PAGE}`));
});

test("anti-drift: setiap URL yang diterima validator TS juga lolos regex constraint database", () => {
  const m = phase3.match(/check \(url ~\* '([^']+)'/);
  assert.ok(m, "regex constraint tidak ditemukan di migration");
  const js = new RegExp((m?.[1] ?? "").replaceAll("[:space:]", "\\s"), "i");
  const samples = [
    "https://contoh.com", "contoh.com/a b".replace(" ", "%20"), "http://localhost:3000/x?y=1#z", "mailto:a@b.co?subject=Hi",
    "tel:+62 812".replace(" ", ""), "WWW.Contoh.com", "https://a.com/é", "tel:(021)555-1234",
  ];
  for (const s of samples) {
    const r = validateLinkUrl(s);
    assert.ok(r.ok, `validator seharusnya menerima ${s}`);
    if (r.ok) assert.ok(js.test(r.value), `regex DB harus menerima ${r.value}`);
  }
  for (const s of ["javascript:alert(1)", "data:text/html,x", "vbscript:x", "file:///x", "ftp://a.com"]) {
    assert.ok(!js.test(s), `regex DB harus menolak ${s}`);
    assert.equal(validateLinkUrl(s).ok, false);
  }
});

test("server actions: file 'use server' hanya mengekspor fungsi async", () => {
  assert.match(actions, /^"use server";/);
  const exported = [...actions.matchAll(/^export\s+(.*)$/gm)].map((m) => m[1] ?? "");
  assert.ok(exported.length >= 7);
  for (const e of exported) assert.match(e, /^async function /, `ekspor bukan async function: ${e}`);
});

test("server actions: setiap action memeriksa sesi dari server dan tidak mempercayai user/owner id dari input", () => {
  const names = [...actions.matchAll(/^export async function (\w+)/gm)].map((m) => m[1] ?? "");
  assert.deepEqual(
    names.sort(),
    ["createLinkAction", "deleteLinkAction", "removeImageAction", "reorderLinksAction", "saveDraftAction", "toggleLinkAction", "updateLinkAction", "uploadImageAction"].sort(),
  );
  for (const n of names) {
    const body = actions.slice(actions.indexOf(`export async function ${n}`)).split(/\nexport async function /)[0] ?? "";
    assert.match(body, /await session\(\)/, `${n} harus memanggil session()`);
    assert.match(body, /SIGNED_OUT/, `${n} harus menolak bila tidak ada sesi`);
  }
  assert.doesNotMatch(actions, /(owner_id|user_id|userId)\s*[:=]\s*(raw|input|formData)/i);
  assert.doesNotMatch(actions, /formData\.get\(["'](owner|user)/i);
  assert.match(actions, /auth\.getUser\(\)/);
  assert.doesNotMatch(actions, /service_role|SERVICE_ROLE|createClient\(/);
});

test("server actions: hasil update/delete selalu dicek (0 baris = bukan milik pengguna)", () => {
  assert.match(actions, /\.select\("id"\)/);
  assert.match(actions, /data\.length !== 1/);
  assert.match(actions, /NOT_FOUND/);
});

test("upload: server memvalidasi isi file dan membersihkan objek bila DB gagal; bucket privat dipakai", () => {
  assert.match(actions, /validateImageBytes\(/);
  assert.match(actions, /storage\.from\(DRAFT_BUCKET\)\.remove\(\[path\]\)/);
  assert.doesNotMatch(actions, /public-assets/);
  const load = read("src/lib/editor/load.ts");
  assert.match(load, /DRAFT_BUCKET = "draft-assets"/);
  assert.match(load, /createSignedUrls\(/);
  assert.doesNotMatch(load, /getPublicUrl/);
});

test("halaman editor memeriksa sesi di server dan tidak di-cache", () => {
  const page = read("src/app/dashboard/editor/page.tsx");
  assert.match(page, /getCurrentUser\(\)/);
  assert.match(page, /redirect\("\/login/);
  assert.match(page, /force-dynamic/);
});

test("tidak ada klien Supabase di komponen client", () => {
  for (const f of ["image-field", "editor-shell", "link-card", "links-panel", "profile-panel", "appearance-panel"]) {
    const src = read(`src/components/editor/${f}.tsx`);
    assert.doesNotMatch(src, /@supabase|createClient|createBrowserClient/, f);
  }
});
