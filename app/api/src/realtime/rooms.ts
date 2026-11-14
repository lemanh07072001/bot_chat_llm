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
