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
| 5 | Stagione corrente | `getCurrentSeason` (lookups) ↔ `GET /api/lookups/seasons/current` | 2026-2027 | elenco stagioni, selettore, creazione della nuova stagione |
| 6 | Utente corrente | `getCurrentUser` (auth) ↔ `GET /api/me` | admin fisso | login Google (OIDC) limitato al dominio del team |
| 7 | Permessi di scrittura | `canWrite` (auth) | sempre vero | ruoli admin / capo area / sola lettura, per area |

### Chiavi di `getSettings()`

| Chiave | Valore oggi | Domanda |
| --- | --- | --- |
| `varianceThreshold` | `0.15` (evidenzia oltre ±15% nel TOTAL) | — |
| `rounding` | `"per-line"` (al centesimo, per riga; il foglio non arrotonda) | Q7 |
| `vatBaseWhenTotalSponsor` | `"net"` (IVA sull'intero netto; alternativa `"net-minus-sponsor"`) | Q1 |
| `bankCompare` | `{ summary: "day", timeline: "month" }` (come il foglio: due confronti diversi) | Q2 |
| `vatReportHorizon` | `{ from: "2026-Q3", to: "2027-Q4" }` (si estende da solo) | — |

## Predisposizioni vuote

Funzioni che esistono già ma oggi fanno il minimo; non sono hardcode, ma sono il punto dove si innesta la funzionalità.

| Funzione | Oggi | Poi |
| --- | --- | --- |
| `runWrite(actor, fn)` (core) | apre la transazione | scrive `audit_log` e rigenera le tabelle `calc_*` nella stessa transazione |
| Aree | solo da seed | creazione di un'area (nel runbook) |

## Come si aggiunge una riga

Nuovo hardcode → funzione di servizio con la sua route → valore nel corpo, con `// HARDCODED: <cosa sarà>` → riga in questa tabella (cosa, funzione ↔ endpoint, valore, cosa diventerà).
