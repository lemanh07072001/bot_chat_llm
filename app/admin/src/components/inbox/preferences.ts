import type { CannedTemplate } from "@/lib/canned";

export type AccountPreferences = {
  soundEnabled: boolean;
  /** Older shape: bodies only, still written so an older reader keeps working. */
  cannedResponses?: string[];
  /** Current shape: body plus an optional title and `/` shortcut. */
  cannedResponseTemplates?: CannedTemplate[];
};

export function announcePreferences(preferences: AccountPreferences) {
  window.dispatchEvent(new CustomEvent("account-preferences", { detail: preferences }));
}
