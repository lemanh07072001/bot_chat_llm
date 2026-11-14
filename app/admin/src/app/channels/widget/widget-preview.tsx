"use client";

import { Send, X } from "lucide-react";
import { SiteImage, isDisplayableImage } from "./site-image";

/**
 * A still of the chat box as the visitor will see it, redrawn as the form
 * changes.
 *
 * Deliberately a mock and not the real widget: embedding the bundle here would
 * open a live visitor session against the project every time somebody edited a
 * colour. The pieces that matter for the decision being made — header colour,
 * title, greeting — are the ones reproduced; the rest is suggestion.
 */
export function WidgetPreview({
  title,
  themeColor,
  greeting,
  imageUrl,
  outsideHours = false,
  offlineMessage,
}: {
  title: string;
  themeColor: string;
  greeting: string;
  imageUrl?: string;
  outsideHours?: boolean;
  offlineMessage?: string;
}) {
  return (
    <div className="select-none" aria-hidden="true">
      <div className="rounded border border-black/[0.08] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.08)] overflow-hidden">
        <div
          className="px-3 py-2.5 flex items-center justify-between text-white"
          style={{ backgroundColor: themeColor }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {isDisplayableImage(imageUrl) && (
              <span className="w-7 h-7 shrink-0 grid place-items-center overflow-hidden rounded-full bg-white/20">
                <SiteImage src={imageUrl} name="" className="w-3.5 h-3.5" />
              </span>
            )}
            <div className="min-w-0">
              <div className="text-[13px] font-semibold leading-tight truncate">
                {title || "Chat"}
              </div>
              <div className="text-[10px] opacity-85">
                {outsideHours ? "Ngoài giờ làm việc" : "Đang trực tuyến"}
              </div>
            </div>
          </div>
          <X className="w-3.5 h-3.5 opacity-80 shrink-0" />
        </div>

        <div className="px-3 py-3 space-y-2 bg-[#FBFBFD] min-h-[132px]">
          {greeting && (
            <p className="mx-auto max-w-[90%] text-center text-[11px] text-[#86868B] leading-relaxed">
              {greeting}
            </p>
          )}

          {outsideHours && offlineMessage && (
            <p className="mx-auto max-w-[90%] text-center text-[11px] text-[#86868B] leading-relaxed">
              {offlineMessage}
            </p>
          )}

          <div className="flex justify-start">
            <div className="max-w-[78%] rounded border border-black/[0.06] bg-white px-2.5 py-1.5 text-[11px] text-[#1D1D1F]">
              Chào bạn, mình cần tư vấn ạ.
            </div>
          </div>

          <div className="flex justify-end">
            <div
              className="max-w-[78%] rounded px-2.5 py-1.5 text-[11px] text-white"
              style={{ backgroundColor: themeColor }}
            >
              Vâng, mình hỗ trợ ngay đây.
            </div>
          </div>
        </div>

        {outsideHours && (
          <div className="px-3 py-2 border-t border-black/[0.06] bg-[#FAFAFA] space-y-1.5">
            <p className="text-[10px] text-[#86868B]">
              Để lại email để chúng tôi trả lời bạn khi quay lại nhé.
            </p>
            <div className="flex gap-1.5">
              <span className="flex-1 rounded border border-black/[0.08] bg-white px-2 py-1 text-[10px] text-neutral-400">
                Email
              </span>
              <span
                className="rounded px-2 py-1 text-[10px] font-semibold text-white"
                style={{ backgroundColor: themeColor }}
              >
                Gửi
              </span>
            </div>
          </div>
        )}

        <div className="px-3 py-2 border-t border-black/[0.06] flex items-center gap-2">
          <span className="flex-1 rounded border border-black/[0.08] px-2 py-1.5 text-[11px] text-neutral-400">
            Nhập tin nhắn…
          </span>
          <span
            className="w-7 h-7 rounded-full grid place-items-center text-white shrink-0"
            style={{ backgroundColor: themeColor }}
          >
            <Send className="w-3 h-3" />
          </span>
        </div>
      </div>

      <div className="mt-2 flex justify-end pr-1">
        <span
          className="w-10 h-10 rounded-full grid place-items-center text-white shadow-lg"
          style={{ backgroundColor: themeColor }}
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-none stroke-current stroke-2">
            <path
              d="M21 11.5a8.4 8.4 0 0 1-8.5 8.4 9 9 0 0 1-3.8-.8L3 21l1.9-5.1a8.1 8.1 0 0 1-.9-3.7A8.4 8.4 0 0 1 12.5 4 8.4 8.4 0 0 1 21 11.5z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
    </div>
  );
}
