// Zeitleiste für die App: Abschaltungen aus der offiziellen Abschaltliste (ohne KI, fest gerechnet)
// und neue Modelle bzw. große Neuerungen aus dem optionalen Beitragsfeld „ereignis“.
//   node daten/zeitleiste.mjs --zaehlen [abschaltungen.md]   → Modelle mit festem Abschaltdatum, Ereignisse
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ABSCHALT_URL = 'https://platform.claude.com/docs/en/about-claude/model-deprecations';
export const EREIGNIS_ARTEN = ['neu'];
export const EREIGNIS_TITEL_MAX = 60;

const MONATE = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

// „November 30, 2026“ → „2026-11-30“; alles andere („Not sooner than …“, „To be announced“, „N/A“) → null.
export function festesDatum(text) {
  const m = /^\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s*$/.exec(text ?? '');
  if (!m) return null;
  const monat = MONATE.indexOf(m[1].toLowerCase());
  if (monat < 0) return null;
  const iso = `${m[3]}-${String(monat + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

const FAMILIEN = ['opus', 'sonnet', 'haiku', 'fable', 'mythos', 'instant'];
const gross = (w) => w.charAt(0).toUpperCase() + w.slice(1);

// API-Name → lesbarer Name: claude-sonnet-4-5-20250929 → „Sonnet 4.5“, claude-3-7-sonnet-… → „Sonnet 3.7“,
// claude-2.1 → „Claude 2.1“, claude-instant-1.0 → „Claude Instant 1.0“.
export function modellName(api) {
  const teile = api.replace(/`/g, '').trim().replace(/^claude-/, '').replace(/-\d{8}$/, '').split('-');
  const familie = teile.find((t) => FAMILIEN.includes(t));
  const zahlen = teile.filter((t) => /^\d+(\.\d+)?$/.test(t));
  const woerter = teile.filter((t) => t !== familie && !/^\d+(\.\d+)?$/.test(t)).map(gross);
  if (!familie || familie === 'instant') return ['Claude', ...(familie ? [gross(familie)] : []), zahlen.join('.'), ...woerter].filter(Boolean).join(' ');
  return [gross(familie), zahlen.join('.'), ...woerter].filter(Boolean).join(' ');
}

// Zeilen einer Markdown-Tabelle als Zellenlisten (Kopf- und Trennzeile weggelassen).
function tabellen(markdown) {
  const ergebnis = [];
  let aktuell = null;
  for (const zeile of markdown.split('\n')) {
    if (/^\s*\|/.test(zeile)) {
      const zellen = zeile.trim().replace(/^\||\|$/g, '').split('|').map((z) => z.trim());
      if (!aktuell) { aktuell = { kopf: zellen.map((z) => z.toLowerCase()), zeilen: [] }; ergebnis.push(aktuell); continue; }
      if (zellen.every((z) => /^:?-+:?$/.test(z))) continue;
      aktuell.zeilen.push(zellen);
    } else {
      aktuell = null;
    }
  }
  return ergebnis;
}

// Datumszellen ohne festes Datum, die bekannt sind. Alles andere ist „unklar“ und hält den Index an –
// lieber kein neuer Index als eine Abschaltung, die still verschwindet (Prüfrunde 1, S5).
const KEIN_DATUM = /^(not sooner than .+|to be announced|n\/a|tbd)$/i;
const API_NAME = /^claude-[a-z0-9.-]+$/;
// In „Model status“ sind nur diese Zustände eine angekündigte Abschaltung; Active/Legacy nicht (S4).
const ABGEKUENDIGT = ['deprecated', 'retired'];

// Je Modell mit festem Abschaltdatum ein Ereignis. Quellen: Tabelle „Model status“ (Spalten API model name,
// Current state, Tentative retirement date) und die Tabellen der „Deprecation history“ (Retirement date,
// Deprecated model). Widersprechen sie sich, gilt „Model status“ (steht zuerst).
export function abschaltEreignisse(markdown) {
  return liesAbschaltliste(markdown).ereignisse;
}

// Zeilen, deren Name oder Datum keine bekannte Form hat (leer = alles verstanden).
export function unklareAbschaltZeilen(markdown) {
  return liesAbschaltliste(markdown).unklar;
}

