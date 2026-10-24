#!/usr/bin/env node
// Pemeriksaan prasyarat harness browser (tests/browser). TIDAK memasang apa pun dan tidak mengubah package.json.
// Keluar 0  : semua prasyarat ada; stdout berisi dua baris `RONA_TOOLS=<dir>` dan `RONA_NODE_PATH=<dir>`.
// Keluar 10 : ada yang kurang; alasan per kandidat di stderr (jangan dianggap lulus: pemanggil harus mencatat SKIPPED).
// Tidak ada lokasi yang diasumsikan: kandidat = $RONA_TOOLS bila diatur (hanya itu), selain itu folder proyek lalu /opt/npm-tools HANYA bila ada.
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { delimiter, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const reasons = [];
const miss = (m) => reasons.push(m);
const version = (pkgJson) => { try { return JSON.parse(readFileSync(pkgJson, "utf8")).version ?? "?"; } catch { return null; } };

// RONA_TOOLS yang diatur eksplisit adalah SATU-SATUNYA kandidat (tidak diam-diam jatuh ke lokasi lain).
const candidates = process.env.RONA_TOOLS
  ? [resolve(process.env.RONA_TOOLS)]
  : [ROOT, ...(existsSync("/opt/npm-tools") ? ["/opt/npm-tools"] : [])];

function inspectTools(dir) {
  const nm = `${dir}/node_modules`;
  const problems = [];
  if (!existsSync(nm)) return { problems: [`${dir}: folder node_modules tidak ada`] };
  if (!existsSync(`${nm}/esbuild/lib/main.js`)) problems.push(`${dir}: paket esbuild tidak terpasang`);
  const tw = version(`${nm}/tailwindcss/package.json`);
  if (!tw || !existsSync(`${nm}/tailwindcss/dist/lib.mjs`)) problems.push(`${dir}: tailwindcss tidak terpasang (butuh v4 dengan dist/lib.mjs)`);
  else if (!tw.startsWith("4.")) problems.push(`${dir}: tailwindcss ${tw} bukan v4`);
  const pw = version(`${nm}/playwright/package.json`);
  if (!pw) problems.push(`${dir}: paket playwright tidak terpasang`);
  if (problems.length) return { problems };
  let exe = "";
  try { exe = createRequire(`${nm}/`)("playwright").chromium.executablePath(); } catch (e) { problems.push(`${dir}: playwright tidak dapat dimuat (${e.message.split("\n")[0]})`); }
  if (!problems.length && (!exe || !existsSync(exe))) problems.push(`${dir}: Chromium milik Playwright belum diunduh (perkiraan lokasi: ${exe || "?"}); jalankan: npx playwright install chromium`);
  return { problems, exe, pw, tw };
}

let chosen = null;
for (const c of candidates) {
  const r = inspectTools(c);
  if (r.problems.length === 0) { chosen = { dir: c, ...r }; break; }
  reasons.push(...r.problems);
}
if (!chosen) miss("tidak ada lokasi alat uji browser (esbuild + tailwindcss v4 + playwright + Chromium) yang lengkap");

const nodePaths = (process.env.RONA_NODE_PATH ?? `${ROOT}/node_modules`).split(delimiter === ";" ? ";" : ":").filter(Boolean);
const reactDir = nodePaths.find((p) => existsSync(`${p}/react/package.json`) && existsSync(`${p}/react-dom/package.json`));
if (!reactDir) miss(`react dan react-dom tidak ditemukan di ${nodePaths.join(", ")} (jalankan npm install, atau atur RONA_NODE_PATH)`);

if (chosen && reactDir) {
  console.error(`playwright ${chosen.pw}, tailwindcss ${chosen.tw}, chromium ${chosen.exe}, react ${version(`${reactDir}/react/package.json`)}`);
  console.log(`RONA_TOOLS=${chosen.dir}`);
  console.log(`RONA_NODE_PATH=${nodePaths.join(":")}`);
  process.exit(0);
}
console.error("PRASYARAT BROWSER TIDAK LENGKAP:\n- " + [...new Set(reasons)].join("\n- "));
console.error(
  "\nCara menyediakan alat TANPA mengubah package.json proyek (folder terpisah):\n" +
  "  mkdir ~/rona-tools && cd ~/rona-tools && npm init -y && npm i esbuild tailwindcss@4 playwright && npx playwright install chromium\n" +
  "  lalu: RONA_TOOLS=~/rona-tools bash scripts/verify-with-npm.sh   (atau: npm run test:browser dengan RONA_TOOLS yang sama)"
);
process.exit(10);
