"use client";

import { useRef, useState, type ReactNode } from "react";
import { Globe, Loader2, Trash2, Upload } from "lucide-react";
import { Field } from "./field";

/** Accepted by the upload endpoint; anything else is refused before leaving the browser. */
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_FILE_BYTES = 5 * 1024 * 1024;
/** Longest side after downscaling — these images are never shown larger. */
const MAX_EDGE = 160;
/** The encoded image has to fit the field the api stores it in. */
const MAX_ENCODED_LENGTH = 50_000;

const URL_PATTERN = /^(https?:\/\/|data:image\/(png|jpeg|webp);base64,)/;

/** True for something this component is willing to render as a picture. */
export function isDisplayableImage(url: string | undefined): boolean {
  return Boolean(url) && URL_PATTERN.test(url as string);
}

/**
 * A picture from a url an operator supplied, with a fallback.
 *
 * Operators paste arbitrary urls here, so a broken one has to degrade to the
 * fallback rather than leave a torn image icon in the layout.
 */
export function RemoteImage({
  src,
  name,
  className = "",
  fallback,
}: {
  src?: string;
  name: string;
  className?: string;
  /** Shown when there is no usable url, or the image fails to load. */
  fallback?: ReactNode;
}) {
  const [failed, setFailed] = useState(false);

  if (!isDisplayableImage(src) || failed) {
    return (
      fallback ?? (
        <Globe className={`text-neutral-400 ${className || "w-4 h-4"}`} aria-hidden="true" />
      )
    );
  }

  // An operator-provided URL: kept off Next's image optimizer on purpose, since
  // it may point anywhere and is already size-capped on upload.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="w-full h-full object-cover"
    />
  );
}

/**
 * Holds an image while the form around it is open.
 *
 * The file never goes to the api as-is: it is drawn onto a canvas, scaled to
 * MAX_EDGE and re-encoded as WebP first. That keeps a 4MB photo from becoming a
 * 4MB row, and it means the stored value is always one of two shapes — an
 * http(s) url somebody typed, or a data url we produced.
 */
export function useImageUpload(initial: string | undefined) {
  const [imageUrl, setImageUrl] = useState(initial ?? "");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  // Guards against an earlier, slower upload overwriting a later choice.
  const attempt = useRef(0);

  const upload = async (file?: File) => {
    if (!file) {
      return;
    }

    const id = ++attempt.current;

    if (!ACCEPTED_TYPES.includes(file.type) || file.size > MAX_FILE_BYTES) {
      setError("Chọn ảnh PNG, JPEG hoặc WebP không quá 5 MB.");
      return;
    }

    setUploading(true);
    setError("");

    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));

      const context = canvas.getContext("2d");

      if (!context) {
        bitmap.close();
        throw new Error("Không dựng được ảnh thu nhỏ.");
      }

      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();

      const encoded = canvas.toDataURL("image/webp", 0.85);

      if (encoded.length > MAX_ENCODED_LENGTH) {
        throw new Error("Ảnh vẫn quá lớn sau khi thu nhỏ. Hãy chọn ảnh khác.");
      }

      const response = await fetch("/api/site-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl: encoded }),
      });
      const result = (await response.json()) as { url?: string; error?: string };

      if (!response.ok || !result.url) {
        throw new Error(result.error ?? "Không tải được ảnh lên máy chủ.");
      }

      if (id === attempt.current) {
        setImageUrl(result.url);
      }
    } catch (cause) {
      if (id === attempt.current) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Không đọc được ảnh. Hãy chọn ảnh khác hoặc nhập URL.",
        );
      }
    } finally {
      if (id === attempt.current) {
        setUploading(false);
      }
    }
  };

  const setUrl = (next: string) => {
    // Any in-flight upload stops counting once a url is typed by hand.
    attempt.current += 1;
    setImageUrl(next);
    setError("");
  };

  const clear = () => {
    attempt.current += 1;
    setUploading(false);
    setImageUrl("");
    setError("");
  };

  return { imageUrl, setUrl, clear, upload, uploading, error };
}

export type ImageUploadState = ReturnType<typeof useImageUpload>;

/**
 * File picker plus url box for one image, posting its value under `name`.
 *
 * Both halves write the same hidden field, because the api stores one string
 * either way and the operator should not have to care which route they took.
 */
export function ImageUploadField({
  state,
  name,
  label,
  hint,
  round = false,
  fallback,
  urlPlaceholder = "Hoặc dán URL ảnh: https://example.com/logo.png",
}: {
  state: ImageUploadState;
  name: string;
  label: string;
  hint?: string;
  /** Circular preview, for anything that stands in for a person. */
  round?: boolean;
  fallback?: ReactNode;
  urlPlaceholder?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <input type="hidden" name={name} value={state.imageUrl} />

      <div className="rounded-xl border border-neutral-200 p-3 space-y-2.5">
        <div className="flex items-center gap-3">
          <span
            className={`w-12 h-12 shrink-0 grid place-items-center overflow-hidden bg-neutral-100 border border-black/[0.04] ${
              round ? "rounded-full" : "rounded-xl"
            }`}
          >
            <RemoteImage
              key={state.imageUrl}
              src={state.imageUrl}
              name="Xem trước ảnh"
              className="w-5 h-5"
              fallback={fallback}
            />
          </span>

          <div className="flex-1 min-w-0 flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-neutral-200 bg-white text-[11px] font-medium text-[#1D1D1F] hover:border-neutral-300 transition cursor-pointer">
              {state.uploading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Upload className="w-3 h-3" />
              )}
              <span>{state.uploading ? "Đang tải lên…" : "Chọn ảnh từ máy"}</span>
              <input
                type="file"
                accept={ACCEPTED_TYPES.join(",")}
                disabled={state.uploading}
                onChange={(event) => {
                  void state.upload(event.target.files?.[0]);
                  // Lets the same file be chosen again after an error.
                  event.target.value = "";
                }}
                className="sr-only"
              />
            </label>

            {state.imageUrl && (
              <button
                type="button"
                onClick={state.clear}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-neutral-200 bg-white text-[11px] font-medium text-red-600 hover:bg-red-50 transition cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                Xóa ảnh
              </button>
            )}
          </div>
        </div>

        <input
          type="url"
          maxLength={2048}
          // A data url lives in the hidden field; showing it here would be noise.
          value={state.imageUrl.startsWith("data:") ? "" : state.imageUrl}
          disabled={state.uploading}
          onChange={(event) => state.setUrl(event.target.value)}
          placeholder={urlPlaceholder}
          aria-label={label}
          className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs text-[#1D1D1F] placeholder:text-neutral-400 outline-none transition focus:border-[#EA580C] focus:ring-1 focus:ring-[#EA580C]/20 disabled:bg-[#F5F5F7]"
        />

        {state.error && (
          <p role="alert" className="text-[11px] text-red-600">
            {state.error}
          </p>
        )}

        {/* Blocks submitting while an upload is still running, so the form
            cannot save an image that has not finished arriving. */}
        {state.uploading && (
          <input required value="" readOnly aria-label="Chờ xử lý ảnh" className="sr-only" />
        )}
      </div>
    </Field>
  );
}
