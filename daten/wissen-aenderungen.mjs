// F-17 Wissen: geänderte Stellen zeigen (Paul 28.10.2026: „Baue alle sechs Punkte“). Der Index-Bau vergleicht jedes
// Wissensblatt mit dem vorigen Index: Hat sich ein Abschnitt oder die Grafik inhaltlich geändert, bekommt er
// „geaendert“ = { am: heute, durch: [Beiträge, die dabei neu in „gesehen“ kamen] }. Unverändertes behält sein altes
// Datum. Ein entfernter Abschnitt steht 30 Tage unter „entfernt“ (Prüfrunde 1, Befund 6). Ohne Claude – auch wenn der
// Claude-Lauf das Feld vergisst, stimmt die Markierung.
// Die Felder stehen nur im Index (abgeleitet), nie in daten/wissen/<bereich>.json.

const ENTFERNT_TAGE = 30;
const ohneMarke = ({ geaendert, ...rest }) => rest;
// Gleich heißt: gleicher Inhalt – die Reihenfolge der Felder zählt nicht (Prüfrunde 1, Befund 6).
const sortiert = (x) => (Array.isArray(x) ? x.map(sortiert)
  : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, sortiert(x[k])])) : x);
const gleich = (a, b) => JSON.stringify(sortiert(a)) === JSON.stringify(sortiert(b));
const tageZwischen = (von, bis) => (new Date(`${bis}T00:00:00Z`) - new Date(`${von}T00:00:00Z`)) / 86_400_000;

// Der Kalendertag in Deutschland – die Action läuft in UTC, Paul liest in Ortszeit (Prüfrunde 1, Befund 7).
export function tagInBerlin(jetzt = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(jetzt);
}

export function markiereAenderungen(neuListe, altListe, heute, beitragsIds = null) {
  const altJe = new Map((Array.isArray(altListe) ? altListe : []).filter((w) => w?.bereich).map((w) => [w.bereich, w]));
  return neuListe.map((neu) => {
    const alt = altJe.get(neu.bereich);
    // Ein neues Blatt ist als Ganzes neu – einzelne Stellen hervorzuheben, hieße alles hervorzuheben.
    if (!alt) return neu;
    const altGesehen = new Set(Array.isArray(alt.gesehen) ? alt.gesehen : []);
    const durch = (Array.isArray(neu.gesehen) ? neu.gesehen : []).filter((id) => !altGesehen.has(id) && (!beitragsIds || beitragsIds.has(id)));
    const marke = { am: heute, durch };
    const altAbschnitte = new Map((alt.abschnitte ?? []).map((a) => [a.titel_de, a]));
    const abschnitte = (neu.abschnitte ?? []).map((a) => {
      const vorher = altAbschnitte.get(a.titel_de);
      if (vorher && gleich(ohneMarke(vorher), ohneMarke(a))) return vorher.geaendert ? { ...a, geaendert: vorher.geaendert } : a;
      return { ...a, geaendert: marke };
    });
    const ergebnis = { ...neu, abschnitte };
    const { grafik_geaendert: grafikVorher } = alt;
    if (!gleich(alt.grafik, neu.grafik)) ergebnis.grafik_geaendert = marke;
    else if (grafikVorher) ergebnis.grafik_geaendert = grafikVorher;
    // Entfernt: neu weggefallene Titel mit heute, ältere Hinweise weitertragen, solange sie jünger als 30 Tage sind
    // und der Abschnitt nicht zurückgekommen ist.
    const neueTitel = new Set(abschnitte.map((a) => a.titel_de));
    const entfernt = [
      ...(Array.isArray(alt.entfernt) ? alt.entfernt : []).filter((e) => !neueTitel.has(e.titel_de) && tageZwischen(e.am, heute) <= ENTFERNT_TAGE),
      ...(alt.abschnitte ?? []).filter((a) => !neueTitel.has(a.titel_de)).map((a) => ({ titel_de: a.titel_de, am: heute })),
    ].filter((e, i, l) => l.findIndex((x) => x.titel_de === e.titel_de) === i);
    if (entfernt.length) ergebnis.entfernt = entfernt;
    return ergebnis;
  });
}

// Für den Index-Bau: altText ist der bisherige daten/index.json.
export function mitAenderungen(neu, altText, jetzt = new Date()) {
  let alt;
  try { alt = JSON.parse(altText); } catch { return neu; }
  const ids = new Set((neu.beitraege ?? []).map((b) => b.id));
  return { ...neu, wissen: markiereAenderungen(neu.wissen ?? [], alt?.wissen, tagInBerlin(jetzt), ids) };
}
