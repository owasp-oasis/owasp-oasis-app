/** Contribution interests are independent of application access roles. */
export const CONTRIBUTION_ROLES = [
  { id: 'validator', name: 'Validator', description: 'Review candidate security fixes.' },
  { id: 'steward', name: 'Repo steward', description: 'Coordinate OASIS work for a repository.' },
  { id: 'contact', name: 'Maintainer contact', description: 'Connect OASIS with upstream maintainers.' },
  { id: 'operator', name: 'Fix automation operator', description: 'Run tools and prepare candidate fixes.' },
  { id: 'advocate', name: 'Evangelist & advocate', description: 'Bring people into the OASIS community.' },
  { id: 'scout', name: 'Repo scout', description: 'Find repositories where OASIS can help.' },
  { id: 'mentor', name: 'Application security mentor', description: 'Help contributors build security skills.' },
  { id: 'tooling', name: 'Tooling & metrics', description: 'Improve OASIS tools and insights.' },
  { id: 'other', name: 'Other', description: 'Share another way you would like to contribute.' },
] as const;
export type ContributionRole = typeof CONTRIBUTION_ROLES[number]['id'];
export function validateRoleInterests(value: unknown): ContributionRole[] | null {
  if (!Array.isArray(value) || value.length > CONTRIBUTION_ROLES.length
    || value.some(role => typeof role !== 'string' || !CONTRIBUTION_ROLES.some(option => option.id === role))) return null;
  return CONTRIBUTION_ROLES.filter(role => value.includes(role.id)).map(role => role.id);
}

export function validateOtherInterest(value: unknown, selected: boolean): { ok: true; val: string } | { ok: false; error: string } {
  if (value !== undefined && typeof value !== 'string') return { ok: false, error: 'Other role details must be text.' };
  const text = typeof value === 'string' ? value.replace(/<[^>]*>/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim() : '';
  if (text.length > 240) return { ok: false, error: 'Other role details must be 240 characters or fewer.' };
  if (selected && !text) return { ok: false, error: 'Please describe your other role interest.' };
  if (!selected && text) return { ok: false, error: 'Select Other to save these role details.' };
  return { ok: true, val: text };
}
