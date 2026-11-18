/**
 * Client-side pieces of the chat translator: the language list the picker
 * offers, and a cheap script guess used to pick a sensible target for a reply.
 *
 * Safe to import from a Client Component — nothing here touches next/headers.
 * The codes must stay in step with app/api/src/translation/translation.languages.ts.
 */

export type TranslationLanguage = {
  code: string;
  label: string;
};

export const TRANSLATION_LANGUAGES: TranslationLanguage[] = [
  { code: "vi", label: "Tiếng Việt" },
  { code: "en", label: "Tiếng Anh" },
  { code: "ja", label: "Tiếng Nhật" },
  { code: "ko", label: "Tiếng Hàn" },
  { code: "zh", label: "Tiếng Trung" },
  { code: "th", label: "Tiếng Thái" },
  { code: "id", label: "Tiếng Indonesia" },
  { code: "fr", label: "Tiếng Pháp" },
  { code: "de", label: "Tiếng Đức" },
  { code: "es", label: "Tiếng Tây Ban Nha" },
  { code: "pt", label: "Tiếng Bồ Đào Nha" },
  { code: "ru", label: "Tiếng Nga" },
];

/** What an agent who never picked a language reads. */
export const DEFAULT_TRANSLATION_LANGUAGE = "vi";

export function translationLanguageLabel(code: string): string {
  return TRANSLATION_LANGUAGES.find((language) => language.code === code)?.label ?? code;
}

export function isTranslationLanguage(code: string): boolean {
  return TRANSLATION_LANGUAGES.some((language) => language.code === code);
}

let statusRequest: Promise<boolean> | null = null;

/**
 * Asks the panel's own proxy whether the api has a provider configured.
 *
 * Cached per page load: every conversation thread mounts, and they all want the
 * same answer. A failure reads as "off", which is the safe way to fail — the
 * inbox keeps working without its Dịch buttons.
 */
export function translationIsEnabled(): Promise<boolean> {
  statusRequest ??= fetch("/api/translation/status")
    .then(async (response) => (response.ok ? Boolean((await response.json()).enabled) : false))
    .catch(() => false);

  return statusRequest;
}

const SCRIPT_HINTS: Array<[RegExp, string]> = [
  [/[\u3040-\u30ff]/, "ja"],
  [/[\uac00-\ud7af]/, "ko"],
  [/[\u4e00-\u9fff]/, "zh"],
  [/[\u0e00-\u0e7f]/, "th"],
  [/[\u0400-\u04ff]/, "ru"],
];

const VIETNAMESE_PATTERN =
  /[ăâđêôơưĂÂĐÊÔƠƯàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/;

/**
 * A guess, not a verdict. It only decides which language the "Dịch" button in
 * the composer offers, and the api skips the model call when the guess says the
 * text is already in the target language.
 */
export function detectLanguage(text: string): string {
  const sample = text.slice(0, 2000);

  for (const [pattern, language] of SCRIPT_HINTS) {
    if (pattern.test(sample)) return language;
  }

  if (VIETNAMESE_PATTERN.test(sample)) return "vi";

  return /[a-z]/i.test(sample) ? "en" : "vi";
}
