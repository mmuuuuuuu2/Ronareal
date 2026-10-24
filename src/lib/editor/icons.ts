// Ikon preset untuk tautan (bukan logo merek). Path SVG 24x24, stroke saja; digambar oleh komponen UI.
export const LINK_ICON_KEYS = [
  "link", "globe", "mail", "phone", "pin", "cart", "calendar", "play", "music", "camera", "star", "heart", "briefcase", "document",
] as const;
export type LinkIconKey = (typeof LINK_ICON_KEYS)[number];

export const LINK_ICON_LABELS: Record<LinkIconKey, string> = {
  link: "Tautan", globe: "Situs web", mail: "Email", phone: "Telepon", pin: "Lokasi", cart: "Belanja",
  calendar: "Jadwal", play: "Video", music: "Musik", camera: "Foto", star: "Unggulan", heart: "Favorit",
  briefcase: "Layanan", document: "Dokumen",
};

export const LINK_ICON_PATHS: Record<LinkIconKey, string[]> = {
  link: ["M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11.5 4.43", "M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07l1.33-1.33"],
  globe: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M3 12h18", "M12 3c2.5 2.5 3.8 5.5 3.8 9S14.5 18.5 12 21c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3Z"],
  mail: ["M4 6h16v12H4z", "m4 7 8 6 8-6"],
  phone: ["M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2Z"],
  pin: ["M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z", "M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"],
  cart: ["M3 4h2l2.2 10.5h10.6L20 7H6", "M9 19.5a.5.5 0 1 0 0 .01", "M17 19.5a.5.5 0 1 0 0 .01"],
  calendar: ["M4 6h16v14H4z", "M4 10h16", "M8 3v4", "M16 3v4"],
  play: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "m10 8.5 6 3.5-6 3.5z"],
  music: ["M9 18V6l10-2v12", "M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z", "M19 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z"],
  camera: ["M4 8h3l1.5-2h7L17 8h3v11H4z", "M12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"],
  star: ["m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"],
  heart: ["M12 20s-8-4.6-8-10.2A4.4 4.4 0 0 1 12 7.5a4.4 4.4 0 0 1 8 2.3C20 15.4 12 20 12 20Z"],
  briefcase: ["M4 8h16v11H4z", "M9 8V5h6v3", "M4 13h16"],
  document: ["M7 3h7l4 4v14H7z", "M14 3v4h4", "M10 12h5", "M10 16h5"],
};
