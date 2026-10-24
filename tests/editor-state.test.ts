import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SETTINGS } from "../src/lib/editor/settings.ts";
import {
  editorReducer, hasUnsavedChanges, initialEditorState, isDraftDirty, isLinkDirty, moveItem, toPreviewData,
  type EditorLink, type EditorState,
} from "../src/lib/editor/state.ts";

const link = (id: string, over: Partial<EditorLink> = {}): EditorLink => ({
  id, title: `T${id}`, url: `https://x.com/${id}`, description: "", icon: null, isVisible: true,
  imagePath: null, imageUrl: null, saved: { title: `T${id}`, url: `https://x.com/${id}`, description: "", icon: null },
  status: "idle", ...over,
});
const base = (links: EditorLink[] = []): EditorState =>
  initialEditorState({
    profile: { displayName: "Nadia", bio: "", username: "nadia" }, settings: { ...DEFAULT_SETTINGS },
    avatarUrl: null, backgroundUrl: null, links,
  });
const ids = (s: EditorState) => s.links.map((l) => l.id);

test("moveItem: memindah, batas, tidak mengubah array asal", () => {
  const a = [1, 2, 3];
  assert.deepEqual(moveItem(a, 0, 2), [2, 3, 1]);
  assert.deepEqual(moveItem(a, 2, 0), [3, 1, 2]);
  assert.deepEqual(moveItem(a, 0, -1), [1, 2, 3]);
  assert.deepEqual(moveItem(a, 1, 9), [1, 2, 3]);
  assert.deepEqual(a, [1, 2, 3]);
});

test("mengetik hanya mengubah state lokal dan menandai belum tersimpan", () => {
  let s = base();
  assert.equal(isDraftDirty(s), false);
  s = editorReducer(s, { type: "profile/set", field: "displayName", value: "Nadia R" });
  s = editorReducer(s, { type: "settings/set", patch: { radius: "sm" } });
  assert.equal(isDraftDirty(s), true);
  assert.equal(hasUnsavedChanges(s), true);
  assert.equal(s.savedProfile.displayName, "Nadia");
});

test("simpan draft berhasil membersihkan status kotor; gagal TIDAK menghapus input", () => {
  let s = base();
  s = editorReducer(s, { type: "profile/set", field: "bio", value: "Halo" });
  s = editorReducer(s, { type: "draft/saving" });
  assert.equal(s.save.status, "saving");
  s = editorReducer(s, { type: "draft/failed", message: "gagal", fieldErrors: { username: "dipakai" } });
  assert.equal(s.profile.bio, "Halo");
  assert.equal(isDraftDirty(s), true);
  assert.equal(s.profileErrors.username, "dipakai");
  s = editorReducer(s, { type: "draft/saved", profile: s.profile, settings: s.settings, at: 1 });
  assert.equal(isDraftDirty(s), false);
  assert.equal(s.save.status, "saved");
});

test("mengedit field menghapus galat field itu saja", () => {
  let s = base();
  s = editorReducer(s, { type: "draft/failed", message: "x", fieldErrors: { username: "a", bio: "b" } });
  s = editorReducer(s, { type: "profile/set", field: "username", value: "baru" });
  assert.equal(s.profileErrors.username, undefined);
  assert.equal(s.profileErrors.bio, "b");
});

test("tambah link baru -> belum tersimpan; simpan memberi id database", () => {
  let s = base();
  s = editorReducer(s, { type: "link/add" });
  const tmp = s.links[0]!;
  assert.ok(tmp.id.startsWith("new:"));
  assert.equal(isLinkDirty(tmp), true);
  s = editorReducer(s, { type: "link/edit", id: tmp.id, patch: { title: "Toko", url: "toko.com" } });
  s = editorReducer(s, { type: "link/saving", id: tmp.id });
  s = editorReducer(s, { type: "link/saved", id: tmp.id, newId: "uuid-1", fields: { title: "Toko", url: "https://toko.com", description: "", icon: null } });
  assert.equal(s.links[0]!.id, "uuid-1");
  assert.equal(isLinkDirty(s.links[0]!), false);
  assert.equal(s.links[0]!.url, "https://toko.com");
});

test("simpan link gagal: isian utuh, galat tampil, bisa dicoba lagi", () => {
  let s = base([link("a")]);
  s = editorReducer(s, { type: "link/edit", id: "a", patch: { title: "Baru" } });
  s = editorReducer(s, { type: "link/saving", id: "a" });
  s = editorReducer(s, { type: "link/failed", id: "a", message: "jaringan", fieldErrors: {} });
  assert.equal(s.links[0]!.title, "Baru");
  assert.equal(s.links[0]!.status, "error");
  assert.equal(isLinkDirty(s.links[0]!), true);
  s = editorReducer(s, { type: "link/edit", id: "a", patch: { title: "Baru 2" } });
  assert.equal(s.links[0]!.status, "idle");
  assert.equal(s.links[0]!.error, undefined);
});

test("discard: mengembalikan snapshot tersimpan; link baru dibuang", () => {
  let s = base([link("a")]);
  s = editorReducer(s, { type: "link/edit", id: "a", patch: { title: "Ubah", url: "salah" } });
  s = editorReducer(s, { type: "link/discard", id: "a" });
  assert.equal(s.links[0]!.title, "Ta");
  s = editorReducer(s, { type: "link/add" });
  const tmp = s.links[1]!.id;
  s = editorReducer(s, { type: "link/discard", id: tmp });
  assert.deepEqual(ids(s), ["a"]);
});

test("urutan: naik/turun, batas, dan pemulihan setelah gagal simpan", () => {
  const s0 = base([link("a"), link("b"), link("c")]);
  let s = editorReducer(s0, { type: "links/move", id: "c", direction: -1 });
  assert.deepEqual(ids(s), ["a", "c", "b"]);
  s = editorReducer(s, { type: "links/move", id: "a", direction: -1 });
  assert.deepEqual(ids(s), ["a", "c", "b"]);
  s = editorReducer(s, { type: "links/move", id: "tidak-ada", direction: 1 });
  assert.deepEqual(ids(s), ["a", "c", "b"]);
  s = editorReducer(s, { type: "links/replace", links: s0.links }); // rollback
  assert.deepEqual(ids(s), ["a", "b", "c"]);
});

test("toggle dan hapus", () => {
  let s = base([link("a"), link("b")]);
  s = editorReducer(s, { type: "link/visible", id: "a", value: false });
  assert.equal(s.links[0]!.isVisible, false);
  s = editorReducer(s, { type: "link/remove", id: "b" });
  assert.deepEqual(ids(s), ["a"]);
});

test("preview: hanya link tampil, berjudul, dan ber-URL aman", () => {
  const s = base([
    link("ok"),
    link("hidden", { isVisible: false }),
    link("notitle", { title: "  " }),
    link("xss", { url: "javascript:alert(1)" }),
    link("data", { url: "data:text/html,x" }),
    link("empty", { url: "" }),
  ]);
  assert.deepEqual(toPreviewData(s).links.map((l) => l.id), ["ok"]);
});

test("preview memakai nilai bawaan saat nama/username kosong", () => {
  let s = base();
  s = editorReducer(s, { type: "profile/set", field: "displayName", value: " " });
  s = editorReducer(s, { type: "profile/set", field: "username", value: "" });
  const p = toPreviewData(s);
  assert.equal(p.displayName, "Nama tampilan");
  assert.equal(p.username, "username");
});
