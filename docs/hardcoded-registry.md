# Registro degli hardcode

Regola 4 di `CLAUDE.md`: ciò che è hardcoded perché andrà implementato in futuro vive **nel corpo della funzione-API che lo servirà**, marcato con `// HARDCODED: …`, e ha una riga qui. Quando lo si implementa davvero, si cambia solo il corpo della funzione e si toglie la riga.

Verifica rapida che il registro sia completo: `grep -rn "HARDCODED" apps packages` deve trovare gli stessi punti elencati qui.

## Hardcode

| # | Cosa | Funzione (modulo) ↔ endpoint | Valore oggi | Diventerà |
| --- | --- | --- | --- | --- |
| 3 | Regole delle scadenze IVA | `getVatRules` (lookups) ↔ `GET /api/lookups/vat-rules` | trimestre → 16/05, 20/08, 16/11, 16/02 dell'anno dopo; weekend → lunedì; nessuna festività né proroga | **spariranno** quando l'IVA delle righe si pagherà alla data di pagamento ([sponsor-e-fondi.md](sponsor-e-fondi.md)); oggi le usano solo le righe del budget |
| 4 | Orizzonte del report IVA per area | `vatReportHorizon` dentro `getSettings` (lookups) ↔ `GET /api/lookups/settings` | dal 3° trimestre 2026 al 4° 2027 (si allarga da solo intorno alle date) | sparirà con la stessa modifica (il report diventerà per mese di pagamento) |
| 5 | Stagione corrente | `getCurrentSeason` (seasons) ↔ `GET /api/seasons/current` | 2026-2027 | elenco stagioni, selettore, creazione della nuova stagione ([stagioni-anni-fiscali-e-macchine.md](stagioni-anni-fiscali-e-macchine.md)) |
| 6 | Fuso orario della squadra, per sapere che giorno è «oggi» | `today` (core) ↔ un'impostazione della pagina Settings | `Europe/Rome` | un'impostazione di Settings, se una squadra non sta in Italia ([controllo-bug-e-prestazioni.md](controllo-bug-e-prestazioni.md), P2) |
| 7 | Aliquota IVA che certi tipi di sponsor non scelgono: merce senza IVA **0%**, merce con controfattura **11%** | `getFixedSponsorRates` (lookups) ↔ `GET /api/lookups/sponsor-rates` | `gift` 0, `gift_vat` 11 | un valore della pagina Settings (oggi l'11% degli inflow è un'impostazione a parte, `inflowVatRate`) |

### Implementati (26 ottobre 2026)

Erano le righe 1, 2, 4, 6, 7 e 8: ora stanno nel database e li cambia l'admin dalla pagina **Settings** ([impostazioni.md](impostazioni.md)). Le funzioni sono le stesse, è cambiato solo il loro corpo.

| Cosa | Funzione | Tabella |
| --- | --- | --- |
| Categorie (e il loro ordine) | `listCategories` | `category` |
| Aliquote IVA | `listVatRates` | `vat_rate` |
| Impostazioni di calcolo: soglia di TOTAL, IVA sugli inflow, IVA con sponsor totale (Q1), confronti con BANK (Q2) | `getSettings` | `setting` |
| Sedi e stanze | `listLocations` | `location` |
| Unità di misura | `listUnits` | `unit` |
| Campi facoltativi per categoria | `getCategoryFields` | `category_field` |

I valori con cui partono sono quelli del vecchio foglio (`LOOKUP_DEFAULTS` in `apps/api/src/modules/lookups/defaults.ts`, gli stessi della migrazione `0010`): li usano i test e la riconciliazione col foglio.

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
