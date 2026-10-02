// Vorprüfung: liest alle Quellen, vergleicht mit dem gespeicherten Stand, meldet nur Neues.
// Läuft ohne Claude – kostet kein Abo-Kontingent.
//
//   node vorpruefung/pruefen.mjs [--stand <datei>] [--warteschlange <ordner>] [--quellen-ordner <ordner>] [--zaehlen]
//
// --warteschlange: Neues kommt zusätzlich als Datei <ordner>/<zeit>.json dorthin. Der Claude-Lauf
//   arbeitet die Dateien ab und löscht sie danach – fällt ein Lauf aus, bleibt die Datei liegen
//   und wird beim nächsten Mal nachgeholt.
// --quellen-ordner: Rohtext der Inhalts-Quellen (Modellübersicht, Abschaltungen) als <id>.md, damit
//   Claude bei „geändert“ den Unterschied im Git-Verlauf sehen kann.
//
// Ausgabe: eine JSON-Zeile. Exit-Code 0 = nichts neu, 3 = etwas neu, 1 = alle Quellen fehlgeschlagen.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QUELLEN } from './quellen.mjs';
import { lese, vergleiche, zaehle, ohneDoppelte } from './vergleich.mjs';

export const NICHTS_NEU = 0;
export const ETWAS_NEU = 3;
export const ALLES_FEHLGESCHLAGEN = 1;

async function holeAusNetz(url) {
  const antwort = await fetch(url, { headers: { 'user-agent': 'anthropic-news-vorpruefung/1' }, signal: AbortSignal.timeout(30000) });
  if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`);
  return antwort.text();
}

// hole: (url) => Promise<string> – in Tests ersetzt, damit sie ohne Netz laufen.
// Ab so vielen Fehlläufen in Folge gilt eine Quelle als gestört (ergebnis.gestoert) –
// damit eine Quelle nicht still und dauerhaft ausfällt. Die Action meldet das per Fehlermail.
export const GESTOERT_AB = 3;

export async function pruefe({ stand = {}, quellen = QUELLEN, hole = holeAusNetz, jetzt = new Date() } = {}) {
  const { _stoerungen: alteStoerungen = {}, ...quellenStand } = stand;
  const neuerStand = { ...quellenStand };
  const stoerungen = { ...alteStoerungen };
  const meldungen = [];
  const fehler = [];
  const gezaehlt = {};
  const rohtexte = {};

  await Promise.all(quellen.map(async (quelle) => {
    try {
      const text = await hole(quelle.url);
      const gelesen = lese(quelle, text);
      if (quelle.art === 'inhalt') rohtexte[quelle.id] = text;
      gezaehlt[quelle.id] = zaehle(gelesen);
      if (gezaehlt[quelle.id] === 0 && quelle.art !== 'inhalt') throw new Error('nichts gelesen – Format geändert?');
      const auchBekannt = quelle.gruppe
        ? quellen.filter((q) => q.gruppe === quelle.gruppe && q.id !== quelle.id).flatMap((q) => stand[q.id]?.urls ?? [])
        : [];
      const deckelUebernehmen = alteStoerungen[quelle.id]?.deckel === true;
      const { neu, stand: s } = vergleiche(quelle, stand[quelle.id], gelesen, { auchBekannt, deckelUebernehmen });
      meldungen.push(...neu);
      // Kein Prüfzeitpunkt im Stand: sonst ändert sich die Datei bei jedem Lauf und erzeugt leere Commits.
      neuerStand[quelle.id] = s;
      delete stoerungen[quelle.id];
    } catch (e) {
      // Stand dieser Quelle bleibt, wie er war; nur der Fehlerzähler läuft.
      fehler.push({ quelle: quelle.id, meldung: e.message });
      stoerungen[quelle.id] = { anzahl: (alteStoerungen[quelle.id]?.anzahl ?? 0) + 1, deckel: Boolean(e.deckel) };
    }
  }));

  if (Object.keys(stoerungen).length) neuerStand._stoerungen = stoerungen;
  const gestoert = Object.entries(stoerungen).filter(([, s]) => s.anzahl >= GESTOERT_AB).map(([id]) => id).sort();
  const neu = ohneDoppelte(meldungen);
  const code = fehler.length === quellen.length ? ALLES_FEHLGESCHLAGEN : neu.length ? ETWAS_NEU : NICHTS_NEU;
  return { ergebnis: { zeit: jetzt.toISOString(), neu, fehler, gestoert, gezaehlt }, stand: neuerStand, code, rohtexte };
}

// Schreibt Warteschlange und Quelltexte (für die GitHub Action). Gibt den Pfad der neuen Warteschlangen-Datei zurück.
export function schreibeAusgaben({ ergebnis, rohtexte = {}, warteschlange, quellenOrdner }) {
  let datei = null;
  if (warteschlange && ergebnis.neu.length) {
    mkdirSync(warteschlange, { recursive: true });
    datei = join(warteschlange, ergebnis.zeit.replace(/[:.]/g, '-') + '.json');
    writeFileSync(datei, JSON.stringify({ zeit: ergebnis.zeit, neu: ergebnis.neu }, null, 1) + '\n');
  }
  if (quellenOrdner) {
    mkdirSync(quellenOrdner, { recursive: true });
    for (const [id, text] of Object.entries(rohtexte)) writeFileSync(join(quellenOrdner, id + '.md'), text);
  }
  return datei;
}

async function hauptprogramm() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--stand');
  const standDatei = resolve(i >= 0 ? args[i + 1] : `${dirname(fileURLToPath(import.meta.url))}/../daten/vorpruefung-stand.json`);

  if (args.includes('--zaehlen')) {
    const { ergebnis, code } = await pruefe();
    console.log(JSON.stringify({ gezaehlt: ergebnis.gezaehlt, fehler: ergebnis.fehler }, null, 2));
    if (code === ALLES_FEHLGESCHLAGEN) process.exitCode = code;
    return;
  }

  const wert = (name) => { const j = args.indexOf(name); return j >= 0 ? resolve(args[j + 1]) : null; };
  const stand = existsSync(standDatei) ? JSON.parse(readFileSync(standDatei, 'utf8')) : {};
  const { ergebnis, stand: neuerStand, code, rohtexte } = await pruefe({ stand });
  mkdirSync(dirname(standDatei), { recursive: true });
  writeFileSync(standDatei, JSON.stringify(neuerStand, null, 1) + '\n');
  schreibeAusgaben({ ergebnis, rohtexte, warteschlange: wert('--warteschlange'), quellenOrdner: wert('--quellen-ordner') });
  console.log(JSON.stringify(ergebnis));
  process.exitCode = code;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await hauptprogramm();
