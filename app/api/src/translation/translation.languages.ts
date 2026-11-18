/**
 * The languages the chat translator offers.
 *
 * A closed list rather than free text: the picker in the admin panel has to
 * show a name, and an unknown code would be sent to the model as a mystery
 * instruction ("translate to xx"), which it would happily invent something for.
 */
export const TRANSLATION_LANGUAGES = [
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'en', label: 'Tiếng Anh' },
  { code: 'ja', label: 'Tiếng Nhật' },
  { code: 'ko', label: 'Tiếng Hàn' },
  { code: 'zh', label: 'Tiếng Trung' },
  { code: 'th', label: 'Tiếng Thái' },
  { code: 'id', label: 'Tiếng Indonesia' },
  { code: 'fr', label: 'Tiếng Pháp' },
  { code: 'de', label: 'Tiếng Đức' },
  { code: 'es', label: 'Tiếng Tây Ban Nha' },
  { code: 'pt', label: 'Tiếng Bồ Đào Nha' },
  { code: 'ru', label: 'Tiếng Nga' },
] as const;

export type TranslationLanguage = (typeof TRANSLATION_LANGUAGES)[number]['code'];

export const TRANSLATION_LANGUAGE_CODES = TRANSLATION_LANGUAGES.map(
  (language) => language.code,
);

export function isTranslationLanguage(
  value: unknown,
): value is TranslationLanguage {
  return (
    typeof value === 'string' &&
    TRANSLATION_LANGUAGE_CODES.includes(value as TranslationLanguage)
  );
}

export function languageLabel(code: string): string {
  return (
    TRANSLATION_LANGUAGES.find((language) => language.code === code)?.label ??
    code
  );
}

/**
 * Script ranges that identify a language on their own. Japanese is checked
 * before Chinese because kanji sit inside the CJK block as well.
 */
const SCRIPT_HINTS: ReadonlyArray<readonly [RegExp, TranslationLanguage]> = [
  [/[\u3040-\u30ff]/, 'ja'],
  [/[\uac00-\ud7af]/, 'ko'],
  [/[\u4e00-\u9fff]/, 'zh'],
  [/[\u0e00-\u0e7f]/, 'th'],
  [/[\u0400-\u04ff]/, 'ru'],
];

/** Letters and tone marks that only Vietnamese uses. */
const VIETNAMESE_PATTERN =
  /[ăâđêôơưĂÂĐÊÔƠƯàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/;

/**
 * A cheap guess, only used to skip a pointless model call ("this is already
 * Vietnamese") and to tell the agent which language they are looking at. The
 * model does the real work, so being wrong here costs nothing but a call.
 */
export function detectLanguage(text: string): TranslationLanguage | 'und' {
  const sample = text.slice(0, 2000);

  for (const [pattern, language] of SCRIPT_HINTS) {
    if (pattern.test(sample)) {
      return language;
    }
  }

  if (VIETNAMESE_PATTERN.test(sample)) {
    return 'vi';
  }

  // Latin script with no Vietnamese marks: English is the safe default, and a
  // French or Spanish message still translates correctly from it.
  return /[a-z]/i.test(sample) ? 'en' : 'und';
}
