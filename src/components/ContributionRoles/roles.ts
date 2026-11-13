export const SIGNUP_ROLE_CHOICES = [
  { id: 'validator', name: 'Validator', description: 'Review candidate security fixes.' },
  { id: 'steward', name: 'Repo Security Steward/Owner', description: 'Lead OASIS security work for a repository.' },
  { id: 'contact', name: 'Maintainer contact', description: 'Connect OASIS with upstream maintainers.' },
  { id: 'operator', name: 'Fix automation operator', description: 'Run tools and prepare candidate fixes.' },
  { id: 'advocate', name: 'Evangelist & advocate', description: 'Bring people into the OASIS community.' },
  { id: 'scout', name: 'Repo scout', description: 'Find repositories where OASIS can help.' },
  { id: 'mentor', name: 'Application security mentor', description: 'Help contributors build security skills.' },
  { id: 'tooling', name: 'Tooling and Metrics Scout', description: 'Improve OASIS tools and insights.' },
  { id: 'other', name: 'Other', description: 'Share another way you would like to contribute.' },
] as const;

export type SignupRoleChoice = typeof SIGNUP_ROLE_CHOICES[number]['id'];
