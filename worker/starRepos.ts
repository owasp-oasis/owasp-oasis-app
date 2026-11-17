/**
 * Repositories the in-app star prompt asks people to star. Shared by the
 * Worker (the only list POST /api/github/stars will star) and the client
 * (labels shown before the status has loaded). Keep this module dependency-free
 * so the frontend can import it.
 */
export const STAR_REPOS = ['OWASP/oasis', 'owasp-oasis/project-overview'] as const;
