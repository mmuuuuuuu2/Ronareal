import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseSaveResult, planDraftSave, planHasChanges, revFrom } from "../src/lib/editor/draft-save.ts";
import { mapEditorError } from "../src/lib/editor/errors.ts";
import { DEFAULT_SETTINGS } from "../src/lib/editor/settings.ts";
import { editorReducer, initialEditorState, isDraftDirty, type EditorState } from "../src/lib/editor/state.ts";

const base = (): EditorState =>
  initialEditorState({
    profile: { displayName: "Nadia", bio: "", username: "nadia" }, settings: { ...DEFAULT_SETTINGS },
    avatarUrl: null, backgroundUrl: null, links: [], revs: { profile: 3, settings: 5 },
  });
const plan = (s: EditorState) => planDraftSave(s);

test("rencana simpan: tanpa perubahan tidak mengirim apa pun", () => {
  assert.equal(planHasChanges(plan(base())), false);
});

test("rencana simpan: hanya grup yang berubah dikirim (profil saja / tampilan saja)", () => {
  let s = editorReducer(base(), { type: "profile/set", field: "bio", value: "Halo" });
  let p = plan(s);
  assert.deepEqual(p.profile, { displayName: "Nadia", bio: "Halo", username: "nadia" });
  assert.equal(p.settings, null, "tampilan tidak dikirim => tidak menimpa tampilan tab lain");
  s = editorReducer(base(), { type: "settings/set", patch: { radius: "sm" } });
  p = plan(s);
  assert.equal(p.profile, null, "profil tidak dikirim => tidak menimpa profil tab lain");
  assert.equal(p.settings?.radius, "sm");
});

test("rencana simpan membawa revisi yang diketahui editor", () => {
  const s = editorReducer(base(), { type: "settings/set", patch: { radius: "sm" } });
  assert.deepEqual(plan(s).revs, { profile: 3, settings: 5 });
});

test("setelah simpan sebagian, hanya grup itu yang menjadi bersih dan revisi diperbarui", () => {
  let s = editorReducer(base(), { type: "settings/set", patch: { radius: "sm" } });
  s = editorReducer(s, { type: "profile/set", field: "bio", value: "Halo" });
  const p = plan(s);
  s = editorReducer(s, { type: "draft/saving" });
  s = editorReducer(s, {
    type: "draft/saved", settings: p.settings, profile: null, sent: { profile: null, settings: p.settings },
    revs: { profile: 3, settings: 6 }, at: 1,
  });
  assert.deepEqual(s.savedSettings.radius, "sm");
  assert.equal(s.savedProfile.bio, "", "profil tidak ikut tersimpan");
  assert.equal(isDraftDirty(s), true, "profil masih kotor");
  assert.deepEqual(s.revs, { profile: 3, settings: 6 });
});

test("mengetik saat proses simpan tidak ditimpa nilai lama dari server", () => {
  let s = editorReducer(base(), { type: "profile/set", field: "bio", value: "Satu" });
  const p = plan(s);
  s = editorReducer(s, { type: "draft/saving" });
  s = editorReducer(s, { type: "profile/set", field: "bio", value: "Satu dua" }); // diketik selama menyimpan
  s = editorReducer(s, {
    type: "draft/saved", profile: p.profile, settings: null, sent: { profile: p.profile, settings: null },
    revs: { profile: 4, settings: 5 }, at: 1,
  });
  assert.equal(s.profile.bio, "Satu dua", "ketikan terbaru dipertahankan");
  assert.equal(s.savedProfile.bio, "Satu");
  assert.equal(isDraftDirty(s), true, "masih tercatat belum tersimpan");
});

test("gagal/konflik: input pengguna dan revisi tidak berubah; konflik ditandai", () => {
  let s = editorReducer(base(), { type: "profile/set", field: "displayName", value: "Nama Baru" });
  s = editorReducer(s, { type: "settings/set", patch: { radius: "pill" } });
  const before = { profile: s.profile, settings: s.settings, revs: s.revs };
  s = editorReducer(s, { type: "draft/saving" });
  s = editorReducer(s, { type: "draft/failed", message: "konflik", conflict: true });
  assert.deepEqual({ profile: s.profile, settings: s.settings, revs: s.revs }, before);
  assert.equal(isDraftDirty(s), true);
  assert.equal(s.save.status, "error");
  assert.equal(s.save.status === "error" && s.save.conflict, true);
  s = editorReducer(s, { type: "draft/failed", message: "jaringan" });
  assert.equal(s.save.status === "error" && s.save.conflict, undefined);
});

test("parseSaveResult dan revFrom defensif", () => {
  assert.deepEqual(parseSaveResult({ username: "a", profile_rev: 1, settings_rev: 2 }), { username: "a", revs: { profile: 1, settings: 2 } });
  assert.equal(parseSaveResult(null), null);
  assert.equal(parseSaveResult({ username: "a", profile_rev: "1", settings_rev: 2 }), null);
  assert.equal(parseSaveResult({ username: 1, profile_rev: 1, settings_rev: 2 }), null);
  assert.equal(revFrom(7), 7);
  assert.equal(revFrom(-1), 0);
  assert.equal(revFrom("3"), 0);
  assert.equal(revFrom(undefined), 0);
});

test("pesan galat konflik jelas dan tidak mencoba ulang otomatis", () => {
  for (const m of ["draft_conflict_profile", "draft_conflict_settings"]) {
    const e = mapEditorError({ message: m });
    assert.match(e.message, /tab atau perangkat lain/);
    assert.match(e.message, /Muat ulang/);
    assert.equal(e.retryable, false);
  }
});

test("kontrak: saveDraftAction memakai RPC atomik, tidak membaca-lalu-menulis draft_config", () => {
  const src = readFileSync(new URL("../src/app/dashboard/editor/actions.ts", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("export async function saveDraftAction")).split(/\nexport async function /)[0] ?? "";
  assert.match(body, /rpc\("save_draft"/);
  assert.doesNotMatch(body, /draft_config/, "tidak boleh menyentuh draft_config langsung");
  assert.doesNotMatch(body, /from\("pages"\)|from\("profiles"\)/, "tidak boleh menulis tabel langsung");
  assert.doesNotMatch(body, /revalidatePath\("\/\[username\]|revalidatePath\(`\//, "simpan draft tidak menyegarkan halaman publik");
  const sql = readFileSync(new URL("../supabase/migrations/20261019000000_phase6_draft_save.sql", import.meta.url), "utf8");
  assert.match(sql, /draft_conflict_profile/);
  assert.match(sql, /draft_conflict_settings/);
  assert.doesNotMatch(sql, /published_snapshots/, "migration simpan-draft tidak menyentuh snapshot");
  assert.doesNotMatch(sql, /grant update \(.*(?:settings_rev|profile_rev)/i, "revisi tidak boleh ditulis client");
});
