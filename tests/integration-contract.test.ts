// Tes kontrak lintas fase (Phase 8): urutan & keamanan migration, kontrak RPC aplikasi <-> database, logging aman,
// konfigurasi produksi. Tes STATIS (membaca source) — bukan eksekusi terhadap Supabase/Next asli.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { redact, toSafeEntry } from "../src/lib/log.ts";

const root = new URL("../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), "utf8");
const migDir = "supabase/migrations/";
const migrations = readdirSync(new URL(migDir, root)).filter((f) => f.endsWith(".sql")).sort();
const strip = (sql: string) => sql.replace(/--.*$/gm, "");
const walk = (dir: string): string[] =>
  readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}${e.name}/`) : [`${dir}${e.name}`]));

test("migration: 8+ file, timestamp unik & berurutan, nama sesuai pola, daftar lengkap", () => {
  assert.ok(migrations.length >= 9);
  const stamps = migrations.map((m) => m.slice(0, 14));
  assert.equal(new Set(stamps).size, stamps.length, "timestamp ganda");
  assert.deepEqual([...stamps].sort(), stamps);
  for (const m of migrations) assert.match(m, /^\d{14}_[a-z0-9_]+\.sql$/);
  assert.deepEqual(migrations.map((m) => m.replace(/^\d{14}_/, "").replace(".sql", "")), [
    "foundation", "phase1_onboarding_assets", "phase2_claim_profile_reserved", "phase3_editor", "phase4_publish",
    "phase5_catalog", "phase6_draft_save", "phase7_account_page_settings", "phase8_hardening",
  ]);
});

test("migration: tidak ada perubahan destruktif pada data (drop table/column, truncate, delete/update massal)", () => {
  for (const m of migrations) {
    const sql = strip(read(migDir + m));
    assert.doesNotMatch(sql, /\bdrop\s+table\b/i, `${m}: drop table`);
    assert.doesNotMatch(sql, /\bdrop\s+column\b/i, `${m}: drop column`);
    assert.doesNotMatch(sql, /\btruncate\s+(table\s+)?public\./i, `${m}: truncate`);
    assert.doesNotMatch(sql, /\bdelete\s+from\s+public\.(profiles|pages|page_links|catalog_items|catalog_images|published_snapshots)\b/i, `${m}: delete data`);
  }
});

test("migration fase 7 & 8 idempoten: semua DDL memakai if not exists / create or replace / revoke-grant", () => {
  for (const m of migrations.slice(-2)) {
    const sql = strip(read(migDir + m));
    for (const line of sql.split(";")) {
      const l = line.trim();
      if (/^create\s+table\b/i.test(l)) assert.match(l, /if not exists/i, `${m}: ${l.slice(0, 60)}`);
      if (/^create\s+function\b/i.test(l)) assert.fail(`${m}: gunakan create or replace`);
      if (/^alter\s+table .* add column\b/i.test(l)) assert.match(l, /if not exists/i, `${m}: ${l.slice(0, 60)}`);
      if (/^drop\b/i.test(l)) assert.fail(`${m}: drop tak terdokumentasi: ${l.slice(0, 60)}`);
    }
  }
});

test("migration: setiap fungsi SECURITY DEFINER mengunci search_path", () => {
  for (const m of migrations) {
    const sql = strip(read(migDir + m));
    for (const block of sql.split(/create (?:or replace )?function/i).slice(1)) {
      const head = block.split(/\bas\s+\$/i)[0] ?? "";
      if (/security definer/i.test(head)) assert.match(head, /set search_path\s*=\s*''/i, `${m}: ${head.slice(0, 50)}`);
    }
  }
});

test("kontrak RPC: setiap rpc() di source ada di migration dengan nama parameter yang sama", () => {
  const defs = new Map<string, string[]>();
  for (const m of migrations) {
    const sql = strip(read(migDir + m));
    for (const x of sql.matchAll(/create (?:or replace )?function\s+public\.(\w+)\s*\(([^)]*)\)/gi)) {
      const params = (x[2] ?? "").split(",").map((p) => p.trim().split(/\s+/)[0] ?? "").filter(Boolean);
      defs.set(x[1] ?? "", params); // definisi TERAKHIR yang berlaku
    }
  }
  let seen = 0;
  for (const f of walk("src/").filter((p) => /\.(ts|tsx)$/.test(p))) {
    const src = read(f);
    for (const x of src.matchAll(/\.rpc\(\s*"(\w+)"(?:\s*,\s*(\{[^}]*\}|\w+(?:\.\w+)*))?/g)) {
      const name = x[1] ?? "";
      assert.ok(defs.has(name), `${f}: rpc("${name}") tidak ada di migration`);
      seen++;
      const arg = x[2];
      if (arg && arg.startsWith("{")) {
        const keys = [...arg.matchAll(/\b(p_\w+)\s*:/g)].map((k) => k[1] ?? "");
        for (const k of keys) assert.ok(defs.get(name)?.includes(k), `${f}: rpc("${name}") parameter ${k} tidak ada di database`);
      }
    }
  }
  assert.ok(seen >= 10, `hanya ${seen} panggilan rpc terbaca`);
});

test("save_draft (Phase 8) mengunci pages SEBELUM profiles, sama dengan publish (anti-deadlock)", () => {
  const sql = strip(read(migDir + "20261023000000_phase8_hardening.sql"));
  const body = sql.slice(sql.indexOf("create or replace function public.save_draft"));
  const iPages = body.indexOf("from public.pages where owner_id = v_uid for update");
  const iProfiles = body.indexOf("from public.profiles where id = v_uid for update");
  assert.ok(iPages > 0 && iProfiles > iPages, "urutan kunci salah");
});

test("hardening: hak TRUNCATE/INSERT/DELETE berlebih dicabut", () => {
  const sql = strip(read(migDir + "20261023000000_phase8_hardening.sql"));
  assert.match(sql, /revoke truncate, references, trigger on all tables in schema public from anon, authenticated/i);
  assert.match(sql, /revoke insert, delete on public\.pages from authenticated/i);
  assert.match(sql, /revoke execute on function public\.is_username_available\(text\) from anon/i);
});

test("logging aman: samaran JWT/Bearer/kunci/token/email; tidak mencatat objek mentah", () => {
  const jwt = ["eyJ" + "hbGciOiJIUzI1NiJ9", "eyJ" + "zdWIiOiIxMjM0NTY3ODkwIn0", "abcdefghijk"].join("."); // dirakit saat runtime: bukan JWT sungguhan, tidak memicu pemindai secret
  const r = redact(`gagal ${jwt} Bearer abc.def password=hunter2 token: xyz a@b.co sb_secret_ABCDEF123 ${"A".repeat(60)}`);
  for (const bad of ["eyJ", "hunter2", "xyz", "a@b.co", "sb_secret", "AAAAAAAA", "abc.def"]) assert.ok(!r.includes(bad), `bocor: ${bad} -> ${r}`);
  const e = toSafeEntry("x", { name: "AuthApiError", code: "bad", status: 400, message: `token=abc`, stack: "SECRET STACK", extra: { password: "p" } });
  assert.deepEqual(Object.keys(e).sort(), ["code", "message", "name", "scope", "status"]);
  assert.ok(!JSON.stringify(e).includes("SECRET"));
  assert.equal(toSafeEntry("x", "plain").message, "plain");
});

test("server action: tidak ada console.* langsung (hanya logServerError) dan tidak ada service-role", () => {
  for (const f of walk("src/app/").filter((p) => /actions\.ts$/.test(p))) {
    const code = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(code, /console\./, `${f}: console langsung`);
    assert.doesNotMatch(code, /service_role|SERVICE_ROLE/i, `${f}: service-role`);
  }
  for (const f of walk("src/").filter((p) => /\.(ts|tsx)$/.test(p))) {
    assert.doesNotMatch(read(f), /NEXT_PUBLIC_\w*(SERVICE|SECRET)/i, `${f}: secret lewat NEXT_PUBLIC`);
    assert.doesNotMatch(read(f), /SUPABASE_SERVICE_ROLE_KEY/, `${f}: service-role di source`);
  }
});

test("konfigurasi produksi: header keamanan, noStore rute privat, .env.example tanpa nilai, .vercel.app tanpa konfigurasi domain", () => {
  const cfg = read("next.config.ts");
  for (const h of ["X-Content-Type-Options", "Referrer-Policy", "X-Frame-Options", "Strict-Transport-Security", "Permissions-Policy"]) assert.ok(cfg.includes(h), h);
  assert.ok(cfg.includes('"/dashboard/:path*"') && cfg.includes("no-store"));
  const env = read(".env.example");
  for (const line of env.split("\n").filter((l) => /^[A-Z_]+=/.test(l))) assert.match(line, /^[A-Z_]+=$/, `nilai di .env.example: ${line.split("=")[0]}`);
  assert.ok(!/vercel\.app|custom-domain|domain\.com/i.test(cfg), "next.config tidak boleh mengunci domain");
  assert.match(env, /NEXT_PUBLIC_SITE_URL/);
});

test("halaman publik: tanpa cookies()/headers(); route privat tidak di-cache; error boundary ada", () => {
  const files = walk("src/app/");
  for (const need of ["src/app/error.tsx", "src/app/global-error.tsx", "src/app/not-found.tsx", "src/app/dashboard/settings/loading.tsx", "src/app/dashboard/editor/loading.tsx"]) assert.ok(files.includes(need), need);
  const pub = read("src/app/[username]/page.tsx").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(pub, /cookies\(\)|headers\(\)/);
  for (const p of ["src/app/dashboard/settings/page.tsx", "src/app/dashboard/editor/page.tsx"]) assert.match(read(p), /force-dynamic/);
});

test("README tidak menyuruh mengekstrak ZIP fase lama", () => {
  const readme = read("README.md");
  assert.doesNotMatch(readme, /RONA_Phase_\d_[A-Za-z_]+\.zip/);
  assert.doesNotMatch(readme, /Phase 5 services catalog/);
});

test("skrip verifikasi: status PASS/FAIL/SKIPPED, exit code asli, tidak mengubah dependency", () => {
  const s = read("scripts/verify-with-npm.sh");
  assert.match(s, /npm ping/);
  assert.match(s, /rc=\$\?/); // exit code asli ditangkap
  for (const st of ["PASS", "FAIL", "SKIPPED"]) assert.match(s, new RegExp(st));
  assert.match(s, /SKIPPED bukan berhasil/);
  assert.match(s, /22.*18/); // syarat Node >= 22.18 diperiksa
  assert.match(s, /PGBIN|initdb/); // prasyarat PostgreSQL 16 diperiksa sebelum test:db
  assert.match(s, /preflight-browser\.mjs/); // prasyarat browser diperiksa sebelum test:browser
  assert.doesNotMatch(s, /--save(-dev)?\b|npm (add|uninstall)\b/); // tidak mengubah package.json
  assert.doesNotMatch(s, />\s*package-lock\.json|echo .*>.*package-lock/); // tidak membuat lockfile manual
});

test("preflight browser hanya memeriksa (tidak memasang/menulis apa pun)", () => {
  const s = read("scripts/preflight-browser.mjs");
  assert.doesNotMatch(s, /execSync|spawn|exec\(|writeFileSync|appendFileSync/);
  for (const pkg of ["esbuild", "playwright", "tailwindcss", "react-dom"]) assert.match(s, new RegExp(pkg));
});

test("schema_check.sql hanya SELECT (tidak mengubah apa pun)", () => {
  const sql = strip(read("supabase/verify/schema_check.sql")).replace(/'[^']*'/g, "''"); // abaikan literal string
  assert.doesNotMatch(sql, /\b(insert|update|delete|drop|alter|truncate|grant|revoke|create)\b/i);
});

test("GitHub Actions: tidak menyembunyikan kegagalan, tidak memakai secret, izin minimal", () => {
  const noYamlComments = (t: string) => t.replace(/^\s*#.*$/gm, "");
  const ci = noYamlComments(read(".github/workflows/ci.yml"));
  const lock = noYamlComments(read(".github/workflows/lockfile.yml"));
  for (const w of [ci, lock]) {
    assert.doesNotMatch(w, /continue-on-error/);
    assert.doesNotMatch(w, /\$\{\{\s*secrets\./); // tidak ada secret yang dipakai
  }
  assert.match(ci, /bash scripts\/verify-with-npm\.sh\s*$/m);
  assert.doesNotMatch(ci.split("\n").filter((l) => /verify-with-npm/.test(l)).join("\n"), /\|\|\s*true/);
  assert.match(ci, /permissions:\s*\n\s*contents: read/); // CI hanya membaca
  assert.match(ci, /node-version: "22"/);
  assert.match(ci, /esbuild@\d[\d.]*/); // alat browser dipatok versinya, di folder terpisah
  assert.match(ci, /RUNNER_TEMP\/rona-tools/);
  assert.doesNotMatch(ci, /--save|npm (add|uninstall)/);
  // lockfile hanya dari npm (tidak ditulis tangan) dan hanya bila belum ada
  assert.match(lock, /npm install --package-lock-only/);
  assert.match(lock, /need=false/);
  assert.doesNotMatch(lock, /echo .*>\s*package-lock\.json|cat\s*>\s*package-lock\.json/);
});

test("repository siap GitHub: .gitignore melindungi secret/build, .env.example tanpa nilai, .gitattributes LF", () => {
  const gi = read(".gitignore");
  for (const p of ["node_modules/", ".next/", ".env", "!.env.example", ".vercel", "verification-output/", "*.tsbuildinfo"]) assert.ok(gi.includes(p), p);
  const env = read(".env.example");
  for (const line of env.split("\n").filter((l) => /^[A-Z_]+=/.test(l))) assert.match(line, /^[A-Z_]+=\s*$/, `nilai harus kosong: ${line.split("=")[0]}`);
  assert.match(read(".gitattributes"), /eol=lf/);
  assert.doesNotMatch(env.replace(/^\s*#.*$/gm, ""), /service_role|sb_secret_|eyJ/); // tidak ada nilai secret di luar komentar
  for (const d of ["docs/post-deployment-checklist.md", "docs/supabase-test-project-verification.md", "docs/migrations.md", "docs/production-readiness-report.md"]) {
    assert.ok(read(d).length > 200, d);
    assert.ok(read("README.md").includes(d), `README harus menautkan ${d}`);
  }
});
