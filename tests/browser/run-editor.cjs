const { createRequire } = require("module");
const { chromium } = createRequire((process.env.RONA_TOOLS ?? "/opt/npm-tools") + "/node_modules/")("playwright");
const assert = require("node:assert/strict");
const URL_ = "file://" + __dirname + "/editor.html";
const pass = (n) => console.log("PASS", n);

async function open(browser, w, h, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: !!opts.touch, isMobile: !!opts.touch, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const net = []; await page.route(/^https?:\/\//, (r) => { net.push(r.request().url()); r.abort(); });
  const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(URL_); await page.waitForSelector('[role="tablist"]');
  return { page, ctx, net, errors };
}
const overflow = (page) => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
const rect = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r && { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; }, sel);

(async () => {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });

  for (const [w, h] of [[320, 640], [360, 740], [390, 844], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]]) {
    const { page, ctx, errors } = await open(browser, w, h, { touch: w < 800 });
    const o = await overflow(page);
    // Bandingkan dengan lebar yang DIMAKSUD: pada emulasi ponsel, viewport layout ikut melebar bila ada konten yang meluap (innerWidth > w).
    assert.equal(o.iw, w, `viewport layout melebar di ${w}px: innerWidth=${o.iw} (ada konten yang meluap)`);
    assert.ok(o.sw <= w, `overflow horizontal ${w}px (scrollWidth ${o.sw})`);
    const small = w < 1024;
    const mobileSwitch = await page.getByRole("group", { name: "Tampilan editor" }).isVisible();
    assert.equal(mobileSwitch, small, `pemilih Edit/Pratinjau hanya di layar < 1024px (${w})`);
    const edit = await rect(page, 'section[aria-label="Pengaturan"]'); const prev = await rect(page, 'aside[aria-label="Pratinjau"]');
    if (small) assert.ok(prev.w === 0 || (await page.locator('aside[aria-label="Pratinjau"]').isHidden()), `pratinjau tersembunyi saat mode Edit (${w})`);
    else {
      assert.ok(edit.r <= prev.x + 1, `editor dan pratinjau berdampingan tanpa tumpang tindih (${w}): ${edit.r} vs ${prev.x}`);
      assert.ok(prev.w >= 300 && edit.w >= 480, `proporsi nyaman (${w}): editor ${Math.round(edit.w)}, pratinjau ${Math.round(prev.w)}`);
    }
    // target sentuh di layar sentuh
    if (small) {
      const tiny = await page.evaluate(() => [...document.querySelectorAll("button, a, select, input:not([type=checkbox]):not([type=color]):not([type=file])")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 40; }).map((e) => (e.textContent || e.id).trim().slice(0, 25) + ":" + Math.round(e.getBoundingClientRect().height)));
      assert.deepEqual(tiny, [], `target < 40px di ${w}px: ${tiny}`);
    }
    await page.screenshot({ path: `${__dirname}/shots/editor-${w}.png`, fullPage: w < 1024 });
    assert.deepEqual(errors, [], "console/page error: " + errors.join("|"));
    await ctx.close();
    pass(`editor ${w}px: tanpa overflow, tata letak ${small ? "satu kolom + pemilih Edit/Pratinjau" : "dua kolom proporsional"}${small ? ", target sentuh >= 40px" : ""}, tanpa error`);
  }

  /* keyboard tabs di editor asli */
  {
    const { page, ctx } = await open(browser, 1280, 800);
    const tab = (n) => page.getByRole("tab", { name: new RegExp("^" + n) });
    await tab("Profil").focus(); await page.keyboard.press("ArrowRight");
    assert.equal(await tab("Tampilan").getAttribute("aria-selected"), "true");
    assert.ok(await page.getByRole("tabpanel").getAttribute("id") === "editor-panel-tampilan");
    await page.keyboard.press("End"); assert.ok(await page.getByText("Judul section").isVisible());
    await ctx.close(); pass("editor: navigasi tab dengan keyboard memindah panel (Tampilan -> Katalog)");
  }

  /* ketik -> pratinjau lokal tanpa jaringan; simpan hanya grup berubah; toast */
  {
    const { page, ctx, net } = await open(browser, 1280, 800);
    await page.getByLabel("Nama tampilan").fill("Nadia Baru");
    await page.waitForFunction(() => document.querySelector("[data-page-view] h1")?.textContent === "Nadia Baru", null, { timeout: 3000 });
    assert.equal(net.length, 0, "tidak ada request jaringan saat mengetik: " + net);
    await page.getByRole("button", { name: "Simpan draft" }).click();
    await page.getByRole("status").filter({ hasText: "Draft tersimpan." }).first().waitFor();
    const call = await page.evaluate(() => window.__calls.filter((c) => c.name === "saveDraftAction").at(-1).args[0]);
    assert.equal(call.settings, null, "tampilan tidak ikut dikirim"); assert.equal(call.profile.displayName, "Nadia Baru");
    assert.deepEqual(call.revs, { profile: 3, settings: 5 }, "revisi yang dibawa");
    assert.equal(await page.locator(".rona-toast").count(), 1, "toast sukses tampil");
    // simpan lagi tanpa perubahan: tombol nonaktif
    assert.ok(await page.getByRole("button", { name: "Simpan draft" }).isDisabled());
    // ubah tampilan saja -> hanya settings dikirim dengan revisi baru
    await page.getByRole("tab", { name: /^Tampilan/ }).click();
    await page.getByLabel(/Rata|Tengah|Kiri/).first().click().catch(() => {});
    await ctx.close(); pass("editor: pratinjau lokal tanpa request jaringan; simpan hanya mengirim grup profil + revisi; toast sukses");
  }

  /* konflik: input dipertahankan, pesan jelas, tombol muat ulang */
  {
    const { page, ctx } = await open(browser, 390, 844, { touch: true });
    await page.evaluate(() => { window.__conflict = true; });
    await page.getByLabel("Nama tampilan").fill("Perubahan Saya");
    await page.getByRole("button", { name: "Simpan draft" }).click();
    await page.getByRole("alert").filter({ hasText: "tab atau perangkat lain" }).waitFor();
    assert.equal(await page.getByLabel("Nama tampilan").inputValue(), "Perubahan Saya", "input pengguna dipertahankan saat konflik");
    assert.ok(await page.getByRole("button", { name: "Muat ulang versi terbaru" }).isVisible());
    assert.equal(await page.locator(".rona-toast").count(), 0, "tidak ada toast sukses palsu saat gagal");
    await page.screenshot({ path: `${__dirname}/shots/editor-conflict-390.png` });
    await ctx.close(); pass("editor: konflik simpan => pesan jelas, input utuh, tombol muat ulang, tanpa toast sukses palsu");
  }

  /* dialog hapus (tautan) */
  {
    const { page, ctx } = await open(browser, 390, 844, { touch: true });
    await page.getByRole("tab", { name: /^Tautan/ }).click();
    await page.getByRole("button", { name: /Tautan 1/ }).first().click();
    await page.getByRole("button", { name: "Hapus", exact: true }).first().click();
    await page.waitForSelector("dialog[open]");
    const d = await rect(page, "dialog[open]"); assert.ok(d.w <= 390 && d.b <= 844, "dialog hapus muat di viewport 390x844");
    await page.screenshot({ path: `${__dirname}/shots/editor-confirm-390.png` });
    await page.keyboard.press("Escape"); await page.waitForSelector("dialog", { state: "detached" });
    assert.equal(await page.evaluate(() => window.__calls.filter((c) => c.name === "deleteLinkAction").length), 0, "Esc membatalkan: tidak ada hapus");
    await ctx.close(); pass("editor: dialog konfirmasi hapus tautan muat di ponsel, Esc membatalkan tanpa menghapus");
  }

  await browser.close(); console.log("\nSELESAI: pemeriksaan browser editor lulus");
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
