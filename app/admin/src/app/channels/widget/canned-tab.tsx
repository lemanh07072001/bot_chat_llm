"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Lock, Save, Sparkles, X } from "lucide-react";
import { TemplateRows } from "@/components/canned/TemplateRows";
import {
  CANNED_MODE_OPTIONS,
  cleanCannedTemplates,
  validateCannedTemplates,
  type CannedMode,
  type CannedSet,
  type CannedTemplate,
} from "@/lib/canned";

type SetPayload = CannedSet & { mode?: CannedMode };

type SetResult =
  | { ok: true; data: SetPayload }
  | { ok: false; error: string; status: number; code?: string };

async function readSet(url: string): Promise<SetResult> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as
      | (SetPayload & { error?: string; code?: string })
      | null;

    if (!response.ok) {
      return {
        ok: false,
        error: body?.error ?? `Lỗi ${response.status}`,
        status: response.status,
        code: body?.code,
      };
    }

    return { ok: true, data: body ?? { templates: [], version: 0 } };
  } catch {
    return { ok: false, error: "Không kết nối được máy chủ.", status: 0 };
  }
}

async function putSet(url: string, body: unknown): Promise<SetResult> {
  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => null)) as
      | (SetPayload & { error?: string; code?: string })
      | null;

    if (!response.ok) {
      return {
        ok: false,
        error: data?.error ?? `Lỗi ${response.status}`,
        status: response.status,
        code: data?.code,
      };
    }

    return { ok: true, data: data ?? { templates: [], version: 0 } };
  } catch {
    return { ok: false, error: "Không kết nối được máy chủ.", status: 0 };
  }
}

/**
 * Loads, edits and saves one set.
 *
 * Saves carry the version the editor loaded. When somebody else got there
 * first the api answers 409 and the editor refuses to overwrite silently: the
 * operator chooses between taking the newer set and replacing it.
 */
