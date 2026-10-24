// Keadaan kosong bersama: judul + penjelasan + (opsional) aksi. Tanpa gambar dekoratif.
export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="surface empty">
      <p className="empty-title">{title}</p>
      {children ? <p className="empty-text">{children}</p> : null}
      {action}
    </div>
  );
}
