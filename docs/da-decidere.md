# Da decidere

L'elenco **unico** delle decisioni ancora aperte, con chi deve rispondere, cosa cambia e dove è descritto il dettaglio. Quando una decisione si chiude si sposta nel documento che la riguarda (e si toglie da qui); quando ne nasce una nuova si aggiunge qui.

Ultimo aggiornamento: **12 novembre 2026** (aggiunta D11: i difetti del rendiconto uguale al foglio; D10 chiusa, aggiunta D12: l'area ADMINISTRATION; D13: il preventivo per Voce, rimandato). Il 10 novembre: D7, le domande per la tesoriera sul registro di cassa. Prima: 29 ottobre 2026. Chiuse il 29/10: annullare i movimenti e il progetto delle parti di una produzione ([inventario.md](inventario.md), §16 e §18).

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

### D7. Il registro di cassa: tre domande per la tesoriera

Descritto in [registro-di-cassa.md](registro-di-cassa.md) (§2 e §6). Non bloccano niente: l'import le segnala e lascia scegliere.

1. **Le 6 righe di maggio 2025** dentro il foglio del 2026 e la scritta **«saldo al 01/01/2025»**: sono errori di battitura (2026) o dati veri? Contate nel 2026 i saldi del foglio tornano al centesimo; lasciate fuori la Banca differisce di quanto valgono.
2. **Le Voci 9.4 (Pec aruba) e 9.5 (saldo fattura)**, 42 righe, non compaiono nel rendiconto del foglio («voci di ricavocosto»): è voluto? Il rendiconto del sito è uguale al foglio e le segnala: vedi D11.
3. **Il Paypal** non è nel «Progressivo cumulato» del foglio (che è Cassa + Banca): è voluto? Il sito fa come il foglio.

### D11. Il rendiconto uguale al foglio: i suoi difetti, per la tesoreria e il commercialista

FINANCIAL STATEMENT ([registro-di-cassa.md](registro-di-cassa.md), §5.5) è **uguale al foglio «voci di ricavocosto»**, difetti compresi, perché serve per motivi legali; il pulsante **Things to check** li spiega e dice quanti soldi dell'anno toccano. Se si vogliono **correggere** è una scelta della tesoreria e del commercialista, una per una (cambia solo `getStatementLayout`, riga 9 del registro degli hardcode):

1. **Il Paypal** non è letto dalle righe QUOTE ASSOCIATIVE, 1.2 Cancelleria e 1.3 Materiale sportivo: voluto? Oggi non c'è Paypal su quelle Voci.
2. **«4.4 da università»** non entra nella sezione 4 «Contributi da enti pubblici» (che somma solo 4.1, 4.2 e 4.3) né in nessun totale: i suoi soldi non sono in TOTALE RICAVI. Un errore di formula, o l'università non è un ente pubblico per il rendiconto?
3. **«PRODUTTIVE MARGINALI (Eventi di raccolta fondi)»** non è in nessun totale e non è una Voce del registro: è una riga di intestazione andata a capo della riga 5, o una riga vera da avere fra le Voci?
4. **«9. IVA»** è dentro «8. IMPOSTE E TASSE»: l'IVA va in quella sezione o è una sezione a sé (e allora il totale dei costi deve sommarla come nona)?
5. **Le Voci 9.4 Pec aruba e 9.5 saldo fattura** non hanno riga nel rendiconto, e i movimenti senza Voce non compaiono: in quale riga vanno? Con i dati veri del 2026 sono una quarantina di movimenti, e i soldi mancano dai totali.
6. **Il segno**: la colonna «importi parziali» è senza segno. Un rimborso su un costo (per esempio un noleggio restituito) va a ridurre il costo: la riga 4.2 Noleggi, oggi, ha un saldo positivo. È giusto così?

### D8. CASH FLOW dopo il registro: tenerlo, e dove si scrivono gli inflow

Il foglio «Pagamenti e Scadenze» della tesoreria ha **due tabelle affiancate**: *IN ENTRATA* (data attesa, ente o persona, importo, IVA, fattura?, descrizione, casella «saldo») e *IN USCITA* (data, ente o persona, importo, descrizione, casella). Sono le due metà di una **previsione**.

- *IN ENTRATA* è già nel sito: sono gli inflow EXPECTED di CASH FLOW, e la casella «saldo» è «Mark as received».
- *IN USCITA* oggi il sito la ricava dal budget (le righe da pagare con la loro data, le scadenze dell'IVA), ma non ha le uscite **fuori budget** (un'assicurazione, una quota) e non si scrive da nessuna parte.
- **CASH FLOW non si elimina**: è l'unica pagina che calcola il «Left value» e la linea del tempo degli incassi. Si può invece togliergli i moduli: diventa una **vista calcolata**, e gli inflow attesi e le uscite previste fuori budget si scrivono in una scheda del registro, **«Pagamenti e Scadenze»**, con le due tabelle e la casella «saldo» che collega al movimento vero.
- Chi è un'azienda lì è lo stesso che in CASH FROM (uno sponsor), ma oggi nell'inflow il nome è testo libero: scegliendolo dall'elenco degli sponsor si evitano doppioni e refusi.
- **Fino ad allora**: un ritocco piccolo (il pulsante «New inflow» dentro il riquadro EXPECTED e rinominato «New expected inflow», un rimando nel riquadro ACTUAL).
- **Da decidere:** fare «Pagamenti e Scadenze» (piano a parte) o lasciare CASH FLOW com'è con il ritocco.

### D9. Un movimento dovuto dal budget

**Fatto** (11 novembre 2026, [registro-di-cassa.md](registro-di-cassa.md), §5.4): la pagina TO PAY, calcolata dal budget, con il pulsante «Pay»; il collegamento copre netto + IVA (prima il netto). Il testo qui sotto è la discussione di partenza.

Una riga ACTUAL pagata dal fondo del team con ancora qualcosa da pagare è un movimento **dovuto**. Oggi la si collega a mano a un'uscita del registro *dopo* averla pagata.

- **Proposta:** un elenco **«Da pagare»**, **calcolato** dal budget e non salvato (così non si può disallineare): le righe con il residuo, con la data d'acquisto o la scadenza dell'IVA. Da ogni riga un pulsante **Pay** crea l'uscita nel registro già compilata (descrizione, importo del residuo, giorno di oggi) e già collegata alla riga. Il budget genera la scadenza, il registro la chiude. Sarebbe la tabella *IN USCITA* di D8.
- Non farei una tabella di «uscite previste» salvata: duplicherebbe il budget.
- **Domanda per la tesoriera:** un fornitore con IVA si paga **lordo subito** (netto più IVA in un bonifico) o **netto subito e l'IVA alla scadenza** che il sito calcola? Se è lordo, il collegamento deve poter coprire anche l'IVA, altrimenti la previsione la conta due volte (già uscita e ancora da pagare). Oggi il collegamento copre solo il netto.

### D12. L'area ADMINISTRATION: due cose da guardare con la tesoreria

L'area è fatta ([spese-fuori-budget.md](spese-fuori-budget.md), 12 novembre 2026): le spese e le entrate fuori budget contano nei TOTAL, nel Gantt e nelle analisi. Il **preventivo per Voce** (fase 4) non c'è ancora. Non blocca niente:

1. **L'ambito di partenza di ogni Voce** è una proposta (tutto «fuori budget» tranne 1.1 Attrezzature e 1.4 Altro «di progetto», e «ignorate» 6.1 sponsorizzazioni e l'IVA 9.1–9.3). Si corregge in Settings, colonna COUNTS. In particolare **9.5 saldo fattura** (e 9.4 Pec aruba), una quarantina di movimenti: se sono pagamenti di fatture di righe del budget vanno su «On a project» (e si collegano alle righe da TO PAY); se sono spese di gestione restano fuori budget. Oggi sono nell'ultimo progetto dell'area, «Voci not in the statement».
2. **CAR TOTAL**: l'area conta come ogni riga della stagione, cioè nella macchina della stagione. Una spesa di gestione (assicurazione, bollo) non è davvero «della macchina»: va bene, o la CAR TOTAL deve escluderla?