function CannedEditor({
  url,
  allowMode,
  canWrite,
  emptyHint,
  description,
}: {
  url: string;
  allowMode: boolean;
  canWrite: boolean;
  emptyHint: string;
  description: React.ReactNode;
}) {
  const [templates, setTemplates] = useState<CannedTemplate[]>([]);
  const [mode, setMode] = useState<CannedMode>("global");
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  /** The newer set the server holds, offered when a save was refused. */
  const [conflict, setConflict] = useState<SetPayload | null>(null);
  const savingRef = useRef(false);

  const apply = useCallback((data: SetPayload) => {
    setTemplates(data.templates ?? []);
    setVersion(data.version ?? 0);
    if (data.mode) setMode(data.mode);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await readSet(url);
    setLoading(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    apply(result.data);
    setError("");
  }, [url, apply]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (overrideVersion?: number) => {
    if (savingRef.current || loading || !canWrite) return;

    const invalid = validateCannedTemplates(templates);
    if (invalid) {
      setError(invalid);
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError("");
    setNotice("");

    const result = await putSet(url, {
      version: overrideVersion ?? version,
      templates: cleanCannedTemplates(templates),
      ...(allowMode ? { mode } : {}),
    });

    savingRef.current = false;
    setSaving(false);

    if (result.ok) {
      apply(result.data);
      setConflict(null);
      setNotice("Đã lưu bộ mẫu.");
      return;
    }

    if (result.code === "CANNED_CONFLICT") {
      const fresh = await readSet(url);
      if (fresh.ok) setConflict(fresh.data);
    }

    setError(result.error);
  };

  const disabled = !canWrite || saving;

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        {description}
      </div>

      {allowMode && (
        <fieldset className="grid gap-2 sm:grid-cols-3" disabled={disabled}>
          <legend className="sr-only">Bộ mẫu câu dùng cho dự án</legend>
          {CANNED_MODE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`rounded-xl border p-2.5 text-xs cursor-pointer transition ${
                mode === option.value
                  ? "border-[#EA580C] bg-amber-50/60"
                  : "border-neutral-200 hover:border-neutral-300"
              } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              <span className="flex items-center gap-2 font-medium text-[#1D1D1F]">
                <input
                  type="radio"
                  name="canned-mode"
                  className="accent-[#EA580C]"
                  checked={mode === option.value}
                  onChange={() => setMode(option.value)}
                />
                {option.label}
              </span>
              <span className="mt-1 block text-[11px] text-[#86868B] leading-relaxed">
                {option.hint}
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {!canWrite && (
        <p className="inline-flex items-center gap-1.5 text-[11px] text-amber-700">
          <Lock className="w-3 h-3" />
          Chỉ chủ dự án sửa được bộ mẫu này. Bạn vẫn dùng được trong hộp thư.
        </p>
      )}

      {conflict && (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 space-y-2"
        >
          <p className="flex items-start gap-2 font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
            Người khác vừa sửa bộ mẫu này. Bản của bạn chưa được lưu.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                apply(conflict);
                setConflict(null);
                setError("");
              }}
              className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 font-medium hover:bg-amber-100 cursor-pointer"
            >
              Tải bản mới
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void save(conflict.version)}
              className="rounded-lg bg-amber-600 px-2.5 py-1 font-medium text-white hover:bg-amber-700 disabled:opacity-50 cursor-pointer"
            >
              Ghi đè bằng bản của tôi
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-neutral-500">Đang tải bộ mẫu…</p>
      ) : (
        <TemplateRows
          templates={templates}
          onChange={setTemplates}
          disabled={disabled}
          emptyHint={emptyHint}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled || loading}
          onClick={() => void save()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 px-3 py-1.5 text-xs font-medium text-white shadow-xs transition hover:from-amber-700 hover:to-orange-700 disabled:opacity-50 cursor-pointer"
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? "Đang lưu…" : "Lưu bộ mẫu"}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void load()}
          className="rounded-xl border border-neutral-200 px-3 py-1.5 text-xs font-medium text-[#86868B] transition hover:text-[#1D1D1F] disabled:opacity-50 cursor-pointer"
        >
          Tải lại
        </button>
        <span className="text-[11px] text-neutral-400">Bản {version}</span>
      </div>

      {error && (
        <p role="alert" className="text-xs text-rose-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-xs text-emerald-700">
          {notice}
        </p>
      )}
    </div>
  );
}

/** The project's own set, plus the mode that decides what its staff see. */
export function CannedTab({ siteId, siteName }: { siteId: string; siteName: string }) {
  return (
    <CannedEditor
      url={`/api/sites/${encodeURIComponent(siteId)}/canned-responses`}
      allowMode
      canWrite
      emptyHint={`Chưa có mẫu câu riêng cho ${siteName}. Thêm mẫu để nhân viên dự án dùng nhanh trong hộp thư.`}
      description={
        <p className="text-[11px] text-[#86868B] leading-relaxed">
          Mẫu câu riêng của <b className="text-[#1D1D1F]">{siteName}</b> chỉ dùng cho dự án này.
          Chọn chế độ bên dưới để quyết định nhân viên thấy bộ mẫu chung, bộ mẫu riêng hay cả hai.
        </p>
      }
    />
  );
}

/** The system-wide set. Admin-only, and the dialog is only reachable by admins. */
export function GlobalCannedDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      className="m-auto w-[min(94vw,620px)] rounded-2xl p-5 shadow-xl backdrop:bg-black/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-[#1D1D1F]">
            <Sparkles className="w-4 h-4 text-[#EA580C]" />
            Mẫu câu chung
          </h2>
          <p className="mt-1 text-[11px] text-[#86868B] max-w-lg leading-relaxed">
            Dùng cho mọi dự án đang để chế độ “Chỉ mẫu chung” hoặc “Cả hai”. Mẫu riêng của dự án
            và mẫu cá nhân của nhân viên vẫn được ưu tiên trước.
          </p>
        </div>
        <button
          type="button"
          onClick={() => dialog.current?.close()}
          aria-label="Đóng"
          className="p-1 rounded-md text-neutral-400 hover:text-neutral-700 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-4">
        <CannedEditor
          url="/api/canned-responses/global"
          allowMode={false}
          canWrite
          emptyHint="Chưa có mẫu câu chung nào."
          description={
            <p className="text-[11px] text-[#86868B]">
              Ai cũng đọc được bộ mẫu này; chỉ quản trị viên sửa được.
            </p>
          }
        />
      </div>
    </dialog>
  );
}
