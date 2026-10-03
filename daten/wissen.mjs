// F-12 Wissen: eine erklärte Übersichtsseite je Bereich des Wissen-Reiters (daten/wissen/<bereich>.json).
// Liegt wie die Beiträge im öffentlichen Daten-Repo – darum dieselben Regeln: nur erlaubte Quellen,
// nichts Persönliches. Dazu je Blatt genau eine Grafik in einer der drei Formen, die die App zeichnen kann.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { erlaubteUrl, persoenlicheStellen, alleTexte, links } from './format.mjs';

// Reihenfolge = Reihenfolge der Kacheln im Wissen-Reiter.
export const WISSEN_BEREICHE = ['modelle', 'claude-code', 'entwickler', 'api', 'forschung', 'unternehmen'];
export const GRAFIK_ARTEN = ['balken', 'schritte', 'zahlen'];
const WERT_MAX = 10; // „1 Mio.“, „128.000“ – passt in eine Kachel
const KURZ_MAX = 90; // Kacheltext im Wissen-Reiter
const EINHEIT_KURZ_MAX = 4; // „$“, „%“ – steht direkt am Wert

// Gleiche Namen wären in der App doppelte Schlüssel (Prüfrunde 1, B5).
function doppelte(namen, wo, id) {
  const gesehen = new Set();
  const fehler = [];
  for (const n of namen) {
    if (typeof n !== 'string') continue;
    if (gesehen.has(n)) fehler.push(`${id}: ${wo} „${n}“ doppelt`);
    gesehen.add(n);
  }
  return fehler;
}

// Eine eigene Quelle (Punkt, Schritt) ist erlaubt, wenn die Aussage woanders steht als der Rest (Prüfrunde 1, B2).
function pruefeEigeneQuelle(q, wo, id) {
  if (q === undefined) return [];
  if (!istText(q)) return [`${id}: ${wo}: quelle leer`];
  return erlaubteUrl(q) ? [] : [`${id}: ${wo}: quelle nicht auf erlaubter Domain: ${q}`];
}

const istText = (x) => typeof x === 'string' && x.trim().length > 0;

function gueltigesDatum(text) {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const d = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text;
}

function pruefeGrafik(g, id) {
  const fehler = [];
  if (!g || typeof g !== 'object' || Array.isArray(g)) return [`${id}: Feld „grafik“ fehlt`];
  if (!GRAFIK_ARTEN.includes(g.art)) return [`${id}: grafik.art muss ${GRAFIK_ARTEN.join(', ')} sein`];
  if (!istText(g.titel_de)) fehler.push(`${id}: grafik.titel_de fehlt`);
  if (!istText(g.quelle)) fehler.push(`${id}: grafik.quelle fehlt`);
  else if (!erlaubteUrl(g.quelle)) fehler.push(`${id}: grafik.quelle nicht auf erlaubter Domain: ${g.quelle}`);

  if (g.art === 'balken') {
    if (!istText(g.einheit_de)) fehler.push(`${id}: grafik.einheit_de fehlt`);
    if (g.einheit_kurz !== undefined && !(istText(g.einheit_kurz) && g.einheit_kurz.length <= EINHEIT_KURZ_MAX)) fehler.push(`${id}: grafik.einheit_kurz höchstens ${EINHEIT_KURZ_MAX} Zeichen`);
    const reihen = Array.isArray(g.reihen) && g.reihen.length >= 1 && g.reihen.length <= 3 && g.reihen.every(istText) ? g.reihen : null;
    if (!reihen) fehler.push(`${id}: grafik.reihen braucht 1 bis 3 Namen`);
    else fehler.push(...doppelte(reihen, 'Reihe', id));
    if (!Array.isArray(g.zeilen) || g.zeilen.length < 2 || g.zeilen.length > 12) fehler.push(`${id}: grafik.zeilen braucht 2 bis 12 Einträge`);
    else for (const z of g.zeilen) {
      if (!z || typeof z !== 'object') { fehler.push(`${id}: grafik.zeilen: Eintrag kein Objekt`); continue; }
      if (!istText(z?.name)) fehler.push(`${id}: grafik.zeilen ohne Namen`);
      if (!Array.isArray(z?.werte) || !z.werte.every((w) => typeof w === 'number' && Number.isFinite(w) && w >= 0)) fehler.push(`${id}: grafik „${z?.name}“: jeder Wert muss eine Zahl ab 0 sein`);
      else if (reihen && z.werte.length !== reihen.length) fehler.push(`${id}: grafik „${z.name}“: so viele Werte wie reihen`);
    }
    if (Array.isArray(g.zeilen)) fehler.push(...doppelte(g.zeilen.map((z) => z?.name), 'Zeile', id));
  } else if (g.art === 'schritte') {
    if (!Array.isArray(g.schritte) || g.schritte.length < 2 || g.schritte.length > 8) fehler.push(`${id}: grafik.schritte braucht 2 bis 8 Schritte`);
    else {
      for (const s of g.schritte) {
        if (!istText(s?.titel_de) || !istText(s?.text_de)) fehler.push(`${id}: jeder Schritt braucht titel_de und text_de`);
        fehler.push(...pruefeEigeneQuelle(s?.quelle, `Schritt „${s?.titel_de}“`, id));
      }
      fehler.push(...doppelte(g.schritte.map((s) => s?.titel_de), 'Schritt', id));
    }
  } else if (g.art === 'zahlen') {
    if (!Array.isArray(g.zahlen) || g.zahlen.length < 2 || g.zahlen.length > 6) fehler.push(`${id}: grafik.zahlen braucht 2 bis 6 Kennzahlen`);
    else for (const z of g.zahlen) {
      if (!istText(z?.wert) || z.wert.length > WERT_MAX) fehler.push(`${id}: grafik.zahlen: wert kurz halten (höchstens ${WERT_MAX} Zeichen)`);
      if (!istText(z?.text_de)) fehler.push(`${id}: grafik.zahlen: text_de fehlt`);
    }
    if (Array.isArray(g.zahlen)) fehler.push(...doppelte(g.zahlen.map((z) => `${z?.wert} ${z?.text_de}`), 'Kennzahl', id));
  }
  return fehler;
}

