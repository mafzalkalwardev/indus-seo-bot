import { expect, it } from 'vitest';
import { auditHtml, indexNowBody, parseSitemap } from '../src/logic';

it('flags a bare homepage and builds an IndexNow body', () => {
  expect(auditHtml('<html><head></head><body></body></html>')).toContain('Missing title');
  const entries = parseSitemap('<urlset><url><loc>https://example.com/a</loc><lastmod>2026-01-01</lastmod></url></urlset>');
  expect(entries).toEqual([{ loc: 'https://example.com/a', lastmod: '2026-01-01' }]);
  expect(indexNowBody('https://mailforge.induswebagency.com/', 'abc', ['https://mailforge.induswebagency.com/']).keyLocation).toBe('https://mailforge.induswebagency.com/abc.txt');
});
