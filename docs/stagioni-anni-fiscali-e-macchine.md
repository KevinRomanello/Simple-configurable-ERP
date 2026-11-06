# Stagioni, anni solari e macchine

**Stato: implementato e provato** (6 novembre 2026). Sostituisce il piano del 22 ottobre, che dava stagione e anno fiscale come etichette calcolate sulle voci. Dopo il confronto con l'utente del 5–6 novembre la stagione è diventata **la vista intera del sito**, scelta nel menù.

## 1. Cosa si vede

- **Il selettore della stagione.** Nel menù, sotto «E-Agle TRT», c'è «Budget 2026-2027 ▾». Cliccandolo si apre l'elenco delle stagioni, la più recente in alto, ciascuna con la sua macchina. Scegliendone una **cambia tutto il sito**: le aree, CASH FROM, BOUGHT FROM, CASH FLOW, i Gantt, le analisi, TOTAL, PENDING e le statistiche dell'inventario.
  - La scelta resta in quel browser (`localStorage`, chiave `erp.season`).
  - Scegliendo la stagione di oggi, la scelta si dimentica: il settembre successivo il sito passa da solo alla stagione nuova.
  - Sul telefono il selettore sta nel pannello del menù; la barra in alto dice solo quale stagione si sta guardando. Dopo la scelta il pannello si chiude da solo, come dopo un cambio di pagina.
- **La striscia gialla.** In cima a ogni pagina compare quando si guarda una stagione diversa da quella di oggi: «You're looking at the season 2025-2026 (Car EG-25)», con il pulsante **Back to 2026-2027**. Compare anche quando la stagione è in sola lettura, e lo dice.
- **La colonna CAR.** Nella griglia di un'area sta accanto a PRIORITY.
  - In grigio c'è la macchina della stagione: è la scelta automatica.
  - Una macchina scelta a mano (per esempio un pezzo per la macchina vecchia) ha l'etichetta arancione.
  - Il campo **Car** c'è anche nel modulo «Add item» e nel modulo di modifica del telefono. Sulla scheda del telefono l'etichetta dice «for EG-25».
- **Settings › Seasons and cars** (solo admin). È la tabella delle stagioni:
  - date, macchina (si rinomina sul posto), casella **READ-ONLY**, numero di righe del budget;
  - il pulsante **New season**: si sceglie l'anno di settembre in cui parte e il nome della macchina.
- **Views › CALENDAR YEARS.** È l'unica pagina che non segue il selettore. Riunisce tutte le stagioni e divide gli acquisti per **anno solare** (1 gennaio – 31 dicembre), secondo la data d'acquisto. Per EXPECTED e ACTUAL mostra GRAND TOTAL, OUTFLOW e VAT (TEAM); la riga «No date yet» raccoglie le voci senza data; in fondo c'è il TOTAL.
- **INVENTORY STATS.**
  - Contano ciò che è **arrivato o è stato usato nei giorni della stagione scelta**, mentre lo scaffale è sempre quello di oggi.
  - C'è il taglio nuovo **By car**: compra e «on its way» per la macchina a cui ogni acquisto è destinato. I prelievi non dicono su che macchina vanno, quindi lì non contano.
- **Arrivo fuori budget.** Il modulo ha il campo **Car**: di base è la macchina della stagione della data d'arrivo, e se ne può scegliere un'altra. Un arrivo dal budget prende la macchina della sua riga.

## 2. Le regole

