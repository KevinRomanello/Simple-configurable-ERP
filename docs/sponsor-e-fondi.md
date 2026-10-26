# Sponsor e fondi

**Stato: implementato e provato** (21 ottobre 2026). Nasce dalle risposte del tesoriere del 21 ottobre. Questo documento è la specifica: come si definisce uno sponsor, cosa fa il sito quando lo scegli in una riga del budget, come si pagano più fondi insieme, cosa succede con i soldi che entrano in cassa.

**Cambiato il 26 ottobre 2026**: uno sponsor è **sempre virtuale e copre sempre l'IVA** dei suoi acquisti (alla sua aliquota, 0% se non ne ha). Sono spariti «Money goes to» e «Pays VAT». I soldi che entrano nel conto del team non sono sponsor: si inseriscono **solo in CASH FLOW con New inflow**, e ogni inflow paga l'11% di IVA il primo giorno del trimestre successivo (§5).

## 1. L'idea

Uno sponsor è una voce di **CASH FROM**. Nella riga del budget scegli *con cosa paghi* (o pensi di pagare) e il sito fa il resto: quanto copre lo sponsor, che aliquota ha l'IVA, chi la paga, quando scade. Gli sponsor sono delle **scatole nere**: tutte le regole stanno nella loro definizione, nella riga non c'è niente da cliccare in più (le colonne SPONSOR e SPONSOR VALUE non ci sono più nella griglia, perché è già tutto in CASH FROM; quanto lo sponsor regala si legge nel suggerimento di OUTFLOW e nel totale SPONSOR VALUE dell'area).

## 2. Come si definisce uno sponsor

Pagina **CASH FROM**: il bottone giallo **New sponsor** in alto apre il form in un riquadro (nome, parametri e soldi del fondo); sotto, il riquadro **SPONSORS** è la tabella dove si modifica tutto sul posto, **soldi e data compresi**; i riquadri EXPECTED e ACTUAL mostrano solo i risultati (cosa resta di ogni fondo, gli ingressi per mese). Scrive solo l'admin (`GET`/`POST`/`PATCH`/`DELETE /api/funds`):

| Campo | Valori | Cosa decide |
| --- | --- | --- |
| Nome | testo, unico senza distinguere le maiuscole | come compare nelle tendine |
| Gives (`type`) | **Gives a fund** (A) · **Gives goods, no VAT** (B) · **Gives goods, VAT on the counter-invoice** (C) | come si copre la riga e chi paga l'IVA (§3) |
| VAT % (`vat_rate`) | 0, 11, 22 | l'aliquota di *tutti* gli acquisti pagati con quello sponsor, che il fondo copre. **Uno sponsor che non paga IVA si definisce con 0%**: non c'è una casella apposta. Per un regalo senza IVA (B) è sempre 0 |
| Group (`group_name`) | testo facoltativo | i fondi dello stesso gruppo possono pagare insieme una riga (§4) |
| I soldi (`contracts`) | **un valore e una data per fase**, nelle colonne EXPECTED e ACTUAL della riga dello sponsor (VALUE e ARRIVES) | quanto vale il fondo e quando arriva. Si cambiano sul posto; il valore vuoto toglie i soldi di quella fase, e la data si può mettere solo dopo il valore. Nel form del nuovo sponsor si inseriscono subito (per EXPECTED, ACTUAL o tutte e due: sponsor e soldi si salvano insieme o per niente). Uno sponsor che dà merce (B, C) non ha soldi: non è una somma. Prima i contratti erano righe da aggiungere una a una; la migrazione `0008` ha unito quelle doppie (somma e data più vecchia) |

L'aliquota la decide lo sponsor, non la riga. **Fa eccezione il fondo del team**: lì non c'è nessuno sponsor che la definisce e l'aliquota dipende dal fornitore (nel foglio reale ci sono righe del team allo 0% e al 22%), quindi resta la colonna VAT % da scegliere sulla riga.

## 3. I tre tipi (sponsor virtuali)

Esempio: una voce da 1.000,00 € netti.

| Tipo | Cosa succede | Sponsor | IVA | Outflow | Chi paga l'IVA |
| --- | --- | --- | --- | --- | --- |
| **A. dà un fondo** (22%) | la riga attinge dal fondo, IVA compresa | 0 | 220,00 | 1.220,00 | il **fondo**: copre anche i 220 e il team non paga niente (con 0% non c'è IVA) |
| **B. regalo, niente IVA** | la merce è gratis, la riga è coperta per intero | 1.000,00 | 0 | 0 | nessuno |
| **C. regalo con controfattura** (11%, pubblicità) | merce gratis, ma il team fattura la pubblicità e paga l'IVA sull'**intero valore** | 1.000,00 | 110,00 | 110,00 | il **team**, sempre |

L'IVA che il team paga di tasca sua è quindi solo quella delle righe pagate con il **fondo del team**, quella dei regali con controfattura (C) e l'11% sugli inflow (§5).

Il tipo C chiude la domanda **Q1** («sponsor totale: IVA sull'intero netto?»): sì, è voluto, e il motore già lo faceva (`vatBaseWhenTotalSponsor = "net"`).

## 4. Più fondi sulla stessa riga

Se un fondo non basta per una riga, **ne scegli un altro** (casella **ALSO FROM** accanto a CASH FROM) e la quota è il resto: non si digita, si calcola. Se anche così non basta se ne aggiunge un terzo, un quarto e così via: la casella resta lì finché la riga non è coperta.

- Il **primo** fondo copre fino a quello che gli resta; il successivo copre quello che avanza, e così via (uno dopo l'altro, fino a 10).
- Il **resto dei fondi si consuma nell'ordine del foglio** (area, progetto, posizione della riga), separatamente per previsto e consuntivo. Una riga più in alto consuma prima: modificarla può cambiare la quota delle righe sotto, anche in altre aree.
- **L'ultimo fondo prende comunque tutto quello che manca**: se non basta va in negativo (rosso, come il foglio) e la riga è segnalata: icona rossa a sinistra con la scritta («the funds are X € short»), cella CASH FROM rossa e cella ALSO FROM evidenziata.
- Ogni fondo mette **la sua aliquota** sulla parte che paga. Esempio: 1.000,00 € netti, A (22%, gruppo `g`, 600,00 € di contratto) e B (11%, gruppo `g`): A paga 600,00 con 132,00 di IVA, B paga 400,00 con 44,00; IVA totale 176,00.
- Il fondo consuma netto + IVA; per sapere quanto netto ci sta dentro si divide quello che gli resta per `1 + aliquota`. Con le sue aliquote, 100,00 € di fondo coprono 81,96 € netti a 22%.

Chi può stare insieme (controllato dal server, `400` con il motivo):

| Regola | Perché |
| --- | --- |
| stesso **gruppo** (non vuoto) per gli sponsor | «alcuni fondi sono accumulabili tra loro» |
| il **fondo del team** mai insieme ad altri fondi | i soldi del team non possono coprire quello che un fondo non basta (scelta del tesoriere, 23 ottobre 2026): se non basta si aggiunge un altro fondo dello stesso gruppo, e se non bastano tutti la riga resta segnalata. Il fondo del team paga una riga solo da solo |
| un **regalo** (B, C) solo da solo | copre già tutto |
| lo stesso fondo due volte, più di 10 fondi | un tetto di sicurezza: la catena continua finché la riga non è coperta |

La tendina di ALSO FROM, con la ricerca, propone solo i fondi dello **stesso gruppo** del primo (mai il fondo del team). La colonna **ALSO FROM non si vede** finché nessuna riga del progetto ne ha bisogno: compare nel progetto (per quella fase) solo quando una sua riga è corta o ha già più di un fondo, e sparisce quando non serve più. Nella riga la casella è modificabile se la riga è corta e c'è ancora un fondo compatibile, oppure se ha già più di un fondo; scegliere vuoto toglie i fondi in più.

## 5. I soldi che entrano nel conto: gli inflow

Fino al 26 ottobre 2026 esisteva anche uno sponsor «in cassa» (`mode = cash`). Non c'è più: **i soldi che entrano nel conto del team sono un inflow di CASH FLOW** (pulsante giallo **New inflow**: lato Expected o Actual, azienda, valore, data). Uno sponsor serve solo a pagare acquisti del budget.

- l'inflow conta in CASH FLOW e nel Gantt, nel mese della sua data;
- su **ogni** inflow il team deve **l'11% di IVA** (è una sponsorizzazione, fatturata; fissa per legge, la versano le ASD), che si paga **il primo giorno del trimestre successivo** alla data dell'inflow, a trimestri di calendario: un inflow del 9/1/2026 paga il 1/4/2026, uno del 10/12/2026 di 1.000,00 € paga 110,00 € il 1/1/2027, uno dell'1/4 paga l'1/7. Compare nell'IVA del team (CASH FLOW, riga *VAT* del Gantt), non nel report IVA per progetto;
- un inflow **senza data** non ha un giorno in cui pagare: l'IVA non compare finché non lo si data;
- non c'è una casella per escludere l'IVA: per il tesoriere tutti la pagano (scelta del 26/10/2026; aggiungerla sarebbe una colonna in più in `team_inflow`).

La migrazione `0009_one_kind_of_sponsor.sql` ha trasformato gli sponsor in cassa rimasti in inflow (un inflow per ogni contratto, con la stessa fase, valore e data) e poi ha tolto le colonne `mode` e `pays_vat` e il tipo `fund_mode`: nessun dato perso. Provata su una copia dei dati reali di quel giorno.

## 6. Dove sta il codice

| Cosa | Dove |
| --- | --- |
| le regole di tutto il §3 e §4 | `packages/calc/src/settle.ts` (`settleLine`): puro, in interi; la formula a un'aliquota di `lineAmounts` (`line.ts`) resta per le righe senza fondo |
| consumo dei fondi in ordine di foglio | `computeLines` in `packages/calc/src/lines.ts` |
| inflow e IVA dell'11% sugli inflow | `packages/calc/src/cash.ts` (`bankInflows`, `inflowVat`), con `firstDayOfNextQuarter` in `vat.ts`; usato da `cashflow.ts` e `gantt.ts` |
| saldi e analisi per fondo con le quote | `funds.ts`, `analysis.ts` |
| tabelle | `fund` (con `type`, `vat_rate`, `group_name`), `fund_contract`, `line_fund` (i fondi di una riga: `figures_id`, `position`, `fund_id`): migrazioni `0006_sponsors.sql` e `0009_one_kind_of_sponsor.sql`, con il trigger dello storico; gli inflow sono `team_inflow` |
| controlli di compatibilità | `saveFunds` in `apps/api/src/modules/budget/budget.service.ts`; la definizione dello sponsor in `funds.service.ts` |
| 11% | `getSettings().inflowVatRate`: si cambia dalla pagina Settings ([impostazioni.md](impostazioni.md)) |
| schermate | `FundsPage.tsx` (bottone New sponsor e suo form, tabella SPONSORS con i soldi, riquadri dei risultati), `areaColumns.tsx` (CASH FROM, ALSO FROM, icona di avviso) |

**API** (tutte con login; scrive solo l'admin):

| Metodo | Percorso | Cosa fa |
| --- | --- | --- |
| `GET` | `/api/funds?phase=` | i fondi, ognuno con i suoi soldi (`contracts.estimate` / `contracts.actual`: valore e data, oppure `null`); con la fase solo quelli che una riga può usare: team, regali, sponsor con soldi nella fase |
| `POST` | `/api/funds` | nuovo sponsor (`name`, `vatRate` obbligatoria tranne per il regalo senza IVA, il resto facoltativo) e, se si vuole, i suoi `contracts` (`phase`, `amount`, `inflowDate`: massimo uno per fase; solo per chi dà un fondo): tutto o niente |
| `PATCH` | `/api/funds/:id` | cambia qualunque parametro; il risultato è ricontrollato per intero |
| `DELETE` | `/api/funds/:id` | se nessuna riga è pagata da lui; si porta via anche i suoi soldi |
| `PUT` | `/api/funds/:id/contracts/:phase` | `{ amount, inflowDate }`: mette (o sostituisce) i soldi dello sponsor in quella fase; solo per chi dà un fondo. Due richieste insieme non lasciano mai due righe |
| `DELETE` | `/api/funds/:id/contracts/:phase` | toglie i soldi di quella fase |
| `PATCH` | `/api/lines/:id` | `figures.<fase>.fundIds`: l'elenco ordinato dei fondi (`[]` li toglie) |

## 7. Cosa è rimasto di prima

- **Righe senza fondo**: il motore usa la formula di prima con tipo di sponsor e aliquota digitati. Le colonne SPONSOR e SPONSOR VALUE sono state tolte dalla griglia: una riga nuova resta *incompleta* (icona gialla) finché non scegli CASH FROM.
- **Sponsor «parziale» importato dal foglio** (una voce nel foglio reale): il valore digitato resta e vale, perché toglierlo cambierebbe il costo della riga. Non si può creare una nuova voce così.
- **La casella «paga IVA» non c'è più** (tolta il 26/10/2026): un fondo copre sempre l'IVA, e per non farla pagare si mette 0%. Prima era una sola per sponsor (migrazione `0007`); nei dati del foglio tutti gli sponsor la avevano, quindi i numeri non sono cambiati.
- Le aliquote delle righe già assegnate a uno sponsor si ignorano: vale quella dello sponsor. La migrazione ha dato a ogni sponsor l'aliquota più usata dalle sue righe (22% per tutti, nei dati attuali).

## 8. Decisioni del tesoriere (21 ottobre 2026) e cosa resta aperto

| | Risposta |
| --- | --- |
| Q1 sponsor totale e IVA | **chiusa**: IVA sull'intero valore, a carico del team (tipo C) |
| Q3 scadenze IVA | **confermate** |
| Q4 CASH FROM ↔ CASH FLOW | in sospeso; gli sponsor in cassa non esistono più: i soldi che entrano sono inflow di CASH FLOW (§5) |
| Q5 casella «paga IVA» | **chiusa**: una sola per sponsor; **tolta il 26/10/2026** (lo dice l'aliquota: 0% = niente IVA) |
| Sponsor che danno soldi in cassa (come «esaving») | **tolti dal menù sponsor** (26/10/2026): si inseriscono come inflow in CASH FLOW; l'11% si paga il primo giorno del trimestre successivo |
| Soldi dello sponsor | **un valore e una data per sponsor e fase**, dentro lo sponsor: niente più contratti da gestire a parte (21/10/2026) |
| Q7 arrotondamento | va bene così |
| Q2 confronto con BANK, Q6 fondo in negativo | ancora aperte |

### Quando esce l'IVA del team (richiesta del 23 ottobre 2026: **in parte fatta**)

Fatto il 26 ottobre 2026: l'IVA dell'**11% sugli inflow** si paga il **primo giorno del trimestre successivo** alla data dell'inflow (§5), non più alla scadenza trimestrale (16/5, 20/8, 16/11, 16/2). Un inflow del 9 gennaio paga l'1 aprile. È la stessa regola della controfattura.

**Ancora da fare** (aspetta una risposta): l'IVA che il team paga sulle **righe del budget** oggi esce alla scadenza trimestrale del trimestre dell'acquisto. La richiesta è cambiarla così:

- l'IVA esce alla **data di pagamento** della fase: per EXPECTED la data EXPECTED della riga, per ACTUAL la data ACTUAL;
- **eccezione, la controfattura** (regalo di tipo C): si paga **il primo giorno del primo trimestre dopo l'acquisto**, con trimestri di calendario. Un acquisto del 20/11/2026 paga il 1/1/2027; uno del 1/1/2027 paga il 1/4/2027.

Per partire serve decidere come deve essere la tabella VAT OUTFLOW / PROJECT (oggi una colonna per scadenza trimestrale: con questa regola non avrebbe più quelle date; proposta: una colonna per mese di pagamento, come il Gantt). Quando sarà fatto le scadenze trimestrali (`getVatRules()` in `lookups.service.ts`) non serviranno più a niente e si tolgono.

Cosa cambia quando si fa: la data `vatDueDate` di ogni riga (`packages/calc/src/lines.ts`), da cui dipendono il Gantt, il CASH FLOW e la tabella per progetto (`vatReport.ts`); e la **riconciliazione col foglio non tornerà più** su queste date, perché è una scelta voluta e non un errore: va documentata come differenza dallo script in [regole-script-attuale.md](regole-script-attuale.md).

Da confermare (le ho assunte così): l'11% si calcola sul valore dell'inflow; il consumo dei fondi segue l'ordine del foglio; la riga non coperta resta segnalata finché non si aggiunge un fondo (nessuna "copertura" con i soldi del team).

**Limite noto**: cambiare il gruppo o il tipo di uno sponsor **non ricontrolla** le righe che lo usano già insieme ad altri (il motore regge, ma una combinazione che oggi non sarebbe ammessa resta com'è finché non si modifica la riga).

## 9. Prove

- `packages/calc/src/settle.test.ts` (17): regali B e C, aliquota dello sponsor, il fondo che copre l'IVA (anche a 0%), sponsor parziale importato, più fondi (resto, ordine del foglio, ultimo fondo in negativo, netto che ci sta con l'IVA, fino a sei fondi uno dopo l'altro), righe senza fondo. I numeri dei casi con più fondi sono calcolati a mano prima di lanciare il test.
- `packages/calc/src/cash.test.ts` (8) e `vat.test.ts`: l'11% sugli inflow e il giorno in cui si paga (ultimo giorno del trimestre, primo giorno, anno bisestile; `firstDayOfNextQuarter` confrontato con un calcolo indipendente su ogni giorno dal 2000 al 2100), CASH FLOW, Gantt, saldi.
- `apps/api/src/modules/funds/funds.routes.test.ts` e `budget.routes.test.ts`: definizione dello sponsor e sue regole, nomi unici (anche in parallelo), i soldi dello sponsor (messi, sostituiti, tolti, anche insieme), combinazioni rifiutate con il motivo, un cambiamento rifiutato non tocca la riga.
- Riconciliazione col foglio (`pnpm reconcile`, anche `-- --db` dopo `load --replace`): **1.995 controlli uguali**, con le aliquote ora prese dallo sponsor e anche dopo il 26/10/2026 (il foglio non ha inflow e tutti i suoi sponsor coprono l'IVA).
- Migrazione `0009` provata su una copia dei dati reali che aveva ancora uno sponsor in cassa: è diventato un inflow Expected, senza data, dello stesso valore.
- Controllo di mutazione: togliere il tetto dei fondi, la divisione per `1 + aliquota` o la regola «il team paga sempre l'IVA di un regalo» fa fallire i test.
