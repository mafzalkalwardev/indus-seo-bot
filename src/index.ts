import { createBotService, PRODUCT_SITES } from '@indus/bot-core';
import { run } from './logic';

createBotService({
  id: 'seo',
  name: 'SEO',
  description: 'Checks sitemaps and metadata, pings IndexNow when a sitemap changes, and drafts posts for approval.',
  accent: '#8fbf98',
  defaultPort: 41742,
  capabilities: ['seo', 'indexnow'],
  defaultSettings: { sites: [...PRODUCT_SITES] },
  fields: [{ key: 'sites', label: 'Sites, one per line, optional "| indexnow-key"', type: 'lines' }],
  desired: [{ key: 'check', task: 'check', cron: '20 */6 * * *', group: 'llm' }],
  autoTask: 'check',
  runTask: run,
}).start().catch((error) => { console.error(error); process.exit(1); });
