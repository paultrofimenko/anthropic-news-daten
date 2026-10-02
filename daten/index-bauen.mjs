// Baut daten/index.json – die eine Datei, die die App liest: alle Beiträge, neueste zuerst, und die
// Zeitleiste (F-09: Abschaltungen aus daten/quellen/abschaltungen.md, Neues aus dem Feld „ereignis“).
//   node daten/index-bauen.mjs [beitraege-ordner] [ziel-datei] [abschaltungen.md]
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leseOrdner } from './format.mjs';
import { bauZeitleiste, unklareAbschaltZeilen, unklareModelle } from './zeitleiste.mjs';

export const INDEX_VERSION = 1;

// Versteht das Skript Zeilen der Abschaltliste nicht, wird der Index trotzdem gebaut – neue Beiträge sollen
// nicht hängen bleiben (Prüfrunde 2, sollte 1). Die App zeigt dann den Hinweis, und die Action wird nach dem
// Veröffentlichen rot (zeitleiste.mjs --pruefen).
export function bauIndex(beitraege, jetzt = new Date(), abschaltMarkdown = '') {
  const unklar = unklareAbschaltZeilen(abschaltMarkdown);
  const hinweise = unklar.length
    ? [`Abschaltliste: ${unklar.length === 1 ? 'eine Zeile' : `${unklar.length} Zeilen`} nicht verstanden – Abschaltungen können fehlen (${unklar.join('; ')}).`]
    : [];
  const sortiert = [...beitraege].sort((a, b) => b.datum.localeCompare(a.datum) || a.id.localeCompare(b.id));
  return { version: INDEX_VERSION, erzeugt: jetzt.toISOString(), anzahl: sortiert.length, beitraege: sortiert, zeitleiste: bauZeitleiste(sortiert, abschaltMarkdown), hinweise };
}

// Abschaltungen der Modelle, deren Zeile nicht verstanden wurde, bleiben aus dem alten Index stehen –
// so verschwindet eine schon bekannte Abschaltung nicht, nur weil sich die Schreibweise geändert hat.
export function mitAltenAbschaltungen(neu, altText, modelle) {
  if (!modelle.length) return neu;
  let alt;
  try { alt = JSON.parse(altText); } catch { return neu; }
  // Ein Modell, das der neue Index schon kennt (z. B. aus der Verlaufstabelle), kommt nicht ein zweites Mal
  // mit dem alten Datum dazu (Prüfrunde 3, sollte 3).
  const schon = new Set(neu.zeitleiste.flatMap((e) => e.modelle ?? []));
  const behalten = (alt?.zeitleiste ?? []).filter((e) => e.art === 'ende'
    && (e.modelle ?? []).some((m) => modelle.includes(m)) && !(e.modelle ?? []).some((m) => schon.has(m)));
  if (!behalten.length) return neu;
  return { ...neu, zeitleiste: [...neu.zeitleiste, ...behalten].sort((a, b) => a.datum.localeCompare(b.datum) || (a.art === b.art ? 0 : a.art === 'neu' ? -1 : 1)) };
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
  const liste = existsSync(abschaltungen) ? readFileSync(abschaltungen, 'utf8') : '';
  const altText = existsSync(ziel) ? readFileSync(ziel, 'utf8') : '';
  const neu = mitAltenAbschaltungen(bauIndex(leseOrdner(ordner).map((e) => e.beitrag), new Date(), liste), altText, unklareModelle(liste));
  const index = mitAltemZeitstempel(neu, altText);
  writeFileSync(ziel, JSON.stringify(index, null, 1) + '\n');
  console.log(`${index.anzahl} Beiträge, ${index.zeitleiste.length} Ereignisse in der Zeitleiste: ${ziel}`);
  for (const h of index.hinweise) console.log(`::warning::${h}`);
}
