# Anthropic-News – Daten

Deutsche Zusammenfassungen neuer Inhalte von Anthropic (anthropic.com, claude.dev, Claude-Doku,
Claude-Code-Changelog) für eine private Lese-App. Alle Beiträge verlinken auf die Originalquelle.

## So läuft es
1. **Vorprüfung** (GitHub Action, alle 3 Stunden, ohne KI): liest Sitemaps, RSS, Changelog und
   Release Notes und vergleicht mit `daten/vorpruefung-stand.json`. Echt Neues landet in
   `daten/warteschlange/`.
2. **Claude-Lauf** (wird von der Vorprüfung gestartet): arbeitet `ROUTINE-AUFTRAG.md` ab und schreibt
   je Neuigkeit eine Datei nach `daten/beitraege/`.
3. **Veröffentlichen** (GitHub Action): prüft das Format und baut `daten/index.json` – die Datei,
   die die App liest.

## Ordner
- `vorpruefung/` – Quellen und Vergleich
- `daten/beitraege/` – ein Beitrag je Datei
- `daten/index.json` – alle Beiträge, neueste zuerst
- `daten/quellen/` – Rohtext von Modellübersicht und Abschaltliste (für Unterschiede)
- `daten/warteschlange/` – noch nicht zusammengefasste Meldungen

Inhalte gehören Anthropic; hier stehen nur kurze Zusammenfassungen mit Link.
