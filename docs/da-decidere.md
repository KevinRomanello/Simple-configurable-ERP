# Da decidere

L'elenco **unico** delle decisioni ancora aperte, con chi deve rispondere, cosa cambia e dove è descritto il dettaglio. Quando una decisione si chiude si sposta nel documento che la riguarda (e si toglie da qui); quando ne nasce una nuova si aggiunge qui.

Ultimo aggiornamento: **29 ottobre 2026**. Chiuse il 29/10: annullare i movimenti e il progetto delle parti di una produzione ([inventario.md](inventario.md), §16 e §18).

## Urgente

### U1. Il «GRAND TOTAL COST» include l'IVA che copre un fondo: va bene?

**Dove.** Le pagine **TOTAL** (ESTIMATED / ACTUAL GRAND TOTAL COST e i loro grafici), le **analisi** (CASH FROM, BOUGHT FROM, CATEGORY ANALYSES: "Grand Total Cost" e grafici) e la colonna GRAND TOTAL della riga **Area total** (e di ogni riga del budget).

**Com'è oggi.** GRAND TOTAL = netto + IVA **intera**, anche quella che un fondo di sponsor si prende: il fondo la consuma davvero, ed è il numero del foglio. Il 29/10/2026 si è deciso che la colonna **VAT** dei subtotali dei progetti e di Area total mostri **solo l'IVA a carico del team** ([sponsor-e-fondi.md](sponsor-e-fondi.md), §3). Risultato: in quelle tabelle **NET COST + VAT (TEAM) ≠ GRAND TOTAL** quando c'è un fondo che copre IVA, e chi somma le colonne a mano trova una differenza.

**La domanda.** Anche lì il costo deve essere **netto + solo IVA del team** (e quindi GRAND TOTAL cambia nelle pagine TOTAL, nelle analisi e nei loro grafici), oppure resta com'è, con una nota che spiega la differenza?

**Cosa cambia se la risposta è «sì».**
- cambiano le **differenze evidenziate di TOTAL** (expected contro actual) e tutti i grafici che usano il grand total;
- la **riconciliazione col foglio** (`pnpm reconcile`, 1.995 confronti) confronta anche questi valori: non tornerebbero più al foglio, e ogni differenza andrebbe spiegata come voluta (come le altre in [regole-script-attuale.md](regole-script-attuale.md));
- la colonna GRAND TOTAL di ogni riga del budget (netto + IVA intera, come nel foglio) resterebbe, o cambierebbe pure lei? Va deciso insieme.

**Chi.** Tesoriere, con chi usa le analisi. **Non ancora risposto.** (Richiesta del 29/10/2026: «ci pensiamo poi, mettilo nelle docs come urgente».)

## Fondi e IVA

### D1. IVA sugli inflow: scrivere l'importo intero ricevuto

**Proposta (in attesa del via).** Un inflow si inserisce **come arriva**: per esempio 12.200 € quando lo sponsor dà 10.000 € più 22% di IVA in fattura. Il sito calcola da solo l'IVA che il team deve versare: l'**11% del netto** (10.000 × 11% = 1.100 €), il primo giorno del trimestre successivo. Il 22% della fattura diventerebbe una voce di **Settings** («VAT on the invoice of an inflow»); l'11% c'è già ([impostazioni.md](impostazioni.md)). Oggi si scrive il solo importo e l'11% si calcola su quello ([sponsor-e-fondi.md](sponsor-e-fondi.md), §5).

**Da chiarire.** Che importo contano i grafici e BANK: l'intero 12.200 (cassa vera) con 1.100 in uscita, o il netto?

### D2. L'IVA delle righe del budget alla data di pagamento, e il report VAT OUTFLOW / PROJECT

Già descritta in [sponsor-e-fondi.md](sponsor-e-fondi.md), §8 («Ancora da fare»): oggi l'IVA che il team paga sulle righe del budget esce alla **scadenza trimestrale** del trimestre dell'acquisto; la richiesta è farla uscire alla **data di pagamento** di ogni fase (EXPECTED o ACTUAL), con la **controfattura** (merce di tipo C) il primo giorno del trimestre dopo l'acquisto. Per partire serve decidere il **formato del report VAT OUTFLOW / PROJECT**: oggi ha una colonna per scadenza trimestrale (con la nuova regola quelle date non esisterebbero più); la proposta è **una colonna per mese di pagamento, come il Gantt**. Con il cambio la riconciliazione col foglio non tornerà più su quelle date (scelta voluta, da documentare).

### D3. Q2 e Q6 del tesoriere

[sponsor-e-fondi.md](sponsor-e-fondi.md), §8: **Q2** confronto con il saldo BANK; **Q6** cosa fare quando un fondo va in negativo.

## Struttura

### D4. Stagioni, anno fiscale e macchine

Piano completo, con le fasi e le domande, in [stagioni-anni-fiscali-e-macchine.md](stagioni-anni-fiscali-e-macchine.md) (§7 «Da decidere prima di partire»). Niente codice scritto.

## Accesso e rilascio

### D5. Le risposte di IT per il login dietro il proxy

[accesso-e-storico.md](accesso-e-storico.md): (1) gli **indirizzi del proxy** da mettere in `PROXY_IPS`; (2) **chi passa dal proxy**: solo il team o tutta l'organizzazione? (nel secondo caso una mail mai vista non dovrebbe diventare `viewer` da sola: serve un «Add user» e nessun ruolo predefinito); (3) cosa succede alla **sessione scaduta**; (4) l'indirizzo di **logout** del proxy.

### D6. Nome del rilascio su GitHub

Il tag `0.1` non ha fatto partire il workflow, che aspetta tag che iniziano con `v`. O si pubblica `v0.1.0` (vedi [rilascio.md](rilascio.md)) o si fa partire il workflow **alla pubblicazione di una Release** qualunque sia il nome (modifica piccola, da fare solo su richiesta).
