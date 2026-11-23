/**
 * Emoji assets for the widget.
 *
 * The dataset (~183 KB of labels and keywords) and the emoji font (~2 MB, the
 * whole Noto Color Emoji in COLRv1 so every emoji has one consistent look) are
 * served as static files next to the bundle instead of being bundled into
 * widget.js: every customer page would otherwise download them, whether or not
 * it ever opens the picker. Fetched lazily, a page that shows no emoji pays
 * nothing.
 *
 * Urls are always absolute. A relative `url()` inside the `<style>` element we
 * inject into the shadow root resolves against the *host page* origin, not the
 * api, so the font would 404 on every customer site. Resolving against the
 * script src (or an explicit data-asset-base-url) keeps it correct.
 *
 * `unicode-range` is the same range the admin panel uses: it makes the font
 * lazy at the glyph level, so the file is only downloaded once an emoji is on
 * screen. Plain digits, # * © ® ™ are left out of it so ordinary text keeps
 * the page font.
 *
 * Only registered where the browser can paint COLRv1. Safari cannot, and would
 * draw every emoji blank; there the platform font (Apple Color Emoji) is used.
 */

function supportsColrV1(): boolean {
  try {
    return typeof CSS !== 'undefined' && CSS.supports('font-tech(color-COLRv1)');
  } catch {
    return false;
  }
}

export const EMOJI_FONT_FAMILY = 'ChatEmojiFill';

export const EMOJI_UNICODE_RANGE = 'U+200D, U+203C, U+2049, U+20E3, U+2139, U+2194-2199, U+21A9-21AA, U+231A-231B, U+2328, U+23CF, U+23E9-23F3, U+23F8-23FA, U+24C2, U+25AA-25AB, U+25B6, U+25C0, U+25FB-25FE, U+2600-2604, U+260E, U+2611, U+2614-2615, U+2618, U+261D, U+2620, U+2622-2623, U+2626, U+262A, U+262E-262F, U+2638-263A, U+2640, U+2642, U+2648-2653, U+265F-2660, U+2663, U+2665-2666, U+2668, U+267B, U+267E-267F, U+2692-2697, U+2699, U+269B-269C, U+26A0-26A1, U+26A7, U+26AA-26AB, U+26B0-26B1, U+26BD-26BE, U+26C4-26C5, U+26C8, U+26CE-26CF, U+26D1, U+26D3-26D4, U+26E9-26EA, U+26F0-26F5, U+26F7-26FA, U+26FD, U+2702, U+2705, U+2708-270D, U+270F, U+2712, U+2714, U+2716, U+271D, U+2721, U+2728, U+2733-2734, U+2744, U+2747, U+274C, U+274E, U+2753-2755, U+2757, U+2763-2764, U+2795-2797, U+27A1, U+27B0, U+27BF, U+2934-2935, U+2B05-2B07, U+2B1B-2B1C, U+2B50, U+2B55, U+3030, U+303D, U+3297, U+3299, U+FE0E-FE0F, U+1F004, U+1F0CF, U+1F170-1F171, U+1F17E-1F17F, U+1F18E, U+1F191-1F19A, U+1F1E6-1F1FF, U+1F201-1F202, U+1F21A, U+1F22F, U+1F232-1F23A, U+1F250-1F251, U+1F300-1F321, U+1F324-1F393, U+1F396-1F397, U+1F399-1F39B, U+1F39E-1F3F0, U+1F3F3-1F3F5, U+1F3F7-1F4FD, U+1F4FF-1F53D, U+1F549-1F54E, U+1F550-1F567, U+1F56F-1F570, U+1F573-1F57A, U+1F587, U+1F58A-1F58D, U+1F590, U+1F595-1F596, U+1F5A4-1F5A5, U+1F5A8, U+1F5B1-1F5B2, U+1F5BC, U+1F5C2-1F5C4, U+1F5D1-1F5D3, U+1F5DC-1F5DE, U+1F5E1, U+1F5E3, U+1F5E8, U+1F5EF, U+1F5F3, U+1F5FA-1F64F, U+1F680-1F6C5, U+1F6CB-1F6D2, U+1F6D5-1F6D9, U+1F6DC-1F6E5, U+1F6E9, U+1F6EB-1F6EC, U+1F6F0, U+1F6F3-1F6FC, U+1F7E0-1F7EB, U+1F7F0, U+1F90C-1F93A, U+1F93C-1F945, U+1F947-1F9FF, U+1FA70-1FA7C, U+1FA80-1FAC6, U+1FAC8, U+1FACC-1FADD, U+1FADF-1FAEB, U+1FAEF-1FAFA, U+E0020-E007F';

export interface EmojiEntry {
  e: string;
  g: number;
  l: string;
  t?: string[];
}

export interface EmojiGroup {
  order: number;
  key: string;
  label: string;
}

export interface EmojiData {
  groups: EmojiGroup[];
  emojis: EmojiEntry[];
}

