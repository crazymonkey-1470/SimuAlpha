// Feed parsing: RSS 2.0, RSS 1.0 (RDF), Atom, YouTube channel feeds and podcast feeds.
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  textNodeName: '#text',
  trimValues: true,
  processEntities: true,
  htmlEntities: true,
  parseTagValue: false,
  parseAttributeValue: false,
  isArray: (name) => ['item', 'entry', 'link', 'thumbnail', 'transcript', 'enclosure'].includes(name),
});

const NAMED = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…', mdash: '—', ndash: '–' };

/** Plain text from a possibly-HTML string. */
export function htmlToText(s) {
  if (s == null) return null;
  let t = String(s)
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => NAMED[n.toLowerCase()] ?? m)
    .replace(/[ ​﻿]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t || null;
}

/** "00:51:51" | "51:51" | "3111" → seconds */
export function parseDuration(v) {
  const s = text(v)?.trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s));
  if (/^\d+(:\d{1,2}){1,2}$/.test(s)) return s.split(':').map(Number).reduce((acc, n) => acc * 60 + n, 0);
  return null;
}

function text(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === 'object') return v['#text'] != null ? String(v['#text']) : null;
  return String(v);
}

function isoDate(v) {
  const s = text(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function pickLink(item) {
  const links = item.link ?? [];
  for (const l of links) {
    if (typeof l === 'object' && l['@_href'] && (!l['@_rel'] || l['@_rel'] === 'alternate')) return l['@_href'];
  }
  for (const l of links) {
    const t = text(l);
    if (t && /^https?:\/\//i.test(t.trim())) return t.trim();
  }
  const guid = text(item.guid ?? item.id);
  return guid && /^https?:\/\//i.test(guid) ? guid : null;
}

/**
 * @param {string} xml
 * @param {'rss'|'youtube'|'podcast'} kind
 * @returns {{ title: string|null, entries: object[] }}
 */
export function parseFeed(xml, kind = 'rss') {
  const doc = parser.parse(xml);
  const channel = doc.rss?.channel ?? doc.feed ?? doc.RDF?.channel ?? null;
  const items = doc.rss?.channel?.item ?? doc.feed?.entry ?? doc.RDF?.item ?? [];
  if (!channel && !items.length) throw new Error('Not an RSS/Atom feed');
  const showImage = channel?.image?.['@_href'] ?? text(channel?.image?.url) ?? null;

  const entries = [];
  for (const item of items) {
    // Many podcast feeds have no <link>; the audio file is then the episode's address.
    const url = (pickLink(item) ?? (item.enclosure ?? []).find((e) => e?.['@_url'])?.['@_url'])?.trim();
    const title = htmlToText(text(item.title));
    if (!url || !title || !/^https?:\/\/\S+$/i.test(url)) continue;
    if (/youtube\.com\/shorts\//i.test(url)) continue; // Shorts are noise for show prep

    const group = item.group ?? {};
    const enclosure = (item.enclosure ?? []).find((e) => e?.['@_url']);
    const isVideo = kind === 'youtube' || /youtube\.com\/watch/i.test(url);
    const isPodcast = !isVideo && (kind === 'podcast' || /^audio\//i.test(enclosure?.['@_type'] ?? ''));
    const views = Number(group.community?.statistics?.['@_views']);

    entries.push({
      title: title.slice(0, 300),
      url,
      guid: text(item.guid ?? item.id)?.slice(0, 500) ?? null,
      published_at: isoDate(item.pubDate ?? item.published ?? item.date ?? item.issued ?? item.updated),
      preview: htmlToText(text(item.description ?? item.summary ?? group.description ?? item.encoded ?? item.content))?.slice(0, 400) ?? null,
      media_type: isVideo ? 'video' : isPodcast ? 'podcast' : 'article',
      media_url: isVideo ? url : isPodcast ? enclosure?.['@_url'] ?? null : null,
      thumbnail_url: group.thumbnail?.[0]?.['@_url'] ?? item.image?.['@_href'] ?? (isPodcast ? showImage : null),
      duration_seconds: parseDuration(item.duration),
      views: Number.isFinite(views) ? views : null,
      transcript_url: (item.transcript ?? []).find((t) => t?.['@_url'])?.['@_url'] ?? null,
    });
  }
  return { title: htmlToText(text(channel?.title)), entries };
}
