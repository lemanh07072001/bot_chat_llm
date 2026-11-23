import { isSafeImageUrl, type AttachmentView } from "@/lib/attachments";

export type MessageAttachmentsProps = {
  attachments: AttachmentView[] | null | undefined;
  /** visitor = light bubble, agent = amber gradient bubble. */
  tone: "visitor" | "agent";
  className?: string;
};

/**
 * Image grid rendered inside a chat/ticket bubble (place it above the text).
 * Plain <img>: hosts are arbitrary R2 / API domains, so next/image is not used.
 */
export function MessageAttachments({ attachments, tone, className = "" }: MessageAttachmentsProps) {
  const safe = (attachments ?? []).filter((item) => isSafeImageUrl(item.url));
  if (safe.length === 0) return null;
  const single = safe.length === 1;
  const ring = tone === "agent" ? "ring-1 ring-white/40" : "ring-1 ring-amber-200/80";
  const focus =
    tone === "agent"
      ? "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      : "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60";

  return (
    <div
      className={`${
        single ? "max-w-[240px]" : "grid grid-cols-2 gap-1 w-[240px] max-w-full"
      } rounded-xl overflow-hidden ${ring} ${className}`}
    >
      {safe.map((item) => (
        <a
          key={item.id}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Mở ảnh đính kèm"
          className={`block bg-black/5 ${focus}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.url}
            alt="Ảnh đính kèm"
            loading="lazy"
            decoding="async"
            width={item.width ?? undefined}
            height={item.height ?? undefined}
            className={single ? "block w-full h-auto max-h-[320px] object-contain" : "block w-full aspect-square object-cover"}
          />
        </a>
      ))}
    </div>
  );
}
