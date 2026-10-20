# Piano d'azione v0 — parità con lo script, su database

Proposta del 20 ottobre 2026, da confermare prima di iniziare (regola 5). Comprime la prima parte del piano originale (`fonti/Piano d'azione — Budget e Inventario custom.md`): invece di otto fasi, un primo traguardo che replica lo script e lascia l'app pronta a ricevere la logica fatta bene nei giorni successivi.

## Stato (20 ottobre 2026)

| Blocco | Stato |
| --- | --- |
| B0 Fondamenta | fatto: `docker compose up` avvia db, api e web |
| B1 Schema e predisposizioni | fatto: 10 tabelle, migrazione, seed ripetibile, funzioni-API con hardcode, `runWrite` |
| B2 Motore di calcolo | fatto: 13 moduli |
| B3 Importer e riconciliazione | fatto: 1.995 confronti col foglio reale tutti coincidenti, anche rileggendo i dati dal database; foglio caricato nel database di sviluppo |
| B4 API di scrittura, B5 API delle viste | fatto: 43 test di integrazione |
| B6 Aree, B7 fondi/fornitori/cash flow, B8 viste | fatto: tutte le pagine del foglio, verificate nel browser con i dati reali |
| B9 Grafici | fatto: a colonne, sulle viste dove il foglio li aveva |
| Stile Figma | applicato (token, tipografia, componenti); navigazione, tabelle e grafici **non sono disegnati su Figma**: da rivedere ([stile-interfaccia.md](stile-interfaccia.md)) |

Test: 148 (99 motore, 43 API, 3 importer, 3 interfaccia). `pnpm reconcile` (anche `-- --db`) confronta il motore con il foglio reale.

**Fuori dalla v0, ancora da fare**: accesso con login e ruoli, storico delle modifiche, incolla multi-riga da Sheets, logo, test automatici dell'interfaccia, backup e deploy. L'app va usata solo in locale.

## Obiettivo

Un'app web su Postgres, in Docker, che fa quello che fa lo script (stesse regole, stessi numeri), con un codice in cui ogni cosa oggi fissa è già dietro la funzione che in futuro sarà l'API (regola 4): aggiungere la logica vera significa sostituire dei corpi di funzione, non riscrivere.

**Fatto quando:**

1. Importando `fonti/Budget 26-27.xlsx`, l'app mostra gli stessi numeri del foglio: importi di riga, saldi dei fondi, riepilogo CASH FLOW, TOTAL, scadenze IVA (tolleranza 0,005 € per riga).
2. Da interfaccia si può lavorare: aggiungere progetti e righe, modificare ogni campo, gestire fondi e contratti, fornitori, ingressi e BANK, e i numeri cambiano subito.
3. Ci sono tutte le viste del foglio, almeno come tabelle: 6 aree con report IVA, CASH FROM, BOUGHT FROM, CASH FLOW, EXPECTED e ACTUAL GANTT, TOTAL, CASH FROM ANALYSES, BOUGHT FROM ANALYSES, CATEGORY ANALYSES.
4. Ogni regola di [regole-script-attuale.md](regole-script-attuale.md) ha un test; niente di fisso fuori dalle funzioni-API; i documenti sono aggiornati.

## Quanto è difficile

Non è difficile: è **grande**. Il rischio è il tempo, non la fattibilità.

- La logica sono una dozzina di regole, i dati nel foglio d'esempio sono 52 voci. Le regole le ho già riprodotte sull'xlsx reale con uno script di prova e coincidono al centesimo (dettagli nel §0 delle regole): il rischio di "scoprire a metà che il foglio faceva altro" è basso.
- Le ore stanno nell'interfaccia (griglia in stile foglio, tendine, date) e nelle viste (Gantt, Total, tre analisi, report IVA), non nel calcolo.

