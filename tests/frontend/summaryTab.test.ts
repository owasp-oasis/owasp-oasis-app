import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import SummaryTab from '../../src/components/PRPanel/SummaryTab';
it('renders summary Markdown as structured content and labels the findings fallback',()=>{
  const html=renderToStaticMarkup(createElement(SummaryTab,{details:{tldr:'- **Finding:** Medium severity.\n- **Location:** `Example.java`',tldr_source:'findings',consensus_accept:0,consensus_modify:0,consensus_reject:0,consensus_duplicate:0,participants:0},loading:false,error:null}));
  expect(html).toContain('What we found'); expect(html).toContain('<ul'); expect(html).toContain('<strong'); expect(html).toContain('<code'); expect(html).not.toContain('**Finding:**');
});
