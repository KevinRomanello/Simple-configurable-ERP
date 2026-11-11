# Il prezzo con l'IVA nel budget

**Stato: fatto e provato** (11 novembre 2026), su richiesta del team: poter scrivere nel budget il prezzo **con l'IVA** (uno scontrino, il totale di una fattura) senza dover prima ricavare il netto a mano.

## 1. Cosa fa

Il prezzo di **un'unità** si può scrivere in due modi, in ogni fase (EXPECTED e ACTUAL) di ogni riga:

- **senza IVA**, nella colonna **NET UNIT COST** (come sempre);
- **con IVA**, nella colonna **GROSS UNIT COST**.

**Il numero che scrivi è quello che resta**: l'altra colonna si calcola e si legge in corsivo, in grigio. Scrivere nell'altra colonna cambia il modo. Il prezzo scritto con l'IVA **non si muove**: se poi cambi l'aliquota o il fondo cambia il netto, non il lordo (scrivendo il netto succede il contrario, come è sempre stato).

## 2. Che aliquota si usa

L'IVA di una riga dipende da chi la paga, come per il prezzo netto ([sponsor-e-fondi.md](sponsor-e-fondi.md)):

| Chi paga | Aliquota con cui si toglie l'IVA dal lordo |
| --- | --- |
| il **fondo del team**, o nessuno ancora | quella scelta sulla riga (**VAT %**). Se non c'è, **22%**: parte da sola e si cambia (§5) |
| un **fondo di uno sponsor** | quella del fondo: non si sceglie sulla riga |
| **merce regalata** senza IVA / con controfattura | quella fissa del tipo (0% / 11%) |
| **più fondi** | ognuno la sua (§3) |

## 3. Le regole

- **Il lordo scritto è esatto.** Il totale lordo della riga è quantità × prezzo con IVA, arrotondato al centesimo. Il **netto** è il lordo senza IVA, arrotondato al centesimo, e l'**IVA è la differenza**: così i centesimi tornano sempre a ciò che hai scritto. Esempio: 10,01 € al 22% è 8,20 € più 1,81 €; con un prezzo netto non si poteva ottenere (8,20 + 22% fa 10,00). Con più pezzi: 1000 pezzi a 1,00 € con IVA fanno 1.000,00 €, non 1.000,03 €.
- **Un fondo di uno sponsor** paga il lordo: il suo saldo cala di netto + IVA, cioè di quanto hai scritto, all'aliquota del fondo (non a quella scritta sulla riga).
- **Più fondi con aliquote diverse** (per esempio due fondi dello stesso gruppo): il primo paga fino a esaurire il suo saldo (in lordo), il resto va al successivo con la sua aliquota. Esempio: riga da 1.000,00 € con IVA, primo fondo al 22% con 305,00 € nel saldo, secondo fondo al 10%: il primo paga 305,00 € (250,00 + 55,00), il secondo 695,00 € (631,82 + 63,18); in tutto 881,82 € di netto e 118,18 € di IVA, cioè 1.000,00 €.
- **Sponsor totale / merce regalata**: come per il netto. Lo sponsor copre il netto (ricavato dal lordo) e resta l'IVA; con la scelta Q1 «IVA su ciò che lo sponsor non copre» non resta niente da tassare, e il netto è uguale al lordo.
- **Senza aliquota o senza il tipo di sponsor** non c'è ancora IVA: il prezzo conta come netto e la riga è «incompleta», come per il prezzo netto. Dall'interfaccia non succede: scrivendo un prezzo con l'IVA il server mette 22% e «nessuno sponsor» se mancano.
- **Lo sponsor parziale non è ammesso** con un prezzo con IVA (`400`, e la casella del lordo è spenta con un suggerimento): con uno sponsor parziale l'IVA si applica solo a ciò che lo sponsor non copre, quindi il lordo calcolato non sarebbe quello scritto. Si scrive il netto. Se servirà, si può sciogliere questo limite (il calcolo inverso c'è: netto = (lordo + aliquota × sponsor) / (1 + aliquota)).
- Il **prezzo unitario dell'altro tipo** è ricavato dai totali della riga e approssimato a quattro decimali: il totale della riga non lo è. Sono i prezzi che l'inventario congela all'arrivo di una merce (`linePricesE4`).

## 4. I dati

