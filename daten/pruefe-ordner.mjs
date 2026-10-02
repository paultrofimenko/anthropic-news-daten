// Prüft alle Beiträge im Ordner daten/beitraege gegen das Format (F-02).
//   node daten/pruefe-ordner.mjs [ordner]
// Exit 0 = alles in Ordnung, 1 = Fehler (werden aufgelistet). Läuft lokal und in der GitHub Action.
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leseOrdner, pruefeAlle, persoenlicheWoerter } from './format.mjs';

const ordner = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), 'beitraege'));
const eintraege = leseOrdner(ordner);
const fehler = pruefeAlle(eintraege.map((e) => e.beitrag), { projektnamen: persoenlicheWoerter() });
for (const { datei, beitrag } of eintraege) if (`${beitrag.id}.json` !== datei) fehler.push(`${datei}: Dateiname muss <id>.json sein`);
if (fehler.length) { console.error(fehler.join('\n')); process.exitCode = 1; }
else console.log(`${eintraege.length} Beiträge geprüft, alles in Ordnung.`);
