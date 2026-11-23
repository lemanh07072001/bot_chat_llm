/**
 * Room names, shared by the gateway and by the HTTP routes that broadcast
 * through RealtimeBusService.
 */

/** Every staff socket joins one of these per project it may read. */
export const siteRoom = (siteId: string) => `site:${siteId}`;

/** The visitor plus whichever agents currently have the thread open. */
export const conversationRoom = (conversationId: string) => `conv:${conversationId}`;

/**
 * Every visitor of one project. Used to push presence ("có người trực") to all
 * open widgets of a project with a single emit.
 */
export const siteVisitorsRoom = (siteId: string) => `site-visitors:${siteId}`;

/**
 * One person's own sockets, across every project and tab. The bell and the
 * "assigned to you" event are addressed to a person, not to a project, so they
 * need a room that exists regardless of which inbox is open.
 */
export const userRoom = (userId: string) => `user:${userId}`;

/**
 * Every live socket of one conversation's visitor. Narrower than the
 * conversation room, which also holds agents: presence and "the visitor has
 * read this" must not be inferred from an agent watching the thread.
 */
export const visitorRoom = (conversationId: string) => `visitor:${conversationId}`;
