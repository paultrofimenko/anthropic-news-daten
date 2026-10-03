// Prüft alle Beiträge im Ordner daten/beitraege gegen das Format (F-02) und die Wissensblätter in
// daten/wissen (F-12).
//   node daten/pruefe-ordner.mjs [beitraege-ordner] [wissen-ordner]
// Exit 0 = alles in Ordnung, 1 = Fehler (werden aufgelistet). Läuft lokal und in der GitHub Action.
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leseOrdner, pruefeAlle, persoenlicheWoerter } from './format.mjs';
import { leseWissen, pruefeAlleWissen } from './wissen.mjs';

const hier = dirname(fileURLToPath(import.meta.url));
const ordner = resolve(process.argv[2] ?? join(hier, 'beitraege'));
const wissenOrdner = resolve(process.argv[3] ?? join(hier, 'wissen'));
const woerter = persoenlicheWoerter();
const eintraege = leseOrdner(ordner);
const fehler = pruefeAlle(eintraege.map((e) => e.beitrag), { projektnamen: woerter });
for (const { datei, beitrag } of eintraege) if (`${beitrag.id}.json` !== datei) fehler.push(`${datei}: Dateiname muss <id>.json sein`);
const blaetter = leseWissen(wissenOrdner);
fehler.push(...pruefeAlleWissen(blaetter.map((e) => e.wissen), { projektnamen: woerter }));
for (const { datei, wissen } of blaetter) if (`${wissen.bereich}.json` !== datei) fehler.push(`${datei}: Dateiname muss <bereich>.json sein`);
if (fehler.length) { console.error(fehler.join('\n')); process.exitCode = 1; }
else console.log(`${eintraege.length} Beiträge und ${blaetter.length} Wissensblätter geprüft, alles in Ordnung.`);
