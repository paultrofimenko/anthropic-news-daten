// Baut daten/index.json – die eine Datei, die die App liest: alle Beiträge, neueste zuerst, und die
// Zeitleiste (F-09: Abschaltungen aus daten/quellen/abschaltungen.md, Neues aus dem Feld „ereignis“).
//   node daten/index-bauen.mjs [beitraege-ordner] [ziel-datei] [abschaltungen.md]
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leseOrdner } from './format.mjs';
import { bauZeitleiste, unklareAbschaltZeilen } from './zeitleiste.mjs';

export const INDEX_VERSION = 1;

export function bauIndex(beitraege, jetzt = new Date(), abschaltMarkdown = '') {
  const unklar = unklareAbschaltZeilen(abschaltMarkdown);
  if (unklar.length) throw new Error(`Abschaltliste in unbekannter Form – Index nicht gebaut, damit keine Abschaltung still verschwindet:\n${unklar.join('\n')}`);
  const sortiert = [...beitraege].sort((a, b) => b.datum.localeCompare(a.datum) || a.id.localeCompare(b.id));
  return { version: INDEX_VERSION, erzeugt: jetzt.toISOString(), anzahl: sortiert.length, beitraege: sortiert, zeitleiste: bauZeitleiste(sortiert, abschaltMarkdown) };
}

// Hat sich außer dem Zeitstempel nichts geändert, bleibt der alte Index stehen – sonst gäbe der
// tägliche Lauf jeden Tag einen Commit ohne Inhalt.
export function mitAltemZeitstempel(neu, altText) {
  try {
    const alt = JSON.parse(altText);
    if (JSON.stringify({ ...alt, erzeugt: '' }) === JSON.stringify({ ...neu, erzeugt: '' })) return alt;
  } catch { /* kein oder kaputter alter Index */ }
  return neu;
}

const istHauptprogramm = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (istHauptprogramm) {
  const hier = dirname(fileURLToPath(import.meta.url));
  const ordner = resolve(process.argv[2] ?? join(hier, 'beitraege'));
  const ziel = resolve(process.argv[3] ?? join(hier, 'index.json'));
  const abschaltungen = resolve(process.argv[4] ?? join(hier, 'quellen', 'abschaltungen.md'));
  const neu = bauIndex(leseOrdner(ordner).map((e) => e.beitrag), new Date(), existsSync(abschaltungen) ? readFileSync(abschaltungen, 'utf8') : '');
  const index = mitAltemZeitstempel(neu, existsSync(ziel) ? readFileSync(ziel, 'utf8') : '');
  writeFileSync(ziel, JSON.stringify(index, null, 1) + '\n');
  console.log(`${index.anzahl} Beiträge, ${index.zeitleiste.length} Ereignisse in der Zeitleiste: ${ziel}`);
}
