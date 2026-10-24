"use client";

import { motion } from "motion/react";
import { useCallback, useDeferredValue, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  createLinkAction, deleteLinkAction, reorderLinksAction, saveDraftAction, toggleLinkAction, updateLinkAction,
} from "@/app/dashboard/editor/actions";
import { AppearancePanel } from "@/components/editor/appearance-panel";
import { CatalogPanel } from "@/components/editor/catalog-panel";
import { LinksPanel } from "@/components/editor/links-panel";
import { PublishPanel } from "@/components/publish/publish-panel";
import { ProfilePanel } from "@/components/editor/profile-panel";
import { PageView } from "@/components/page/page-view";
import { Tabs, tabIds } from "@/components/ui/tabs";
import { Toast } from "@/components/ui/toast";
import { catalogReducer, initialCatalogState, isCatalogDirty, toCatalogPreview } from "@/lib/catalog/state";
import { planDraftSave, planHasChanges } from "@/lib/editor/draft-save";
import type { EditorInitialData } from "@/lib/editor/load";
import {
  editorReducer, hasUnsavedChanges, initialEditorState, isDraftDirty, isLinkDirty, isNewLink, toPreviewData,
} from "@/lib/editor/state";
import { validateLink } from "@/lib/validation/link";

type Tab = "profil" | "tampilan" | "tautan" | "katalog";
type Device = "mobile" | "desktop";

const TABS: { id: Tab; label: string }[] = [
  { id: "profil", label: "Profil" },
  { id: "tampilan", label: "Tampilan" },
  { id: "tautan", label: "Tautan" },
  { id: "katalog", label: "Katalog" },
];

const LOGIN_URL = "/login?next=%2Fdashboard%2Feditor";

