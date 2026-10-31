import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../../src/components/PRPanel/renderMarkdown';

describe('PR panel Markdown table rendering', () => {
  it('keeps an escaped pipe inside its table cell', () => {
    const html = renderToStaticMarkup(createElement(Fragment, null, ...renderMarkdown([
      '| Field | Value |',
      '| :-- | :-- |',
      '| Summary | first \\| second |',
    ].join('\n'))));

    expect(html).toContain('<td class="prp-md-td"><span>first | second</span></td>');
    expect(html.match(/<td\b/g)).toHaveLength(2);
  });
});
