import { describe, expect, it } from 'vitest';
import { differingFields } from '../../../worker/shadowSync.js';

describe('shadow sync parity comparison', () => {
  it('returns only fields whose values differ', () => {
    expect(differingFields(
      { id: 42, state: 'open', counts: { accept: 2 }, optional: null },
      { id: 42, state: 'closed', counts: { accept: 3 } },
    )).toEqual(['counts', 'state']);
  });

  it('treats absent and null fields as equivalent canonical values', () => {
    expect(differingFields({ id: 42, upstream_url: null }, { id: 42 })).toEqual([]);
  });

  it('reports fields present on only one side when they contain a value', () => {
    expect(differingFields({ id: 42 }, { id: 42, detection_tool: 'Bandit' }))
      .toEqual(['detection_tool']);
  });
});
