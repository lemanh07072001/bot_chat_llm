/**
 * Quick replies ("mẫu câu"), shared by the invoicing inbox and the project
 * settings page.
 *
 * Safe to import from Client Components: no next/headers, no fetch.
 */

export type CannedMode = "global" | "site" | "both";

export type CannedTemplate = {
  /** Optional heading; lets a long reply be recognisable at a glance. */
  title?: string;
  /** Typed after a `/` in the composer. Lowercase, digits and dashes. */
  shortcut?: string;
  text: string;
};

export type CannedSet = { templates: CannedTemplate[]; version: number };
export type SiteCannedSet = CannedSet & { mode: CannedMode };

/** What `/api/canned-responses/effective` answers for one project. */
export type EffectiveCanned = {
  siteId: string;
  mode: CannedMode;
  site: CannedSet;
  global: CannedSet;
};

export const CANNED_MAX_TEMPLATES = 30;
export const CANNED_TITLE_MAX_LENGTH = 60;
export const CANNED_SHORTCUT_MAX_LENGTH = 20;
export const CANNED_TEXT_MAX_LENGTH = 4000;
export const CANNED_SHORTCUT_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const CANNED_MODE_OPTIONS: { value: CannedMode; label: string; hint: string }[] = [
  {
    value: "global",
    label: "Chỉ mẫu chung",
    hint: "Mọi dự án dùng bộ mẫu do quản trị viên soạn.",
  },
  {
    value: "site",
    label: "Chỉ mẫu riêng",
    hint: "Chỉ dùng bộ mẫu của dự án này, ẩn bộ mẫu chung.",
  },
  {
    value: "both",
    label: "Cả hai",
    hint: "Nhân viên thấy cả bộ mẫu chung và bộ mẫu của dự án.",
  },
];

/**
 * Shown to an agent who has never saved a set.
 *
 * These used to be plain strings; the shortcut is new, so it is spelled out
 * here rather than inferred from the first word.
 */
export const DEFAULT_CANNED_TEMPLATES: CannedTemplate[] = [
  {
    title: "Chào khách",
    shortcut: "chao",
    text: "Xin chào quý khách, em có thể hỗ trợ gì cho mình ạ? 👋",
  },
  {
    title: "Đang kiểm tra",
    shortcut: "doi",
    text: "Dạ bên em đã tiếp nhận thông tin, xin quý khách đợi trong giây lát ạ! ⏳",
  },
  {
    title: "Đã giải quyết",
    shortcut: "xong",
    text: "Dạ vấn đề đã được giải quyết rồi ạ. Quý khách cần hỗ trợ thêm gì không ạ? ✨",
  },
  {
    title: "Cảm ơn",
    shortcut: "cam-on",
    text: "Cảm ơn quý khách đã liên hệ với Chat Center. Chúc quý khách một ngày tốt lành! 🙏",
  },
];

/**
 * A saved set, or the starter replies when the account never chose.
 *
 * An empty list is deliberate and must survive as an empty list — that is how
 * somebody turns the starter replies off.
 */
export function resolvePersonalTemplates(profile: {
  cannedResponseTemplates?: CannedTemplate[];
  cannedResponses?: string[];
} | null): CannedTemplate[] {
  if (profile?.cannedResponseTemplates) {
    return profile.cannedResponseTemplates;
  }

  if (profile?.cannedResponses) {
    return profile.cannedResponses.map((text) => ({ text }));
  }

  return DEFAULT_CANNED_TEMPLATES;
}

/** Turns whatever the agent typed into something a `/` command can match. */
export function normalizeShortcut(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^\/+/, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, CANNED_SHORTCUT_MAX_LENGTH);
}

export type CannedGroup = {
  key: "mine" | "site" | "global";
  label: string;
  templates: CannedTemplate[];
};

/**
 * The three groups the picker shows, already narrowed by the project's mode.
 *
 * Order is also the tie-break order for a shortcut that exists twice: the
 * agent's own reply wins over the project's, which wins over the shared one.
 */
export function cannedGroups({
  personal,
  effective,
  siteName,
}: {
  personal: CannedTemplate[];
  effective: EffectiveCanned | null;
  siteName?: string;
}): CannedGroup[] {
  const mode = effective?.mode ?? "global";
  const usesSite = mode === "site" || mode === "both";
  const usesGlobal = mode === "global" || mode === "both";

  return [
    { key: "mine", label: "Của tôi", templates: personal },
    {
      key: "site",
      label: siteName ? `Riêng ${siteName}` : "Riêng dự án",
      templates: usesSite ? (effective?.site.templates ?? []) : [],
    },
    {
      key: "global",
      label: "Chung",
      templates: usesGlobal ? (effective?.global.templates ?? []) : [],
    },
  ];
}

