// Status publikasi — modul murni (parsing hasil RPC, label UI, URL publik, path cache).

export type PublishState = {
  isPublished: boolean;
  version: number | null;
  publishedAt: string | null;
  hasChanges: boolean;
};

/** Memetakan jsonb get_publish_state(). Nilai tak terduga -> bentuk paling aman (belum terbit, ada perubahan). */
export function parsePublishState(raw: unknown): PublishState {
  const o = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    isPublished: o.is_published === true,
    version: typeof o.version === "number" && Number.isInteger(o.version) ? o.version : null,
    publishedAt: typeof o.published_at === "string" ? o.published_at : null,
    hasChanges: o.has_changes !== false,
  };
}

export type PublishOp = "idle" | "publishing" | "unpublishing" | "published-ok" | "unpublished-ok" | "failed";
export type PublishKey = "draft" | "published" | "changes" | "publishing" | "unpublishing" | "success" | "unpublished" | "failed";

export type PublishView = {
  key: PublishKey;
  label: string;
  tone: "neutral" | "ok" | "warn" | "error" | "busy";
  /** URL live hanya boleh ditampilkan bila true. */
  showLiveUrl: boolean;
};

/**
 * Menentukan status tampilan. `changesPending` = ada perubahan tersimpan setelah sinkron terakhir dengan server.
 * Status "berhasil" hanya muncul setelah operasi sukses (op diisi SETELAH server menjawab ok).
 * URL live tidak pernah ditampilkan selama menerbitkan, atau bila halaman tidak berstatus terbit.
 */
export function describePublish(state: PublishState, op: PublishOp, changesPending: boolean): PublishView {
  if (op === "publishing") return { key: "publishing", label: "Menerbitkan…", tone: "busy", showLiveUrl: state.isPublished };
  if (op === "unpublishing") return { key: "unpublishing", label: "Membatalkan penerbitan…", tone: "busy", showLiveUrl: false };
  if (op === "failed") {
    return { key: "failed", label: "Gagal menerbitkan", tone: "error", showLiveUrl: state.isPublished };
  }
  if (!state.isPublished) {
    return op === "unpublished-ok"
      ? { key: "unpublished", label: "Penerbitan dibatalkan — kembali ke draft", tone: "neutral", showLiveUrl: false }
      : { key: "draft", label: "Draft — belum diterbitkan", tone: "neutral", showLiveUrl: false };
  }
  if (changesPending || state.hasChanges) {
    return { key: "changes", label: "Ada perubahan belum diterbitkan", tone: "warn", showLiveUrl: true };
  }
  return op === "published-ok"
    ? { key: "success", label: "Berhasil diterbitkan", tone: "ok", showLiveUrl: true }
    : { key: "published", label: "Diterbitkan", tone: "ok", showLiveUrl: true };
}

export function publicPath(username: string): string {
  return `/${username}`;
}

/** URL publik lengkap dari origin yang valid; null bila origin/username tidak valid. */
export function buildPublicUrl(origin: string, username: string): string | null {
  if (!/^[a-z0-9](?:[a-z0-9_-]{1,28})[a-z0-9]$/.test(username)) return null;
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return `${u.origin}${publicPath(username)}`;
  } catch {
    return null;
  }
}

/** Waktu revalidasi cadangan halaman publik (detik). Pembaruan utama lewat invalidasi on-demand saat publish/unpublish. */
export const PUBLIC_PAGE_REVALIDATE_SECONDS = 3600;
