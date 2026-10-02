// Die Quellen der Vorprüfung und wie man sie liest. Reine Funktionen, kein Netz.
// Gemessen am 02.10.2026 – siehe AUFTRAG.md „Nachgemessen“.
import { createHash } from 'node:crypto';

export const QUELLEN = [
  { id: 'anthropic', art: 'sitemap', url: 'https://www.anthropic.com/sitemap.xml', name: 'anthropic.com' },
  // Gleiche gruppe = gleiche Beiträge auf zwei Wegen; bekannt ist, was einer von beiden kennt.
  { id: 'claude-dev-rss', art: 'rss', url: 'https://claude.dev/rss.xml', name: 'claude.dev', gruppe: 'claude-dev' },
  { id: 'claude-dev', art: 'sitemap', url: 'https://claude.dev/sitemap.xml', name: 'claude.dev', gruppe: 'claude-dev' },
  { id: 'code-changelog', art: 'changelog', url: 'https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md', name: 'Claude Code Changelog', seite: 'https://code.claude.com/docs/en/changelog' },
  { id: 'platform-release-notes', art: 'tage', url: 'https://platform.claude.com/docs/en/release-notes/overview.md', name: 'Claude Platform Release Notes', seite: 'https://platform.claude.com/docs/en/release-notes/overview' },
  // muss: Text, der in der echten Seite steht – sonst ist es eine Wartungs- oder Fehlerseite.
  { id: 'modelle', art: 'inhalt', url: 'https://platform.claude.com/docs/en/about-claude/models/overview.md', name: 'Modellübersicht', seite: 'https://platform.claude.com/docs/en/models/overview', wichtig: true, muss: 'Models overview' },
  { id: 'abschaltungen', art: 'inhalt', url: 'https://platform.claude.com/docs/en/about-claude/model-deprecations.md', name: 'Modell-Abschaltungen', seite: 'https://platform.claude.com/docs/en/about-claude/model-deprecations', wichtig: true, muss: 'Model deprecations' },
  { id: 'code-doku', art: 'sitemap', url: 'https://code.claude.com/docs/sitemap.xml', name: 'Claude-Code-Doku', filter: '/docs/en/' },
  { id: 'platform-doku', art: 'sitemap', url: 'https://platform.claude.com/sitemap.xml', name: 'Claude-Platform-Doku', filter: '/docs/en/' },
];

// Gleiche Seite, verschiedene Schreibweisen: http/https, mit/ohne www, Schrägstrich am Ende,
// Großbuchstaben. Ergebnis ist ein Vergleichsschlüssel, keine aufrufbare Adresse.
export function normalisiere(url) {
  try {
    const u = new URL(url.trim());
    return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch {
    return url.trim().replace(/\/+$/, '').toLowerCase();
  }
}

function entities(text) {
  return text
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&')
    .trim();
}

function feld(block, name) {
  const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? entities(m[1]) : null;
}

export function leseSitemap(xml, filter) {
  const eintraege = [];
  for (const block of xml.match(/<url>[\s\S]*?<\/url>/g) ?? []) {
    const url = feld(block, 'loc');
    if (!url || (filter && !url.includes(filter))) continue;
    eintraege.push({ url, lastmod: feld(block, 'lastmod') });
  }
  return eintraege;
}

export function leseRss(xml) {
  return (xml.match(/<item>[\s\S]*?<\/item>/g) ?? []).map((block) => ({
    url: feld(block, 'link'),
    titel: feld(block, 'title'),
    datum: feld(block, 'pubDate'),
  })).filter((e) => e.url);
}

// „## 2.1.287“, „## [2.1.287]“, „## 2.1.287 (2026-10-01)“ → { version: '2.1.287', zeilen }
export function leseChangelog(md) {
  return abschnitte(md, /^##\s+\[?(\d+\.\d+\.\d+[^\s\]]*)\]?(?:\s+\(.*\))?\s*$/, /^##\s/, (m) => m[1])
    .map(([version, zeilen]) => ({ version, zeilen }));
}

// „### September 30, 2026“, „## October 2nd, 2026“ → { tag: 'October 2, 2026', zeilen }
// Ordinalformen standen am 02.10.2026 33-mal in den älteren Release Notes.
export function leseTage(md) {
  return abschnitte(md, /^#{2,3}\s+([A-Z][a-z]+) (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})\s*$/, /^#{1,3}\s/, (m) => `${m[1]} ${m[2]}, ${m[3]}`)
    .map(([tag, zeilen]) => ({ tag, zeilen }));
}

function abschnitte(md, kopf, ende, schluessel) {
  const ergebnis = [];
  let aktuell = null;
  for (const zeile of md.split(/\r?\n/)) {
    const m = zeile.match(kopf);
    if (m) { aktuell = [schluessel(m), []]; ergebnis.push(aktuell); continue; }
    if (aktuell && ende.test(zeile)) { aktuell = null; continue; }
    if (aktuell && zeile.trim()) aktuell[1].push(zeile.trim());
  }
  return ergebnis;
}

// Leerraum zählt nicht als Änderung.
export function fingerabdruck(text) {
  return createHash('sha256').update(text.replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 16);
}
