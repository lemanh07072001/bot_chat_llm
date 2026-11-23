"use client";

import { AlertCircle, Loader2, RotateCw, X } from "lucide-react";
import type { PendingAttachment } from "./useAttachmentUploads";

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 focus-visible:ring-offset-1";

export type AttachmentTrayProps = {
  items: PendingAttachment[];
  onRemove: (localId: string) => void;
  /** Re-uploads a failed item (shows a retry control on failed thumbnails). */
  onRetry?: (localId: string) => void;
  /** Composer-level notice (from useAttachmentUploads().notice). */
  notice?: string | null;
  onDismissNotice?: () => void;
  className?: string;
};

/** Row of pending image thumbnails with progress, per-file error (retry) and remove (×). */
export function AttachmentTray({
  items,
  onRemove,
  onRetry,
  notice,
  onDismissNotice,
  className = "",
}: AttachmentTrayProps) {
  if (items.length === 0 && !notice) return null;
  return (
    <div className={`px-3 pt-2.5 ${className}`}>
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Ảnh đính kèm">
          {items.map((item, index) => {
            const percent = Math.round(item.progress * 100);
            const failed = item.status === "error";
            return (
              <li key={item.localId} className="relative w-16">
                <div
                  className={`relative w-16 h-16 rounded-xl overflow-hidden border bg-amber-50 ${
                    failed ? "border-rose-300" : "border-amber-200/80"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.previewUrl}
                    alt={`Ảnh ${index + 1}`}
                    className={`w-full h-full object-cover ${item.status === "uploading" || failed ? "opacity-60" : ""}`}
                  />
                  {item.status === "uploading" && (
                    <div
                      className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-white/40"
                      role="progressbar"
                      aria-label={`Đang tải ảnh ${index + 1}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={percent}
                    >
                      <Loader2 className="w-4 h-4 text-amber-800 animate-spin" />
                      <span className="text-[10px] font-semibold text-amber-950 tabular-nums">{percent}%</span>
                      <span className="absolute left-0 bottom-0 h-1 bg-amber-500 transition-[width]" style={{ width: `${percent}%` }} />
                    </div>
                  )}
                  {failed && onRetry && (
                    <button
                      type="button"
                      onClick={() => onRetry(item.localId)}
                      aria-label={`Thử tải lại ảnh ${index + 1}`}
                      title="Thử lại"
                      className={`absolute inset-0 flex items-center justify-center bg-rose-50/60 hover:bg-rose-50/80 cursor-pointer ${FOCUS}`}
                    >
                      <RotateCw className="w-4 h-4 text-rose-600" aria-hidden="true" />
                    </button>
                  )}
                  {failed && !onRetry && (
                    <div className="absolute inset-0 flex items-center justify-center bg-rose-50/60">
                      <AlertCircle className="w-4 h-4 text-rose-600" aria-hidden="true" />
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(item.localId)}
                  aria-label={`Bỏ ảnh ${index + 1}`}
                  title="Bỏ ảnh"
                  className={`absolute -top-1.5 -right-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-neutral-900/80 text-white hover:bg-neutral-900 shadow-sm cursor-pointer ${FOCUS}`}
                >
                  <X className="w-3 h-3" />
                </button>
                {failed && item.error && (
                  <p className="mt-1 text-[10px] leading-tight text-rose-700 break-words" role="alert">
                    {item.error}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {notice && (
        <div
          className="mt-2 flex items-start justify-between gap-2 rounded-xl border border-amber-200/80 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-950"
          role="status"
        >
          <span className="min-w-0">{notice}</span>
          {onDismissNotice && (
            <button
              type="button"
              onClick={onDismissNotice}
              aria-label="Đóng thông báo"
              className={`shrink-0 text-amber-800 hover:text-amber-950 rounded ${FOCUS}`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
