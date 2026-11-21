import type { APIRoute } from 'astro';
import { informationPages } from '../config/information';
import { categories, tools } from '../config/tools';

export const GET: APIRoute = ({ site }) => {
  const paths = [
    '/',
    ...informationPages.map(slug => `/${slug}/`),
    ...Object.keys(categories).map(slug => `/${slug}/`),
    ...tools.map(tool => tool.url),
  ].sort();
  const entries = paths.map(path => {
    const url = new URL(path, site).href.replaceAll('&', '&amp;');
    return `  <url><loc>${url}</loc></url>`;
  });
  return new Response([
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    '</urlset>',
    '',
  ].join('\n'), { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
