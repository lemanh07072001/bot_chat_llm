"use client";

import {
  CANNED_MAX_TEMPLATES,
  CANNED_SHORTCUT_MAX_LENGTH,
  CANNED_TEXT_MAX_LENGTH,
  CANNED_TITLE_MAX_LENGTH,
  type CannedTemplate,
} from "@/lib/canned";

const FIELD =
  "w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs text-[#1D1D1F] placeholder:text-neutral-400 outline-none transition focus:border-[#EA580C] focus:ring-2 focus:ring-[#EA580C]/15";

/**
 * The row editor shared by the personal set and both project-wide sets, so the
 * three places that edit a reply look and behave the same.
 *
 * Controlled: the caller owns the list and decides what saving means.
 */
export function TemplateRows({
  templates,
  onChange,
  disabled = false,
  emptyHint,
}: {
  templates: CannedTemplate[];
  onChange: (next: CannedTemplate[]) => void;
  disabled?: boolean;
  emptyHint?: string;
}) {
  const update = (index: number, patch: Partial<CannedTemplate>) =>
    onChange(templates.map((row, position) => (position === index ? { ...row, ...patch } : row)));

  return (
    <div className="space-y-2">
      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
        {templates.map((template, index) => (
          <div key={index} className="rounded-xl border border-neutral-200 p-2.5 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <input
                aria-label={`Tiêu đề mẫu ${index + 1}`}
                maxLength={CANNED_TITLE_MAX_LENGTH}
                placeholder="Tiêu đề (không bắt buộc)"
                className={FIELD}
                disabled={disabled}
                value={template.title ?? ""}
                onChange={(event) => update(index, { title: event.target.value })}
              />
              <span aria-hidden="true" className="text-xs text-neutral-400">/</span>
              <input
                aria-label={`Phím tắt mẫu ${index + 1}`}
                maxLength={CANNED_SHORTCUT_MAX_LENGTH}
                placeholder="phim-tat"
                className={`${FIELD} w-32 font-mono`}
                disabled={disabled}
                value={template.shortcut ?? ""}
                onChange={(event) => update(index, { shortcut: event.target.value })}
              />
            </div>

            <textarea
              aria-label={`Mẫu câu ${index + 1}`}
              required
              rows={2}
              maxLength={CANNED_TEXT_MAX_LENGTH}
              className={`${FIELD} resize-y`}
              disabled={disabled}
              value={template.text}
              onChange={(event) => update(index, { text: event.target.value })}
            />

            <div className="flex items-center justify-between text-[11px] text-neutral-400">
              <span>
                {template.text.length}/{CANNED_TEXT_MAX_LENGTH}
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(templates.filter((_, position) => position !== index))}
                className="text-rose-600 hover:underline cursor-pointer disabled:opacity-50"
              >
                Xóa
              </button>
            </div>
          </div>
        ))}

        {templates.length === 0 && emptyHint && (
          <p className="text-xs text-neutral-500">{emptyHint}</p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={disabled || templates.length >= CANNED_MAX_TEMPLATES}
          onClick={() => onChange([...templates, { text: "" }])}
          className="text-xs font-medium text-[#EA580C] hover:text-amber-700 disabled:opacity-50 cursor-pointer"
        >
          + Thêm mẫu
        </button>
        <span className="text-[11px] text-neutral-400">
          {templates.length}/{CANNED_MAX_TEMPLATES} mẫu
        </span>
      </div>
    </div>
  );
}
