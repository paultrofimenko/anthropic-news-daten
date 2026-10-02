// Baut daten/index.json – die eine Datei, die die App liest: alle Beiträge, neueste zuerst.
//   node daten/index-bauen.mjs [beitraege-ordner] [ziel-datei]
import { writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leseOrdner } from './format.mjs';

export const INDEX_VERSION = 1;

export function bauIndex(beitraege, jetzt = new Date()) {
  const sortiert = [...beitraege].sort((a, b) => b.datum.localeCompare(a.datum) || a.id.localeCompare(b.id));
  return { version: INDEX_VERSION, erzeugt: jetzt.toISOString(), anzahl: sortiert.length, beitraege: sortiert };
}

const istHauptprogramm = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (istHauptprogramm) {
  const hier = dirname(fileURLToPath(import.meta.url));
  const ordner = resolve(process.argv[2] ?? join(hier, 'beitraege'));
  const ziel = resolve(process.argv[3] ?? join(hier, 'index.json'));
  const index = bauIndex(leseOrdner(ordner).map((e) => e.beitrag));
  writeFileSync(ziel, JSON.stringify(index, null, 1) + '\n');
  console.log(`${index.anzahl} Beiträge in ${ziel}`);
}
