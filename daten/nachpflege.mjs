// F-13 Wissen nachpflegen: Welche wichtigen Beiträge sind neuer als das Wissensblatt ihres Bereichs?
// Ohne Claude. Der Claude-Lauf arbeitet die Liste ab (ROUTINE-AUFTRAG.md) und setzt danach „stand“ des
// Blatts auf heute – dann ist der Eintrag weg. Bleibt ein Blatt liegen, zeigt die App die Liste als Hinweis.
//   node daten/nachpflege.mjs [beitraege-ordner] [wissen-ordner] [--json]
// Verglichen wird das Datum laut Quelle mit „stand“ (gleicher Tag zählt mit, Prüfrunde 1 B2: ein Modell kann
// Stunden nach der Nachpflege erscheinen). Was der Lauf schon abgearbeitet hat, steht im Blatt unter „gesehen“.
// Ein Beitrag kann Tage nach seinem Datum geschrieben werden (gemessen: bis 4 Tage). Darum zählt alles ab
// FENSTER_TAGE vor „stand“, was nicht unter „gesehen“ steht (Prüfrunde 2, N3); der Lauf hält „gesehen“ so lange.
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leseOrdner } from './format.mjs';
import { leseWissen, WISSEN_BEREICHE } from './wissen.mjs';

// Bereich eines Beitrags → Wissensblatt. news, produkte und richtlinien haben kein eigenes Blatt.
const ZUM_BLATT = { modelle: 'modelle', 'claude-code': 'claude-code', api: 'api', entwickler: 'entwickler', engineering: 'entwickler', forschung: 'forschung', unternehmen: 'unternehmen' };
// Preise, Abschaltungen und neue Modelle stehen auf dem Blatt „modelle“, auch wenn der Beitrag woanders einsortiert ist.
const MODELL_QUELLEN = ['modelle', 'abschaltungen'];
const MODELLNAME = /\b(Fable|Mythos|Opus|Sonnet|Haiku)\b/;

export const FENSTER_TAGE = 7;

// Nur JJJJ-MM-TT, das es wirklich gibt – sonst wird das Blatt übersprungen statt abzustürzen (Prüfrunde 3, N5).
function gueltigerTag(text) {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const d = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text;
}

function tageVorher(iso, tage) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - tage);
  return d.toISOString().slice(0, 10);
}

const zaehlt = (b) => b.wichtig === true || Boolean(b.ereignis);

function blaetterFuer(b) {
  const ziele = new Set();
  if (ZUM_BLATT[b.bereich]) ziele.add(ZUM_BLATT[b.bereich]);
  if (b.wichtig === true && (MODELL_QUELLEN.includes(b.quelle) || MODELLNAME.test(`${b.titel_de} ${b.kurz_de}`))) ziele.add('modelle');
  return ziele;
}

// Liefert { bereich: [{ id, titel_de, datum }, …] } – neueste zuerst, nur Blätter mit Einträgen.
export function nachpflegeListe(beitraege, wissen) {
  const blaetter = new Map(wissen.filter((w) => WISSEN_BEREICHE.includes(w?.bereich)).map((w) => [w.bereich, w]));
  const liste = {};
  for (const b of beitraege) {
    if (!zaehlt(b)) continue;
    for (const bereich of blaetterFuer(b)) {
      const w = blaetter.get(bereich);
      if (!w || !gueltigerTag(w.stand) || b.datum < tageVorher(w.stand, FENSTER_TAGE)) continue;
      if (Array.isArray(w.gesehen) && w.gesehen.includes(b.id)) continue;
      (liste[bereich] ??= []).push({ id: b.id, titel_de: b.titel_de, datum: b.datum });
    }
  }
  for (const eintraege of Object.values(liste)) eintraege.sort((a, b) => b.datum.localeCompare(a.datum) || a.id.localeCompare(b.id));
  return liste;
}

const istHauptprogramm = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (istHauptprogramm) {
  const hier = dirname(fileURLToPath(import.meta.url));
  const args = process.argv.slice(2).filter((a) => a !== '--json');
  const beitraege = leseOrdner(resolve(args[0] ?? join(hier, 'beitraege'))).map((e) => e.beitrag);
  const wissen = leseWissen(resolve(args[1] ?? join(hier, 'wissen'))).map((e) => e.wissen);
  const liste = nachpflegeListe(beitraege, wissen);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(liste));
  } else if (!Object.keys(liste).length) {
    console.log('Nichts nachzupflegen: Kein Wissensblatt ist älter als ein wichtiger Beitrag seines Bereichs.');
  } else {
    for (const [bereich, eintraege] of Object.entries(liste)) {
      const w = wissen.find((x) => x.bereich === bereich);
      console.log(`daten/wissen/${bereich}.json (stand ${w.stand}) – neuer sind:`);
      for (const e of eintraege) console.log(`  ${e.datum}  ${e.titel_de}  (daten/beitraege/${e.id}.json)`);
    }
  }
}
