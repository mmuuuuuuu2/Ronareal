const { createRequire } = require("module");
const { chromium } = createRequire((process.env.RONA_TOOLS ?? "/opt/npm-tools") + "/node_modules/")("playwright");
const assert = require("node:assert/strict");
const URL0 = (q = "") => `file://${__dirname}/settings.html?${q}`;
const calls = (p, name) => p.evaluate((n) => window.__calls.filter((c) => c.name === n), name);
const T = { timeout: 4000 };
(async () => {
  const b = await chromium.launch({ args: ["--no-sandbox"] });

  // 1) Tata letak: 5 tab x 4 lebar viewport
  for (const tab of ["akun", "username", "halaman", "seo", "status"]) {
    for (const [w, h] of [[320, 640], [360, 740], [390, 844], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]]) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: w < 800, isMobile: w < 800, deviceScaleFactor: 2 });
      const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
      await p.goto(URL0(`tab=${tab}`)); await p.waitForSelector("[role=tabpanel]:not([hidden])");
      const m = await p.evaluate(() => {
        const vis = (e) => !!(e.offsetWidth || e.offsetHeight);
        const panel = document.querySelector("[role=tabpanel]:not([hidden])");
        return {
          iw: innerWidth, sw: document.documentElement.scrollWidth,
          small: [...panel.querySelectorAll("input:not([type=hidden]), select, textarea")].filter((i) => vis(i) && parseFloat(getComputedStyle(i).fontSize) < 16).map((i) => i.id),
          short: [...panel.querySelectorAll("button, a.btn, input:not([type=hidden]), select")].filter((e) => vis(e) && e.getBoundingClientRect().height < 40).map((e) => (e.id || e.textContent).slice(0, 24)),
          unlabeled: [...panel.querySelectorAll("input:not([type=hidden]), select, textarea")].filter((i) => vis(i) && !i.labels?.length).map((i) => i.id),
          hiddenPanels: document.querySelectorAll("[role=tabpanel][hidden]").length,
          right: Math.round(panel.getBoundingClientRect().right),
        };
      });
      assert.equal(m.iw, w, `${tab}@${w}: viewport melebar`); assert.ok(m.sw <= w, `${tab}@${w}: overflow ${m.sw}`);
      assert.deepEqual(m.small, [], `${tab}@${w}: font < 16px ${m.small}`);
      assert.deepEqual(m.short, [], `${tab}@${w}: target < 40px ${m.short}`);
      assert.deepEqual(m.unlabeled, [], `${tab}@${w}: tanpa label ${m.unlabeled}`);
      assert.equal(m.hiddenPanels, 4, `${tab}: hanya satu panel tampil`);
      assert.ok(m.right <= w, `${tab}@${w}: panel keluar layar`);
      assert.deepEqual(errs, [], errs.join("|"));
      if (w === 390) await p.screenshot({ path: `${__dirname}/shots/settings-${tab}-390.png`, fullPage: true });
      await ctx.close();
    }
  }
  console.log("PASS tata letak: 5 tab pada 320/360/390/768/1024/1440/1920 — tanpa overflow, input >= 16px, target >= 40px, semua berlabel");

  const open = async (q = "") => { const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage(); await p.goto(URL0(q)); await p.waitForSelector("[role=tabpanel]:not([hidden])"); return { ctx, p }; };

  // 2) Keyboard tab
  { const { ctx, p } = await open();
    await p.getByRole("tab", { name: "Akun" }).focus(); await p.keyboard.press("ArrowRight");
    assert.equal(await p.getByRole("tab", { name: /Username/ }).getAttribute("aria-selected"), "true");
    assert.ok(await p.locator("#un-input").isVisible());
    await ctx.close(); console.log("PASS tab dapat dipakai dengan keyboard (panah)"); }

  // 3) Username: ketersediaan (debounce), tidak tersedia, konfirmasi saat terbit, simpan
  { const { ctx, p } = await open("tab=username");
    await p.evaluate(() => { window.__avail = "unavailable"; });
    await p.fill("#un-input", "budi");
    await p.getByText(/tidak tersedia/).waitFor(T);
    assert.ok(await p.getByRole("button", { name: "Simpan username" }).isDisabled(), "tombol aktif padahal tidak tersedia");
    await p.evaluate(() => { window.__avail = "available"; });
    await p.fill("#un-input", "BudiBaru");
    await p.getByText("Username tersedia.").waitFor(T);
    const checks = await calls(p, "checkUsernameAction");
    assert.ok(checks.length <= 3, `terlalu banyak cek ketersediaan: ${checks.length}`); // debounce, bukan per ketukan
    assert.deepEqual(checks.at(-1).args, ["budibaru"]);
    await p.getByRole("button", { name: "Simpan username" }).click();
    const dlg = p.getByRole("alertdialog"); await dlg.waitFor(T);
    assert.match(await dlg.innerText(), /\/rona.*berhenti bekerja/s);
    assert.equal((await calls(p, "changeUsernameAction")).length, 0, "tersimpan sebelum konfirmasi");
    await dlg.getByRole("button", { name: "Batal" }).click();
    assert.equal(await p.inputValue("#un-input"), "BudiBaru", "input hilang setelah batal");
    await p.getByRole("button", { name: "Simpan username" }).click();
    await p.getByRole("alertdialog").getByRole("button", { name: /Ya, ganti username/ }).click();
    await p.getByText("Username diperbarui.").waitFor(T);
    assert.deepEqual((await calls(p, "changeUsernameAction"))[0].args, [{ username: "BudiBaru" }]);
    assert.equal(await p.inputValue("#un-input"), "budibaru"); // dinormalisasi dari balasan server
    await p.screenshot({ path: `${__dirname}/shots/settings-username-ok-390.png`, fullPage: true });
    await ctx.close(); console.log("PASS username: debounce, tidak tersedia, konfirmasi saat terbit, simpan"); }

  // 4) Username belum terbit: tanpa dialog. Galat server per-field: input tetap.
  { const { ctx, p } = await open("tab=username&published=0");
    await p.evaluate(() => { window.__mode = "field"; });
    await p.fill("#un-input", "diambil");
    await p.getByText("Username tersedia.").waitFor(T);
    await p.getByRole("button", { name: "Simpan username" }).click();
    assert.equal(await p.getByRole("alertdialog").count(), 0, "dialog muncul padahal belum terbit");
    await p.locator("#un-input-error").waitFor(T);
    assert.match(await p.locator("#un-input-error").innerText(), /sudah dipakai/);
    assert.equal(await p.inputValue("#un-input"), "diambil", "input hilang setelah gagal");
    await ctx.close(); console.log("PASS username: galat server tampil di samping field, input tidak hilang"); }

  // 5) SEO: simpan parsial, konflik menjaga input
  { const { ctx, p } = await open("tab=seo");
    assert.equal(await p.inputValue("#seo-title"), "Judul Awal");
    await p.fill("#seo-title", "Judul Baru"); await p.fill("#og-desc", "Deskripsi bagikan");
    await p.selectOption("#og-card", "summary_large_image");
    assert.match(await p.locator("[data-testid=seo-preview]").innerText(), /Judul Baru/);
    assert.equal(await p.locator("[data-testid=seo-canonical]").innerText(), "https://rona.example/rona");
    await p.evaluate(() => { window.__mode = "conflict"; });
    await p.getByRole("button", { name: "Simpan SEO" }).click();
    await p.getByRole("alert").filter({ hasText: "tab atau perangkat lain" }).waitFor(T);
    assert.ok(await p.getByRole("button", { name: /Muat ulang/ }).isVisible());
    assert.equal(await p.inputValue("#seo-title"), "Judul Baru", "input hilang saat konflik");
    await p.evaluate(() => { window.__mode = "ok"; });
    await p.getByRole("button", { name: "Simpan SEO" }).click();
    await p.getByText("SEO disimpan sebagai draft.").waitFor(T);
    const c = await calls(p, "saveSeoAction");
    assert.equal(c.at(-1).args[0].rev, 3); assert.equal(c.at(-1).args[0].seo.twitterCard, "summary_large_image");
    assert.ok(await p.getByRole("button", { name: "Simpan SEO" }).isDisabled(), "tombol tetap aktif setelah tersimpan");
    await ctx.close(); console.log("PASS SEO: pratinjau, canonical tepercaya, konflik menjaga input, simpan dengan revisi"); }

  // 6) Akun: nama, email menunggu konfirmasi, kata sandi
  { const { ctx, p } = await open("tab=akun");
    await p.fill("#acc-name", "Nama Baru"); await p.getByRole("button", { name: "Simpan nama" }).click();
    await p.getByText("Nama profil disimpan.").first().waitFor(T);
    assert.equal((await calls(p, "saveProfileFieldsAction"))[0].args[0].rev, 2);
    await p.fill("#acc-new-email", "baru@contoh.com"); await p.getByRole("button", { name: "Kirim konfirmasi" }).click();
    await p.locator("[data-testid=email-pending]").waitFor(T);
    assert.match(await p.locator("[data-testid=email-pending]").innerText(), /baru@contoh\.com/);
    assert.equal(await p.locator("[data-testid=account-email]").innerText(), "rona@contoh.com", "email aktif berubah sebelum konfirmasi");
    await p.fill("#acc-pw1", "kata-sandi-satu"); await p.fill("#acc-pw2", "kata-sandi-dua");
    await p.getByRole("button", { name: "Ubah kata sandi" }).click();
    await p.locator("#acc-pw2-error").waitFor(T);
    assert.equal(await p.inputValue("#acc-pw1"), "kata-sandi-satu", "kata sandi hilang saat gagal");
    assert.equal(await p.locator("#acc-pw1").getAttribute("type"), "password");
    await p.fill("#acc-pw2", "kata-sandi-satu"); await p.getByRole("button", { name: "Ubah kata sandi" }).click();
    await p.getByText("Kata sandi diperbarui.").first().waitFor(T);
    assert.equal(await p.inputValue("#acc-pw1"), "", "kolom kata sandi tidak dikosongkan setelah sukses");
    assert.ok(!JSON.stringify(await p.evaluate(() => window.__calls)).includes("kata-sandi"), "kata sandi bocor ke log panggilan");
    await p.getByRole("button", { name: "Keluar dari perangkat lain" }).click();
    await p.getByRole("alertdialog").getByRole("button", { name: /Ya, keluarkan/ }).click();
    await p.getByText("Perangkat lain sudah dikeluarkan.").waitFor(T);
    await ctx.close(); console.log("PASS akun: nama, email menunggu konfirmasi (email aktif tetap), kata sandi, keluar perangkat lain"); }

  // 7) Status halaman
  { const { ctx, p } = await open("tab=status&changes=1");
    assert.equal(await p.locator("[data-publish-status]").first().getAttribute("data-publish-status"), "changes");
    await p.getByRole("button", { name: "Terbitkan perubahan" }).click();
    await p.locator("[data-publish-status=success]").waitFor(T);
    await p.getByRole("button", { name: "Batalkan penerbitan" }).click();
    await p.getByRole("alertdialog").getByRole("button", { name: /Ya, batalkan/ }).click();
    await p.locator("[data-publish-status=unpublished]").waitFor(T);
    assert.equal(await p.getByRole("link", { name: "Buka halaman publik" }).count(), 0, "tautan live tampil padahal tidak terbit");
    assert.equal((await calls(p, "unpublishAction")).length, 1);
    await ctx.close(); console.log("PASS status: terbitkan, batalkan dengan konfirmasi, tautan live hilang saat draft"); }

  // 8) Ada isian belum disimpan -> Terbitkan dinonaktifkan
  { const { ctx, p } = await open("tab=halaman&published=0");
    await p.fill("#pg-bio", "Bio berubah"); 
    await p.getByRole("tab", { name: "Status halaman" }).click();
    assert.ok(await p.getByRole("button", { name: "Terbitkan halaman" }).isDisabled());
    await p.getByRole("tab", { name: "Pengaturan halaman" }).click();
    assert.equal(await p.inputValue("#pg-bio"), "Bio berubah", "isian hilang saat berpindah tab");
    await ctx.close(); console.log("PASS isian tab dipertahankan saat berpindah; terbit diblokir bila ada isian belum disimpan"); }

  await b.close();
  console.log("\nSELESAI: pemeriksaan browser pengaturan lulus");
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
