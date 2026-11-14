export interface JwtPayload {
  sub: string;
  email: string;
  role: 'admin' | 'agent';
  ver: number;
  /** Absent on tokens issued before scopes existed; treated as 'agent'. */
  scope?: 'agent';
}

/**
 * Issued to anonymous website visitors by the widget session endpoint. It is
 * handed out to anyone holding a site public key, so it carries no user id and
 * is pinned to the single conversation it was minted for.
 */
export interface VisitorJwtPayload {
  scope: 'visitor';
  /** Visitor document id. */
  sub: string;
  siteId: string;
  conversationId: string;
}