// Liefert eine Liste von Fehlern (leer = in Ordnung).
export function pruefeWissen(w, { projektnamen = [] } = {}) {
  if (!w || typeof w !== 'object' || Array.isArray(w)) return ['kein Objekt'];
  const id = istText(w.bereich) ? w.bereich : '(ohne bereich)';
  const fehler = [];
  for (const feld of ['bereich', 'titel_de', 'einleitung_de', 'stand']) if (!istText(w[feld])) fehler.push(`${id}: Feld „${feld}“ fehlt`);
  if (w.kurz_de !== undefined && !(istText(w.kurz_de) && w.kurz_de.length <= KURZ_MAX)) fehler.push(`${id}: kurz_de (Kacheltext) höchstens ${KURZ_MAX} Zeichen`);
  if (istText(w.bereich) && !WISSEN_BEREICHE.includes(w.bereich)) fehler.push(`${id}: unbekannter Bereich „${w.bereich}“`);
  if (istText(w.stand) && !gueltigesDatum(w.stand)) fehler.push(`${id}: stand kein gültiges Datum JJJJ-MM-TT`);
  fehler.push(...pruefeGrafik(w.grafik, id));

  if (!Array.isArray(w.abschnitte) || w.abschnitte.length === 0) fehler.push(`${id}: Feld „abschnitte“ fehlt oder ist leer`);
  else w.abschnitte.forEach((a, i) => {
    const wo = `${id}: Abschnitt ${i + 1}`;
    if (!istText(a?.titel_de)) fehler.push(`${wo}: titel_de fehlt`);
    if (!istText(a?.text_de)) fehler.push(`${wo}: text_de fehlt`);
    // Ein Punkt ist ein Text oder { text_de, quelle } mit eigener Quelle.
    if (a?.punkte_de !== undefined) {
      const istPunkt = (p) => istText(p) || (p && typeof p === 'object' && !Array.isArray(p) && istText(p.text_de) && istText(p.quelle));
      if (!(Array.isArray(a.punkte_de) && a.punkte_de.every(istPunkt))) fehler.push(`${wo}: punkte_de muss eine Liste von Texten oder { text_de, quelle } sein`);
      else {
        for (const p of a.punkte_de) if (typeof p === 'object') fehler.push(...pruefeEigeneQuelle(p.quelle, `Punkt „${p.text_de.slice(0, 30)}“`, `${id} Abschnitt ${i + 1}`));
        fehler.push(...doppelte(a.punkte_de.map((p) => (typeof p === 'string' ? p : p.text_de)), 'Punkt', `${id} Abschnitt ${i + 1}`));
      }
    }
    if (!istText(a?.quelle)) fehler.push(`${wo}: quelle fehlt`);
    else if (!erlaubteUrl(a.quelle)) fehler.push(`${wo}: quelle nicht auf erlaubter Domain: ${a.quelle}`);
  });

  if (Array.isArray(w.abschnitte)) fehler.push(...doppelte(w.abschnitte.map((a) => a?.titel_de), 'Abschnitt', id));

  const texte = alleTexte(w);
  for (const text of texte) for (const link of links(text)) if (!erlaubteUrl(link)) fehler.push(`${id}: Link nicht auf erlaubter Domain: ${link}`);
  const stellen = persoenlicheStellen(texte.join('\n'), projektnamen);
  if (stellen.length) fehler.push(`${id}: Persönliches gefunden (${stellen.join(', ')})`);
  return [...new Set(fehler)];
}

export function pruefeAlleWissen(liste, optionen) {
  const fehler = liste.flatMap((w) => pruefeWissen(w, optionen));
  const gesehen = new Set();
  for (const w of liste) {
    if (!w?.bereich) continue;
    if (gesehen.has(w.bereich)) fehler.push(`${w.bereich}: Bereich doppelt`);
    gesehen.add(w.bereich);
  }
  return fehler;
}

// Für den Index: in der Reihenfolge der Kacheln.
export function sortiereWissen(liste) {
  const rang = (w) => { const i = WISSEN_BEREICHE.indexOf(w.bereich); return i < 0 ? WISSEN_BEREICHE.length : i; };
  return [...liste].sort((a, b) => rang(a) - rang(b));
}

// Jede Datei im Ordner ist ein Blatt (<bereich>.json).
export function leseWissen(ordner) {
  if (!existsSync(ordner)) return [];
  return readdirSync(ordner).filter((n) => n.endsWith('.json')).sort().map((n) => ({
    datei: n,
    wissen: JSON.parse(readFileSync(join(ordner, n), 'utf8')),
  }));
}
