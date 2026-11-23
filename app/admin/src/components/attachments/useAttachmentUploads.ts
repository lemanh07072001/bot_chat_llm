"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ATTACHMENT_ERRORS,
  MAX_ATTACHMENTS,
  isAttachmentMimeType,
  prepareImage,
  uploadImage,
  type AttachmentView,
} from "@/lib/attachments";

export type PendingAttachmentStatus = "uploading" | "done" | "error";

export type PendingAttachment = {
  localId: string;
  /** Object URL of the picked file (revoked on remove/clear/unmount). */
  previewUrl: string;
  /** 0..1 */
  progress: number;
  status: PendingAttachmentStatus;
  error?: string;
  attachment?: AttachmentView;
};

export type AttachmentUploads = {
  items: PendingAttachment[];
  addFiles: (files: FileList | File[] | null | undefined) => void;
  remove: (localId: string) => void;
  /** Re-runs the upload of a failed item. */
  retry: (localId: string) => void;
  clear: () => void;
  /** Drops only the items whose attachment id was just sent (keeps newer picks and failures). */
  removeSent: (ids: string[]) => void;
  /** Ids of finished uploads, in pick order — send as `attachmentIds`. */
  ids: string[];
  /** True while any upload is in flight (block sending). */
  busy: boolean;
  /** True when any item failed (block sending until retried or removed). */
  hasErrors: boolean;
  /** Composer-level notice, e.g. too many files / unsupported type. */
  notice: string | null;
  dismissNotice: () => void;
};

let counter = 0;
const nextLocalId = () => `att-${Date.now().toString(36)}-${(counter++).toString(36)}`;

/** One decode/encode at a time across all composers: keeps memory flat. */
let prepareChain: Promise<unknown> = Promise.resolve();

function queuePrepare<T>(task: () => Promise<T>): Promise<T> {
  const run = prepareChain.then(task, task);
  prepareChain = run.catch(() => undefined);
  return run;
}

/**
 * Upload queue for one composer. Each picked file is prepared (validated and
 * downscaled) and uploaded immediately; the composer sends `ids` once `busy`
 * is false.
 */
export function useAttachmentUploads(siteId: string): AttachmentUploads {
  const [items, setItems] = useState<PendingAttachment[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  // Synchronous mirror so quick successive addFiles calls respect the limit.
  const itemsRef = useRef<PendingAttachment[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const siteRef = useRef(siteId);
  // Picked files by localId, kept for retry.
  const sources = useRef(new Map<string, File>());

  useEffect(() => {
    siteRef.current = siteId;
  }, [siteId]);

  const commit = useCallback((update: (prev: PendingAttachment[]) => PendingAttachment[]) => {
    itemsRef.current = update(itemsRef.current);
    setItems(itemsRef.current);
  }, []);

  const patch = useCallback(
    (localId: string, changes: Partial<PendingAttachment>) => {
      commit((prev) => prev.map((item) => (item.localId === localId ? { ...item, ...changes } : item)));
    },
    [commit],
  );

  const start = useCallback(
    async (localId: string, file: File) => {
      const controller = new AbortController();
      controllers.current.set(localId, controller);
      try {
        const prepared = await queuePrepare(() =>
          controller.signal.aborted ? Promise.resolve(null) : prepareImage(file),
        );
        if (controller.signal.aborted || !prepared) return;
        let last = 0;
        const attachment = await uploadImage(
          siteRef.current,
          prepared,
          (fraction) => {
            // Throttle re-renders to ~2% steps.
            if (fraction - last >= 0.02 || fraction === 1) {
              last = fraction;
              patch(localId, { progress: fraction });
            }
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        patch(localId, { status: "done", progress: 1, attachment, error: undefined });
      } catch (err) {
        if (controller.signal.aborted) return;
        patch(localId, {
          status: "error",
          error: err instanceof Error && err.message ? err.message : ATTACHMENT_ERRORS.upload,
        });
      } finally {
        controllers.current.delete(localId);
      }
    },
    [patch],
  );

  const addFiles = useCallback(
    (input: FileList | File[] | null | undefined) => {
      const files = input ? Array.from(input) : [];
      if (files.length === 0) return;
      let message: string | null = null;
      const accepted: File[] = [];
      for (const file of files) {
        if (!isAttachmentMimeType(file.type)) {
          message = ATTACHMENT_ERRORS.type;
          continue;
        }
        accepted.push(file);
      }
      const room = MAX_ATTACHMENTS - itemsRef.current.length;
      if (accepted.length > room) message = ATTACHMENT_ERRORS.tooMany;
      const take = accepted.slice(0, Math.max(0, room));
      setNotice(message);
      if (take.length === 0) return;

      const created = take.map((file) => ({
        file,
        item: {
          localId: nextLocalId(),
          previewUrl: URL.createObjectURL(file),
          progress: 0,
          status: "uploading" as const,
        },
      }));
      for (const { file, item } of created) sources.current.set(item.localId, file);
      commit((prev) => [...prev, ...created.map((entry) => entry.item)]);
      for (const { file, item } of created) void start(item.localId, file);
    },
    [commit, start],
  );

  const remove = useCallback(
    (localId: string) => {
      controllers.current.get(localId)?.abort();
      controllers.current.delete(localId);
      sources.current.delete(localId);
      const target = itemsRef.current.find((item) => item.localId === localId);
      if (target) URL.revokeObjectURL(target.previewUrl);
      commit((prev) => prev.filter((item) => item.localId !== localId));
      setNotice(null);
    },
    [commit],
  );

  const clear = useCallback(() => {
    for (const controller of controllers.current.values()) controller.abort();
    controllers.current.clear();
    sources.current.clear();
    for (const item of itemsRef.current) URL.revokeObjectURL(item.previewUrl);
    commit(() => []);
    setNotice(null);
  }, [commit]);

  const removeSent = useCallback(
    (sentIds: string[]) => {
      const sent = new Set(sentIds);
      const isSent = (item: PendingAttachment) => !!item.attachment && sent.has(item.attachment.id);
      for (const item of itemsRef.current) {
        if (!isSent(item)) continue;
        URL.revokeObjectURL(item.previewUrl);
        sources.current.delete(item.localId);
      }
      commit((prev) => prev.filter((item) => !isSent(item)));
    },
    [commit],
  );

  const retry = useCallback(
    (localId: string) => {
      const item = itemsRef.current.find((entry) => entry.localId === localId);
      const file = sources.current.get(localId);
      if (!item || item.status !== "error" || !file) return;
      patch(localId, { status: "uploading", progress: 0, error: undefined });
      void start(localId, file);
    },
    [patch, start],
  );

  // Abort in-flight uploads and free previews on unmount.
  useEffect(() => {
    const active = controllers.current;
    const picked = sources.current;
    return () => {
      for (const controller of active.values()) controller.abort();
      active.clear();
      picked.clear();
      for (const item of itemsRef.current) URL.revokeObjectURL(item.previewUrl);
      itemsRef.current = [];
    };
  }, []);

  const ids = useMemo(
    () =>
      items.flatMap((item) => (item.status === "done" && item.attachment ? [item.attachment.id] : [])),
    [items],
  );
  const busy = items.some((item) => item.status === "uploading");
  const hasErrors = items.some((item) => item.status === "error");
  const dismissNotice = useCallback(() => setNotice(null), []);

  return { items, addFiles, remove, retry, clear, removeSent, ids, busy, hasErrors, notice, dismissNotice };
}
