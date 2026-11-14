"use client";

import { Field, type FieldSize } from "./field";

export type ChoiceOption = {
  value: string;
  label: string;
  /** A colour to show as a dot on the chip, e.g. a theme preset. */
  swatch?: string;
  title?: string;
};

type Common = {
  options: ChoiceOption[];
  /** Posted with the form; omit for state the form does not submit. */
  name?: string;
  label?: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
  disabled?: boolean;
  size?: FieldSize;
  /** Renders colour-only chips, for palettes. */
  swatchOnly?: boolean;
};

export type ChoiceChipsProps =
  | (Common & { multiple: true; value: string[]; onChange: (value: string[]) => void })
  | (Common & { multiple?: false; value: string; onChange: (value: string) => void });

/**
 * Pick one or several values from a short, visible set — weekdays, a palette,
 * a status. A dropdown hides the choices; chips show them, which is what a
 * handful of options deserves.
 *
 * Each chip wraps a real radio or checkbox, kept visually hidden rather than
 * replaced by a button. That is what makes the group keyboard-navigable, legible
 * to a screen reader, and submittable inside a plain form — the panels here post
 * through server actions, so `name` has to reach the FormData.
 */
export function ChoiceChips(props: ChoiceChipsProps) {
  const {
    options,
    name,
    label,
    required = false,
    hint,
    error,
    disabled = false,
    size = "md",
    swatchOnly = false,
  } = props;

  const isPicked = (value: string) =>
    props.multiple ? props.value.includes(value) : props.value === value;

  const toggle = (value: string) => {
    if (props.multiple) {
      const next = props.value.includes(value)
        ? props.value.filter((entry) => entry !== value)
        : [...props.value, value];

      props.onChange(next);
      return;
    }

    props.onChange(value);
  };

  const chipSizing = swatchOnly
    ? "w-6 h-6 rounded-full"
    : size === "sm"
      ? "px-2.5 py-1 rounded-lg text-[11px]"
      : "px-3 py-1.5 rounded-xl text-xs";

  return (
    <Field label={label} required={required} hint={hint} error={error} size={size}>
      <div className="flex flex-wrap items-center gap-1.5">
        {options.map((option) => {
          const picked = isPicked(option.value);

          return (
            <label
              key={option.value}
              title={option.title ?? (swatchOnly ? option.label : undefined)}
              className={disabled ? "cursor-default" : "cursor-pointer"}
            >
              <input
                type={props.multiple ? "checkbox" : "radio"}
                name={name}
                value={option.value}
                checked={picked}
                disabled={disabled}
                onChange={() => toggle(option.value)}
                className="peer sr-only"
              />
              <span
                className={`inline-flex items-center gap-1.5 border font-medium transition peer-focus-visible:ring-2 peer-focus-visible:ring-[#EA580C]/30 ${chipSizing} ${
                  disabled ? "opacity-60" : ""
                } ${
                  swatchOnly
                    ? picked
                      ? "border-[#1D1D1F] scale-110"
                      : "border-black/10 hover:scale-110"
                    : picked
                      ? "bg-[#EA580C] text-white border-[#EA580C]"
                      : "bg-white text-[#1D1D1F] border-neutral-200 hover:border-neutral-300"
                }`}
                style={swatchOnly ? { backgroundColor: option.swatch } : undefined}
              >
                {!swatchOnly && option.swatch && (
                  <span
                    aria-hidden="true"
                    className="w-2.5 h-2.5 rounded-full border border-black/10"
                    style={{ backgroundColor: option.swatch }}
                  />
                )}
                {/* A colour-only chip still needs a name for assistive tech. */}
                {swatchOnly ? <span className="sr-only">{option.label}</span> : option.label}
              </span>
            </label>
          );
        })}
      </div>
    </Field>
  );
}
