/** Extract a bounded Markdown review brief without consuming the next section. */
function section(body: string, headingName: RegExp): string | null {
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  let depth = 0;
  let fence = '';
  const content: string[] = [];
  for (const line of lines) {
    const marker = line.trim().match(/^(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1][0];
      else if (marker[1][0] === fence) fence = '';
      if (depth) content.push(line);
      continue;
    }
    if (!fence) {
      const heading = line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (depth && (heading && heading[1].length <= depth || /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line))) break;
      if (!depth && heading && headingName.test(heading[2])) {
        depth = heading[1].length;
        continue;
      }
    }
    if (depth) content.push(line);
  }
  return content.join('\n').trim() || null;
}
export function reviewBrief(body?: string | null): { tldr: string | null; tldr_source: 'tldr' | 'findings' | null } {
  const tldr = section(body ?? '', /^TL[;:]DR$/i);
  if (tldr) return { tldr, tldr_source: 'tldr' };
  const findings = section(body ?? '', /^What we found$/i);
  return { tldr: findings, tldr_source: findings ? 'findings' : null };
}
