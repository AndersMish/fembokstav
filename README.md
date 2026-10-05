# Fembokstav – Norsk Wordle

Et polert, gratis Wordle-klon på **norsk bokmål**. Ren statisk HTML5 – ingen byggetrinn.

**Spill online:** [https://andersmish.github.io/fembokstav/](https://andersmish.github.io/fembokstav/)

## Spill

Åpne `index.html` i en nettleser, eller start en lokal server:

```bash
cd fembokstav
python3 -m http.server 8080
# åpne http://localhost:8080
```

### Regler

- Gjett et **5-bokstavsord** på **6 forsøk**
- 🟩 riktig bokstav på riktig plass
- 🟨 bokstaven finnes i ordet, men feil plass
- ⬛ bokstaven er ikke i ordet
- Tastatur med **Æ Ø Å**
- **Hard modus** (valgfritt): avslørte hint må brukes videre
- **Dagens ord**: samme for alle (tidssone `Europe/Oslo`)
- **Øvingsmodus**: tilfeldig ord, teller ikke i statistikken
- Del resultat som emoji-rutenett
- Statistikk lagres i `localStorage` (nøkkelprefiks `fembokstav.`)

## Ordliste

| Liste | Antall | Bruk |
|-------|--------|------|
| Svar (`answers`) | **800** | Daglige / øvings-fasitsvar |
| Gjett (`guesses`) | **5096** | Gyldige gjett (inkl. svarordene) |

**Kilde:** [Norsk ordbank – bokmål 2005](https://github.com/Ondkloss/norwegian-wordlist) (oppdatering 2022-02-01), publisert under **CC-BY 4.0**.

Ordlistene er filtrert til rene 5-bokstavsord (`a–zæøå`). Svarlisten er et kuratert utvalg egnet som daglige fasitsvar. Se også `words/ATTRIBUTION.txt` og `LICENSE`.

Filer:

- `js/wordlists.js` – lastes av spillet
- `words/answers.json` / `words/guesses.json` – samme data som JSON

## Hvordan dagens ord velges

1. Dagens dato beregnes i tidssonen **Europe/Oslo** (`YYYY-MM-DD`).
2. En stabil hash av strengen `fembokstav:{dato}:{dagnr}` (dagnr = dager siden 2024-01-01) gir et heltall.
3. Modulo lengden på svarlisten plukker ordet.

Alle som spiller samme kalenderdag (Oslo-tid) får samme ord.

## Prosjektstruktur

```
fembokstav/
├── index.html
├── css/style.css
├── js/game.js
├── js/wordlists.js
├── words/answers.json
├── words/guesses.json
├── words/ATTRIBUTION.txt
├── assets/logo.png
├── tests/fembokstav.spec.js
├── playwright.config.js
├── LICENSE
└── README.md
```

## Tester

```bash
npm install
npx playwright install chromium
npx playwright test
```

## Lisens

- **Spillkode:** fri bruk (se `LICENSE`).
- **Ordliste:** **CC-BY 4.0** – Norsk ordbank / Nasjonalbiblioteket (via [Ondkloss/norwegian-wordlist](https://github.com/Ondkloss/norwegian-wordlist)). Navngivelse kreves.

Laget for **AndersMish**.
