// Bentuk data yang dirender oleh komponen tampilan halaman (PageView). Dipakai oleh preview editor sekarang
// dan oleh halaman publik /[username] pada fase berikutnya — satu sumber bentuk data, satu komponen render.
import type { LinkIconKey } from "./icons.ts";
import type { PageSettings } from "./settings.ts";
import type { CatalogView } from "../catalog/view.ts";

export type PageViewLink = {
  id: string;
  title: string;
  url: string;
  description: string;
  icon: LinkIconKey | null;
  imageUrl: string | null;
};

export type PageViewData = {
  displayName: string;
  username: string;
  bio: string;
  avatarUrl: string | null;
  backgroundUrl: string | null;
  settings: PageSettings;
  links: PageViewLink[]; // hanya yang tampil (is_visible) dan valid
  /** Katalog (Phase 5). Null/undefined = tidak ada section (halaman tanpa katalog tetap bekerja). */
  catalog?: CatalogView | null;
};
