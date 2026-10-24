import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPublicUrl, describePublish, parsePublishState, publicPath, type PublishState } from "../src/lib/publish/state.ts";

const S = (over: Partial<PublishState> = {}): PublishState => ({ isPublished: false, version: null, publishedAt: null, hasChanges: true, ...over });

test("parsePublishState: bentuk RPC dan nilai tak terduga", () => {
  assert.deepEqual(parsePublishState({ is_published: true, version: 4, published_at: "2026-01-01T00:00:00Z", has_changes: false }), {
    isPublished: true, version: 4, publishedAt: "2026-01-01T00:00:00Z", hasChanges: false,
  });
  assert.deepEqual(parsePublishState(null), S());
  assert.deepEqual(parsePublishState({ is_published: "ya", version: "3" }), S());
});

test("status: draft -> terbit -> perubahan -> berhasil, dengan label yang jelas", () => {
  assert.equal(describePublish(S(), "idle", false).key, "draft");
  assert.equal(describePublish(S({ isPublished: true, version: 1, hasChanges: false }), "idle", false).key, "published");
  assert.equal(describePublish(S({ isPublished: true, version: 1, hasChanges: false }), "idle", true).key, "changes");
  assert.equal(describePublish(S({ isPublished: true, version: 1, hasChanges: true }), "idle", false).key, "changes");
  assert.equal(describePublish(S({ isPublished: true, version: 1, hasChanges: false }), "published-ok", false).key, "success");
  assert.equal(describePublish(S(), "publishing", false).key, "publishing");
  assert.equal(describePublish(S(), "failed", false).key, "failed");
  assert.equal(describePublish(S(), "unpublished-ok", false).key, "unpublished");
});

test("URL live tidak ditampilkan seolah aktif bila halaman belum terbit", () => {
  for (const op of ["idle", "publishing", "unpublishing", "failed", "unpublished-ok", "published-ok"] as const) {
    assert.equal(describePublish(S({ isPublished: false }), op, false).showLiveUrl, false, `op=${op}`);
  }
  assert.equal(describePublish(S({ isPublished: true, hasChanges: false }), "idle", false).showLiveUrl, true);
  assert.equal(describePublish(S({ isPublished: true }), "unpublishing", false).showLiveUrl, false);
});

test("'berhasil' tidak muncul untuk status gagal atau sedang berjalan", () => {
  for (const op of ["publishing", "failed", "unpublishing"] as const) {
    assert.notEqual(describePublish(S({ isPublished: true, hasChanges: false }), op, false).key, "success");
  }
});

test("buildPublicUrl / publicPath", () => {
  assert.equal(publicPath("nadia"), "/nadia");
  assert.equal(buildPublicUrl("https://rona.vercel.app/dashboard?x=1", "nadia"), "https://rona.vercel.app/nadia");
  assert.equal(buildPublicUrl("http://localhost:3000", "nadia-1"), "http://localhost:3000/nadia-1");
  assert.equal(buildPublicUrl("javascript:alert(1)", "nadia"), null);
  assert.equal(buildPublicUrl("https://rona.app", "../x"), null);
  assert.equal(buildPublicUrl("bukan url", "nadia"), null);
});
