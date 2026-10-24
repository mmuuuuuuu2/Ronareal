// Membangun 3 bundle harness (publik, editor, auth) dari komponen ASLI proyek memakai esbuild.
// Yang DIGANTI stub: server action (tidak ada Supabase), next/link, next/image, dan motion/react (animasi Motion tidak diuji di sini).
import path from "node:path";
const TOOLS = process.env.RONA_TOOLS ?? "/opt/npm-tools";
const esbuild = (await import(TOOLS + "/node_modules/esbuild/lib/main.js")).default;
const HERE = path.dirname(new URL(import.meta.url).pathname);
const SRC = process.env.RONA_SRC ?? path.resolve(HERE, "../../src");
const NODE_PATHS = (process.env.RONA_NODE_PATH ?? path.resolve(HERE, "../../node_modules")).split(":");
const editorActions = /^@\/app\/dashboard\/editor\/(actions|catalog-actions|publish-actions)$/;
const settingsActions = /^@\/app\/dashboard\/settings\/actions$/;
const authActions = /^@\/app\/(\(auth\)\/actions|onboarding\/actions)$/;

for (const name of ["public", "editor", "auth", "settings"]) {
  await esbuild.build({
    entryPoints: [`${HERE}/entry-${name}.tsx`], bundle: true, outfile: `${HERE}/bundle-${name}.js`, format: "iife", jsx: "automatic",
    logLevel: "warning", nodePaths: NODE_PATHS, define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{ name: "rona", setup(b) {
      b.onResolve({ filter: /^next\/link$/ }, () => ({ path: `${HERE}/stubs/next-link.tsx` }));
      b.onResolve({ filter: /^next\/image$/ }, () => ({ path: `${HERE}/stubs/next-image.tsx` }));
      b.onResolve({ filter: /^motion\/react$/ }, () => ({ path: `${HERE}/stubs/motion.tsx` }));
      b.onResolve({ filter: /^@\// }, (a) => {
        if (settingsActions.test(a.path)) return { path: `${HERE}/stubs/settings-actions.ts` };
        if (authActions.test(a.path)) return { path: `${HERE}/stubs/auth-actions.ts` };
        if (editorActions.test(a.path)) return { path: `${HERE}/stubs/actions.ts` };
        return b.resolve("./" + a.path.slice(2), { kind: a.kind, resolveDir: SRC });
      });
    } }],
  });
}
console.log("bundle ok: public, editor, auth, settings");
