import { describe, expect, it } from 'vitest';
import { SIGNUP_ROLE_CHOICES } from '../../../src/components/ContributionRoles/roles';

describe('contribution role choices', () => {
  it('presents the repo security steward/owner interest without changing its stored id', () => {
    const steward = SIGNUP_ROLE_CHOICES.find(role => role.id === 'steward');
    expect(steward).toEqual({
      id: 'steward',
      name: 'Repo Security Steward/Owner',
      description: 'Lead OASIS security work for a repository.',
    });
    expect(SIGNUP_ROLE_CHOICES.slice(0, 3)).toContain(steward);
  });
});
