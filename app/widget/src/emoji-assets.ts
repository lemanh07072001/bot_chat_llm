/**
 * Emoji assets for the widget.
 *
 * The dataset (~183 KB of labels and keywords) and the fill font (~1 MB) are
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
 * lazy at the glyph level, so the 1 MB file is only downloaded when a codepoint
 * the subset actually owns is on screen.
 */

export const EMOJI_FONT_FAMILY = 'ChatEmojiFill';

export const EMOJI_UNICODE_RANGE = 'U+200D, U+20E3, U+2194-2195, U+2620, U+2640, U+2642, U+2695-2696, U+26A7, U+26D3, U+26F9, U+2708, U+2744, U+2764, U+27A1, U+2B1B, U+FE0E-FE0F, U+1F1E6-1F1FF, U+1F308, U+1F32B, U+1F33E, U+1F344, U+1F34B, U+1F373, U+1F37C, U+1F384, U+1F393, U+1F3A4, U+1F3A8, U+1F3C3-1F3C4, U+1F3CA-1F3CC, U+1F3EB, U+1F3ED, U+1F3F3-1F3F4, U+1F408, U+1F426, U+1F43B, U+1F466-1F469, U+1F46E-1F471, U+1F473, U+1F477, U+1F481-1F482, U+1F486-1F487, U+1F48B, U+1F4A5, U+1F4A8, U+1F4AB, U+1F4BB-1F4BC, U+1F525, U+1F527, U+1F52C, U+1F575, U+1F62E, U+1F635-1F636, U+1F642, U+1F645-1F647, U+1F64B, U+1F64D-1F64E, U+1F680, U+1F692, U+1F6A3, U+1F6B4-1F6B6, U+1F6D6-1F6D9, U+1F6DC-1F6DF, U+1F6FB-1F6FC, U+1F7E9, U+1F7EB, U+1F7F0, U+1F90C, U+1F91D, U+1F926, U+1F935, U+1F937-1F939, U+1F93C-1F93E, U+1F972, U+1F977-1F979, U+1F9A3-1F9A4, U+1F9AB-1F9AD, U+1F9AF-1F9B3, U+1F9B8-1F9B9, U+1F9BC-1F9BD, U+1F9CB-1F9CF, U+1F9D1-1F9D2, U+1F9D4, U+1F9D6-1F9DF, U+1FA70, U+1FA74-1FA77, U+1FA79, U+1FA7B-1FA7C, U+1FA83-1FA8F, U+1FA96-1FAC6, U+1FAC8, U+1FACC-1FADD, U+1FADF-1FAEB, U+1FAEF-1FAFA, U+E0020-E007F';

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

  if (!fonts) {
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

  if (!fonts) {
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
