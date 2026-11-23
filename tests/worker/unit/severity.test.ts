import { fixtures } from '../../../scripts/severity-fixtures.mjs';
import { describe, it, expect } from 'vitest';
import { parseSeverity } from '../../../worker/severity';
describe('finding severity', () => {
  it.each(['Critical', 'High', 'Medium', 'Low'])('preserves legacy %s severity titles', value => {
    expect(parseSeverity(`CWE-89 ${value} Severity in foo.py`, '## What we found\n- **Severity:** Low')).toBe(value.toLowerCase());
  });
  it.each([
    ['## What we found\n- **Severity:** Medium', 'medium'],
    ['## What we found\n- **Finding:** Information Disclosure, CWE-200; Medium severity.', 'medium'],
    ['## Vulnerabilities Addressed\n| Finding | Severity |\n| --- | --- |\n| Cookie | Medium |\n| XSS | High |', 'high'],
    ['## Why this matters\nThis may cause high severity impact.', null],
    ['## What we found\n- Confidence: High\n- **Severity:** Unknown', null],
    ['## What we found\n```java\nSeverity: Critical\n```', null],
    ['', null],
  ])('parses explicit finding fields: %s', (body, expected) => expect(parseSeverity('Fix security issue', body)).toBe(expected));
});

describe('production-shaped synthetic reports', () => {
  it.each(fixtures)('$repoName #$number: $expected', fixture => {
    expect(parseSeverity(fixture.title, fixture.body)).toBe(fixture.expected);
  });
});
