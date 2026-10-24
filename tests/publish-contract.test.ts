// Tes kontrak statis: strategi cache, otorisasi, dan urutan aman pada kode publish/unpublish + halaman publik.
// Tes statis (membaca source) — bukan eksekusi terhadap Next/Supabase asli.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PUBLIC_PAGE_REVALIDATE_SECONDS } from "../src/lib/publish/state.ts";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""); // tanpa komentar
const actions = read("src/app/dashboard/editor/publish-actions.ts");
const page = code("src/app/[username]/page.tsx");
const fetcher = code("src/lib/publish/fetch.ts");
const mig = read("supabase/migrations/20261016040000_phase4_publish.sql");
const nextConfig = read("next.config.ts");

test("cache: halaman publik statis (ISR), revalidate literal = konstanta, tanpa API dinamis", () => {
  assert.match(page, new RegExp(`export const revalidate = ${PUBLIC_PAGE_REVALIDATE_SECONDS};`));
  for (const src of [page, fetcher, code("src/lib/supabase/public.ts")]) {
    assert.doesNotMatch(src, /next\/headers|cookies\(|headers\(|createSupabaseServerClient/);
  }
  assert.doesNotMatch(page, /force-dynamic/);
});

test("halaman publik hanya memakai SATU rpc get_public_page (tanpa query tabel/draft, tanpa polling)", () => {
  assert.match(fetcher, /rpc\("get_public_page"/);
  assert.doesNotMatch(fetcher, /\.from\(/);
  assert.doesNotMatch(page + fetcher, /setInterval|setTimeout|useEffect|draft_config|page_links/);
  assert.match(page, /notFound\(\)/);
  assert.match(page, /mode="live"/);
});

test("cache invalidation: publish dan unpublish me-revalidate path publik setelah operasi database berhasil", () => {
  const pub = actions.slice(actions.indexOf("export async function publishAction"), actions.indexOf("export async function unpublishAction"));
  const unpub = actions.slice(actions.indexOf("export async function unpublishAction"));
  for (const [name, body, rpc] of [["publish", pub, 'rpc("publish_page_with_assets"'], ["unpublish", unpub, 'rpc("unpublish_page")']] as const) {
    assert.ok(body.includes(rpc), `${name} harus memanggil RPC`);
    assert.match(body, /revalidatePath\(publicPath\(/, `${name} harus invalidasi path publik`);
    assert.match(body, /revalidatePath\("\/dashboard"\)/);
    assert.ok(body.indexOf(rpc) < body.indexOf("revalidatePath("), `${name}: invalidasi hanya setelah RPC`);
    assert.ok(body.indexOf("revalidatePath(") < body.indexOf("ok: true"), `${name}: 'ok' hanya setelah invalidasi`);
  }
});

test("urutan publish: validasi -> rencana aset -> salin -> RPC; gagal salin berhenti sebelum RPC", () => {
  const order = ["validatePublishable(", "planAssetSync(", "storage.from(DRAFT_BUCKET).download", "storage.from(PUBLIC_BUCKET).upload", 'rpc("publish_page_with_assets"'];
  let last = -1;
  for (const m of order) {
    const i = actions.indexOf(m);
    assert.ok(i > last, `urutan salah/hilang: ${m}`);
    last = i;
  }
  assert.match(actions, /validateImageBytes\(/);
});

test("otorisasi: sesi server, tidak ada input client (user id/path/username) pada action publish", () => {
  assert.match(actions, /^"use server";/);
  const exported = [...actions.matchAll(/^export\s+(.*)$/gm)].map((m) => m[1] ?? "");
  for (const e of exported) assert.match(e, /^async function /);
  for (const fn of ["publishAction()", "unpublishAction()"]) assert.ok(actions.includes(`export async function ${fn}`), `${fn} tidak menerima argumen`);
  assert.equal((actions.match(/auth\.getUser\(\)/g) ?? []).length, 2);
  assert.doesNotMatch(actions, /service_role|createClient\(|formData|searchParams/i);
  assert.doesNotMatch(actions, /public-assets.*(remove|delete)|\.remove\(/); // tidak menghapus aset publik (snapshot lama mungkin masih memakainya)
});

test("DB: publish serial (FOR UPDATE), rollback total, aset diverifikasi ada di storage, celah client ditutup", () => {
  assert.match(mig, /from public\.pages where owner_id = v_uid for update/);
  assert.match(mig, /storage\.objects/);
  assert.match(mig, /revoke all on function public\.publish_page\(\) from public, anon, authenticated/);
  assert.match(mig, /revoke insert, update on public\.page_links from authenticated/);
  assert.match(mig, /grant execute on function public\.publish_page_with_assets\(text, text, jsonb\) to authenticated/);
  assert.doesNotMatch(mig, /grant execute on function public\.publish_page_with_assets[^;]*anon/);
  assert.doesNotMatch(mig, /drop table|truncate|delete from/i);
});

test("draft/editor/dashboard tidak di-cache publik", () => {
  for (const route of ["/dashboard/:path*", "/onboarding/:path*"]) assert.ok(nextConfig.includes(route));
  assert.match(nextConfig, /private, no-store/);
  assert.match(read("src/app/dashboard/editor/page.tsx"), /force-dynamic/);
});

test("UI: URL live hanya via status; panel tidak mempercayai klaim klien", () => {
  const panel = read("src/components/publish/publish-panel.tsx");
  assert.match(panel, /view\.showLiveUrl \? <CopyUrl/);
  assert.match(panel, /setOp\("published-ok"\)/);
  const okIdx = panel.indexOf("if (result.ok)");
  assert.ok(okIdx > panel.indexOf("await publishAction()"), "status berhasil hanya setelah action menjawab");
  const copy = read("src/components/publish/copy-url.tsx");
  assert.match(copy, /execCommand\("copy"\)/); // cara alternatif tanpa Clipboard API
});