- Una colonna nuova: **`line_figures.unit_gross_cost`** (`numeric(14,4)`), migrazione **`0022_gross_price.sql`**. **Piena = il prezzo è stato scritto con l'IVA**; vuota = senza IVA (tutte le righe che c'erano). Non c'è un campo «modo»: lo dice la colonna.
- Un controllo del database (`line_figures_one_price`): se il lordo c'è, non è negativo e `unit_net_cost` è 0. Si salva **un solo** prezzo, quello scritto; l'altro non si salva mai (dipenderebbe dall'aliquota e dai fondi, che cambiano).
- La modifica è nello storico come ogni altra delle cifre di una riga.
- Il foglio dell'Excel (importer) e le righe già nel database restano com'erano: prezzo netto.

## 5. API

`PATCH /api/lines/:id` e `POST /api/projects/:id/lines`, nelle `figures` di una fase:

- `unitGrossCost` (decimale, al massimo 4 decimali) **oppure** `unitNetCost`: tutti e due insieme, `400`. Il prezzo scritto sostituisce l'altro: scrivere il netto su una riga con il lordo la riporta al netto, e viceversa.
- Con un prezzo con IVA: se manca l'**aliquota** si mette quella di partenza (`getDefaultVatRate`, 22%: un hardcode nella funzione-API, riga 8 di [hardcoded-registry.md](hardcoded-registry.md)) e se manca il tipo di sponsor «nessuno»; con uno sponsor parziale `400` («type the net price»). L'aliquota messa si vede e si cambia come ogni altra.
- Il costo di una riga ha lo stesso tetto del netto (`LIMITS.netCost`), anche con l'IVA.

## 6. Il calcolo

`packages/calc`: `Figures.unitGrossE4` (presente = prezzo con IVA) · `grossCents` e `netOfGross` in `money.ts` · `grossLineAmounts` e `splitGross` in `line.ts` (riga senza fondi) · `settleTotalGross` e `settleSharesGross` in `settle.ts` (con i fondi: lo stesso ordine di prima, ma in lordo) · `PhaseCalc.unitPriceE4` (i due prezzi unitari). Il calcolo con il prezzo netto non cambia: la riconciliazione col foglio del budget è la stessa.

## 7. L'interfaccia

- **Griglia**: dopo QTY ci sono **NET UNIT COST** e **GROSS UNIT COST**, tutte e due modificabili. Quella calcolata è in corsivo grigio con un suggerimento. Con uno sponsor parziale la casella del lordo non si apre.
- **Moduli** (nuova riga, modifica dal telefono): accanto al prezzo c'è un selettore **«without VAT / with VAT»**. Cambiarlo traduce il numero scritto nell'altro modo (da 40,00 € netti a 48,80 € con IVA) e cambia l'etichetta; in una riga nuova, dove non c'è niente da tradurre, il numero resta.
- **Scheda del telefono**: «2 × 61,00 € with VAT».
- Non progettata su Figma: la griglia e i moduli del sito ([stile-interfaccia.md](stile-interfaccia.md)).

## 8. Cosa resta fuori

- Lo sponsor parziale con il lordo (§3).
- Il **collegamento delle uscite del registro alle righe** ([registro-di-cassa.md](registro-di-cassa.md), §5.3) usa ancora la quota **netta** del fondo del team. Un prezzo con l'IVA coincide con ciò che esce dalla banca, e questo potrà semplificare il collegamento (D9 di [da-decidere.md](da-decidere.md)).
- L'aliquota di partenza (22%) non è ancora una scelta di Settings.

## 9. Prove

- **Calcolo** (`grossPrice.test.ts`, 15): 122,00 al 22% è 100,00 + 22,00; i centesimi (10,01); la quantità (1000 pezzi); aliquota 0%; senza aliquota o senza tipo di sponsor; sponsor totale con le due letture di Q1; fondo del team; fondo di sponsor (paga il lordo, il saldo cala del lordo, finisce); due fondi con aliquote diverse (le quote sommano al lordo scritto); merce regalata (0% e 11%); i prezzi unitari nei due sensi.
- **API** (`budget.routes.test.ts`, 5 nuovi): l'aliquota e lo sponsor di partenza, il lordo che resta fermo quando cambia l'aliquota, il passaggio avanti e indietro fra i due prezzi, l'aliquota del fondo, i rifiuti (due prezzi insieme, sponsor parziale nei due ordini, tetto, negativo, troppi decimali).
- **Sito** (`lineEdit.test.ts` e `newLine.test.ts`, 4 nuovi): la bozza di una riga con IVA, cosa si manda quando si scrive un prezzo con IVA o si torna al netto, il cambio di modo.
- **Mutazione:** calcolando l'IVA dal netto arrotondato invece che per differenza, fallisce il test dei centesimi.
- **Browser** (riga inventata, tolta per id con le sue righe di storico): 61,00 € con IVA su 2 pezzi → netto 100,00 €, IVA 22,00 €, netto unitario 50,00 € in corsivo; scrivendo 40,00 € netti il lordo calcolato è 48,80 €; il selettore del modulo del telefono converte 40 in 48,8.

## 10. Per andare online

Serve la migrazione **`0022_gross_price.sql`** (una colonna in una tabella che l'utente dell'API già può leggere e scrivere: nessun permesso da dare). Il passo `setup` la applica da solo; a mano, `pnpm db:migrate` dal proprietario del database ([rilascio.md](rilascio.md)).
