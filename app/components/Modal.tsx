"use client";
import { useEffect, useRef, type ReactNode } from "react";

/** Accessible modal built on the native <dialog> element (focus trap + Esc handled by the browser). */
export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="modal-title"
      className="m-auto w-[min(36rem,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl border border-line bg-surface p-0 text-ink shadow-xl"
    >
      {open && (
        <div className="p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 id="modal-title" className="text-xl font-semibold text-ink">{title}</h2>
            <button onClick={onClose} aria-label="Close dialog" className="rounded-md border border-control px-2.5 py-1 text-base font-bold text-ink hover:bg-page">×</button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
