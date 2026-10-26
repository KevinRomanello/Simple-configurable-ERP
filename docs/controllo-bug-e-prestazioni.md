# Controllo di bug e prestazioni (26 ottobre 2026)

Un controllo a fondo di tutta l'app, fatto **senza modificare il codice**: cosa è stato provato, cosa va bene, e i problemi trovati con la soluzione proposta. Il via è arrivato il 26 ottobre 2026 per la lista «Subito» (§3): **P1, P2, P4, P5, P7, P10 e i due import di P11 sono corretti** (sotto, per ciascuno: cosa è stato fatto, la misura prima e dopo, e dove sono le prove). Restano aperti P6, P8, P9, il linter e P3 (da lasciare così), che aspettano una decisione.

## 1. Cosa è stato controllato

| Controllo | Come | Esito |
| --- | --- | --- |
| Errori nel browser | tutte le 22 pagine del menù, un articolo, un componente e una pagina inesistente, con la console registrata | **nessun errore né avviso** |
| Tempo di apertura delle pagine | dal clic al titolo con i dati, nel browser | tutte sotto i **200 ms** |
| Tempi dell'API | 20 chiamate principali, 7 volte ciascuna, con i dati attuali (52 righe, 20 articoli) | mediana sotto i **7 ms** per tutte |
| Il motore di calcolo con molti dati | budget sintetici di 50, 500, 2.000 e 8.000 righe (con 20 sponsor, fondi in gruppo, 60 fornitori, 24 mesi) | **cresce in modo lineare**: a 8.000 righe il calcolo più lento (analisi per fornitore) è 81 ms |
| Il calcolo dell'inventario con molti dati | 20, 200, 1.000 e 2.000 articoli con 34, 2.000, 10.000 e 40.000 movimenti | **non lineare**: vedi P4 |
| Test | tutte le suite, poi quella dell'API in 5 ordini casuali (fra cui i tre che erano falliti il 22 ottobre) | **tutti verdi** (168 + 240 + 54 + 3); i tre fallimenti isolati non si ripresentano |
| Regole degli hook di React e codice inutilizzato | un linter (ESLint con `react-hooks`) lanciato a parte, non installato nel progetto | **nessun errore**; due import inutilizzati (P11) |
| Indici del database | le chiavi esterne senza indice, letto da PostgreSQL | 9 chiavi esterne senza indice (P7) |
| Dipendenze | `pnpm audit --prod` | 8 avvisi, nessuno alto (P10) |
| Soldi e date | ricerca nel codice di numeri con la virgola sui soldi e di date locali | soldi solo in interi; date ISO nel calcolo; **una data in UTC** (P2) |
| Immagini | intestazioni delle risposte | servite con `ETag` e caricate solo quando si vedono: va bene |
| Valori doppi e vincoli del database | gestione degli errori dell'API | un doppione diventa `409`, un valore fuori misura `400`: va bene |

## 2. I problemi, dal più importante

