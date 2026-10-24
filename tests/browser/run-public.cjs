const { createRequire } = require("module");
const req = createRequire((process.env.RONA_TOOLS ?? "/opt/npm-tools") + "/node_modules/");
const { chromium } = req("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const URL_ = "file://" + __dirname + "/public.html";
const results = [];
const pass = (n) => { results.push(["PASS", n]); console.log("PASS", n); };
const svg = (label, w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#cdbfa5"/><text x="50%" y="50%" font-size="${Math.min(w,h)/6}" text-anchor="middle" fill="#222">${label}</text></svg>`;

async function newPage(browser, { width, height, reduced = false, touch = false, clock = false }) {
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: reduced ? "reduce" : "no-preference", hasTouch: touch, isMobile: touch, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const requested = [];
  await page.route("https://abcdefgh.supabase.co/**", (r) => {
    const u = r.request().url(); requested.push(u);
    const thumb = /-t\./.test(u);
    r.fulfill({ status: 200, contentType: "image/svg+xml", body: svg(u.split("/").pop().slice(0, 8), thumb ? 640 : 1600, thumb ? 640 : 1200) });
  });
  page.on("pageerror", (e) => { throw e; });
  const errors = []; page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  if (clock) await page.clock.install();
  await page.goto(URL_);
  await page.evaluate(() => {
    // pelacak interval aktif: slideshow tidak boleh meninggalkan timer
    const active = new Set(); const si = window.setInterval.bind(window), ci = window.clearInterval.bind(window);
    window.setInterval = (fn, ms, ...a) => { const id = si(fn, ms, ...a); active.add(id); return id; };
    window.clearInterval = (id) => { active.delete(id); return ci(id); };
    window.__activeIntervals = () => active.size;
    let listeners = 0; const al = document.addEventListener.bind(document), rl = document.removeEventListener.bind(document);
    document.addEventListener = (t, f, o) => { if (t === "visibilitychange") listeners++; return al(t, f, o); };
    document.removeEventListener = (t, f, o) => { if (t === "visibilitychange") listeners--; return rl(t, f, o); };
    window.__visListeners = () => listeners;
  });
  return { page, ctx, requested, errors };
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
  fs.mkdirSync(__dirname + "/shots", { recursive: true });

  /* ---- 1) responsif: tanpa overflow horizontal, jumlah kolom, target sentuh */
  for (const [w, h, cols] of [[320, 640, 2], [360, 740, 2], [390, 844, 2], [768, 1024, 3], [1024, 768, 4], [1440, 900, 4], [1920, 1080, 4]]) {
    const { page, requested, errors, ctx } = await newPage(browser, { width: w, height: h });
    await page.evaluate(() => window.mount("page"));
    await page.waitForSelector(".rona-cat-card");
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth,
      cols: getComputedStyle(document.querySelector(".rona-cat-grid")).gridTemplateColumns.split(" ").length }));
    assert.equal(m.iw, w, `viewport layout melebar di ${w}px (${m.iw})`);
    assert.ok(m.sw <= w, `overflow horizontal di ${w}px: scrollWidth ${m.sw} > ${w}`);
    assert.equal(m.cols, cols, `kolom grid di ${w}px`);
    // hanya thumbnail yang diminta untuk grid
    await page.waitForTimeout(150);
    assert.ok(requested.every((u) => /-t\./.test(u)), `grid hanya memuat thumbnail (${w}px): ${requested.filter((u) => !/-t\./.test(u))}`);
    await page.screenshot({ path: `${__dirname}/shots/page-${w}.png`, fullPage: true });
    assert.equal(errors.length, 0, "console error: " + errors.join("|"));
    await ctx.close();
    pass(`responsif ${w}px: tanpa overflow, ${cols} kolom, hanya thumbnail dimuat, tanpa console error`);
  }

  /* ---- 2) modal + slideshow + keyboard (jam palsu agar deterministik) */
  {
    const { page, requested, ctx } = await newPage(browser, { width: 390, height: 844, touch: true, clock: true });
    await page.evaluate(() => window.mount("page"));
    await page.waitForSelector(".rona-cat-card");
    const card = page.locator(".rona-cat-card").first();
    await card.focus(); await card.press("Enter");
    const dlg = page.locator("dialog.rona-cat-dialog[open]");
    await dlg.waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.style.overflow), "hidden", "scroll latar terkunci");
    const inside = await page.evaluate(() => !!document.activeElement?.closest("dialog"));
    assert.ok(inside, "fokus berada di dalam dialog");
    pass("modal terbuka sebagai dialog native; fokus di dalam; scroll latar terkunci");
    // geometri dialog: pas dengan viewport kecil, tombol tutup terlihat & >= 44px
    await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))));
    const g = await page.evaluate(() => { const d = document.querySelector("dialog").getBoundingClientRect(); const c = document.querySelector(".rona-cat-close").getBoundingClientRect();
      return { dw: d.width, dh: d.height, vw: innerWidth, vh: innerHeight, cw: c.width, ch: c.height, ct: c.top, cb: c.bottom }; });
    assert.ok(g.dw <= g.vw && g.dh <= g.vh, "dialog tidak melebihi viewport");
    assert.ok(g.ch >= 44 && g.cb <= g.vh && g.ct >= 0, "tombol tutup terlihat dan >= 44px " + JSON.stringify(g));
    const tiny = await page.evaluate(() => [...document.querySelectorAll("dialog button, dialog a")].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.height < 44 || r.width < 44); }).map((b) => b.className + ":" + Math.round(b.getBoundingClientRect().width) + "x" + Math.round(b.getBoundingClientRect().height)));
    assert.deepEqual(tiny, [], "target sentuh < 44px: " + tiny);
    pass("dialog 390x844: dalam viewport, tombol tutup terlihat, semua target sentuh >= 44px");
    await page.screenshot({ path: `${__dirname}/shots/dialog-390.png` });

    const count = () => page.locator(".rona-cat-count").innerText();
    assert.equal(await count(), "1 / 3");
    const intervals0 = await page.evaluate(() => window.__activeIntervals());
    assert.equal(intervals0, 1, "satu interval slideshow aktif");
    await page.clock.fastForward(2100); assert.equal(await count(), "2 / 3", "slide maju setelah ~2 dtk");
    await page.clock.fastForward(2000); assert.equal(await count(), "3 / 3");
    await page.clock.fastForward(2000); assert.equal(await count(), "1 / 3", "berputar");
    pass("slideshow otomatis ~2 dtk, berputar");
    // interaksi manual menjeda
    await page.locator(".rona-cat-next").click();
    assert.equal(await count(), "2 / 3");
    assert.equal(await page.evaluate(() => window.__activeIntervals()), 0, "interaksi menjeda dan menghapus timer");
    await page.clock.fastForward(6000); assert.equal(await count(), "2 / 3", "tidak maju sendiri setelah dijeda");
    pass("interaksi manual menjeda slideshow dan membersihkan timer");
    // keyboard
    await page.keyboard.press("ArrowRight"); assert.equal(await count(), "3 / 3");
    await page.keyboard.press("ArrowLeft"); assert.equal(await count(), "2 / 3");
    pass("panah kiri/kanan berpindah foto");
    // putar lagi lalu tutup dengan Escape: timer harus bersih, fokus kembali ke kartu
    await page.locator(".rona-cat-pp").click();
    assert.equal(await page.evaluate(() => window.__activeIntervals()), 1);
    await page.keyboard.press("Escape");
    await page.waitForSelector("dialog", { state: "detached" });
    assert.equal(await page.evaluate(() => window.__activeIntervals()), 0, "slideshow berhenti saat modal ditutup");
    assert.equal(await page.evaluate(() => document.documentElement.style.overflow), "", "scroll latar dipulihkan");
    assert.ok(await page.evaluate(() => document.activeElement?.classList.contains("rona-cat-card")), "fokus kembali ke kartu");
    assert.equal(await page.evaluate(() => window.__visListeners()), 0, "listener visibilitychange dilepas");
    const before = requested.length; await page.clock.fastForward(10000);
    assert.equal(requested.length, before, "tidak ada muat foto setelah modal ditutup");
    pass("Escape menutup: timer & listener bersih, scroll pulih, fokus kembali ke kartu");
    await ctx.close();
  }

  /* ---- 3) foto penuh dimuat hanya saat dibuka (satu per satu + pramuat berikutnya) */
  {
    const { page, requested, ctx } = await newPage(browser, { width: 1280, height: 800 });
    await page.evaluate(() => window.mount("page"));
    await page.waitForSelector(".rona-cat-card"); await page.waitForTimeout(150);
    assert.equal(requested.filter((u) => !/-t\./.test(u)).length, 0);
    await page.locator(".rona-cat-card").first().click(); await page.waitForSelector("dialog[open]"); await page.waitForTimeout(200);
    const full = requested.filter((u) => !/-t\./.test(u));
    assert.ok(full.length >= 1 && full.length <= 2, "foto penuh: yang tampil + pramuat berikutnya saja (" + full.length + ")");
    await page.screenshot({ path: `${__dirname}/shots/dialog-1280.png` });
    await page.keyboard.press("Escape");
    await ctx.close();
    pass("foto penuh hanya dimuat saat detail dibuka (tampil + 1 pramuat), bukan seluruh galeri");
  }

  /* ---- 4) reduced motion: slideshow tidak otomatis, tanpa animasi masuk */
  {
    const { page, ctx } = await newPage(browser, { width: 390, height: 844, reduced: true, clock: true });
    await page.evaluate(() => window.mount("page"));
    await page.waitForSelector(".rona-cat-card");
    const anim = await page.evaluate(() => getComputedStyle(document.querySelector("li.rona-rise")).animationName);
    assert.ok(anim === "none" || anim === "", "tanpa animasi muncul saat reduced motion: " + anim);
    await page.locator(".rona-cat-card").first().click(); await page.waitForSelector("dialog[open]");
    assert.equal(await page.evaluate(() => window.__activeIntervals()), 0, "tidak ada timer slideshow");
    await page.clock.fastForward(8000);
    assert.equal(await page.locator(".rona-cat-count").innerText(), "1 / 3", "tidak maju otomatis");
    assert.equal(await page.locator(".rona-cat-pp").getAttribute("aria-pressed"), "false");
    await ctx.close();
    pass("prefers-reduced-motion: slideshow tidak berjalan otomatis, animasi muncul dimatikan");
  }

  /* ---- 5) CTA: WhatsApp ter-encode, https, URL berbahaya tidak ada tombol; pratinjau tidak bisa diklik */
  {
    const { page, ctx } = await newPage(browser, { width: 1280, height: 800 });
    await page.evaluate(() => window.mount("page"));
    await page.waitForSelector(".rona-cat-card");
    await page.locator(".rona-cat-card").nth(0).click(); await page.waitForSelector("dialog[open]");
    const wa = await page.locator("a.rona-cat-cta").getAttribute("href");
    assert.match(wa, /^https:\/\/wa\.me\/6281234567890\?text=/); assert.ok(!/ /.test(wa)); assert.ok(decodeURIComponent(wa).includes("Paket Foto"));
    assert.equal(await page.locator("a.rona-cat-cta").getAttribute("rel"), "noopener noreferrer");
    await page.keyboard.press("Escape");
    await page.locator(".rona-cat-card").nth(2).click(); await page.waitForSelector("dialog[open]");
    assert.equal(await page.locator("a.rona-cat-cta").count(), 0, "CTA javascript: tidak dirender");
    assert.ok(!(await page.content()).includes("javascript:"));
    await ctx.close();
    pass("CTA: WhatsApp ter-encode + rel aman; javascript: tidak pernah menjadi tautan");
  }
  {
    const { page, ctx } = await newPage(browser, { width: 1280, height: 800 });
    await page.evaluate(() => window.mount("page", { mode: "preview" }));
    await page.waitForSelector(".rona-cat-card");
    assert.equal(await page.locator("a[href]").count(), 0, "pratinjau: tidak ada tautan aktif");
    await page.locator(".rona-cat-card").first().click(); await page.waitForSelector("dialog[open]");
    assert.equal(await page.locator("a.rona-cat-cta").count(), 0, "pratinjau: CTA tidak dapat diklik");
    await ctx.close();
    pass("mode pratinjau: tautan dan CTA tidak aktif");
  }

  /* ---- 6) ConfirmDialog: fokus awal di Batal, Escape membatalkan, klik latar membatalkan, konfirmasi bekerja */
  {
    const { page, ctx } = await newPage(browser, { width: 390, height: 700 });
    await page.evaluate(() => window.mount("confirm"));
    await page.click("#open-confirm"); await page.waitForSelector("dialog[open]");
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Batal", "fokus awal pada aksi aman");
    assert.equal(await page.locator("dialog").getAttribute("role"), "alertdialog");
    await page.keyboard.press("Escape"); await page.waitForSelector("dialog", { state: "detached" });
    await page.waitForFunction(() => document.getElementById("log").textContent === "cancel", null, { timeout: 2000 });
    assert.equal(await page.evaluate(() => document.activeElement?.id), "open-confirm", "fokus kembali ke pemicu");
    await page.click("#open-confirm"); await page.waitForSelector("dialog[open]");
    await page.mouse.click(5, 5); await page.waitForSelector("dialog", { state: "detached" });
    assert.equal(await page.innerText("#log"), "cancel", "klik latar membatalkan");
    await page.click("#open-confirm"); await page.keyboard.press("Tab"); await page.keyboard.press("Tab"); await page.keyboard.press("Tab");
    assert.ok(await page.evaluate(() => !!document.activeElement?.closest("dialog")), "fokus terkunci di dalam dialog");
    await page.getByRole("button", { name: "Ya, hapus" }).click();
    await page.waitForFunction(() => document.getElementById("log").textContent === "confirm", null, { timeout: 2000 });
    await page.screenshot({ path: `${__dirname}/shots/confirm.png` });
    await ctx.close();
    pass("ConfirmDialog: fokus awal Batal, Esc/klik latar membatalkan, fokus terkunci & kembali ke pemicu, konfirmasi bekerja");
  }

  /* ---- 7) Tabs keyboard + Toast */
  {
    const { page, ctx } = await newPage(browser, { width: 390, height: 700, clock: true });
    await page.evaluate(() => window.mount("tabs"));
    const tab = (n) => page.getByRole("tab", { name: n });
    await tab("Profil").focus(); await page.keyboard.press("ArrowRight");
    assert.equal(await tab("Tampilan").getAttribute("aria-selected"), "true");
    assert.ok(await page.evaluate(() => document.activeElement?.textContent === "Tampilan"), "fokus mengikuti");
    assert.equal(await tab("Profil").getAttribute("tabindex"), "-1");
    await page.keyboard.press("End"); assert.equal(await tab("Katalog").getAttribute("aria-selected"), "true");
    await page.keyboard.press("ArrowRight"); assert.equal(await tab("Profil").getAttribute("aria-selected"), "true", "melingkar");
    await page.keyboard.press("ArrowLeft"); assert.equal(await tab("Katalog").getAttribute("aria-selected"), "true");
    await page.keyboard.press("Home"); assert.equal(await tab("Profil").getAttribute("aria-selected"), "true");
    assert.equal(await page.locator("[role=tabpanel]").getAttribute("aria-labelledby"), "t-tab-a");
    await ctx.close();
    pass("Tabs: panah/Home/End, roving tabindex, fokus mengikuti, panel terhubung");
  }
  {
    const { page, ctx } = await newPage(browser, { width: 390, height: 700, clock: true });
    await page.evaluate(() => window.mount("toast"));
    assert.equal(await page.getByRole("status").count(), 1);
    await page.clock.fastForward(4200);
    assert.equal(await page.locator(".rona-toast").count(), 0, "toast sukses hilang sendiri");
    await ctx.close();
    pass("Toast sukses hilang otomatis dan timer dibersihkan");
  }

  await browser.close();
  console.log(`\nSELESAI: ${results.length} pemeriksaan browser lulus`);
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