| | Regola |
| --- | --- |
| **Stagione** | 1 settembre – 31 agosto, nome «2026-2027». Ogni stagione ha il suo budget: progetti, righe, sponsor, inflow, BANK. Fornitori, aree, impostazioni e inventario sono di tutte |
| **Stagione di oggi** | l'ultima già cominciata (se non ne è cominciata nessuna, la prima). È quella che si vede senza scegliere niente, ed è quella che usano il caricatore e il seed |
| **Macchina** | ogni stagione ha la sua (`season.car`, la si cambia in Settings). Una voce è per la macchina **della stagione del budget in cui sta**, a meno che non se ne scelga un'altra. Scegliere la macchina della propria stagione equivale a non scegliere (si salva vuoto) |
| **Comprare per la macchina vecchia** | la riga resta nel budget della **stagione in corso** e la pagano i fondi in corso, perché i soldi escono adesso; si sceglie solo la macchina. Il 6/11/2026 si è scartata l'idea di tornare alla stagione vecchia e comprare da lì: la riga sarebbe stata pagata dai fondi del 2025-26 e sarebbe finita nel loro CASH FLOW e BANK |
| **Cambiare macchina** | non sposta soldi: cambia solo il gruppo in cui la voce compare (By car) |
| **Arrivi** | dal budget: la macchina della riga (scelta, oppure quella della stagione della riga). Fuori budget: quella scelta nel modulo, altrimenti quella della stagione della data. Due stagioni con lo stesso nome di macchina sono una macchina sola (By car le somma) |
| **Sola lettura** | una stagione con READ-ONLY rifiuta con 409 ogni modifica al suo budget: progetti, righe, sponsor e loro soldi, inflow, BANK. Leggere va sempre bene, e l'inventario non è toccato (gli arrivi delle sue righe si registrano lo stesso). Il sito nasconde i comandi di modifica e la striscia gialla lo dice. Per correggere, l'admin la riapre |
| **Nuova stagione** | parte dalla più recente, per comodità: **gli stessi progetti** (vuoti) e **gli stessi sponsor** (senza i loro soldi), più un Team's fund suo. Righe, inflow e BANK partono vuoti. Si può creare anche una stagione passata (per caricare un vecchio foglio) |
| **Anno solare** | ogni fase va nell'anno della **sua** data d'acquisto (EXPECTED e ACTUAL possono cadere in anni diversi). Una fase senza niente scritto non conta; una con dati ma senza data va in «No date yet». VAT (TEAM) è l'IVA che il team paga di tasca sua, contata anch'essa sulla data d'acquisto (non sulla scadenza) |

## 3. Come funziona dentro

- **Il browser** manda la stagione scelta in ogni richiesta, nell'header `X-Season: <id>` (`apps/web/src/lib/seasonChoice.ts` e `api/client.ts`). Cambiando stagione si ricaricano tutti i dati tranne chi è collegato (`useChooseSeason` in `lib/season.ts`). Le pagine si rimontano, così un modulo lasciato aperto non scrive nella stagione nuova (la chiave dell'`Outlet` in `Shell.tsx`).
- **L'API** legge l'header in un hook (`addSeasonHook` in `seasons.routes.ts`) e lo mette in un `AsyncLocalStorage`, come già fa con l'utente.
  - `getCurrentSeason()` lo legge: è cambiato **solo il corpo** di quella funzione (regola 4), e tutti i servizi che la chiamavano funzionano su ogni stagione senza altre modifiche.
  - Senza header vale la stagione di oggi. Un header che non è un numero dà 400; una stagione che non esiste dà 404 (il browser che ne ricorda una sparita torna da solo a quella di oggi).
- **La sola lettura** la controlla `assertSeasonOpen` in ogni scrittura di budget (`budget.service.ts`, `funds.service.ts`, `cashflow.service.ts`), sulla stagione della riga toccata, non su quella dell'header.
- **Le statistiche dell'inventario.** Il motore (`stats` in `packages/calc/src/inventory.ts`) riceve il periodo della stagione e, per By car, la macchina di ogni arrivo. Quest'ultima la calcola l'API con una sola query: macchina scelta sull'arrivo, altrimenti quella della riga, altrimenti la stagione della riga, altrimenti la stagione della data (`receiptCars` in `stats.service.ts`).
- **L'anno solare.** `GET /api/views/calendar-years` calcola le righe di ogni stagione con il proprio snapshot (ognuna con i suoi fondi) e le passa a `calendarYears` (`packages/calc/src/calendarYears.ts`).
- **Il report IVA per area** parte dai trimestri della stagione mostrata (dal 3° trimestre del primo anno al 4° del secondo; prima era fisso sul 2026-27).

## 4. API