| Parte | Difficoltà | Perché |
| --- | --- | --- |
| Schema e CRUD | Bassa | dieci tabelle, validazioni semplici |
| Motore di calcolo | Media | pochi casi particolari (IVA a carico del team, due confronti diversi con BANK), già chiariti |
| Importer dal foglio | Media | celle unite, righe gialle di subtotale, date come numeri seriali |
| Griglia stile foglio | Media-alta | decide se gli utenti lasciano Sheets: tastiera, tendine, date; l'incolla multi-riga è da verificare |
| Viste (Gantt, Total, analisi) | Media | tante ma meccaniche, la logica è nel motore |
| Grafici | Bassa-media | nel foglio ce ne sono 50, tutti a colonne |
| Login, storico, backup, deploy | Bassa-media | noti; non per domani |
| Inventario | Media | modulo nuovo, dopo |

## Perimetro

| Cosa | Priorità | Nota |
| --- | --- | --- |
| Tutte le regole di calcolo, schema, CRUD, importer e riconciliazione | Indispensabile | |
| Interfaccia: aree, fondi, fornitori, cash flow, tutte le viste come tabelle | Indispensabile | |
| Stile Figma | Indispensabile, ma bloccato | servono i link ai file ([stile-interfaccia.md](stile-interfaccia.md)); intanto token neutri in un unico punto |
| Grafici | Se avanza tempo | una volta che le tabelle sono giuste |
| Incolla multi-riga da Sheets | Dopo | verifica su AG Grid Community, come nel piano originale |
| Login Google e ruoli, storico modifiche, backup, deploy | Fuori | funzioni predisposte con valori fissi ([hardcoded-registry.md](hardcoded-registry.md)); l'app per ora va usata solo in locale |
| Inventario, tabelle `calc_*` e notebook Python, multi-stagione | Fuori | nel piano originale, dopo la parità |
| Risposte alle sette domande per il tesoriere | Fuori | il comportamento dello script è portato così com'è, ogni domanda è un'impostazione ([regole §15](regole-script-attuale.md#15-domande-aperte--dove-sono-isolate)) |

## Blocchi di lavoro, in ordine

Taglia: S ≈ 1 h, M ≈ 2 h, L ≈ 3 h di lavoro assistito (prove incluse). Sono stime mie, non misurate, con un margine di ±40%.

| Blocco | Cosa | Fatto quando | Taglia |
| --- | --- | --- | --- |
| B0 Fondamenta | pnpm workspaces, TypeScript, Vitest, `docker-compose.yml` (db, api, web), `.env.example`, `/api/health` | `docker compose up` da zero e la pagina mostra "API ok, DB ok" | S |
| B1 Schema e predisposizioni | schema Drizzle e migrazione, seed sintetico (aree, stagione, Team's fund, qualche riga), `runWrite`, `getCurrentUser`, `canWrite`, funzioni `lookups` con gli hardcode | migrazione e seed ripetibili; gli endpoint `lookups` rispondono | S |
| B2 Motore di calcolo | `packages/calc` come da [architettura](architettura.md#pacchetto-calc), in ordine: righe → IVA → subtotali → fondi → cash flow → Gantt → Total → analisi → elenco voci → report IVA | ogni regola ha test, compresi gli esempi del §17 delle regole | L |
| B3 Importer e riconciliazione | `tools/import-xlsx`: legge `fonti/Budget 26-27.xlsx` nel DB e confronta con i valori del foglio | TOTAL, saldi dei fondi, CASH FLOW e scadenze IVA coincidono; le differenze rimaste hanno una spiegazione scritta | M |
| **Traguardo 1** | **il motore riproduce il foglio reale, prima di avere un'interfaccia** | | |
| B4 API di scrittura | progetti, righe (con `version`), fondi e contratti, fornitori, ingressi, BANK | test di integrazione: crea progetto → riga → figure; 409 su versione vecchia e su eliminazione di fondo/fornitore in uso | M |
| B5 API delle viste | `loadSnapshot` e gli endpoint `/views/*` | sul seed ogni vista risponde e coincide con `calc` | S |
| B6 Web: guscio e aree | navigazione, `theme/`, una pagina per area con progetti, righe, subtotali, IVA a carico, report IVA, tendine, date | inserire una voce completa da interfaccia e vedere i numeri degli esempi | L |
| B7 Web: fondi, fornitori, cash flow | CASH FROM (contratti, riepilogo, flag IVA), BOUGHT FROM, CASH FLOW con BANK | gli stessi riepiloghi del foglio, aggiornati a ogni modifica | M |
| B8 Web: viste | Gantt stima e consuntivo, TOTAL, analisi per fondo e per fornitore, CATEGORY ANALYSES con i tre filtri | ogni vista mostra le stesse colonne del foglio | M |
| **Traguardo 2** | **parità funzionale** | | |
| B9 Grafici e rifiniture | grafici a colonne, evidenziazioni (rosso/verde, priorità), messaggi d'errore | | M |

Somma indicativa: circa 19 ore in serie. Il cammino critico (B0 → B1 → B2 → B5 → B6 → B8) è di circa 12 ore: dopo B1 il motore (B2), l'API di scrittura (B4) e il guscio web possono procedere in parallelo, e dopo B2 anche B3 e B5.

**Cosa significa per "domani"** — una giornata piena rende realistico il Traguardo 1 e l'interfaccia di aree, fondi e cash flow; arrivare alla parità completa (Traguardo 2) richiede il lavoro in parallelo di cui sopra o una seconda mattina. Se bisogna tagliare, si taglia dal fondo: grafici (B9), poi CATEGORY ANALYSES e analisi per fornitore, poi il report IVA. Il motore e l'importer non si tagliano.

## Verifica

- **Unitari** sul motore, con dati sintetici e i casi del §17 delle regole.
- **Riconciliazione** con il foglio reale (`pnpm reconcile`): legge `fonti/`, quindi non gira senza; nessun dato reale entra nei file tracciati.
- **Integrazione** dell'API su un Postgres di test.
- **A mano** nel browser: il percorso "nuovo progetto → voce → fondo → BANK → Gantt" confrontato con il foglio.

## Rischi

| Rischio | Cosa fa | Mitigazione |
| --- | --- | --- |
| Tempo | la parità completa non entra in un giorno in serie | ordine pensato per tagliare dal fondo; lavoro in parallelo se vuoi |
| Regole non scritte | i totali non tornano | già verificate sull'xlsx; riconciliazione automatica; test per ogni regola |
| Le risposte del tesoriere cambiano i numeri | rifare i conti | sono impostazioni, non codice sparso |
| Tabella "Team's fund" EXPECTED del foglio vuota | nessun valore atteso per quel pezzo | si verifica con i casi del §17; segnalo anche l'errore silenzioso dello script |
| Griglia meno comoda del foglio | gli utenti tornano a Sheets | AG Grid con tastiera e tendine; incolla multi-riga da verificare dopo |
| Figma non leggibile | stile in ritardo | token neutri in `theme/`, sostituibili senza toccare i componenti |
| App senza login | accesso a chiunque la raggiunga | solo in locale finché non c'è l'accesso con Google |
| Dati reali nel repository | fuga di nomi e importi | `fonti/` ignorata da git, fixture solo sintetiche (convenzione in `CLAUDE.md`) |

## Cosa mi serve da te

1. Il via al piano, o cosa cambiare. Le scelte che ho fatto e che puoi contestare: calcolo alla lettura invece delle tabelle `calc_*` (più semplice, si aggiungono dopo); due flag "paga IVA" per fondo (parità col foglio, Q5); importer subito dopo il motore, perché l'xlsx è l'oracolo; nessun login nella v0; Postgres e non Mongo.
2. **I link ai singoli file Figma** (le cartelle non bastano agli strumenti; il browser integrato non è collegato a Figma e non inserirò credenziali).
3. Se vuoi che lavori in parallelo con più agenti (accorcia, ma richiede che tu riveda più cose insieme).
4. Quando serve davvero "domani", così scelgo dove tagliare.

## Dopo la v0

In quest'ordine, riprendendo le fasi del piano originale: risposte del tesoriere (si cambia `getSettings()`), poi login Google e ruoli per area e storico modifiche (fase 2), inventario (fase 6), analisi esterne dagli endpoint `/views/*` o dalle tabelle `calc_*` (fase 5), backup, runbook e deploy (fasi 7 e sicurezza).
