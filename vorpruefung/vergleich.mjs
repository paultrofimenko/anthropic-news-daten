// Vergleicht frisch gelesene Quellen mit dem gespeicherten Stand.
// Grundregel: Nur echt Neues zählt. Ein geändertes lastmod allein ist keine Meldung,
// weil die Doku-Seiten ihr Datum fast täglich ändern (02.10.2026: 61 Seiten an einem Tag).
import { leseSitemap, leseRss, leseChangelog, leseTage, fingerabdruck, normalisiere } from './quellen.mjs';

// Mehr neue Adressen auf einmal deuten auf einen Umzug oder ein neues Format, nicht auf
// Neuigkeiten – lieber als Fehler melden, als 200 Push-Meldungen und Claude-Läufe auszulösen.
export const HOECHSTENS_NEU_JE_QUELLE = 25;

// Nur die jüngsten Abschnitte (oben in der Datei) werden auf Nachträge geprüft.
export const NACHTRAEGE_IN_DEN_LETZTEN = 10;

// Version der Rechenweise von zeilenHash. Ändert sie sich, werden gespeicherte Fingerabdrücke
// neu eingelesen statt verglichen – sonst meldet der erste Lauf alles als „ergänzt“.
export const ZEILEN_VERSION = 2;

// Liest den Rohtext einer Quelle in eine vergleichbare Form. Wirft bei unplausiblem Inhalt.
export function lese(quelle, text) {
  switch (quelle.art) {
    case 'sitemap': return { eintraege: leseSitemap(text, quelle.filter) };
    case 'rss': return { eintraege: leseRss(text) };
    case 'changelog': return { abschnitte: leseChangelog(text).map((a) => ({ schluessel: a.version, ...a })) };
    case 'tage': return { abschnitte: leseTage(text).map((a) => ({ schluessel: a.tag, ...a })) };
    case 'inhalt':
      // Echte Seiten sind Markdown und beginnen mit Frontmatter („---“) oder einer Überschrift.
      if (!/^\s*(---|#)/.test(text) || (quelle.muss && !text.includes(quelle.muss))) {
        throw new Error(`Inhalt unplausibel (erwartet „${quelle.muss}“) – Wartungs- oder Fehlerseite?`);
      }
      return { hash: fingerabdruck(text) };
    default: throw new Error(`Unbekannte Quellenart: ${quelle.art}`);
  }
}

export function zaehle(gelesen) {
  return gelesen.eintraege?.length ?? gelesen.abschnitte?.length ?? (gelesen.hash ? 1 : 0);
}

// Fingerabdruck einer Zeile ohne Form: Aufzählungszeichen, Linkziele, Groß/Klein und
// Leerraum zählen nicht – sonst wäre ein Umformatieren ein „Nachtrag“.
export function zeilenHash(zeile) {
  const kern = zeile
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/https?:\/\/\S+/g, '')
    .toLowerCase();
  return fingerabdruck(kern).slice(0, 10);
}

export class DeckelFehler extends Error {
  constructor(anzahl) {
    super(`${anzahl} neue Einträge auf einmal – Umzug oder neues Format? Nichts gemeldet, Stand unverändert. Kommt es im nächsten Lauf wieder, gibt es eine Sammelmeldung.`);
    this.deckel = true;
  }
}

// Zu viele Neue: beim ersten Mal Fehler (vielleicht ein Ausrutscher der Quelle), beim
// zweiten Lauf in Folge eine einzige Sammelmeldung und neue Grundlinie – sonst wäre die
// Quelle dauerhaft gesperrt.
function deckel(neu, basis, uebernehmen) {
  if (neu.length <= HOECHSTENS_NEU_JE_QUELLE) return neu;
  if (!uebernehmen) throw new DeckelFehler(neu.length);
  return [{ ...basis, art: 'viele', anzahl: neu.length, url: neu[0].url, titel: `${neu.length} neue Einträge`, beispiele: neu.slice(0, 10).map((m) => m.titel ?? m.url) }];
}

