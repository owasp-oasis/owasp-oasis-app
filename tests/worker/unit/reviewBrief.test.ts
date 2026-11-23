import { describe, expect, it } from 'vitest';
import { reviewBrief } from '../../../worker/reviewBrief';
describe('review brief extraction', () => {
  it('does not consume the next heading when TL;DR is empty', () => {
    const brief=reviewBrief('## TL;DR\n\n## What we found\n\n- **Finding:** CWE-200; Medium severity.\n- **Location:** `src/main/java/Example.java:84`.\n\n## Why this matters\nExcluded detail.');
    expect(brief.tldr_source).toBe('findings');
    expect(brief.tldr).toBe('- **Finding:** CWE-200; Medium severity.\n- **Location:** `src/main/java/Example.java:84`.');
  });
  it.each(['TL;DR','TL:DR','tl;dr'])('keeps valid %s content and Markdown', heading => {
    expect(reviewBrief(`## ${heading}\n\n- **Fix:** use \`safeCall()\`.\n\n## What we found\nOther section.`)).toEqual({tldr:'- **Fix:** use `safeCall()`.',tldr_source:'tldr'});
  });
  it('handles CRLF and stops at a horizontal divider',()=>expect(reviewBrief('## TL;DR\r\nA summary.\r\n---\r\nOther content.').tldr).toBe('A summary.'));
  it('does not treat headings inside code fences as section boundaries',()=>expect(reviewBrief('## TL;DR\n```text\n## example\n```\nSummary.\n## Next\nExcluded.').tldr).toBe('```text\n## example\n```\nSummary.'));
  it.each([null,'','## TL;DR\n\n## Unrelated\nOther content.'])('returns an explicit empty state when no brief exists',body=>expect(reviewBrief(body)).toEqual({tldr:null,tldr_source:null}));
});
