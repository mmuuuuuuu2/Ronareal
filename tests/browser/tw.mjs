// Mengompilasi CSS asli proyek (globals.css + Tailwind 4.3.3 sebenarnya) memakai kelas yang ada di src/.
import fs from "node:fs"; import path from "node:path";
const { compile } = await import((process.env.RONA_TOOLS ?? "/opt/npm-tools") + "/node_modules/tailwindcss/dist/lib.mjs");
const SRC = process.env.RONA_SRC ?? path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../src");
const TOOLS = process.env.RONA_TOOLS ?? "/opt/npm-tools", TW = TOOLS + "/node_modules/tailwindcss";
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const cands = new Set();
for (const f of walk(SRC).filter((f) => /\.(tsx?|css)$/.test(f))) for (const m of fs.readFileSync(f, "utf8").matchAll(/[A-Za-z0-9_\-:.\/\[\]%()#,'=>&*!@]+/g)) cands.add(m[0]);
const css = fs.readFileSync(SRC + "/app/globals.css", "utf8");
const compiler = await compile(css, {
  base: SRC + "/app",
  loadStylesheet: async (id, base) => {
    let p;
    if (id === "tailwindcss") p = TW + "/index.css";
    else if (id.startsWith("tailwindcss/")) p = TW + "/" + id.slice("tailwindcss/".length) + (id.endsWith(".css") ? "" : ".css");
    else p = path.resolve(base, id);
    return { path: p, base: path.dirname(p), content: fs.readFileSync(p, "utf8") };
  },
});
fs.writeFileSync(process.argv[2] ?? "app.css", compiler.build([...cands]));
console.log("css ok", fs.statSync(process.argv[2] ?? "app.css").size, "bytes");