function liesAbschaltliste(markdown) {
  const daten = new Map(); // API-Name → Datum
  const unklar = [];
  for (const t of tabellen(markdown ?? '')) {
    const name = t.kopf.findIndex((k) => k === 'api model name' || k === 'deprecated model');
    const datum = t.kopf.findIndex((k) => k.includes('retirement date'));
    const zustand = t.kopf.findIndex((k) => k === 'current state');
    if (name < 0 || datum < 0) continue;
    for (const z of t.zeilen) {
      const api = (z[name] ?? '').replace(/`/g, '').trim();
      const zelle = (z[datum] ?? '').trim();
      if (zustand >= 0 && !ABGEKUENDIGT.includes((z[zustand] ?? '').trim().toLowerCase())) continue;
      if (KEIN_DATUM.test(zelle)) continue;
      const iso = festesDatum(zelle);
      if (!iso || !API_NAME.test(api)) { unklar.push(`${api || '(ohne Name)'}: ${zelle || '(ohne Datum)'}`); continue; }
      if (!daten.has(api)) daten.set(api, iso);
    }
  }
  // Zwei Fassungen eines Modells am selben Tag (Sonnet 3.5 von 06/2024 und 10/2024) sind ein Ereignis.
  const ereignisse = new Map();
  for (const [api, datum] of daten) {
    const titel = `Abschaltung von ${modellName(api)}`;
    const alt = ereignisse.get(datum + titel);
    if (alt) alt.modelle.push(api);
    else ereignisse.set(datum + titel, { datum, art: 'ende', titel, modelle: [api], url: ABSCHALT_URL });
  }
  return { ereignisse: [...ereignisse.values()], unklar };
}

// Ein Beitrags-Ereignis darf keine Abschaltung behaupten – die kommen nur fest aus der Abschaltliste (S3).
const ABSCHALT_WORT = /abschalt|abgeschalt|eingestellt|retire|deprecat|veraltet|abgek(ü|ue)ndigt|einstellung/i;

// Fehler im optionalen Feld „ereignis“ eines Beitrags (leer = in Ordnung).
export function pruefeEreignis(b) {
  if (!b || typeof b !== 'object' || !('ereignis' in b)) return [];
  const id = typeof b.id === 'string' ? b.id : '(ohne id)';
  const e = b.ereignis;
  if (!e || typeof e !== 'object' || Array.isArray(e)) return [`${id}: ereignis muss ein Objekt sein`];
  const fehler = [];
  if (!EREIGNIS_ARTEN.includes(e.art)) fehler.push(`${id}: ereignis.art muss ${EREIGNIS_ARTEN.map((a) => `„${a}“`).join(' oder ')} sein`);
  if (typeof e.titel !== 'string' || !e.titel.trim()) fehler.push(`${id}: ereignis.titel fehlt`);
  else if (e.titel.length > EREIGNIS_TITEL_MAX) fehler.push(`${id}: ereignis.titel länger als ${EREIGNIS_TITEL_MAX} Zeichen`);
  else if (ABSCHALT_WORT.test(e.titel)) fehler.push(`${id}: ereignis.titel nennt eine Abschaltung – Abschaltungen kommen nur aus der Abschaltliste, nicht als ereignis`);
  if ('datum' in e && !gueltig(e.datum)) fehler.push(`${id}: ereignis.datum kein gültiges Datum JJJJ-MM-TT`);
  return fehler;
}

function gueltig(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

// Dasselbe Ereignis aus zwei Beiträgen (Newsbeitrag und Release Notes) erscheint einmal (S2).
export function beitragsEreignisse(beitraege) {
  const gesehen = new Set();
  return beitraege.filter((b) => b?.ereignis && pruefeEreignis(b).length === 0)
    .map((b) => ({ datum: b.ereignis.datum ?? b.datum, art: b.ereignis.art, titel: b.ereignis.titel, beitrag: b.id, url: b.url }))
    .filter((e) => {
      const schluessel = `${e.datum}|${e.titel.trim().toLowerCase()}`;
      if (!gueltig(e.datum) || gesehen.has(schluessel)) return false;
      gesehen.add(schluessel);
      return true;
    });
}

// Alle Ereignisse nach Datum; bei gleichem Datum Neues vor Abschaltungen, dann nach Titel.
const RANG = { neu: 0, ende: 1 };
export function bauZeitleiste(beitraege, abschaltMarkdown = '') {
  return [...beitragsEreignisse(beitraege), ...abschaltEreignisse(abschaltMarkdown)]
    .sort((a, b) => a.datum.localeCompare(b.datum) || RANG[a.art] - RANG[b.art] || a.titel.localeCompare(b.titel));
}

const istHauptprogramm = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (istHauptprogramm && process.argv[2] === '--zaehlen') {
  const datei = resolve(process.argv[3] ?? join(dirname(fileURLToPath(import.meta.url)), 'quellen', 'abschaltungen.md'));
  const e = abschaltEreignisse(readFileSync(datei, 'utf8'));
  console.log(`${e.flatMap((x) => x.modelle).length} Modelle, ${e.length} Ereignisse`);
}