| Metodo | Percorso | Cosa |
| --- | --- | --- |
| `GET` | `/api/seasons` | tutte le stagioni, la più recente prima: `car`, `readOnly`, `current` (quella di oggi), `lines` (righe del budget) |
| `GET` | `/api/seasons/current` | la stagione su cui lavora la richiesta (quella dell'header, o quella di oggi) |
| `POST` | `/api/seasons` | admin: `{ startYear, car }`. Crea la stagione che parte a settembre di `startYear`, a partire dalla più recente. 409 se esiste già |
| `PATCH` | `/api/seasons/:id` | admin: `{ car?, readOnly? }` |
| `GET` | `/api/views/calendar-years` | gli acquisti di tutte le stagioni per anno solare |
| `PATCH` | `/api/lines/:id`, `POST /api/projects/:id/lines` | accettano `carSeasonId` (l'id della stagione di cui è la macchina; `null` = quella della propria stagione). Una macchina che non esiste dà 409 |
| `POST` | `/api/inventory/receive` | accetta `carSeasonId` solo per gli arrivi fuori budget (con `lineId` dà 400) |
| `GET` | `/api/inventory/stats?by=car` | il taglio per macchina; ogni risposta dice anche `season` (nome e date) |

## 5. Database

Migrazione `0017_seasons_and_cars.sql`:

- `season.car` (testo, obbligatorio; le stagioni che c'erano prendono «Car 2026-2027», da rinominare in Settings) e `season.read_only` (falso di base);
- `budget_line.car_season_id` e `stock_movement.car_season_id`: la stagione di cui è la macchina, vuoto = automatico, con i loro indici;
- il trigger dello storico su `season`: creazione, cambio di macchina e di sola lettura finiscono nella History.

## 6. Il caricatore del foglio

`load -- --season=2025-2026 "/app/fonti/Budget 25-26.xlsx"` carica un foglio nella stagione con quel nome, che va creata prima in Settings. Senza `--season` carica nella stagione di oggi. Comandi completi in [avvio.md](avvio.md).

Da questo lavoro `--replace` **non cancella più i fornitori**: sono di tutte le stagioni, quindi quelli che ci sono (in qualunque grafia) si riusano e si aggiungono solo i nuovi. Prima li cancellava tutti, e con due stagioni avrebbe rotto le righe dell'altra.

## 7. Limiti

- Le macchine sono un nome per stagione, non una tabella a parte: una macchina che corre due stagioni si scrive uguale nelle due (By car le somma).
- Una stagione non si cancella dal sito.
- Rinominare uno sponsor di merce rinomina il fornitore, che è di tutte le stagioni ([sponsor-e-fondi.md](sponsor-e-fondi.md), §3bis): la copia di quello sponsor nell'altra stagione resta col nome vecchio e non è più collegata. Basta rinominare anche lei.
- I **prelievi** dallo scaffale non dicono su che macchina vanno (scelta del 5/11/2026: non ora).
- La pagina CALENDAR YEARS mostra la striscia gialla se si sta guardando un'altra stagione, anche se non ne dipende (lo dice la descrizione della pagina).
- Le date di inizio e fine (1/9 – 31/8) sono una regola scritta nel codice: [hardcoded-registry.md](hardcoded-registry.md).

## 8. Prove

- `apps/api/src/modules/seasons/seasons.routes.test.ts` (12 test):
  - elenco e stagione di oggi (anche con una stagione futura e una passata);
  - nuova stagione copiata dalla più recente, senza righe né soldi, con la vecchia intatta; doppione 409, pm 403, valori non validi 400;
  - l'header cambia letture e scritture; header non valido 400, stagione inesistente 404;
  - macchina rinominata (solo admin) e registrata nello storico;
  - sola lettura: 12 scritture diverse rifiutate con 409, lettura possibile, riapertura;
  - macchina della riga: scelta, la propria che si salva vuota, inesistente 409;
  - anno solare su due stagioni, con le voci senza data;
  - statistiche per macchina e per stagione; macchina rifiutata su un arrivo dal budget.
- `packages/calc/src/calendarYears.test.ts` (2) e `inventory.test.ts` (3 nuovi): fasi in anni diversi, voci senza data, periodo della stagione con lo scaffale intero, By car, due stagioni con la stessa macchina.
- `apps/web/src/lib/lineEdit.test.ts` e `newLine.test.ts`: la macchina nel modulo di modifica e in quello nuovo.
- **Mutazioni:** togliendo il filtro del periodo falliscono 3 test del motore; spegnendo il controllo di sola lettura fallisce quello dell'API.
- **Browser**, 6/11/2026, su computer (1440 px) e telefono (375 px), tema scuro:
  - stagione 2025-2026 creata da Settings, con i progetti copiati;
  - selettore e striscia, riga con la macchina dell'altra stagione (etichetta arancione);
  - report IVA con le scadenze della stagione e pagina CALENDAR YEARS;
  - sola lettura, che nasconde i comandi;
  - INVENTORY STATS by car;
  - sul telefono: selettore nel pannello, scheda con «for Car …», niente pagina più larga dello schermo.

  Due difetti trovati e corretti: sul telefono l'elenco delle stagioni si sovrapponeva al menù (la testata si restringeva) e il pulsante della striscia era giallo su giallo nel tema scuro. La stagione di prova è stata poi tolta, per id.
