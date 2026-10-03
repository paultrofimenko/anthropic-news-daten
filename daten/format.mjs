// F-02 Datenformat: wie ein zusammengefasster Beitrag aussieht, und Prüfregeln dafür.
// Die Beiträge liegen später im öffentlichen Daten-Repo – darum: nur erlaubte Quellen,
// nichts Persönliches. Diese Datei selbst kann mit ins Daten-Repo; sie enthält darum
// keine Namen. Persönliche Wörter kommen nur lokal dazu (persoenlicheWoerter).
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir, userInfo } from 'node:os';
import { fileURLToPath } from 'node:url';
import { QUELLEN } from '../vorpruefung/quellen.mjs';
import { pruefeEreignis } from './zeitleiste.mjs';

export const PFLICHTFELDER = ['id', 'quelle', 'url', 'titel_original', 'titel_de', 'kurz_de', 'briefing_de', 'bereich', 'datum', 'wichtig'];
const TEXTFELDER = ['id', 'quelle', 'url', 'titel_original', 'titel_de', 'kurz_de', 'briefing_de', 'bereich', 'datum'];

// Vom Chat festgelegt (02.10.2026), billig zu ändern.
export const BEREICHE = ['news', 'forschung', 'engineering', 'modelle', 'produkte', 'claude-code', 'api', 'entwickler', 'unternehmen', 'richtlinien'];

// Kurztext geht in die Push-Meldung.
export const KURZ_MAX = 280;

// claude.ai und claude.com sind Anthropics eigene Produktseiten – Briefings nennen sie oft.
const ERLAUBTE_HOSTS = ['anthropic.com', 'www.anthropic.com', 'claude.dev', 'platform.claude.com', 'code.claude.com', 'docs.claude.com', 'support.claude.com', 'claude.ai', 'claude.com', 'www.claude.com'];

export function erlaubteUrl(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  if (ERLAUBTE_HOSTS.includes(u.hostname)) return true;
  // Anthropics eigene Unterseiten: console., status., docs., support., trust.anthropic.com (S10)
  if (u.hostname.endsWith('.anthropic.com')) return true;
  return u.hostname === 'github.com' && u.pathname.toLowerCase().startsWith('/anthropics/');
}

// Ordnernamen aus ~/Projekte, nur lokal. Kurze oder allgemeine Namen („3D“, „Test“)
// würden normale Wörter treffen.
// Hinnehmbar: Manche Ordnernamen sind auch normale deutsche Wörter – ein Treffer weist den
// Beitrag nur ab, er wird umformuliert. In der Cloud fehlt der Ordner, die Liste ist dort
// leer; Persönliches kann aber nur über den lokalen „Betrifft dich“-Teil hineinkommen.
export function lokaleProjektnamen(ordner = join(homedir(), 'Projekte')) {
  if (!existsSync(ordner)) return [];
  return readdirSync(ordner, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.length >= 5 && e.name !== 'anthropic-news')
    .map((e) => e.name.toLowerCase());
}

// Alles Persönliche, das lokal bekannt ist: Projektnamen, Benutzername, und die Wörter aus
// lokal/persoenlich.txt (eine Zeile je Wort; der Ordner lokal/ geht nie ins Daten-Repo).
export function persoenlicheWoerter() {
  const datei = join(dirname(fileURLToPath(import.meta.url)), '..', 'lokal', 'persoenlich.txt');
  const ausDatei = existsSync(datei)
    ? readFileSync(datei, 'utf8').split(/\r?\n/).map((z) => z.trim().toLowerCase()).filter((z) => z && !z.startsWith('#'))
    : [];
  const benutzer = benutzerWort(BENUTZER, existsSync(LOKAL));
  return [...new Set([...lokaleProjektnamen(), ...benutzer, ...ausDatei])];
}

// Geprüft wird der Text der Felder, nicht das JSON – dort würde „\n“ wie ein Pfad aussehen.
// Platzhalter, die in Anleitungen stehen („/home/user/project“, „GET /users/me“).
const PLATZHALTER = '(?:user|users|me|runner|ubuntu|you|your-name|yourname|username|name|example)';
const PERSOENLICH = [
  /(^|[^a-z0-9])[a-z]:\\[^\s]/i,                                                   // C:\…
  /(^|[^a-z0-9])[a-z]:\/[^\s/]+\//i,                                               // C:/Users/… (nicht „Plan B:/Ziel“)
  new RegExp(`(^|[^a-z0-9.])\\/(users|home)\\/(?!${PLATZHALTER}([^a-z0-9._-]|$))[a-z0-9._-]+`, 'i'), // /Users/name, /home/name
  /\\users\\[a-z0-9._-]+/i,                                                        // …\Users\name
];

const BENUTZER = (() => { try { return userInfo().username.toLowerCase(); } catch { return ''; } })();
const LOKAL = join(dirname(fileURLToPath(import.meta.url)), '..', 'lokal');

// Allgemeine Benutzernamen von Servern und Cloud-Läufen – nie als persönliches Wort werten (S9).
const ALLGEMEINE_BENUTZER = ['runner', 'root', 'claude', 'user', 'node', 'ubuntu', 'admin', 'vscode', 'codespace'];

// Der Benutzername ist nur auf dem eigenen PC persönlich (dort gibt es den Ordner lokal/), nie in der Cloud.
export function benutzerWort(name, lokalVorhanden) {
  const n = String(name || '').toLowerCase();
  if (!lokalVorhanden || n.length < 4 || ALLGEMEINE_BENUTZER.includes(n)) return [];
  return [n];
}

