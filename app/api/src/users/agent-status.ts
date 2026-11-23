/**
 * What an agent tells visitors about their availability. Shared verbatim by the
 * api, the realtime gateway (copied by prepare.mjs) and mirrored in the widget.
 */
export const AGENT_STATUSES = ['online', 'busy', 'away'] as const;

export type AgentStatus = (typeof AGENT_STATUSES)[number];

/** A site's status as a visitor sees it: `offline` when no agent is connected. */
export type TeamStatus = AgentStatus | 'offline';

export const DEFAULT_AGENT_STATUS: AgentStatus = 'online';

export const DEFAULT_BUSY_MESSAGE =
  'Các nhân viên hiện đang bận. Bạn cứ để lại tin nhắn, chúng tôi sẽ phản hồi sớm.';

export const DEFAULT_AWAY_MESSAGE =
  'Hiện chúng tôi đang tạm vắng. Bạn vui lòng để lại tin nhắn và email để được hỗ trợ khi quay lại.';

export function isAgentStatus(value: unknown): value is AgentStatus {
  return typeof value === 'string' && (AGENT_STATUSES as readonly string[]).includes(value);
}

/** Missing or unknown values (documents written before the field existed) read as online. */
export function normalizeAgentStatus(value: unknown): AgentStatus {
  return isAgentStatus(value) ? value : DEFAULT_AGENT_STATUS;
}

const RANK: Record<TeamStatus, number> = { online: 3, busy: 2, away: 1, offline: 0 };

/** The best status among connected agents: online > busy > away > offline. */
export function bestTeamStatus(statuses: Iterable<TeamStatus>): TeamStatus {
  let best: TeamStatus = 'offline';

  for (const status of statuses) {
    if (RANK[status] > RANK[best]) {
      best = status;
    }
  }

  return best;
}
