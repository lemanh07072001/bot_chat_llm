"use client";

import { useCallback, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { ImagePlus } from "lucide-react";
import { ATTACHMENT_ACCEPT } from "@/lib/attachments";

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 focus-visible:ring-offset-1";

export type AttachButtonProps = {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  /** Tooltip / accessible name. */
  label?: string;
  className?: string;
};

/** Icon button that opens a multi-image file picker. */
export function AttachButton({ onFiles, disabled = false, label = "Đính kèm ảnh", className = "" }: AttachButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        aria-label={label}
        title={label}
        className={`shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg text-amber-800 hover:bg-amber-100 hover:text-amber-950 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer ${FOCUS} ${className}`}
      >
        <ImagePlus className="w-4 h-4" />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ATTACHMENT_ACCEPT}
        multiple
        hidden
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const files = event.target.files ? Array.from(event.target.files) : [];
          // Reset so picking the same file again still fires onChange.
          event.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </>
  );
}

/** Image files (any type the browser marks image/*) carried by a DataTransfer. */
export function imageFilesFromDataTransfer(data: DataTransfer | null | undefined): File[] {
  if (!data) return [];
  const files: File[] = [];
  if (data.items && data.items.length) {
    for (const item of Array.from(data.items)) {
      if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  } else {
    for (const file of Array.from(data.files ?? [])) if (file.type.startsWith("image/")) files.push(file);
  }
  return files;
}

/**
 * onPaste helper for a composer textarea: when the clipboard holds images, they
 * are handed to `onFiles` and the default paste (e.g. a file name) is suppressed.
 * Plain text pastes are left alone. Returns true when images were taken.
 */
export function handleImagePaste(event: ClipboardEvent<HTMLElement>, onFiles: (files: File[]) => void): boolean {
  const files = imageFilesFromDataTransfer(event.clipboardData);
  if (files.length === 0) return false;
  event.preventDefault();
  onFiles(files.map((file, index) => (file.name ? file : renamePasted(file, index))));
  return true;
}

function renamePasted(file: File, index: number): File {
  const ext = file.type.split("/")[1] || "png";
  return new File([file], `pasted-${Date.now()}-${index}.${ext}`, { type: file.type });
}

function hasFiles(event: DragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

export type ImageDropProps = {
  onDragEnter: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
};

/**
 * Drag-and-drop support for a composer element: spread `dropProps` on it and use
 * `isDragging` for a highlight. Only drags carrying files are intercepted.
 */
export function useImageDrop(
  onFiles: (files: File[]) => void,
  options: { disabled?: boolean } = {},
): { isDragging: boolean; dropProps: ImageDropProps } {
  const { disabled = false } = options;
  const [isDragging, setDragging] = useState(false);
  const depth = useRef(0);

  const onDragEnter = useCallback(
    (event: DragEvent<HTMLElement>) => {
      if (disabled || !hasFiles(event)) return;
      event.preventDefault();
      depth.current += 1;
      setDragging(true);
    },
    [disabled],
  );
  const onDragOver = useCallback(
    (event: DragEvent<HTMLElement>) => {
      if (disabled || !hasFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    [disabled],
  );
  const onDragLeave = useCallback((event: DragEvent<HTMLElement>) => {
    if (!hasFiles(event)) return;
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setDragging(false);
  }, []);
  const onDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      depth.current = 0;
      setDragging(false);
      if (disabled || !hasFiles(event)) return;
      event.preventDefault();
      const files = Array.from(event.dataTransfer.files ?? []);
      // Non-images are passed too so the upload hook reports the unsupported type.
      if (files.length) onFiles(files);
    },
    [disabled, onFiles],
  );

  return { isDragging, dropProps: { onDragEnter, onDragOver, onDragLeave, onDrop } };
}