export type CannedHit = CannedTemplate & { group: CannedGroup["key"]; groupLabel: string };

/**
 * Search for the popover, plus the ranking the `/` list needs.
 *
 * An exact shortcut match jumps to the top: `/chao` must insert the greeting
 * even when three replies mention "chào" in their body.
 */
export function searchCanned(groups: CannedGroup[], query: string): CannedHit[] {
  const needle = query.trim().toLowerCase();
  const hits: CannedHit[] = [];

  for (const group of groups) {
    for (const template of group.templates) {
      if (!needle) {
        hits.push({ ...template, group: group.key, groupLabel: group.label });
        continue;
      }

      const shortcut = (template.shortcut ?? "").toLowerCase();
      const title = (template.title ?? "").toLowerCase();
      const text = template.text.toLowerCase();

      if (
        shortcut.includes(needle) ||
        title.includes(needle) ||
        text.includes(needle)
      ) {
        hits.push({ ...template, group: group.key, groupLabel: group.label });
      }
    }
  }

  if (!needle) {
    return hits;
  }

  const rank = (hit: CannedHit) => {
    const shortcut = (hit.shortcut ?? "").toLowerCase();

    if (shortcut === needle) return 0;
    if (shortcut.startsWith(needle)) return 1;
    if ((hit.title ?? "").toLowerCase().startsWith(needle)) return 2;

    return 3;
  };

  // Array#sort is stable, so equal ranks keep the group order above.
  return hits.sort((left, right) => rank(left) - rank(right));
}

export type SlashQuery = { start: number; query: string };

/**
 * Checks a set before it leaves the browser, so the editor can point at the
 * row that is wrong instead of showing a generic 400 from the api.
 */
export function validateCannedTemplates(templates: CannedTemplate[]): string | null {
  if (templates.length > CANNED_MAX_TEMPLATES) {
    return `Chỉ được lưu tối đa ${CANNED_MAX_TEMPLATES} mẫu câu.`;
  }

  const seen = new Set<string>();

  for (const [index, template] of templates.entries()) {
    const position = index + 1;

    if (!template.text.trim()) return `Mẫu ${position} chưa có nội dung.`;
    if ((template.title ?? "").length > CANNED_TITLE_MAX_LENGTH) {
      return `Tiêu đề mẫu ${position} dài quá ${CANNED_TITLE_MAX_LENGTH} ký tự.`;
    }

    const shortcut = (template.shortcut ?? "").trim();

    if (!shortcut) continue;
    if (!CANNED_SHORTCUT_PATTERN.test(shortcut)) {
      return `Phím tắt mẫu ${position} chỉ gồm chữ thường, số và dấu gạch nối.`;
    }
    if (seen.has(shortcut)) return `Phím tắt “/${shortcut}” bị dùng hai lần.`;

    seen.add(shortcut);
  }

  return null;
}

/** Optional fields are dropped rather than sent as empty strings. */
export function cleanCannedTemplates(templates: CannedTemplate[]): CannedTemplate[] {
  return templates.map((template) => {
    const title = (template.title ?? "").trim();
    const shortcut = (template.shortcut ?? "").trim().toLowerCase();

    return {
      text: template.text.trim(),
      ...(title ? { title } : {}),
      ...(shortcut ? { shortcut } : {}),
    };
  });
}

/**
 * Finds a `/` command under the caret.
 *
 * Only a `/` at the start of the draft or right after whitespace counts, so a
 * URL or a fraction (`3/4`) never opens the menu.
 */
export function findSlashQuery(value: string, caret: number): SlashQuery | null {
  const upto = value.slice(0, caret);
  const match = /(^|\s)\/([^\s/]*)$/.exec(upto);

  if (!match) {
    return null;
  }

  return { start: caret - match[2].length - 1, query: match[2] };
}

/**
 * Replaces `[start, end)` with the reply and tells the caller where to put the
 * caret. Kept pure so the composer can set both the value and the selection in
 * one update.
 */
export function insertCannedText({
  value,
  start,
  end,
  text,
}: {
  value: string;
  start: number;
  end: number;
  text: string;
}): { value: string; caret: number } {
  const before = value.slice(0, start);
  const after = value.slice(end);

  // A reply dropped mid-word reads badly; keep the neighbours apart on both
  // sides so "Xin chào" + "Cảm ơn" never runs together.
  const needsLeadingSpace = before.length > 0 && !/\s$/.test(before) && !/^\s/.test(text);
  const needsTrailingSpace = after.length > 0 && !/^\s/.test(after) && !/\s$/.test(text);

  const inserted = `${needsLeadingSpace ? " " : ""}${text}${needsTrailingSpace ? " " : ""}`;
  const next = `${before}${inserted}${after}`;

  return { value: next, caret: before.length + inserted.length };
}
