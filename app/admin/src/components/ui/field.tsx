import type { ReactNode } from "react";

export type FieldSize = "sm" | "md";

/**
 * The label / hint / error frame every form control on the admin shares.
 *
 * Two sizes because the panels use two densities: `md` for a normal form,
 * `sm` for the tighter grouped blocks such as office hours.
 */
export function Field({
  label,
  htmlFor,
  required = false,
  hint,
  error,
  size = "md",
  children,
}: {
  label?: string;
  /** Points the label at the control; omit for groups that label themselves. */
  htmlFor?: string;
  required?: boolean;
  hint?: ReactNode;
  error?: string | null;
  size?: FieldSize;
  children: ReactNode;
}) {
  const labelClass =
    size === "sm"
      ? "block text-[11px] font-medium text-[#1D1D1F] mb-1"
      : "block text-xs font-medium text-[#1D1D1F] mb-1.5";

  return (
    <div>
      {label &&
        (htmlFor ? (
          <label htmlFor={htmlFor} className={labelClass}>
            {label}
            {required && <span className="text-red-500"> *</span>}
          </label>
        ) : (
          // A group of radios or checkboxes is not labelled by <label>, which
          // must point at a single control.
          <span className={labelClass}>
            {label}
            {required && <span className="text-red-500"> *</span>}
          </span>
        ))}

      {children}

      {error ? (
        <p role="alert" className="mt-1 text-[11px] text-red-600">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1 text-[11px] text-[#86868B] leading-relaxed">{hint}</p>
      )}
    </div>
  );
}