export function EditorShell({ initial }: { initial: EditorInitialData }) {
  const [state, dispatch] = useReducer(editorReducer, initial, initialEditorState); // initial.revs ikut dibawa
  const [catalog, catalogDispatch] = useReducer(catalogReducer, initial.catalog, initialCatalogState);
  const [tab, setTab] = useState<Tab>("profil");
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const [device, setDevice] = useState<Device>("mobile");
  const [notice, setNotice] = useState<{ kind: "error" | "success"; message: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null); // umpan balik sukses singkat (hilang sendiri)
  const dismissToast = useCallback(() => setToast(null), []);
  const [ordering, setOrdering] = useState(false);
  // Penghitung perubahan yang BERHASIL tersimpan; dipakai panel penerbitan untuk status "ada perubahan belum diterbitkan".
  const [persistTick, setPersistTick] = useState(0);
  const tickRef = useRef(0);
  const bump = useCallback(() => {
    tickRef.current += 1;
    setPersistTick(tickRef.current);
  }, []);

  // State terbaru untuk handler async tanpa membuat ulang callback pada setiap ketikan.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state; // diperbarui setelah render (bukan saat render) agar aman bagi aturan hooks
  }, [state]);
  const orderQueue = useRef<Promise<unknown>>(Promise.resolve());

  const goLogin = useCallback(() => window.location.assign(LOGIN_URL), []);

  // Peringatan saat meninggalkan halaman dengan perubahan belum tersimpan.
  const catalogDirty = isCatalogDirty(catalog);
  const unsaved = hasUnsavedChanges(state) || catalogDirty;
  useEffect(() => {
    if (!unsaved) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [unsaved]);

  // Preview memakai state lokal; useDeferredValue menjaga input tetap responsif. Tidak ada request jaringan di sini.
  const previewData = useMemo(
    () => ({
      ...toPreviewData(state),
      catalog: toCatalogPreview(catalog, {
        username: state.profile.username.trim() || "username",
        displayName: state.profile.displayName.trim() || "Nama tampilan",
      }),
    }),
    [state, catalog],
  );
  const deferredPreview = useDeferredValue(previewData);

  /* ---- draft: profil + pengaturan ---- */
  const saving = state.save.status === "saving";
  const saveDraft = useCallback(async (): Promise<boolean> => {
    const s = stateRef.current;
    if (s.save.status === "saving") return false; // cegah kirim ganda
    // Hanya grup yang berubah (profil / tampilan) yang dikirim, bersama revisi yang diketahui editor.
    const plan = planDraftSave(s);
    if (!planHasChanges(plan)) return true;
    dispatch({ type: "draft/saving" });
    try {
      const result = await saveDraftAction(plan);
      if (result.ok) {
        setToast("Draft tersimpan. Halaman publik belum berubah sampai Anda menerbitkan.");
        dispatch({
          type: "draft/saved", profile: result.profile, settings: result.settings, revs: result.revs,
          sent: { profile: plan.profile, settings: plan.settings }, at: Date.now(),
        });
        bump();
        return true;
      } else if (result.signedOut) {
        goLogin();
      } else {
        dispatch({ type: "draft/failed", message: result.message, fieldErrors: result.fieldErrors, conflict: result.conflict });
        if (result.fieldErrors?.username || result.fieldErrors?.displayName || result.fieldErrors?.bio) setTab("profil");
      }
    } catch {
      dispatch({ type: "draft/failed", message: "Tidak dapat terhubung ke layanan. Data Anda masih ada di layar; coba lagi." });
    }
    return false;
  }, [goLogin, bump]);

  /* ---- link ---- */
  const saveLink = useCallback(async (id: string) => {
    const link = stateRef.current.links.find((l) => l.id === id);
    if (!link || link.status === "saving") return;
    const v = validateLink(link);
    if (!v.ok) {
      dispatch({ type: "link/failed", id, message: "Periksa kembali isian yang ditandai.", fieldErrors: v.errors });
      return;
    }
    dispatch({ type: "link/saving", id });
    try {
      const result = isNewLink(link) ? await createLinkAction(v.value) : await updateLinkAction(id, v.value);
      if (result.ok) {
        dispatch({ type: "link/saved", id, newId: result.id, fields: result.fields });
        bump();
      } else if (result.signedOut) goLogin();
      else dispatch({ type: "link/failed", id, message: result.message, fieldErrors: result.fieldErrors });
    } catch {
      dispatch({ type: "link/failed", id, message: "Tidak dapat terhubung ke layanan. Perubahan masih ada di layar; coba lagi." });
    }
  }, [goLogin, bump]);

  const toggleLink = useCallback(async (id: string, value: boolean) => {
    const link = stateRef.current.links.find((l) => l.id === id);
    if (!link) return;
    dispatch({ type: "link/visible", id, value });
    if (isNewLink(link)) return;
    try {
      const result = await toggleLinkAction(id, value);
      if (result.ok) bump();
      if (!result.ok) {
        dispatch({ type: "link/visible", id, value: !value }); // kembalikan
        if (result.signedOut) return goLogin();
        setNotice({ kind: "error", message: result.message });
      }
    } catch {
      dispatch({ type: "link/visible", id, value: !value });
      setNotice({ kind: "error", message: "Tidak dapat terhubung ke layanan. Perubahan tampilan tautan dibatalkan." });
    }
  }, [goLogin, bump]);

  const deleteLink = useCallback(async (id: string) => {
    const link = stateRef.current.links.find((l) => l.id === id);
    if (!link) return;
    if (isNewLink(link)) return dispatch({ type: "link/remove", id });
    dispatch({ type: "link/saving", id });
    try {
      const result = await deleteLinkAction(id);
      if (result.ok) {
        dispatch({ type: "link/remove", id });
        bump();
      } else if (result.signedOut) goLogin();
      else dispatch({ type: "link/failed", id, message: result.message });
    } catch {
      dispatch({ type: "link/failed", id, message: "Tidak dapat terhubung ke layanan. Tautan belum dihapus." });
    }
  }, [goLogin, bump]);

  // Perubahan urutan diserialkan (antrian) agar dua klik cepat tidak saling menimpa di server.
  const moveLink = useCallback((id: string, direction: -1 | 1) => {
    const before = stateRef.current.links;
    const from = before.findIndex((l) => l.id === id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= before.length) return;
    dispatch({ type: "links/move", id, direction });
    const savedOrder = () => stateRef.current.links.filter((l) => !isNewLink(l)).map((l) => l.id);
    setOrdering(true);
    orderQueue.current = orderQueue.current.then(async () => {
      const ids = savedOrder();
      try {
        const result = await reorderLinksAction(ids);
        if (result.ok) bump();
        if (!result.ok) {
          dispatch({ type: "links/replace", links: before });
          if (result.signedOut) return goLogin();
          setNotice({ kind: "error", message: `Urutan tidak tersimpan. ${result.message}` });
        }
      } catch {
        dispatch({ type: "links/replace", links: before });
        setNotice({ kind: "error", message: "Tidak dapat terhubung ke layanan. Urutan dikembalikan; coba lagi." });
      } finally {
        setOrdering(false);
      }
    });
  }, [goLogin, bump]);

  const dirty = isDraftDirty(state);
  const statusText =
    state.save.status === "saving" ? "Menyimpan…"
    : state.save.status === "error" ? "Gagal menyimpan"
    : dirty ? "Ada perubahan belum disimpan"
    : state.save.status === "saved" ? "Draft tersimpan"
    : "Semua perubahan tersimpan";

  return (
    <div className="space-y-4">
      <div className="glass sticky z-20 flex flex-wrap items-center gap-3 px-4 py-3" style={{ top: "max(0.5rem, var(--rona-safe-top))" }}>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Editor halaman</p>
          <p className="text-sm" role="status" aria-live="polite" style={{ color: state.save.status === "error" ? "#8c1f26" : "var(--rona-fg-muted)" }}>
            {statusText} · <span>Draft, belum diterbitkan</span>
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={saveDraft} disabled={saving || (!dirty && state.save.status !== "error")}>
          {saving ? "Menyimpan…" : state.save.status === "error" ? "Coba simpan lagi" : "Simpan draft"}
        </button>
      </div>

      {state.save.status === "error" ? (
        <p className="notice notice-error" role="alert">
          {state.save.message}
          {state.save.conflict ? (
            <>
              {" "}
              <button type="button" className="link" onClick={() => window.location.reload()}>Muat ulang versi terbaru</button>
              {" "}(perubahan yang belum disimpan di layar ini akan hilang)
            </>
          ) : null}
        </p>
      ) : null}
      {notice ? (
        <p className={`notice ${notice.kind === "error" ? "notice-error" : "notice-success"}`} role={notice.kind === "error" ? "alert" : "status"}>
          {notice.message}{" "}
          <button type="button" className="link" onClick={() => setNotice(null)}>Tutup</button>
        </p>
      ) : null}

      <PublishPanel
        initial={initial.publishState}
        username={state.savedProfile.username}
        persistTick={persistTick}
        getTick={() => tickRef.current}
        hasUnsavedDraft={isDraftDirty(state)}
        hasUnsavedLinks={state.links.some(isLinkDirty) || catalogDirty}
        onSaveDraft={saveDraft}
        onSignedOut={goLogin}
      />

      {/* Di layar kecil: pilih Edit atau Pratinjau. Di layar lebar keduanya tampil berdampingan. */}
      <div className="seg lg:hidden" role="group" aria-label="Tampilan editor">
        <button type="button" className="seg-btn" aria-pressed={mobileView === "edit"} onClick={() => setMobileView("edit")}>Edit</button>
        <button type="button" className="seg-btn" aria-pressed={mobileView === "preview"} onClick={() => setMobileView("preview")}>Pratinjau</button>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <section aria-label="Pengaturan" className={mobileView === "edit" ? "block" : "hidden lg:block"}>
          <div className="mb-4">
            <Tabs
              idPrefix="editor"
              label="Bagian editor"
              value={tab}
              onChange={setTab}
              tabs={TABS.map((t) => ({
                id: t.id,
                label: `${t.label}${t.id === "tautan" ? ` (${state.links.length})` : ""}${t.id === "katalog" ? ` (${catalog.items.length})` : ""}`,
              }))}
            />
          </div>

          {/* Transisi tab: hanya opacity + transform kecil, dimatikan otomatis oleh MotionConfig saat reduced-motion. */}
          <motion.div
            key={tab}
            id={tabIds("editor", tab).panel}
            role="tabpanel"
            aria-labelledby={tabIds("editor", tab).tab}
            tabIndex={0}
            className="surface p-4 sm:p-5"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            {tab === "profil" ? (
              <ProfilePanel
                profile={state.profile}
                errors={state.profileErrors}
                avatarUrl={state.avatarUrl}
                isPublished={initial.isPublished}
                onChange={(field, value) => dispatch({ type: "profile/set", field, value })}
                onAvatar={(next) => { dispatch({ type: "avatar/set", url: next.url }); bump(); }}
                onSignedOut={goLogin}
              />
            ) : null}
            {tab === "tampilan" ? (
              <AppearancePanel
                settings={state.settings}
                backgroundUrl={state.backgroundUrl}
                onChange={(patch) => dispatch({ type: "settings/set", patch })}
                onReset={() => dispatch({ type: "settings/reset" })}
                onBackground={(next) => { dispatch({ type: "background/set", url: next.url }); bump(); }}
                onSignedOut={goLogin}
              />
            ) : null}
            {tab === "tautan" ? (
              <LinksPanel
                links={state.links}
                busy={ordering}
                onAdd={() => dispatch({ type: "link/add" })}
                onEdit={(id, patch) => dispatch({ type: "link/edit", id, patch })}
                onSave={saveLink}
                onDiscard={(id) => dispatch({ type: "link/discard", id })}
                onToggle={toggleLink}
                onMove={moveLink}
                onDelete={deleteLink}
                onImage={(id, next) => { dispatch({ type: "link/image", id, path: next.path, url: next.url }); bump(); }}
                onSignedOut={goLogin}
              />
            ) : null}
            {tab === "katalog" ? (
              <CatalogPanel state={catalog} dispatch={catalogDispatch} onPersist={bump} onSignedOut={goLogin} />
            ) : null}
          </motion.div>
        </section>

        <aside aria-label="Pratinjau" className={mobileView === "preview" ? "block" : "hidden lg:block"}>
          <div className="lg:sticky lg:top-24">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold">Pratinjau langsung</h2>
              <div className="seg" role="group" aria-label="Ukuran pratinjau">
                <button type="button" className="seg-btn" aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")}>Ponsel</button>
                <button type="button" className="seg-btn" aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}>Desktop</button>
              </div>
            </div>
            <div
              className="mx-auto overflow-hidden border"
              style={{
                width: "100%",
                maxWidth: device === "mobile" ? 380 : "100%",
                height: device === "mobile" ? "min(68dvh, 680px)" : "min(60dvh, 560px)",
                borderRadius: device === "mobile" ? 32 : 14,
                borderColor: "var(--rona-border)",
                boxShadow: "var(--rona-glass-shadow)",
                overflowY: "auto",
              }}
            >
              <PageView data={deferredPreview} mode="preview" />
            </div>
            <p className="field-hint mt-2 text-center">Pratinjau draft — hanya Anda yang melihat ini. Belum ada yang diterbitkan.</p>
          </div>
        </aside>
      </div>
      <Toast message={toast} kind="success" onDismiss={dismissToast} />
    </div>
  );
}