/** Every url this module builds ends in `/`, so names can just be appended. */
function withTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

/**
 * Where `emoji-data.json` and the font live. Order matters: an explicit value
 * (option or `data-asset-base-url`) wins, then the directory next to the
 * script, then the api. The last case has to degrade gracefully — `apiUrl` can
 * be a path like `/api`, which is not a valid url base on its own.
 */
export function resolveAssetBase(explicit?: string, scriptSrc?: string, apiUrl?: string): string {
  if (explicit) {
    return withTrailingSlash(explicit);
  }

  if (scriptSrc) {
    try {
      return new URL('./assets/', scriptSrc).href;
    } catch {
      // Malformed src: fall through to the api guess.
    }
  }

  try {
    return new URL('/v1/assets/', apiUrl ?? '/').href;
  } catch {
    return '/v1/assets/';
  }
}

/** Keyed by base: a base is resolved once per page, so this is a cheap retry cache. */
const dataCache = new Map<string, Promise<EmojiData>>();

function parseEmojiData(value: unknown): EmojiData {
  const data = value as Partial<EmojiData> | null;

  if (
    !data ||
    !Array.isArray(data.groups) ||
    data.groups.length === 0 ||
    !Array.isArray(data.emojis) ||
    data.emojis.length === 0
  ) {
    throw new Error('Emoji data is malformed');
  }

  return { groups: data.groups, emojis: data.emojis };
}

export function loadEmojiData(base: string): Promise<EmojiData> {
  const cached = dataCache.get(base);

  if (cached) {
    return cached;
  }

  const request = fetch(`${base}emoji-data.json`, { credentials: 'omit' })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Emoji data request failed with ${response.status}`);
      }

      return parseEmojiData(await response.json());
    })
    .catch((error: unknown) => {
      // A failed attempt must not poison the cache: the next caller retries.
      dataCache.delete(base);
      throw error;
    });

  dataCache.set(base, request);

  return request;
}

/**
 * Keyed by base, so a remount never registers a second face for the same url.
 * The value is the face itself (not a promise) because a failed download has to
 * be removable: `document.fonts` keeps a failed face forever, so `load()` would
 * keep resolving against the dead one and never retry the url.
 */
const registeredFonts = new Map<string, FontFace | null>();

export function registerEmojiFont(base: string): Promise<void> {
  if (registeredFonts.has(base)) {
    return Promise.resolve();
  }

  // Older embedded browsers and jsdom have no FontFaceSet; the picker still
  // works there, it just renders with the platform emoji font.
  const fonts = typeof document === 'undefined' ? undefined : document.fonts;

  if (!fonts || !supportsColrV1()) {
    registeredFonts.set(base, null);
    return Promise.resolve();
  }

  // Registration is synchronous; `.load()` is deliberately left to the caller
  // that is about to render emoji.
  const face = new FontFace(EMOJI_FONT_FAMILY, `url("${base}chat-emoji-fill.woff2")`, {
    unicodeRange: EMOJI_UNICODE_RANGE,
    display: 'swap',
  });

  fonts.add(face);
  registeredFonts.set(base, face);

  return Promise.resolve();
}

/**
 * Waits for the fill font to be usable. Rejects instead of hanging so the
 * caller can fall back to the platform font — a slow font must never hold up
 * the chat.
 */
export async function loadEmojiFont(base: string, timeoutMs = 1500): Promise<void> {
  await registerEmojiFont(base);

  const fonts = typeof document === 'undefined' ? undefined : document.fonts;

  // Nothing registered on purpose (no FontFaceSet, or no COLRv1): the platform
  // font is the answer, not a failure to retry.
  if (!fonts || registeredFonts.get(base) === null) {
    return;
  }

  let timer: number | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(
      () => reject(new Error(`Emoji font did not load within ${timeoutMs}ms`)),
      timeoutMs,
    );
  });

  const loading = fonts.load(`1rem "${EMOJI_FONT_FAMILY}"`, '🇻🇳');
  // The timeout may win the race; swallow the late rejection either way.
  void loading.catch(() => undefined);

  try {
    const faces = await Promise.race([loading, timeout]);

    if (!faces.length || !faces.some((face) => face.status === 'loaded')) {
      throw new Error('Emoji font did not load');
    }
  } catch (error: unknown) {
    // A face that failed to download stays in the set and keeps answering
    // `fonts.load()` with status "error", so the next attempt would never
    // refetch the file. Drop it; the next `registerEmojiFont` builds a new one.
    forgetEmojiFont(base);
    throw error;
  } finally {
    if (timer !== undefined) {
      window.clearTimeout(timer);
    }
  }
}

function forgetEmojiFont(base: string): void {
  const face = registeredFonts.get(base);

  registeredFonts.delete(base);

  if (!face) {
    return;
  }

  try {
    document.fonts?.delete(face);
  } catch {
    // A few embedded engines expose FontFaceSet without `delete`.
  }
}
