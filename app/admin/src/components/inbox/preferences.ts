import type { CannedTemplate } from "@/lib/canned";
import type { NotifyScope } from "@/lib/notifications";

export type AccountPreferences = {
  soundEnabled: boolean;
  /** Which conversations may notify this account. Defaults to mine_unassigned. */
  notifyScope?: NotifyScope;
  /** Email when a visitor waits too long for an answer. Defaults to true. */
  emailMissed?: boolean;
  /** Older shape: bodies only, still written so an older reader keeps working. */
  cannedResponses?: string[];
  /** Current shape: body plus an optional title and `/` shortcut. */
  cannedResponseTemplates?: CannedTemplate[];
};

export function announcePreferences(preferences: AccountPreferences) {
  window.dispatchEvent(new CustomEvent("account-preferences", { detail: preferences }));
}
