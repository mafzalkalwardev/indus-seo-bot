import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { extractJson, fetchText, type TaskContext, type TaskResult } from '@indus/bot-core';
import { prose } from './prose';

export function sitesOf(value: unknown): { url: string; indexNowKey: string }[] {
  const rows = Array.isArray(value) ? value : [];
  return rows.map((row) => {
    if (typeof row === 'string') {
      const [url, indexNowKey] = row.split('|').map((part) => part.trim());
      return { url, indexNowKey: indexNowKey || '' };
    }
    const item = row as { url?: string; indexNowKey?: string };
    return { url: String(item.url || ''), indexNowKey: String(item.indexNowKey || '') };
  }).filter((site) => site.url);
}

export function auditHtml(html: string): string[] {
  const $ = load(html);
  const issues: string[] = [];
  if (!$('title').text().trim()) issues.push('Missing title');
  if (!$('meta[name="description"]').attr('content')) issues.push('Missing meta description');
  if (!$('link[rel="canonical"]').attr('href')) issues.push('Missing canonical');
  if (!$('meta[property="og:title"]').attr('content') || !$('meta[property="og:image"]').attr('content')) issues.push('Open Graph is incomplete');
  if (!$('script[type="application/ld+json"]').length) issues.push('No JSON-LD');
  return issues;
}

export function parseSitemap(xml: string): { loc: string; lastmod?: string }[] {
  const entries = [];
  for (const chunk of xml.match(/<url>[\s\S]*?<\/url>/gi) || []) {
    const loc = /<loc>\s*([^<]+)\s*<\/loc>/i.exec(chunk)?.[1]?.trim();
    const lastmod = /<lastmod>\s*([^<]+)\s*<\/lastmod>/i.exec(chunk)?.[1]?.trim();
    if (loc) entries.push({ loc, lastmod });
  }
  return entries;
}

export function indexNowBody(pageUrl: string, key: string, urls: string[]) {
  const host = new URL(pageUrl).host;
  return { host, key, keyLocation: `https://${host}/${key}.txt`, urlList: urls.slice(0, 100) };
}

export async function run(ctx: TaskContext): Promise<TaskResult> {
  if (ctx.task === 'instruct') return { summary: prose((await ctx.llm('You are the INDUS SEO bot. Do not claim you pinged or published.', String(ctx.payload.message || ''))).text) };
  const sites = sitesOf(ctx.settings.sites);
  const lines: string[] = [];
  for (const site of sites) {
    if (!site.url) continue;
    const home = await fetchText(site.url, ctx.fetch, 8000);
    const issues = home.ok ? auditHtml(home.text) : [`Homepage failed (${home.error || home.status})`];
    const sitemap = await fetchText(new URL('/sitemap.xml', site.url).toString(), ctx.fetch, 8000);
    const entries = parseSitemap(sitemap.text);
    const hash = createHash('sha256').update(entries.map((entry) => `${entry.loc} ${entry.lastmod || ''}`).sort().join('\n')).digest('hex');
    ctx.db.exec(`CREATE TABLE IF NOT EXISTS seo_state (site TEXT PRIMARY KEY, hash TEXT, checked_at TEXT)`);
    const prev = ctx.db.prepare(`SELECT hash FROM seo_state WHERE site = ?`).get(site.url) as { hash: string } | undefined;
    ctx.db.prepare(`INSERT INTO seo_state (site, hash, checked_at) VALUES (?, ?, ?) ON CONFLICT(site) DO UPDATE SET hash = excluded.hash, checked_at = excluded.checked_at`).run(site.url, hash, ctx.now.toISOString());
    if (prev && prev.hash !== hash && site.indexNowKey && !ctx.dryRun) {
      await fetchText('https://api.indexnow.org/indexnow', ctx.fetch, 8000, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(indexNowBody(site.url, site.indexNowKey, [site.url])) });
      lines.push(`Pinged IndexNow for ${site.url}`);
    }
    lines.push(`${site.url}: ${issues.length ? issues.join(', ') : 'homepage looks complete'}`);
  }
  const focus = sites[0]?.url || 'https://mailforge.induswebagency.com';
  const draft = await ctx.llm('Write an SEO blog JSON with title, slug, description, and body. Label this an SEO blog.', `Draft one short post for ${focus}.`);
  let article = { title: 'Draft', slug: 'draft', description: '', body: prose(draft.text) };
  try { article = { ...article, ...(extractJson(draft.text) as typeof article) }; } catch { /* keep prose */ }
  ctx.propose({ type: 'blog_post', title: article.title, summary: article.description, body: article.body, payload: { site: focus, slug: article.slug, source: 'seo' } });
  return { summary: lines.join(' · ') || 'No sites configured.', details: { lines } };
}