// Liefert { neu: [...], stand } für eine Quelle. alt === undefined → erster Lauf, nur Grundlinie.
// auchBekannt: Adressen, die eine andere Quelle derselben Gruppe schon kennt.
// deckelUebernehmen: der Lauf davor ist am Deckel gescheitert (siehe deckel).
export function vergleiche(quelle, alt, gelesen, { auchBekannt = [], deckelUebernehmen = false } = {}) {
  let neu = [];
  const basis = { quelle: quelle.id, name: quelle.name, wichtig: Boolean(quelle.wichtig) };

  if (gelesen.eintraege) {
    const bekannt = new Set([...(alt?.urls ?? []), ...auchBekannt]);
    const urls = gelesen.eintraege.map((e) => normalisiere(e.url));
    if (alt) {
      gelesen.eintraege.forEach((e, i) => {
        if (!bekannt.has(urls[i])) {
          bekannt.add(urls[i]);
          neu.push({ ...basis, art: 'neu', url: e.url, titel: e.titel ?? null, datum: e.lastmod ?? e.datum ?? null });
        }
      });
    }
    neu = deckel(neu, basis, deckelUebernehmen);
    // Bekannte Adressen bleiben im Stand, auch wenn sie kurz aus der Sitemap fallen –
    // sonst kämen sie beim Wiederauftauchen als „neu“.
    return { neu, stand: { urls: [...new Set([...(alt?.urls ?? []), ...urls])].sort() } };
  }

  if (gelesen.abschnitte) {
    const bekannt = new Set(alt?.schluessel ?? []);
    const alteZeilen = alt?.zeilenVersion === ZEILEN_VERSION ? (alt.zeilen ?? {}) : {};
    // Fingerabdrücke werden vereinigt, nicht ersetzt: Eine Zeile, die kurz fehlt und
    // wiederkommt, ist kein neuer Nachtrag (wie bei Adressen in der Sitemap).
    const jungeZeilen = {};
    gelesen.abschnitte.slice(0, NACHTRAEGE_IN_DEN_LETZTEN).forEach((a) => {
      jungeZeilen[a.schluessel] = [...new Set([...(jungeZeilen[a.schluessel] ?? alteZeilen[a.schluessel] ?? []), ...a.zeilen.map(zeilenHash)])];
    });
    if (alt) {
      const gemeldet = new Set();
      for (const a of gelesen.abschnitte) {
        if (!bekannt.has(a.schluessel)) {
          if (gemeldet.has(a.schluessel)) continue;
          gemeldet.add(a.schluessel);
          neu.push({ ...basis, art: 'neu', url: quelle.seite ?? quelle.url, titel: a.schluessel, zeilen: a.zeilen.slice(0, 60) });
        } else if (alteZeilen[a.schluessel] && jungeZeilen[a.schluessel]) {
          const vorher = new Set(alteZeilen[a.schluessel]);
          const dazu = a.zeilen.filter((z) => !vorher.has(zeilenHash(z)));
          if (dazu.length) neu.push({ ...basis, art: 'ergaenzt', url: quelle.seite ?? quelle.url, titel: a.schluessel, zeilen: dazu.slice(0, 60) });
        }
      }
    }
    neu = deckel(neu, basis, deckelUebernehmen);
    const schluessel = [...new Set([...(alt?.schluessel ?? []), ...gelesen.abschnitte.map((a) => a.schluessel)])];
    return { neu, stand: { schluessel, zeilen: jungeZeilen, zeilenVersion: ZEILEN_VERSION } };
  }

  if (alt && alt.hash !== gelesen.hash) {
    neu.push({ ...basis, art: 'geaendert', url: quelle.seite ?? quelle.url, titel: quelle.name });
  }
  return { neu, stand: { hash: gelesen.hash } };
}

// Derselbe Beitrag kann über zwei Wege kommen (claude.dev RSS und Sitemap) – nur einmal melden.
export function ohneDoppelte(meldungen) {
  const gesehen = new Map();
  for (const m of meldungen) {
    const schluessel = m.zeilen || m.art !== 'neu' ? `${m.quelle}|${m.art}|${m.titel}` : normalisiere(m.url);
    const vorher = gesehen.get(schluessel);
    // Der Eintrag mit Titel (RSS) gewinnt gegen den ohne (Sitemap).
    if (!vorher || (!vorher.titel && m.titel)) gesehen.set(schluessel, m);
  }
  return [...gesehen.values()];
}
