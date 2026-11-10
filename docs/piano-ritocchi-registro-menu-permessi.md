# Piano: ritocchi del registro, menù e permessi dell'inventario

**Stato: fatto il 10 novembre 2026** (i quattro lavori 1, 2, 6, 7), come scritto qui sotto. Restano le tre discussioni (3, 4, 5, in [da-decidere.md](da-decidere.md), D8–D10): nessun codice finché non si decide. Scelte sui dubbi: le categorie sono incluse, le celle sul posto **e** il modulo con la matita, il menù a fisarmonica.

## Ordine

1. **Permessi** (punto 7): è il più piccolo e sblocca l'inventario.
2. **Registro ordinabile** (punto 1).
3. **Modifica delle righe del registro** (punto 2).
4. **Menù** (punto 6).
5. Per ognuno: prove automatiche dove c'è logica, controllo nel browser con dati inventati (tolti per id), documenti aggiornati, tutte le suite e `pnpm reconcile`.

## 7. I permessi: lo «User» cambia le impostazioni dell'inventario

Oggi Settings è dell'admin, tranne **Item types** (anche dei pm, che il sito chiama «User») e le liste del registro (tesoreria). Un User che crea un articolo non può aggiungere un'unità, un posto o una categoria: l'inventario è inutilizzabile.

- **Cosa diventa dello User** (`canManageInventory`, cioè admin e pm): **Units**, **Places** (posti), **Categories** con i loro campi facoltativi, e il riquadro degli articoli senza categoria. Le scritture e anche la lettura di `GET /api/settings`.
- **Resta dell'admin**: Seasons and cars, i **switch del calcolo** (soglia, base IVA, IVA sugli inflow, confronto con il BANK), le **aliquote IVA**. Le liste del registro restano della tesoreria.
- API: i servizi di `settings.service.ts` che oggi fanno `requireAdmin` passano a un controllo per riquadro (admin per il calcolo, le aliquote e le stagioni; `canManageInventory` per unità, posti e categorie). Le regole non cambiano: una voce **in uso non si cancella**, i nomi sono unici, rinominare aggiorna righe e articoli.
- Sito: la pagina mostra a uno User i riquadri Categories, Units, Places, Item types; all'admin tutto come prima.
- Prove: il test «solo l'admin» di `settings.routes.test.ts` va riscritto (pm sì sui tre riquadri, no sul calcolo, le aliquote e le stagioni; viewer sempre `403`), più il permesso in `/api/me`.
- Documenti: `impostazioni.md`, `accesso-e-storico.md`.
- **Dubbio:** le **categorie** servono anche al budget (i blocchi di TOTAL e del Gantt). Uno User che ne aggiunge o rinomina una cambia anche quelle pagine. Le propongo comunque (una categoria in uso non si cancella), perché senza le categorie l'inventario non si usa.

## 1. Il registro con le colonne ordinabili

- Ogni intestazione si clicca come nelle altre tabelle: crescente, decrescente, ordine originale (`useSort` e `SortTh`, già usati altrove). Le colonne: Data, Descrizione, Voce, Metodo, Check fattura, Sponsorship, e per ogni conto Entrate, Uscite e Progressivo, più il Totale.
- I vuoti vanno sempre in fondo (regola di tutte le tabelle). Il **saldo iniziale** resta in cima.
- L'ordine originale (per giorno, poi per inserimento) è il solo in cui i progressivi si leggono come una somma corrente: con un altro ordine il valore di ogni riga resta giusto ma una riga sotto l'altra non si somma. Lo dice una riga sotto il titolo della tabella quando l'ordine non è quello originale.
- Il pulsante Download dà le righe nell'ordine che si vede (come in ogni pagina).
- File: `CashRegisterPage.tsx` e il test dei valori su cui si ordina.

## 2. La modifica delle righe del registro

Oggi la matita trasforma la riga in una fila di caselle strette, una accanto all'altra: illeggibile. Si fa come la tabella degli sponsor (CASH FROM), dove si modifica **sul posto**:

- **Si legge come testo; un clic su una cella la trasforma nella sua casella** (data, descrizione, Voce, metodo, importo), salva con Invio o lasciandola, Esc annulla. Check fattura e Sponsorship sono caselle sempre cliccabili. È lo stesso gesto della griglia del budget. Si fa un solo componente di cella, riusato da tutte le colonne.
- **Conto ed Entrata/Uscita** non si cambiano in una cella (sono le colonne stesse): restano dietro la matita, che apre sopra la tabella **lo stesso modulo di «New movement»**, già compilato, con Salva e Annulla. Così il modulo di inserimento e quello di modifica sono uno solo.
- Via la riga che si trasforma e il suo codice (`EntryCells`).
- **Dubbio:** solo il modulo (più semplice, un solo modo di modificare) o modulo più celle sul posto (più comodo per correggere una descrizione, ma due modi)? Io farei i due insieme.

## 6. Il menù a lato

- **Nuovo ordine:** Budget (le aree), **Views**, **Cash** (CASH FROM, BOUGHT FROM, CASH FLOW e **REGISTRO DI CASSA**, quest'ultimo solo per tesoreria e admin; il gruppo «Register» sparisce), **Total**, **Inventory**, poi **Admin** (Users, Settings, History) com'è.
- **A tendina:** il titolo di ogni gruppo si clicca e il gruppo si chiude o si apre (una freccia a lato). Il gruppo della pagina in cui sei si apre da solo; la scelta si ricorda nel browser (con prova senza archivio: si apre tutto). Vale uguale sul telefono e sul tablet, dove il menù si apre sopra la pagina.
- File: `Shell.tsx` e gli stili del menù.
- **Dubbio:** «a tendina» come fisarmonica (i gruppi si chiudono, il menù resta a lato) o come menù che si apre al passaggio del mouse? Propongo la fisarmonica: funziona anche sul telefono.

## Cosa lascio fuori

- I punti 3, 4, 5 (solo discussione): vedi D8–D10.
- «Pagamenti e Scadenze» come scheda del registro, l'elenco «Da pagare» dal budget e le spese del registro nei TOTAL: se si decide di farli, un piano a parte.
- Nessuna migrazione nuova: nessun lavoro cambia le tabelle.
