#!/usr/bin/env node
// Pemeriksa kebocoran secret. Pakai: node scripts/check-secrets.mjs [folder] [--package]
//   (tanpa --package) mode pengembangan: .env.local diizinkan ada, asalkan di-git-ignore.
//   --package          mode paket/ZIP: tidak boleh ada berkas .env* selain .env.example.
// Keluar dengan kode 1 jika ada temuan.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, basename, sep } from "node:path";

const args = process.argv.slice(2);
const packageMode = args.includes("--package");
const root = args.find((a) => !a.startsWith("--")) ?? ".";

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".vercel", "coverage", ".rona-test-db"]);
const TEXT_EXT = /\.(ts|tsx|js|mjs|cjs|json|md|sql|css|sh|txt|yml|yaml|example|env)$|^\.env/;
const findings = [];
const note = (file, msg) => findings.push(`${file}: ${msg}`);

const JWT = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/;
const SB_SECRET = /sb_secret_[A-Za-z0-9_-]{16,}/;
const PG_URL_WITH_PASSWORD = /postgres(?:ql)?:\/\/[^\s:@/]+:[^\s@/]{3,}@/;

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(full);
      continue;
    }
    check(full, name);
  }
}

function check(full, name) {
  const rel = relative(root, full).split(sep).join("/");

  if (name.startsWith(".env") && name !== ".env.example") {
    if (packageMode) note(rel, "berkas .env* tidak boleh ada di paket");
    return; // isi .env.local memang berisi kunci publik; tidak dipindai
  }
  if (!TEXT_EXT.test(name)) return;

  const text = readFileSync(full, "utf8");
  if (JWT.test(text)) note(rel, "mengandung string berbentuk JWT (kemungkinan kunci)");
  if (SB_SECRET.test(text)) note(rel, "mengandung string berbentuk sb_secret_");
  if (PG_URL_WITH_PASSWORD.test(text)) note(rel, "mengandung URL database dengan password");

  if (rel.startsWith("src/") && /process\.env\.SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE/.test(text) && rel !== "src/lib/supabase/key-check.ts") {
    note(rel, "kode aplikasi merujuk service-role key");
  }
  if (/NEXT_PUBLIC_[A-Z_]*(SERVICE|SECRET|PRIVATE)[A-Z_]*/.test(text)) {
    note(rel, "variabel NEXT_PUBLIC_* dengan nama SERVICE/SECRET/PRIVATE");
  }
}

if (!existsSync(root)) {
  console.error(`Folder tidak ditemukan: ${root}`);
  process.exit(2);
}
walk(root);

// .env.example harus berisi placeholder kosong, bukan nilai.
const example = join(root, ".env.example");
if (existsSync(example)) {
  for (const line of readFileSync(example, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.+)$/);
    if (m && m[1] !== "NEXT_PUBLIC_SITE_URL") note(".env.example", `${m[1]} berisi nilai; harus kosong`);
  }
}

// .env.local harus di-git-ignore.
const gi = join(root, ".gitignore");
if (!existsSync(gi) || !/^\.env\*?\.?\*?$|^\.env$/m.test(readFileSync(gi, "utf8"))) {
  note(".gitignore", "tidak melindungi .env / .env.*");
}

if (findings.length > 0) {
  console.error(`DITEMUKAN ${findings.length} masalah:\n- ${findings.join("\n- ")}`);
  process.exit(1);
}
console.log(`OK: tidak ada secret terdeteksi (${packageMode ? "mode paket" : "mode pengembangan"}).`);
