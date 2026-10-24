"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch } from "react";
import {
  createCatalogItemAction, deleteCatalogItemAction, reorderCatalogItemsAction, saveCatalogSettingsAction, toggleCatalogItemAction,
  updateCatalogItemAction,
} from "@/app/dashboard/editor/catalog-actions";
import { CatalogItemCard } from "@/components/editor/catalog-item-card";
import { EmptyState } from "@/components/ui/empty-state";
import { TextField } from "@/components/ui/text-field";
import { MAX_ITEMS_PER_PAGE, SECTION_TITLE_MAX, validateItem } from "@/lib/catalog/item";
import {
  canAddItem, isNewItem, isSettingsDirty, type CatalogAction, type CatalogEditorState,
} from "@/lib/catalog/state";

type Props = {
  state: CatalogEditorState;
  dispatch: Dispatch<CatalogAction>;
  onPersist: () => void; // dipanggil setelah perubahan BERHASIL tersimpan (menandai "ada perubahan belum diterbitkan")
  onSignedOut: () => void;
};

export function CatalogPanel({ state, dispatch, onPersist, onSignedOut }: Props) {
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const [ordering, setOrdering] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const saveSettings = useCallback(async () => {
    const s = stateRef.current;
    if (s.settingsStatus === "saving") return;
    dispatch({ type: "settings/saving" });
    try {
      const r = await saveCatalogSettingsAction({ enabled: s.enabled, title: s.title });
      if (r.ok) {
        dispatch({ type: "settings/saved", enabled: r.enabled, title: r.title });
        onPersist();
      } else if (r.signedOut) onSignedOut();
      else dispatch({ type: "settings/failed", message: r.message });
    } catch {
      dispatch({ type: "settings/failed", message: "Tidak dapat terhubung ke layanan. Pengaturan masih ada di layar; coba lagi." });
    }
  }, [dispatch, onPersist, onSignedOut]);

  const saveItem = useCallback(async (id: string) => {
    const item = stateRef.current.items.find((i) => i.id === id);
    if (!item || item.status === "saving") return;
    const v = validateItem(item.fields);
    if (!v.ok) return dispatch({ type: "item/failed", id, message: "Periksa kembali isian yang ditandai.", fieldErrors: v.errors });
    dispatch({ type: "item/saving", id });
    try {
      const r = isNewItem(item) ? await createCatalogItemAction(item.fields) : await updateCatalogItemAction(id, item.fields);
      if (r.ok) {
        dispatch({ type: "item/saved", id, newId: r.id, fields: r.fields });
        onPersist();
      } else if (r.signedOut) onSignedOut();
      else dispatch({ type: "item/failed", id, message: r.message, fieldErrors: r.fieldErrors });
    } catch {
      dispatch({ type: "item/failed", id, message: "Tidak dapat terhubung ke layanan. Perubahan masih ada di layar; coba lagi." });
    }
  }, [dispatch, onPersist, onSignedOut]);

  const toggleItem = useCallback(async (id: string, value: boolean) => {
    const item = stateRef.current.items.find((i) => i.id === id);
    if (!item) return;
    dispatch({ type: "item/visible", id, value });
    if (isNewItem(item)) return;
    try {
      const r = await toggleCatalogItemAction(id, value);
      if (r.ok) return onPersist();
      dispatch({ type: "item/visible", id, value: !value });
      if (r.signedOut) return onSignedOut();
      setNotice(r.message);
    } catch {
      dispatch({ type: "item/visible", id, value: !value });
      setNotice("Tidak dapat terhubung ke layanan. Perubahan status item dibatalkan.");
    }
  }, [dispatch, onPersist, onSignedOut]);

  const deleteItem = useCallback(async (id: string) => {
    const item = stateRef.current.items.find((i) => i.id === id);
    if (!item) return;
    if (isNewItem(item)) return dispatch({ type: "item/remove", id });
    dispatch({ type: "item/saving", id });
    try {
      const r = await deleteCatalogItemAction(id);
      if (r.ok) {
        dispatch({ type: "item/remove", id });
        onPersist();
      } else if (r.signedOut) onSignedOut();
      else dispatch({ type: "item/failed", id, message: r.message });
    } catch {
      dispatch({ type: "item/failed", id, message: "Tidak dapat terhubung ke layanan. Item belum dihapus." });
    }
  }, [dispatch, onPersist, onSignedOut]);

  // Perubahan urutan diserialkan agar dua klik cepat tidak saling menimpa di server.
  const moveItem = useCallback((id: string, direction: -1 | 1) => {
    const before = stateRef.current.items;
    const from = before.findIndex((i) => i.id === id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= before.length) return;
    dispatch({ type: "items/move", id, direction });
    setOrdering(true);
    queue.current = queue.current.then(async () => {
      const ids = stateRef.current.items.filter((i) => !isNewItem(i)).map((i) => i.id);
      try {
        const r = await reorderCatalogItemsAction(ids);
        if (r.ok) return onPersist();
        dispatch({ type: "items/replace", items: before });
        if (r.signedOut) return onSignedOut();
        setNotice(`Urutan tidak tersimpan. ${r.message}`);
      } catch {
        dispatch({ type: "items/replace", items: before });
        setNotice("Tidak dapat terhubung ke layanan. Urutan dikembalikan; coba lagi.");
      } finally {
        setOrdering(false);
      }
    });
  }, [dispatch, onPersist, onSignedOut]);

  const full = !canAddItem(state);
  const settingsDirty = isSettingsDirty(state);
  const savingSettings = state.settingsStatus === "saving";

  return (
    <div className="space-y-5">
      <section className="surface space-y-3 p-3 sm:p-4" aria-label="Pengaturan section">
        <label className="inline-flex min-h-[2.75rem] cursor-pointer items-center gap-2 font-medium">
          <input type="checkbox" checked={state.enabled} onChange={(e) => dispatch({ type: "settings/set", patch: { enabled: e.target.checked } })} />
          Tampilkan section katalog di halaman
        </label>
        <TextField id="catalog-title" label="Judul section" value={state.title} maxLength={SECTION_TITLE_MAX * 2}
          onChange={(e) => dispatch({ type: "settings/set", patch: { title: e.target.value } })}
          hint={`Bawaan: “Layanan”. Maksimal ${SECTION_TITLE_MAX} karakter. Contoh: Portofolio, Produk, Karya.`} autoComplete="off" />
        {state.settingsError ? <p className="notice notice-error" role="alert">{state.settingsError}</p> : null}
        <button type="button" className="btn btn-primary btn-sm" onClick={saveSettings} disabled={savingSettings || (!settingsDirty && state.settingsStatus !== "error")}>
          {savingSettings ? "Menyimpan…" : "Simpan pengaturan section"}
        </button>
        <p className="field-hint">Section tidak muncul di halaman publik bila dinonaktifkan atau tidak punya item aktif yang sudah diterbitkan.</p>
      </section>

      {notice ? (
        <p className="notice notice-error" role="alert">
          {notice} <button type="button" className="link" onClick={() => setNotice(null)}>Tutup</button>
        </p>
      ) : null}

      {state.items.length === 0 ? (
        <EmptyState title="Belum ada item">
          Tambahkan layanan, produk, karya, atau proyek. Perubahan tersimpan sebagai draft dan baru tampil di halaman publik setelah Anda menerbitkan.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {state.items.map((item, i) => (
            <CatalogItemCard
              key={item.id}
              item={item}
              index={i}
              total={state.items.length}
              busy={ordering || state.items.some(isItemDirtyNew)}
              onEdit={(patch) => dispatch({ type: "item/edit", id: item.id, patch })}
              onSave={() => saveItem(item.id)}
              onDiscard={() => dispatch({ type: "item/discard", id: item.id })}
              onToggle={(v) => toggleItem(item.id, v)}
              onMove={(d) => moveItem(item.id, d)}
              onDelete={() => deleteItem(item.id)}
              onPhotoAdded={(photo, coverId) => dispatch({ type: "item/photoAdd", id: item.id, photo, coverId })}
              onPhotosChange={(photos, coverId) => dispatch({ type: "item/photos", id: item.id, photos, coverId })}
              onPersist={onPersist}
              onSignedOut={onSignedOut}
            />
          ))}
        </ul>
      )}

      <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: "item/add" })} disabled={full}>+ Tambah item</button>
      {full ? <p className="field-hint">Batas {MAX_ITEMS_PER_PAGE} item tercapai.</p> : null}
    </div>
  );
}

// Urutan hanya bisa diatur setelah semua item tersimpan (item baru belum punya id database).
const isItemDirtyNew = (i: { id: string }) => i.id.startsWith("new:");