| # | Problema | Gravità | Stato |
| --- | --- | --- | --- |
| P1 | Il modulo «New project» resta aperto cambiando area | media (bug) | **fatto** |
| P4 | L'elenco dell'inventario rallenta in modo quadratico | media (prestazioni, in futuro) | **fatto** |
| P5 | Le pagine del budget bloccano il browser dopo ogni modifica | media (prestazioni) | **fatto** (resta l'apertura, vedi sotto) |
| P2 | «Oggi» per l'API è in UTC | bassa (bug) | **fatto** |
| P7 | Mancano alcuni indici del database | bassa (prestazioni, in futuro) | **fatto** |
| P10 | Avvisi di sicurezza su una dipendenza | bassa | **fatto** |
| P6 | Il sito si scarica tutto al primo accesso (2 MB) | bassa (prestazioni) | aperto |
| P8 | La pagina Settings fa molte query piccole | bassa (prestazioni) | aperto |
| P9 | CASH FLOW calcola le righe quattro volte | bassa (prestazioni) | aperto |
| P11 | Due import inutilizzati, nessun linter nel progetto | bassa (manutenzione) | import **fatti**; linter aperto |
| P3 | Rinomina di una categoria mentre si salva una riga | bassa (raro) | proposta: lasciarlo così |

### P1. Il modulo «New project» resta aperto cambiando area

**Cosa succede.** In un'area si preme **New project** e si scrive un nome; poi si passa a un'altra area dal menù. Il modulo resta aperto con il nome già scritto, e premendo **Add project** il progetto viene creato **nella nuova area**, non in quella dove lo si era cominciato. Verificato nel browser (MT + DMT → SW).

**Perché.** Tutte le aree usano la stessa pagina (`AreaPage`): cambiando area React non la ricrea, quindi lo stato «modulo aperto» di `PageHeader` resta. Succederebbe a qualunque pagina con il pulsante giallo che serve più indirizzi.

**Soluzione proposta.** Nel modello `PageHeader` (`apps/web/src/components/ui/PageHeader.tsx`): il modulo si chiude quando cambia l'indirizzo della pagina (`useLocation`). Una riga, e vale per tutte le pagine presenti e future.

**Prova.** Nel giro del browser ([collaudo.md](collaudo.md)): aprire il modulo, cambiare area, il modulo è chiuso.

**Fatto (26 ottobre 2026).** Più in grande di quanto proposto: invece di chiudere il modulo dentro `PageHeader`, il `Shell` (`apps/web/src/components/Shell.tsx`) dà alla pagina una **chiave uguale all'indirizzo** (`<Outlet key={pathname} />`): cambiando indirizzo, React butta la pagina vecchia e ne crea una nuova. Vale per **ogni** cosa che le pagine tengono in memoria, non solo per quel modulo: la stessa pagina serve tutte le aree, tutti gli articoli, tutti i componenti, le due fasi del Gantt, e senza la chiave anche il modulo «aggiungi parte» di un componente sarebbe rimasto aperto passando a un altro componente. Cambiare solo i filtri dell'indirizzo (`?basis=…`) non ricrea la pagina. Provato nel browser: modulo aperto in MT + DMT, passo a SW, il modulo è chiuso e il pulsante dice di nuovo «New project»; tutte le 22 pagine del menù, un articolo e un componente si aprono senza errori in console, e Download elenca ancora tabelle e grafici della pagina.

### P2. «Oggi» per l'API è in UTC

**Cosa succede.** L'API calcola la data di oggi con `new Date().toISOString()` (`apps/api/src/core/today.ts`), cioè in UTC, e il contenitore Docker non ha un fuso orario. Fra mezzanotte e l'1 (le 2 d'estate), ora italiana, per l'API è ancora ieri. Questo tocca:

- i **giorni di attesa** in PENDING (`pendingLines(lines, today())`);
- il prezzo **«di oggi»** di articoli, componenti e statistiche quando non si sceglie un giorno.

Il sito invece usa già l'ora locale (`apps/web/src/lib/today.ts`).

**Soluzione proposta.** `today()` scrive la data **nell'ora locale**, come fa il sito, e il contenitore dell'API (in `docker-compose.yml` e in produzione) ha `TZ=Europe/Rome`. Il fuso è una scelta della squadra: va nel [registro degli hardcode](hardcoded-registry.md) se un giorno dovrà essere un'impostazione.

**Prova.** Un test di `today()` con un istante dato: le 23:30 UTC del 26 ottobre sono già il 27 a Roma.

**Fatto (26 ottobre 2026), in modo un po' diverso dalla proposta.** Invece di dipendere dal fuso del contenitore (`TZ` in `docker-compose.yml` e in produzione, che si può dimenticare), `today()` (`apps/api/src/core/today.ts`) scrive il fuso **dentro la funzione**: `Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" })` dà la data come `AAAA-MM-GG`. Così il risultato è lo stesso su qualunque computer e contenitore, ed è un hardcode della regola 4: marcato `// HARDCODED:` e con la sua riga nel [registro](hardcoded-registry.md) (riga 6). Prove (`core/today.test.ts`, 4): le 23:30 UTC del 26 ottobre sono già il 27 (ora solare) e le 22:30 UTC del 1 luglio il 2 (ora legale); un'ora prima (22:30 e 21:30 UTC) è ancora lo stesso giorno; la notte di capodanno passa all'anno nuovo; e il risultato non cambia se il computer è in un altro fuso (Los Angeles).

### P3. Rinomina di una categoria mentre si salva una riga

**Cosa succede.** Se l'admin rinomina una categoria nello stesso istante in cui qualcuno salva una riga del budget o un articolo con il nome vecchio, la riga può restare con il nome vecchio, che non è più nell'elenco: non comparirebbe nei blocchi di TOTAL e del Gantt finché non le si sceglie di nuovo la categoria.

**Perché.** Il controllo della categoria e il salvataggio della riga non bloccano la categoria nel database.

**Soluzione proposta.** **Lasciarlo così**: serve che due persone facciano esattamente queste due cose nello stesso istante, e si ripara riscegliendo la categoria. Se un giorno servisse: leggere la categoria con `SELECT … FOR SHARE` nella stessa transazione del salvataggio, oppure collegare righe e articoli alla categoria con una chiave esterna invece che con il nome.

### P4. L'elenco dell'inventario rallenta in modo quadratico

**Cosa succede.** Misure del calcolo di `GET /api/inventory/items` con dati sintetici:

| Articoli | Movimenti | Tempo |
| ---: | ---: | ---: |
| 20 | 34 | 6,5 ms |
| 200 | 2.000 | 5 ms |
| 1.000 | 10.000 | 110 ms |
| 2.000 | 40.000 | **823 ms** |

Oggi l'inventario è piccolo e non si nota; con qualche anno di arrivi e prelievi diventa lento.

**Perché.** Per **ogni** articolo si scorrono **tutti** i movimenti, più volte: `costContext` (`receiptsOf` per ogni articolo), e in `listItems` (`apps/api/src/modules/inventory/items.service.ts`) `onHandMilli`, `receivedMilli` e i posti. Il costo è articoli × movimenti.

**Soluzione proposta.** Raggruppare i movimenti per articolo **una volta sola** (una `Map` da articolo a movimenti, e lo stesso per le righe di giacenza) e poi leggere da lì. Il calcolo resta identico, solo più veloce: atteso sotto i 50 ms anche a 2.000 articoli e 40.000 movimenti. La modifica è piccola, in `packages/calc/src/inventory.ts` e in `items.service.ts`.

**Prova.** I test dell'inventario che ci sono già (gli stessi numeri), più la stessa misura di prima e dopo, riportata qui.

**Fatto (26 ottobre 2026).** `byItem` (`packages/calc/src/inventory.ts`) raggruppa le righe per articolo **una volta sola**; `costContext`, `stats` e `listItems` leggono da lì invece di filtrare tutti i movimenti per ogni articolo. Il calcolo è lo stesso, solo non si rileggono i dati. Misura del calcolo dell'elenco con dati sintetici (script temporaneo, stessa forma di dati prima e dopo; i numeri calcolati sono **identici**, controllati con una somma di controllo):

| Articoli | Movimenti | Prima | Dopo |
| ---: | ---: | ---: | ---: |
| 200 | 2.000 | 6,7 ms | 1,1 ms |
| 1.000 | 10.000 | 99 ms | 3,6 ms |
| 2.000 | 40.000 | **243 ms** | **12 ms** |

(I 823 ms del controllo iniziale erano con un'altra forma di dati: più movimenti per posto.) Prove: `byItem` ha due test nuovi in `inventory.test.ts` (raggruppa mantenendo l'ordine; i prezzi di `costContext` sono quelli di `receiptsOf` articolo per articolo) e tutti i test dell'inventario di prima passano.

### P5. Le pagine del budget bloccano il browser dopo ogni modifica

**Cosa succede.** Aprendo MT + DMT (7 progetti, 7 griglie) il browser resta bloccato per circa **0,3 secondi** (due blocchi da 235 e 74 ms, misurati con i «long task» del browser). Il titolo compare subito, ma la pagina non risponde finché le griglie non sono pronte. Dopo **ogni modifica** di una cella i dati si ricaricano e tutte le griglie dell'area riadattano tutte le colonne. Il costo cresce con il numero di progetti.

**Perché.** Ogni griglia disegna tutte le colonne (`suppressColumnVirtualisation`, necessario per misurarle) e le misura tutte a ogni aggiornamento dei dati (`onRowDataUpdated → autoSizeAllColumns`, in `apps/web/src/pages/AreaPage.tsx`).

**Soluzione proposta.**

1. Adattare le colonne solo quando serve davvero: alla prima apertura, quando cambiano le colonne (ALSO FROM che compare) o quando cambia il numero di righe; **non** a ogni ricarica dei dati dopo una modifica.
2. Misurare di nuovo. Se con molti progetti fosse ancora lento, creare le griglie solo quando entrano nello schermo. Va fatto con attenzione, perché il Download legge le griglie per esportarle.

**Prova.** La misura dei «long task» prima e dopo, riportata qui; il giro nel browser (le colonne restano della larghezza giusta, anche quando compare ALSO FROM).

**Fatto (26 ottobre 2026), ma la causa era un'altra.** Prima di toccare l'adattamento delle colonne l'ho misurato: una sola modifica (quantità di una riga di MT + DMT) bloccava il browser per **578 ms** (tre blocchi da 325, 163 e 90 ms). Contando le chiamate: le colonne **non** venivano ricostruite e l'adattamento girava **una volta sola** (la griglia modificata). Togliendolo i blocchi scendevano a 379 ms: quindi non era la causa principale. Il costo vero era un altro: a ogni rendering della pagina ogni progetto passava alla sua griglia **oggetti nuovi** (`defaultColDef` scritto dentro il JSX, la riga del subtotale rifatta ogni volta), e AG Grid, vedendoli cambiati, **riapplicava le colonne a tutte le 7 griglie**, anche a quelle dei progetti che non erano cambiati. La correzione (`apps/web/src/pages/AreaPage.tsx`): `DEFAULT_COL_DEF` è una costante e la riga del subtotale è calcolata solo quando il progetto cambia (`useMemo`). L'adattamento delle colonne è rimasto com'era (le colonne seguono il contenuto dopo ogni modifica).

| Misura nel browser (MT + DMT, 7 griglie) | Prima | Dopo |
| --- | --- | --- |
| Blocchi dopo aver salvato una quantità | 325 + 163 + 90 = **578 ms** (e 337 + 123 + 77 in un'altra prova) | **nessun blocco** sopra i 50 ms (due prove) |
| Apertura della pagina dal menù | 68 + 214 + 102 + 87 ≈ 470 ms | 68 + 228 + 91 + 90 ≈ 480 ms (**invariata**) |

L'apertura resta uguale, ed è la parte che il documento chiamava «seconda mossa» (creare le griglie solo quando entrano nello schermo): non l'ho fatta, perché è un costo **una tantum** (sono misure in sviluppo, con la modalità che disegna due volte; la versione di produzione è più rapida) e creare le griglie in ritardo complicherebbe Download, che le legge per esportarle. Se con molti progetti diventasse un problema, si parte da lì. Regola per chi scrive una pagina con AG Grid: **nessun oggetto o funzione scritti dentro il JSX per le proprietà della griglia** (`defaultColDef`, `columnDefs`, `pinnedBottomRowData`…): costanti o `useMemo`.

### P6. Il sito si scarica tutto al primo accesso

**Cosa succede.** Il primo caricamento scarica un unico file JavaScript da **2 MB** (590 KB compressi): contiene la griglia (AG Grid), i grafici e tutte le pagine, anche quelle che non si aprono. Il costruttore stesso lo segnala (`Some chunks are larger than 500 kB`). Le librerie del Download sono già separate e si scaricano solo quando servono.

**Soluzione proposta.** Caricare ogni pagina solo quando la si apre (`React.lazy` in `App.tsx`): la griglia arriva solo con le pagine del budget, i grafici solo con le viste. Il primo accesso si alleggerisce molto; le pagine successive si aprono come adesso.

**Prova.** La dimensione dei file prima e dopo, dal build; il giro nel browser.

### P7. Mancano alcuni indici del database

**Cosa succede.** Queste chiavi esterne non hanno un indice: `budget_line.project_id`, `line_fund.fund_id`, `line_figures.supplier_id`, `stock_movement.project_id`, `project.area_id`, `project.season_id`, `team_inflow.season_id`, `user_area.area_id`, `component_part.part_id`. Con i dati di oggi non cambia niente; quando crescono, i controlli «è usato?» (un fornitore, un fondo) e le cancellazioni a cascata (un progetto) devono leggere tutta la tabella.

**Soluzione proposta.** Una migrazione che aggiunge gli indici (con Drizzle, nella definizione delle tabelle in `schema.ts`). Facoltativo: un indice su `audit_log (table_name, id)` per la cronologia filtrata per tipo quando sarà grande.

**Prova.** La suite dell'API (gira sul database ricreato da zero, quindi prova la migrazione) e `EXPLAIN` delle query di controllo.

**Fatto (26 ottobre 2026).** I nove indici sono in `apps/api/src/db/schema.ts` e nella migrazione `0011_indexes_on_foreign_keys.sql` (nomi `budget_line_project`, `component_part_part`, `line_figures_supplier`, `line_fund_fund`, `project_area`, `project_season`, `stock_movement_project`, `team_inflow_season`, `user_area_area`). Applicata al database di sviluppo; la query del §4 ora dà **zero** chiavi esterne senza indice. Con `enable_seqscan` spento, `EXPLAIN` sceglie i nuovi indici (`Index Only Scan using line_fund_fund`, `budget_line_project`, `line_figures_supplier`: con tabelle così piccole il database userebbe comunque la lettura completa, quindi lo spegnimento serve solo a provare che l'indice è utilizzabile). L'indice facoltativo su `audit_log` **non serve**: c'è già `audit_log_table_row` su (tabella, riga), proprio per la cronologia filtrata per tipo. Chi ha già un database deve applicare la migrazione (`docker compose exec api pnpm db:migrate`); la suite dell'API la prova da zero a ogni esecuzione.

### P8. La pagina Settings fa molte query piccole

**Cosa succede.** `GET /api/settings` conta l'uso di ogni voce con una o due query per voce: circa 40 query (3,6 ms oggi). Il numero cresce con le voci.

**Soluzione proposta.** Cinque query raggruppate (`group by` per categoria, aliquota, unità, posto) in `apps/api/src/modules/settings/settings.service.ts`.

**Prova.** I test della pagina Settings che ci sono già (USED BY).

### P9. CASH FLOW calcola le righe quattro volte

**Cosa succede.** `GET /api/views/cashflow` calcola tutte le righe del budget quattro volte: per ognuna delle due fasi, una volta per il riepilogo e una per i saldi dei fondi. A 8.000 righe sono 42 ms: non è un problema, ma è lavoro inutile.

**Soluzione proposta.** Calcolare le righe una volta per richiesta e passarle (oppure ricordare il risultato per la stessa fotografia dei dati). Bassa priorità.

### P10. Avvisi di sicurezza su una dipendenza

**Cosa succede.** `pnpm audit --prod` trova 8 avvisi (4 moderati, 4 bassi), tutti su `fast-uri`, una dipendenza interna di Fastify (attraverso `fast-json-stringify` e `ajv`). Nessuno è alto, quindi la CI non si ferma. Riguardano la lettura di indirizzi web costruiti ad arte; l'API non ne legge da fuori, ma conviene comunque aggiornare.

**Soluzione proposta.** Forzare le versioni corrette (`fast-uri` 3.1.9 e 4.2.3 o successive) con `overrides` in `pnpm-workspace.yaml`, finché Fastify non le prende da sé.

**Prova.** `pnpm audit --prod` senza avvisi; la suite dell'API.

**Fatto (26 ottobre 2026).** Due `overrides` in `pnpm-workspace.yaml`, uno per ogni linea di versioni che Fastify usa (`fast-uri@>=3.0.0 <3.1.9` → 3.1.9, `fast-uri@>=4.0.0 <4.2.3` → 4.2.3). Dopo `pnpm install`: `pnpm why fast-uri` mostra 3.1.9 e 4.2.3, `pnpm audit --prod` dice **«No known vulnerabilities found»**, il contenitore ricostruito (`docker compose up -d --build`) ha le stesse due versioni e la suite dell'API passa. La riga è nello stesso elenco degli altri `overrides` ([produzione.md](produzione.md)): da riverificare quando esce un Fastify nuovo, e da togliere quando prende da sé le versioni giuste.

### P11. Due import inutilizzati, nessun linter nel progetto

**Cosa succede.** `SortAccessors` in `apps/web/src/pages/GanttPage.tsx` e `AREA_SHEETS` in `tools/import-xlsx/src/reconcile.ts` sono importati e non usati. Il progetto non ha un linter: ci sono due commenti `eslint-disable` per uno strumento che non gira mai.

**Soluzione proposta.** Togliere i due import. Facoltativo: aggiungere ESLint con le regole degli hook di React al progetto e alla CI. Oggi non trova errori, ma ferma in anticipo gli sbagli sugli hook, che il controllo dei tipi non vede. È una dipendenza in più, quindi da decidere (regola 3).

**Fatto (26 ottobre 2026): i due import** (`SortAccessors` in `GanttPage.tsx`, `AREA_SHEETS` in `reconcile.ts`), con il controllo dei tipi di tutti i pacchi pulito. **Il linter resta da decidere**: non l'ho aggiunto.

## 3. Proposta

| Subito | Facoltativo | Lasciare così |
| --- | --- | --- |
| P1, P2, P4, P5, P7, P10, i due import di P11 | P6, P8, P9, il linter di P11 | P3 |

Per ogni punto corretto: un test o una misura che lo riproduce **prima** della correzione, la correzione, la stessa prova dopo, e l'aggiornamento dei documenti che lo riguardano.

**Stato al 26 ottobre 2026**: la colonna «Subito» è fatta (con il linter e P6, P8, P9, P3 ancora da decidere). Dopo le correzioni: tutte le suite verdi (170 + 244 + 54 + 3), riconciliazione col foglio «All checks match», `pnpm audit --prod` pulito, nessun errore in console nelle 22 pagine.

## 4. Come rifare le misure

- **API**: entrare con l'accesso di sviluppo (`/api/auth/dev-login`) e chiamare ogni indirizzo più volte, prendendo la mediana.
- **Motore e inventario**: uno script che costruisce dati sintetici con i costruttori dei test (`packages/calc/src/fixtures.ts`) e misura le funzioni (`computeLines`, `totals`, `gantt`, `cashFlowSummary`, `analysisByFund`, `analysisBySupplier`, `itemsView`, `vatReport`; `costContext`, `unitCost`, `onHandMilli`, `receivedMilli`). Gli script del 26 ottobre erano temporanei e non sono nel progetto.
- **Browser**: `PerformanceObserver` sui `longtask` mentre si apre una pagina **e dopo aver salvato una cella** della griglia del budget (è lì che il blocco si vedeva); la console registrata durante un giro di tutte le pagine.
- **Indici**: chiavi esterne senza indice, da PostgreSQL (deve dare zero righe; da rifare quando si aggiunge una tabella):

```sql
SELECT c.conrelid::regclass AS tabella, a.attname AS colonna, c.confrelid::regclass AS punta_a
FROM pg_constraint c
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
WHERE c.contype = 'f'
  AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid AND i.indkey[0] = c.conkey[1])
ORDER BY 1, 2;
```
