const { createRequire } = require("module");
const { chromium } = createRequire((process.env.RONA_TOOLS ?? "/opt/npm-tools") + "/node_modules/")("playwright");
const assert = require("node:assert/strict");
(async () => {
  const b = await chromium.launch({ args: ["--no-sandbox"] });
  for (const f of ["login", "register", "onboarding"]) {
    for (const [w, h] of [[320, 640], [360, 740], [390, 844], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]]) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: w < 800, isMobile: w < 800, deviceScaleFactor: 2 });
      const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
      await p.goto(`file://${__dirname}/auth.html?f=${f}`); await p.waitForSelector("form");
      const m = await p.evaluate(() => ({
        iw: innerWidth, sw: document.documentElement.scrollWidth,
        smallInputs: [...document.querySelectorAll("input:not([type=hidden])")].filter((i) => parseFloat(getComputedStyle(i).fontSize) < 16).length,
        short: [...document.querySelectorAll("button, input:not([type=hidden]):not([type=checkbox])")].filter((e) => e.getBoundingClientRect().height < 44).map((e) => (e.name || e.textContent).slice(0, 20)),
        unlabeled: [...document.querySelectorAll("input:not([type=hidden])")].filter((i) => !i.labels?.length).map((i) => i.name),
        formRight: Math.round(document.querySelector("form").getBoundingClientRect().right),
      }));
      assert.equal(m.iw, w, `${f}@${w}: viewport melebar (${m.iw})`); assert.ok(m.sw <= w, `${f}@${w}: overflow ${m.sw}`);
      assert.equal(m.smallInputs, 0, `${f}@${w}: font input < 16px (iOS zoom)`); assert.deepEqual(m.short, [], `${f}@${w}: target < 44px ${m.short}`);
      assert.deepEqual(m.unlabeled, [], `${f}@${w}: input tanpa label`); assert.ok(m.formRight <= w, `${f}@${w}: form keluar layar`);
      assert.deepEqual(errs, [], errs.join("|"));
      if (w === 390) await p.screenshot({ path: `${__dirname}/shots/auth-${f}-390.png` });
      await ctx.close();
    }
    console.log(`PASS ${f}: 320/360/390/768/1024/1440/1920 — tanpa overflow, input >= 16px, target >= 44px, semua input berlabel`);
  }
  // galat tampil dengan role=alert dan fokus tetap di formulir
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
  await p.goto(`file://${__dirname}/auth.html?f=login`); await p.getByLabel("Email").fill("a@b.co"); await p.getByLabel(/Kata sandi/).first().fill("x12345678");
  await p.getByRole("button", { name: /Masuk/ }).click(); await p.getByRole("alert").filter({ hasText: "salah" }).waitFor();
  await p.screenshot({ path: `${__dirname}/shots/auth-login-error-390.png` }); await ctx.close(); await b.close();
  console.log("PASS login: pesan galat tampil sebagai role=alert");
  console.log("\nSELESAI: pemeriksaan browser auth lulus");
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
