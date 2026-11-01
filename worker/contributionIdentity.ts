/** Called only with an OAuth-verified identity and verified email, never a form handle. */
export async function linkContributionProfile(db: D1Database, id: number, login: string, verifiedEmails: string | string[] = []): Promise<void> {
  const now = new Date().toISOString();
  const emails = JSON.stringify((Array.isArray(verifiedEmails) ? verifiedEmails : [verifiedEmails]).map(email => email.trim().toLowerCase()).filter(Boolean));
  await db.batch([
    db.prepare(`INSERT INTO contribution_profiles (github_user_id, github_login, created_at)
      VALUES (?, ?, ?) ON CONFLICT(github_user_id) DO UPDATE SET github_login = excluded.github_login`).bind(id, login, now),
    db.prepare(`UPDATE contribution_profiles SET
      interests = (SELECT i.interests FROM registration_role_interests i JOIN registrations r ON r.id = i.registration_id
        WHERE r.email COLLATE NOCASE IN (SELECT value FROM json_each(?)) AND (i.claimed_by IS NULL OR i.claimed_by = ?) ORDER BY r.id DESC LIMIT 1),
      other_interest = (SELECT i.other_interest FROM registration_role_interests i JOIN registrations r ON r.id = i.registration_id
        WHERE r.email COLLATE NOCASE IN (SELECT value FROM json_each(?)) AND (i.claimed_by IS NULL OR i.claimed_by = ?) ORDER BY r.id DESC LIMIT 1),
      interests_updated_at = ?
      WHERE github_user_id = ? AND interests_updated_at IS NULL AND ? <> '[]'
      AND EXISTS (SELECT 1 FROM registration_role_interests i JOIN registrations r ON r.id = i.registration_id
      WHERE r.email COLLATE NOCASE IN (SELECT value FROM json_each(?)) AND (i.claimed_by IS NULL OR i.claimed_by = ?))`).bind(emails, id, emails, id, now, id, emails, emails, id),
    db.prepare(`UPDATE registration_role_interests SET claimed_by = ? WHERE claimed_by IS NULL
      AND registration_id = (SELECT r.id FROM registrations r JOIN registration_role_interests i ON i.registration_id = r.id
        WHERE r.email COLLATE NOCASE IN (SELECT value FROM json_each(?)) AND (i.claimed_by IS NULL OR i.claimed_by = ?) ORDER BY r.id DESC LIMIT 1)`).bind(id, emails, id),
  ]);
}
