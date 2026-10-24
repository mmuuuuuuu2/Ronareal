// Tes kontrak statis Phase 5: otorisasi, alur publish tunggal, cache publik tanpa draft, keamanan modal, migration.
// Tes statis (membaca source) — bukan eksekusi terhadap Next/Supabase asli.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const actions = code("src/app/dashboard/editor/catalog-actions.ts");
const publish = code("src/app/dashboard/editor/publish-actions.ts");
const section = code("src/components/page/catalog-section.tsx");
const mig = read("supabase/migrations/20261016050000_phase5_catalog.sql");
const publicFiles = ["src/app/[username]/page.tsx", "src/lib/publish/fetch.ts", "src/lib/publish/snapshot.ts", "src/lib/catalog/view.ts"].map((f) => [f, code(f)] as const);

test("server actions katalog: 'use server' hanya mengekspor fungsi async; identitas dari sesi", () => {
  assert.match(read("src/app/dashboard/editor/catalog-actions.ts"), /^"use server";/);
  const exported = [...actions.matchAll(/^export (async function|const|function|type|class|let|var)\s+(\w+)/gm)];
  for (const m of exported) assert.equal(m[1], "async function", `${m[2]} harus async function`);
  assert.ok(exported.length >= 10);
  assert.match(actions, /auth\.getUser\(\)/);
  assert.doesNotMatch(actions, /(userId|user_id|ownerId|owner_id)\s*[:=]\s*(input|raw|formData|o\.)/i);
});

test("setiap action menolak sesi kosong dan memvalidasi input di server", () => {
  const bodies = actions.split(/export async function /).slice(1);
  for (const b of bodies) {
    const name = b.slice(0, b.indexOf("("));
    assert.ok(/session\(\)/.test(b), `${name} harus memeriksa sesi`);
    assert.ok(/SIGNED_OUT/.test(b), `${name} harus menolak tanpa sesi`);
  }
  assert.match(actions, /validateItem\(input\)/);
  assert.match(actions, /validateCatalogUpload\(/);
  assert.match(actions, /isUuid\(/);
});

test("page_id dari sesi server, bukan dari client; path foto dibangun server (nama acak)", () => {
  assert.match(actions, /ownPageId\(s\.supabase, s\.user\.id\)/);
  assert.doesNotMatch(actions, /formData\.get\("(path|storage_path|pageId|page_id|userId|uid)"\)/);
  assert.match(actions, /buildCatalogPath\(user\.id, /);
  assert.match(actions, /randomUUID\(\)/);
  assert.match(actions, /upsert: false/);
});

test("action katalog hanya menyentuh DRAFT: tidak menerbitkan, tidak membuat URL publik, tidak menghapus aset publik", () => {
  assert.doesNotMatch(actions, /publish_page|public-assets|PUBLIC_BUCKET|getPublicUrl|revalidatePath/);
  assert.doesNotMatch(actions, /from\("public-assets"\)/);
  assert.match(actions, /storage\.from\(DRAFT_BUCKET\)\.remove/);
});

test("alur publish TUNGGAL: katalog ikut RPC publish_page_with_assets yang sama (tidak ada mekanisme kedua)", () => {
  assert.equal((publish.match(/rpc\("publish_page_with_assets"/g) ?? []).length, 1);
  assert.doesNotMatch(publish + actions, /rpc\("publish_catalog|insert\(\{[^}]*payload/);
  assert.match(publish, /catalog: catalogSources/);
  assert.match(publish, /parseCatalogConfig\(page\.draft_config\)/);
  assert.match(publish, /revalidatePath\(publicPath\(/);
  // salinan aset terjadi sebelum RPC; RPC sebelum revalidate
  assert.ok(publish.indexOf("plan.copies") < publish.indexOf('rpc("publish_page_with_assets"'));
  assert.ok(publish.indexOf('rpc("publish_page_with_assets"') < publish.indexOf("revalidatePath("));
});

test("halaman publik: katalog hanya dari snapshot (RPC tunggal), tanpa tabel draft, tanpa signed URL, tanpa polling", () => {
  for (const [file, src] of publicFiles) {
    assert.doesNotMatch(src, /catalog_items|catalog_images|storage_path|createSignedUrl|draft-assets|DRAFT_BUCKET/, file);
  }
  assert.doesNotMatch(section, /createSignedUrl|draft-assets|fetch\(|supabase/);
});

test("modal: <dialog> native, tutup jelas, kontrol keyboard/aria, timer dibersihkan, reduced-motion, tanpa dangerouslySetInnerHTML", () => {
  assert.match(section, /showModal\(\)/);
  assert.match(section, /aria-label="Tutup detail"/);
  assert.match(section, /aria-label="Foto sebelumnya"/);
  assert.match(section, /aria-label="Foto berikutnya"/);
  assert.match(section, /ArrowRight/);
  assert.match(section, /ArrowLeft/);
  assert.match(section, /prefers-reduced-motion: reduce/);
  assert.match(section, /show\.stop\(\)/, "cleanup efek menghentikan slideshow");
  assert.match(section, /clearInterval/);
  assert.match(section, /visibilitychange/);
  assert.doesNotMatch(section, /dangerouslySetInnerHTML|innerHTML|eval\(/);
  assert.match(section, /SAFE_CTA/);
  const css = read("src/app/globals.css");
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\)[\s\S]*rona-cat-dialog\[open\]/);
  assert.match(css, /@container \(min-width/);
});

test("PageView: katalog opsional (halaman tanpa katalog tetap bekerja)", () => {
  const pv = code("src/components/page/page-view.tsx");
  assert.match(pv, /data\.catalog \? <CatalogSection/);
});

test("migration Phase 5: aditif, idempoten, grant kolom, tidak mengubah tabel secara destruktif", () => {
  assert.doesNotMatch(mig, /drop table|truncate|delete from|drop column/i);
  assert.match(mig, /add column if not exists/i);
  assert.match(mig, /revoke insert, update on public\.catalog_items from authenticated/);
  assert.match(mig, /revoke insert, update on public\.catalog_images from authenticated/);
  assert.doesNotMatch(mig.slice(mig.indexOf("grant insert (page_id")), /published_path|cover_image_id|position, title/);
  assert.match(mig, /grant execute on function public\.publish_page_with_assets\(text, text, jsonb\) to authenticated/);
  assert.match(mig, /revoke all on function public\.publish_page\(\) from public, anon, authenticated/);
  for (const fn of ["build_catalog_payload", "catalog_enabled", "catalog_items_guard", "catalog_images_guard"]) {
    assert.match(mig, new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated`));
  }
  assert.equal((mig.match(/security definer/g) ?? []).length, (mig.match(/set search_path = ''/g) ?? []).length, "semua SECURITY DEFINER memakai search_path kosong");
  for (const old of ["20261016000000_foundation", "20261016010000_phase1_onboarding_assets", "20261016020000_phase2_claim_profile_reserved", "20261016030000_phase3_editor", "20261016040000_phase4_publish"]) {
    assert.ok(read(`supabase/migrations/${old}.sql`).length > 0);
  }
});

test("tidak ada service-role/secret di kode katalog", () => {
  for (const f of ["src/app/dashboard/editor/catalog-actions.ts", "src/components/page/catalog-section.tsx", "src/components/editor/catalog-photos.tsx", "src/components/editor/catalog-panel.tsx"]) {
    assert.doesNotMatch(read(f), /service_role|SERVICE_ROLE|SUPABASE_SECRET/i, f);
  }
});
