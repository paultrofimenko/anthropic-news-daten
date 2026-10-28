// F-17 Wissen: geänderte Stellen zeigen (Paul 28.10.2026: „Baue alle sechs Punkte“). Der Index-Bau vergleicht jedes
// Wissensblatt mit dem vorigen Index: Hat sich ein Abschnitt oder die Grafik inhaltlich geändert, bekommt er
// „geaendert“ = { am: heute, durch: [Beiträge, die dabei neu in „gesehen“ kamen] }. Unverändertes behält sein altes
// Datum. Ohne Claude – auch wenn der Claude-Lauf das Feld vergisst, stimmt die Markierung.
// Die Felder stehen nur im Index (abgeleitet), nie in daten/wissen/<bereich>.json.

const ohneMarke = ({ geaendert, ...rest }) => rest;
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);

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
    return ergebnis;
  });
}

// Für den Index-Bau: altText ist der bisherige daten/index.json.
export function mitAenderungen(neu, altText, jetzt = new Date()) {
  let alt;
  try { alt = JSON.parse(altText); } catch { return neu; }
  const ids = new Set((neu.beitraege ?? []).map((b) => b.id));
  return { ...neu, wissen: markiereAenderungen(neu.wissen ?? [], alt?.wissen, jetzt.toISOString().slice(0, 10), ids) };
}
