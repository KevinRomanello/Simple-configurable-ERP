# Registro degli hardcode

Regola 4 di `CLAUDE.md`: ciò che è hardcoded perché andrà implementato in futuro vive **nel corpo della funzione-API che lo servirà**, marcato con `// HARDCODED: …`, e ha una riga qui. Quando lo si implementa davvero, si cambia solo il corpo della funzione e si toglie la riga.

Verifica rapida che il registro sia completo: `grep -rn "HARDCODED" apps packages` deve trovare gli stessi punti elencati qui.

## Hardcode

| # | Cosa | Funzione (modulo) ↔ endpoint | Valore oggi | Diventerà |
| --- | --- | --- | --- | --- |
| 1 | Categorie | `listCategories` (lookups) ↔ `GET /api/lookups/categories` | Components, Manufacturing, Consumable, Asset, Logistic, Administration, Software | tabella `category`, modificabile dall'admin; `budget_line.category` diventa chiave esterna |
| 2 | Aliquote IVA | `listVatRates` (lookups) ↔ `GET /api/lookups/vat-rates` | 0, 11, 22 | elenco configurabile |
| 3 | Regole delle scadenze IVA | `getVatRules` (lookups) ↔ `GET /api/lookups/vat-rules` | trimestre → 16/05, 20/08, 16/11, 16/02 dell'anno dopo; weekend → lunedì; nessuna festività né proroga | tabella `vat_rule` validata col commercialista (Q3) |
| 4 | Impostazioni di calcolo | `getSettings` (lookups) ↔ `GET /api/lookups/settings` | vedi sotto | tabella `setting` o pagina admin |
| 5 | Stagione corrente | `getCurrentSeason` (seasons) ↔ `GET /api/seasons/current` | 2026-2027 | elenco stagioni, selettore, creazione della nuova stagione |
| 6 | Sedi e stanze | `listLocations` (lookups) ↔ `GET /api/lookups/locations` | due sedi con cinque stanze ("Site 1 / Room 1"…), codici `s1-r1`… | tabella `location`, tenuta da un admin; i movimenti già registrati conservano il codice |
| 7 | Unità di misura | `listUnits` (lookups) ↔ `GET /api/lookups/units` | pcs, set, box, m, kg, g, l, ml | elenco configurabile |
| 8 | Campi facoltativi per categoria | `getCategoryFields` (lookups) ↔ `GET /api/lookups/category-fields` | per categoria, quali fra a cosa serve / codici di sicurezza / smaltimento / stoccaggio / manutenzione ([inventario.md](inventario.md#5-le-informazioni-di-un-articolo)) | tabella categoria × campo, modificabile dall'admin |

### Chiavi di `getSettings()`

| Chiave | Valore oggi | Domanda |
| --- | --- | --- |
| `varianceThreshold` | `0.15` (evidenzia oltre ±15% nel TOTAL) | — |
| `vatBaseWhenTotalSponsor` | `"net"` (IVA sull'intero netto; alternativa `"net-minus-sponsor"`) | Q1 |
| `bankCompare` | `{ summary: "day", timeline: "month" }` (come il foglio: due confronti diversi) | Q2 |
| `vatReportHorizon` | `{ from: "2026-Q3", to: "2027-Q4" }` (si estende da solo) | — |

L'arrotondamento (Q7) non è un'impostazione: il motore lavora in interi e arrotonda l'IVA al centesimo riga per riga (`roundDiv` in `packages/calc/src/money.ts`). Cambiarlo vuol dire cambiare quella funzione.

Le righe «utente corrente» e «permessi di scrittura» non ci sono più: sono **implementate** (login Google, JWT, ruoli per area: [accesso-e-storico.md](accesso-e-storico.md)).

## Elementi temporanei dello sviluppo

Non sono hardcode di funzioni-API, ma esistono solo in sviluppo e vanno tolti o spenti in produzione.

| Cosa | Dove | Come si spegne |
| --- | --- | --- |
| Accesso «Sign in as developer» | `GET /api/auth/dev-login` (auth), attivo solo se `DEV_LOGIN_EMAIL` è impostata | togli la variabile; **in produzione il server non parte** se c'è |
| `JWT_SECRET` e password del database di esempio (proprietario ed `erp_app`) | `.env.example` | in produzione si usano valori lunghi e casuali; l'API in produzione rifiuta di partire come superutente |

## Predisposizioni vuote

Funzioni che esistono già ma oggi fanno il minimo; non sono hardcode, ma sono il punto dove si innesta la funzionalità.

| Funzione | Oggi | Poi |
| --- | --- | --- |
| `runWrite(actor, fn)` (core) | apre la transazione e dice al database chi scrive (per lo storico, scritto dai trigger) | rigenera le tabelle `calc_*` nella stessa transazione |
| Aree | solo da seed | creazione di un'area (nel runbook) |

## Come si aggiunge una riga

Nuovo hardcode → funzione di servizio con la sua route → valore nel corpo, con `// HARDCODED: <cosa sarà>` → riga in questa tabella (cosa, funzione ↔ endpoint, valore, cosa diventerà).