### D13. Il preventivo per Voce delle spese fuori budget (fase 4, rimandata)

Oggi l'area ADMINISTRATION ha solo l'ACTUAL ([spese-fuori-budget.md](spese-fuori-budget.md), §6): nei TOTAL ha l'EXPECTED a zero e nessun allarme di scostamento. Il preventivo (per esempio il previsto della stagione per le assicurazioni) darebbe il confronto previsto contro reale. **Rimandata il 12 novembre 2026** ("ci pensiamo dopo"); prima va deciso **se serve**: la richiesta di far comparire queste voci nei totali è già soddisfatta.

Come lo farei: un importo per Voce e per stagione, scritto in Settings in un riquadro «Expected outside the budget» (non c'è una pagina dell'area), ripartito in parti uguali sui mesi della stagione; l'importo di una Voce di entrata è il «Money in» atteso; la funzione `outsideBudget` aggiunge la fase EXPECTED alle righe. Una tabella piccola `(stagione, Voce, importo)`. Fuori: IVA, preventivi pluriennali, una pagina dell'area.

Da decidere:

1. **Conta in CASH FLOW?** Un preventivo è una spesa che deve ancora uscire: andrebbe nella previsione EXPECTED («Left value») come pagata dal fondo del team. È la parte delicata: cambia numeri che oggi tornano.
2. **La ripartizione**: in parti uguali sui 12 mesi, o con il mese scelto (l'assicurazione si paga a dicembre)?
3. **L'allarme di scostamento** con la stessa soglia delle altre aree, o spento per ADMINISTRATION (le spese di gestione potrebbero farlo scattare spesso)?
4. **Stagione nuova**: i preventivi si copiano dalla precedente o si riparte da zero?

## Accesso e rilascio

### D5. Le risposte di IT per il login dietro il proxy

[accesso-e-storico.md](accesso-e-storico.md): (1) gli **indirizzi del proxy** da mettere in `PROXY_IPS`; (2) **chi passa dal proxy**: solo il team o tutta l'organizzazione? (nel secondo caso una mail mai vista non dovrebbe diventare `viewer` da sola: serve un «Add user» e nessun ruolo predefinito); (3) cosa succede alla **sessione scaduta**; (4) l'indirizzo di **logout** del proxy.

### D6. Nome del rilascio su GitHub

Il tag `0.1` non ha fatto partire il workflow, che aspetta tag che iniziano con `v`. O si pubblica `v0.1.0` (vedi [rilascio.md](rilascio.md)) o si fa partire il workflow **alla pubblicazione di una Release** qualunque sia il nome (modifica piccola, da fare solo su richiesta).
