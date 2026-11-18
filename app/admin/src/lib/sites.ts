/**
 * Shapes returned by the api's /sites routes. Safe to import from Client
 * Components — nothing here touches next/headers.
 */

export type WidgetSettings = {
  title: string;
  imageUrl?: string;
  themeColor: string;
  greeting: string;
};

/**
 * When somebody is expected to be around. It gates nothing — a visitor may
 * always write — it decides what the widget tells them to expect.
 */
export type OfficeHours = {
  enabled: boolean;
  /** IANA zone, e.g. Asia/Ho_Chi_Minh. */
  timezone: string;
  /** 0 = Sunday … 6 = Saturday. */
  weekdays: number[];
  from: string;
  to: string;
  offlineMessage: string;
};

export const WEEKDAY_LABELS = [
  { value: 1, label: "T2" },
  { value: 2, label: "T3" },
  { value: 3, label: "T4" },
  { value: 4, label: "T5" },
  { value: 5, label: "T6" },
  { value: 6, label: "T7" },
  { value: 0, label: "CN" },
];

export const DEFAULT_OFFICE_HOURS: OfficeHours = {
  enabled: false,
  timezone: "Asia/Ho_Chi_Minh",
  weekdays: [1, 2, 3, 4, 5],
  from: "08:00",
  to: "17:30",
  offlineMessage:
    "Hiện đang ngoài giờ làm việc. Bạn cứ để lại tin nhắn và email, chúng tôi sẽ phản hồi ngay khi mở cửa.",
};

export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** What the caller may do with a project. */
export type SiteAccess = "owner" | "manager";

export type MemberRole = "owner" | "manager";

/**
 * The api trims this for a manager: only the owner is sent the public key, the
 * embed snippet and the origin allowlist, because only they install the
 * widget. Those fields are therefore optional here.
 */
export type Site = {
  id: string;
  name: string;
  settings: WidgetSettings;
  /** Absent for a manager, who is not sent the project's configuration. */
  officeHours?: OfficeHours;
  /** Whether the inbox may offer machine translation for this project. */
  translation?: { enabled: boolean };
  active: boolean;
  access: SiteAccess;
  /** Owner plus managers. Only sent on the list, not on a single read. */
  memberCount?: number;
  createdAt: string;
  updatedAt: string;
  ownerId?: string;
  publicKey?: string;
  allowedOrigins?: string[];
  /** Ready-to-paste <script> tag, assembled by the api. */
  embedSnippet?: string;
};

/** Narrows a project to the shape the owner-only panels need. */
export type OwnedSite = Site & {
  access: "owner";
  ownerId: string;
  publicKey: string;
  allowedOrigins: string[];
  embedSnippet: string;
};

export function isOwnedSite(site: Site): site is OwnedSite {
  return site.access === "owner" && typeof site.publicKey === "string";
}

export type WidgetBuild = {
  channel: string;
  hash: string;
  size: number;
  builtAt: string;
};

/** Mirrors the api's ORIGIN_PATTERN: a browser Origin header carries no path. */
export const ORIGIN_PATTERN = /^https?:\/\/[^/\s]+$/;

export const MAX_ORIGINS = 50;

/**
 * Operators paste origins one per line, or comma-separated, often with a
 * trailing slash copied from the address bar. Trailing slashes are stripped
 * rather than rejected, because `https://example.com/` is what a browser shows
 * and `https://example.com` is what it sends.
 */
export function parseOrigins(raw: string): string[] {
  const seen = new Set<string>();

  for (const entry of raw.split(/[\n,]/)) {
    const trimmed = entry.trim().replace(/\/+$/, '');

    if (trimmed) {
      seen.add(trimmed);
    }
  }

  return [...seen];
}

export function findInvalidOrigin(origins: string[]): string | undefined {
  return origins.find((origin) => !ORIGIN_PATTERN.test(origin));
}
