"use client";

import type { ReactNode } from "react";

/**
 * A single on/off choice with its explanation beside it. Used for the "declare
 * office hours" style switch, where the description is as important as the
 * label — a bare checkbox would leave the operator guessing what it changes.
 */
export function CheckboxField({
  name,
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: {
  name?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-start gap-2.5 ${disabled ? "cursor-default opacity-60" : "cursor-pointer"}`}
    >
      <input
        type="checkbox"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 w-4 h-4 rounded-sm accent-[#EA580C]"
      />
      <span>
        <span className="block text-xs font-medium text-[#1D1D1F]">{label}</span>
        {description && (
          <span className="block text-[11px] text-[#86868B] leading-relaxed">{description}</span>
        )}
      </span>
    </label>
  );
}