// E-Mail-Adressen außer denen von Anthropic und Claude (security@anthropic.com, support@claude.com).
function fremdeMails(text) {
  return (text.match(/[a-z0-9._%+-]+@(?:[a-z0-9-]+\.)+[a-z]{2,}/gi) ?? [])
    .filter((m) => !/@(?:[a-z0-9-]+\.)*(?:anthropic\.com|claude\.com|claude\.ai)$/i.test(m));
}

export function persoenlicheStellen(text, woerter = []) {
  const treffer = PERSOENLICH.filter((m) => m.test(text)).map((m) => m.source);
  if (fremdeMails(text).length) treffer.push('E-Mail-Adresse');
  const klein = text.toLowerCase();
  const alle = [...woerter, ...benutzerWort(BENUTZER, existsSync(LOKAL))];
  for (const wort of new Set(alle)) {
    // Wortgrenze: „Name-Projekt“ trifft, „Namenszug“ nicht.
    const muster = new RegExp(`(^|[^a-z0-9äöüß])${wort.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9äöüß])`);
    if (muster.test(klein)) treffer.push(wort);
  }
  return treffer;
}

// Alle Texte im Beitrag, auch in verschachtelten Zusatzfeldern.
export function alleTexte(wert) {
  if (typeof wert === 'string') return [wert];
  if (Array.isArray(wert)) return wert.flatMap(alleTexte);
  if (wert && typeof wert === 'object') return Object.values(wert).flatMap(alleTexte);
  return [];
}

// Links mit Schema und nackte Adressen („x.com/ClaudeDevs“); E-Mail-Adressen zählen nicht.
const TLD = '(?:com|dev|ai|io|org|net|de|co|app|me|tv|gg)';
export function links(text) {
  const mitSchema = text.match(/https?:\/\/[^\s"'<>)\]`]+/gi) ?? [];
  const rest = text.replace(/https?:\/\/[^\s"'<>)\]`]+/gi, ' ');
  const nackt = [...rest.matchAll(new RegExp(`(?<![@\\w.-])((?:[a-z0-9-]+\\.)+${TLD})(?![\\w-])(\\/[^\\s"'<>)\\]\`]*)?`, 'gi'))]
    .map((m) => `https://${m[0]}`);
  return [...mitSchema, ...nackt].map((l) => l.replace(/[.,;:!?]+$/, ''));
}

function gueltigesDatum(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const d = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text;
}

// Liefert eine Liste von Fehlern (leer = in Ordnung).
// projektnamen: persönliche Wörter (lokal meist persoenlicheWoerter()).
export function pruefeBeitrag(b, { projektnamen = [] } = {}) {
  const fehler = [];
  if (!b || typeof b !== 'object' || Array.isArray(b)) return ['kein Objekt'];
  const id = typeof b.id === 'string' ? b.id : '(ohne id)';

  for (const feld of PFLICHTFELDER) {
    const wert = b[feld];
    if (!(feld in b) || wert === null || (typeof wert === 'string' && !wert.trim())) {
      fehler.push(`${id}: Feld „${feld}“ fehlt`);
    } else if (TEXTFELDER.includes(feld) && typeof wert !== 'string') {
      fehler.push(`${id}: Feld „${feld}“ muss Text sein`);
    }
  }
  if (typeof b.id === 'string' && !/^[a-z0-9][a-z0-9-]*$/.test(b.id)) fehler.push(`${id}: id nur aus a–z, 0–9 und Bindestrich`);
  if ('quelle' in b && !QUELLEN.some((q) => q.id === b.quelle)) fehler.push(`${id}: unbekannte Quelle „${b.quelle}“`);
  if (typeof b.url === 'string' && b.url && !erlaubteUrl(b.url)) fehler.push(`${id}: url nicht auf erlaubter Domain: ${b.url}`);
  if (b.bereich && !BEREICHE.includes(b.bereich)) fehler.push(`${id}: unbekannter Bereich „${b.bereich}“`);
  if (typeof b.datum === 'string' && b.datum && !gueltigesDatum(b.datum)) fehler.push(`${id}: datum kein gültiges Datum JJJJ-MM-TT`);
  if ('wichtig' in b && typeof b.wichtig !== 'boolean') fehler.push(`${id}: wichtig muss true oder false sein`);
  if (typeof b.kurz_de === 'string' && b.kurz_de.length > KURZ_MAX) fehler.push(`${id}: kurz_de länger als ${KURZ_MAX} Zeichen`);
  fehler.push(...pruefeEreignis(b)); // optionales Feld für die Zeitleiste (F-09)

  const texte = alleTexte(b);
  for (const text of texte) {
    for (const link of links(text)) {
      if (!erlaubteUrl(link)) fehler.push(`${id}: Link nicht auf erlaubter Domain: ${link}`);
    }
  }
  const stellen = persoenlicheStellen(texte.join('\n'), projektnamen);
  if (stellen.length) fehler.push(`${id}: Persönliches gefunden (${stellen.join(', ')})`);
  return [...new Set(fehler)];
}

export function pruefeAlle(beitraege, optionen) {
  const fehler = beitraege.flatMap((b) => pruefeBeitrag(b, optionen));
  const gesehen = new Set();
  for (const b of beitraege) {
    if (!b?.id) continue;
    if (gesehen.has(b.id)) fehler.push(`${b.id}: id doppelt`);
    gesehen.add(b.id);
  }
  return fehler;
}

// Jede Datei im Ordner ist ein Beitrag (<id>.json).
export function leseOrdner(ordner) {
  if (!existsSync(ordner)) return [];
  return readdirSync(ordner).filter((n) => n.endsWith('.json')).sort().map((n) => ({
    datei: n,
    beitrag: JSON.parse(readFileSync(join(ordner, n), 'utf8')),
  }));
}
