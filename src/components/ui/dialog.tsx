"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type DialogProps = {
  children: React.ReactNode;
  onClose: () => void;
  open: boolean;
  title?: string;
};

export function Dialog({ children, onClose, open, title }: DialogProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <button
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        type="button"
      />
      <div
        aria-modal="true"
        className={cn(
          "relative z-10 w-full max-w-xl rounded-[1.75rem] border border-white/12 bg-stone-950/95 shadow-2xl shadow-black/50"
        )}
        role="dialog"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-stone-500">Profiles</p>
            <h2 className="text-lg font-semibold text-stone-50">{title ?? "Manage profile"}</h2>
          </div>
          <button
            className="rounded-full border border-white/10 p-2 text-stone-300 transition hover:border-white/20 hover:text-white"
            onClick={onClose}
            type="button"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
