# Registro di cassa (il fondo del team)

**Stato: tutti e cinque i passi fatti e provati** (10 novembre 2026): ruoli e registro, import dell'Excel, BANK dal registro, inflow ricevuti e uscite collegate alle righe del budget. Nasce dal foglio `2026_Registro cassa.xlsx` della tesoreria e dal confronto con l'utente del 10 novembre.

## 1. Cosa fa

Una pagina che fa quello che fa il foglio Excel della tesoreria: il **registro di tutti i movimenti di denaro del fondo del team** (Cassa, Banca, Paypal), con i progressivi; più un modo di **caricare nel sito il foglio scaricato**, perché all'inizio la tesoreria continuerà a usare Excel e poi userà solo il sito.

- **È la gestione del fondo del team, e basta.** I fondi degli sponsor (CASH FROM) sono un'altra cosa: sono virtuali e il registro non li tocca. Una riga del budget pagata da uno sponsor non ha movimenti nel registro: al conto arrivano solo la quota del fondo del team e l'IVA.
- **Non è separato dal resto del sito**: il BANK di CASH FLOW viene dal registro, gli inflow attesi si segnano «ricevuti» collegandoli a un'entrata e le uscite si collegano alle righe del budget che pagano (§5).

## 2. Il foglio di partenza

Cinque fogli; conta **«movimenti cassa e banca»**:

- una riga per movimento, sempre su **un solo conto** fra Cassa, Banca e Paypal, e sempre o entrata o uscita;
- colonne: Data, Descrizione, Voce, Metodo di pagamento, Check fattura, poi per ogni conto Entrate, Uscite, Progressivo, e il Progressivo cumulato (= Cassa + Banca; Paypal resta fuori);
- una riga dei **saldi iniziali** («saldo al …») sotto l'intestazione;
- **il conto e il metodo sono due cose diverse**: un pagamento con metodo «Paypal» può avere l'importo nella colonna Banca (Paypal addebita il conto);
- i progressivi sono formule: il sito li **ricalcola** dai movimenti e li usa solo per controllare;
- la **Voce** è un elenco con codici in cui lo stesso codice vale per un ricavo e per un costo (2.1 da soci e tesserati, 2.1 Assicurazioni): si riconosce dal testo intero;
- in fondo ci sono righe vuote con le sole formule trascinate, e note scritte a lato della tabella.

Gli altri fogli («voci di ricavocosto» = il rendiconto, «Pagamenti e Scadenze» = i pagamenti previsti con la casella «saldo», «Task tesoreria» = la brutta copia, «voci di stato patrimoniale») **non si importano**.

Trovato leggendolo (l'import lo segnala):

- 6 movimenti con la data di maggio **2025** dentro un foglio del 2026, in mezzo a righe di maggio 2026: probabili errori di battitura. Contati nel 2026, i saldi del foglio tornano al centesimo; lasciati fuori, la Banca del sito differisce da quella del foglio di quanto valgono (§4, import);
- la riga dei saldi dice «saldo al 01/01/2025», ma il foglio è del 2026;
- una riga senza Voce;
- due Voci usate (9.4 Pec aruba, 9.5 saldo fattura) non compaiono nell'elenco del rendiconto;
- il progressivo Paypal del foglio non torna con i suoi movimenti da una riga in poi: la formula di quella riga sottrae dalla colonna sbagliata. Cassa e Banca tornano al centesimo.

## 3. Decisioni (10 novembre 2026)

| | Decisione |
| --- | --- |
| Chi lo vede | gli admin e i **pm con la spunta «Treasury»** (si mette da Users, sulla scheda del pm). Pagina e API rispondono `403` agli altri |
| Cosa fa la tesoreria | legge e scrive il registro **e CASH FLOW** (inflow e BANK, che sono entrate nel conto). Per il resto è il pm che è (le sue aree, inventario, fornitori, storico). **CASH FROM** (sponsor e contratti) non è suo: lo tiene chi ha la spunta «Sponsors». In Settings vede le liste del registro |
| La spunta «Sponsors» | un pm (nel sito «User») con la spunta **gestisce gli sponsor**: non è uno sponsor. Può aggiungere e cambiare i fondi degli sponsor e i loro contratti (CASH FROM); per il resto è il pm che è. Non vede il registro né modifica CASH FLOW, a meno che abbia anche la spunta Treasury |
| Totale | **Cassa + Banca**, come il foglio; Paypal si mostra a parte |
| Le parole della pagina | quelle del foglio: Data, Descrizione, Voce, Metodo di pagamento, Check fattura, Entrate, Uscite, Progressivo |
| Righe del 2025 e saldo «01/01/2025» | da chiedere alla tesoriera. L'import le segnala e fa scegliere (§4) |
| Voci 9.4 e 9.5 | sono Voci normali; se debbano stare nel rendiconto è **da chiedere**, e conta solo quando si farà il rendiconto |
| **Sponsorship** | una **spunta** su ogni entrata del registro e su ogni inflow di CASH FLOW. Spuntata: l'11% di IVA si calcola da solo, il primo giorno del trimestre dopo, come prima. Non spuntata: entrata normale (una quota associativa), senza IVA |
| Valore di partenza della spunta | «New inflow» parte spuntato (come prima); nel registro parte non spuntata, tranne se la **Voce** ha «Sponsorship by default» (di base «6.1 Da pubblicità e sponsorizzazioni», in Settings): serve all'import. La spunta della riga resta modificabile |
| Inflow già presenti | restano sponsorizzazioni: i numeri di prima non cambiano |

## 4. Com'è fatto

### La pagina («Cash › REGISTRO DI CASSA»)

- **Anno solare** (di base quello in corso), slegato dalla stagione. Filtri: conto, mese, Voce, testo, «invoice not checked». In cima i saldi dei conti e il totale a fine anno.
- La tabella ha le colonne del foglio, con Cassa, Banca e Paypal (Entrate, Uscite, Progressivo) e il Progressivo cumulato; in più la colonna **SPONSORSHIP**. I progressivi sono quelli **dell'anno intero**, anche quando un filtro nasconde righe, e non si salvano: si ricalcolano a ogni lettura (`registerTimeline` in `packages/calc/src/register.ts`). I movimenti vanno per giorno, poi per ordine di inserimento.
- **Ogni colonna si ordina**, come nelle altre tabelle (clic sull'intestazione: crescente, decrescente, ordine originale; i vuoti vanno in fondo). Le tre colonne di un conto ordinano le sue entrate, le sue uscite e il suo progressivo; il saldo iniziale resta in cima. Con un ordine diverso dall'originale i progressivi di ogni riga restano giusti ma non si sommano da una riga all'altra, e una nota sopra la tabella lo dice. Il Download dà le righe nell'ordine che si vede (`registerSort` in `apps/web/src/lib/registerSort.ts`).
- **Si modifica sul posto**, come la tabella degli sponsor: una riga si legge come testo e **un clic su una casella** (data, descrizione, Voce, metodo, importo) la trasforma nella sua casella; Invio o uscire dalla casella salva, Esc lascia com'era, e la scelta di una Voce o di un metodo salva subito. Check fattura e Sponsorship sono caselle sempre cliccabili (Sponsorship solo per le entrate). Il componente è `EditCell` (`apps/web/src/components/EditCell.tsx`). Cambiare una Voce non tocca la spunta Sponsorship.
- **La matita** di una riga apre sopra la tabella **«Change movement»**: lo stesso modulo di «New movement», già compilato, per ciò che le caselle non possono fare, cioè **cambiare il conto** e **se è un'entrata o un'uscita**. Salva e si chiude. Non c'è più la riga che si trasforma in una fila di caselle.
- **«New movement»** (il pulsante giallo dell'intestazione) apre il modulo di un movimento: data, conto, Entrate o Uscite, importo, descrizione, Voce, metodo, Check fattura, Sponsorship. **Add movement** salva e il modulo resta aperto con la stessa data e lo stesso conto, per scrivere il successivo. Scegliendo una Voce con «Sponsorship by default» la spunta parte accesa per le entrate. Il cestino cancella; sulle uscite c'è il pulsante **«Link to budget lines»** (§5).
- Di una riga si vede anche a cosa è legata: «received the inflow …» per un'entrata che ha ricevuto un inflow atteso, «paid …» con le righe del budget che un'uscita ha pagato.
- La riga **«Saldo al 01/01/…»** dell'anno si scrive sul posto (un conto senza saldo proprio mostra, in grigio, quello che riporta dall'anno prima; cancellare il valore lo toglie).
- Il pulsante **Download** di ogni pagina dà l'Excel o il PDF.
- Sul telefono la tabella scorre di lato (prima versione; non c'è una scheda per riga).
- Non progettata su Figma: le tabelle del sito ([stile-interfaccia.md](stile-interfaccia.md)).

### I dati

- `cash_entry`: data, descrizione, `category_id` (Voce, può mancare), `method_id` (metodo, può mancare), `account` (`cash`/`bank`/`paypal`), `amount` (con segno: positivo entrata, negativo uscita, mai zero), `invoice_checked`, `sponsorship` (solo per le entrate: un controllo del database).
- `cash_opening`: anno, conto, importo (unico per anno e conto, anche negativo). Un anno senza saldo iniziale proprio riparte dalla chiusura dell'anno prima.
- `cash_category` (le Voci, con `sponsorship` come valore di partenza) e `cash_method` (i metodi): liste in **Settings** («Register: Voci», «Register: payment methods»), con USED BY, ordine e senza poter cancellare ciò che è usato. Partono con le 48 Voci e i 5 metodi del foglio (migrazione `0018`; gli stessi valori sono in `apps/api/src/modules/cash/defaults.ts`, che i test rimettono a ogni prova).
- `team_inflow.sponsorship` (di base vera) e `team_inflow.cash_entry_id` (l'entrata che ha ricevuto l'inflow; unico; se l'entrata si cancella torna vuoto). `cash_entry_line`: un'uscita, una riga del budget e quanto ha pagato (unico per coppia, importo sopra zero; se si cancella l'uscita o la riga sparisce).
- Nella tabella degli utenti, `app_user.treasury` e `app_user.sponsors` (due spunte, valgono per i pm). Migrazione `0019`: chi era `treasurer` è diventato pm con la spunta Treasury; migrazione `0021`: chi aveva il ruolo `sp` è diventato pm con la spunta Sponsors e il ruolo `sp` non esiste più.
- Tutte le tabelle nuove sono nello storico delle modifiche. Soldi in centesimi nel codice e `numeric(14,2)` nel database.

### I ruoli

I ruoli sono `admin`, `pm` e `viewer`; nel sito il `pm` si chiama **«User»** (il valore tecnico non cambia). La **tesoreria** e chi **tiene gli sponsor** non sono ruoli ma **due spunte** («Treasury» e «Sponsors», da **Users**, sulla scheda di un pm; si possono avere tutte e due). `canManageCash` = admin, oppure pm con la spunta Treasury: lo controlla ogni servizio del registro e anche gli inflow e il BANK scritti a mano di CASH FLOW. `canManageFunds` / `canEditShared` = admin, oppure pm con la spunta Sponsors: crea e cambia i fondi degli sponsor e i loro contratti (CASH FROM), e non entra nel registro né negli inflow e nel BANK. Il pm con una spunta resta un pm: le sue aree, inventario, fornitori e storico non cambiano. Una spunta su un viewer o su un admin non fa niente: l'API la rifiuta (`400`) e cambiando ruolo si spegne. In una stagione in sola lettura nemmeno la tesoreria cambia gli inflow ([stagioni-anni-fiscali-e-macchine.md](stagioni-anni-fiscali-e-macchine.md)). La tabella dei ruoli è in [accesso-e-storico.md](accesso-e-storico.md).

### L'import («Import from Excel» nella pagina)

1. **File.** Il browser legge il `.xlsx` (`apps/web/src/lib/cashSheet.ts`; la libreria `exceljs` c'è già, per scaricare l'Excel) e manda all'API le righe già lette: l'immagine di produzione resta com'è. Legge il foglio «movimenti cassa e banca» (o, se manca, il primo che ha le intestazioni Data e Descrizione), trova le colonne **dalle intestazioni** (Data, Descrizione, Voce, Metodo di pagamento, Check fattura, e Entrate/Uscite/Progressivo di ogni conto, riconosciuto dalla scritta Cassa/Banca/Paypal sopra), legge i **saldi iniziali** dalla riga «saldo…», ignora le formule dei progressivi e le righe vuote in fondo, e raccoglie le **note** scritte a lato. Una riga che non può essere un movimento (senza data, senza importo, importo che non è un numero o con più di due decimali, più importi) è segnalata con il suo numero e lasciata fuori. Il browser controlla anche i progressivi del foglio contro i movimenti e dice **da quale riga** non tornano (di solito il Paypal).
2. **Controllo** (`POST /api/cash/import/preview`, non salva niente): quante righe sono già nel sito, nuove, «uguali ma scritte diversamente», quante ci sono solo nel sito; Voci e metodi che il sito non ha; righe senza Voce; i saldi finali del foglio contro quelli del sito; le righe di un altro anno.
3. **Applicare** (`POST /api/cash/import`), in due modi, sempre in una transazione sola:
   - **Add what is missing**: aggiunge le righe nuove; non cancella mai; rilanciarlo non aggiunge niente. Una riga è «già nel sito» se coincidono data, conto, importo e testo (senza badare a maiuscole, spazi e tipo di apostrofo), **contando le ripetizioni** (due commissioni uguali nello stesso giorno sono due movimenti). Se coincidono data, conto e importo ma cambia il testo, la Voce, il metodo o la spunta fattura, la riga è «cambiata» e di base non si tocca (una spunta le cambia tutte). I saldi iniziali si scrivono solo dove il sito non ne ha. *Non ci sono spunte riga per riga: si aggiunge tutto il nuovo.*
   - **Replace the year**: cancella i movimenti di quell'anno e ricarica il foglio com'è, con i suoi saldi iniziali; chiede di riscrivere l'anno per confermare, con i numeri; le righe cancellate restano nello storico; gli altri anni non si toccano; le spunte Sponsorship ripartono dalla Voce.
   - **Finché il foglio resta la copia principale, il modo giusto è Replace**: è esatto e si può rifare quante volte si vuole. «Add» serve quando si scrive anche nel sito.
   - **Righe di un altro anno** (di base lasciate fuori): *Leave them out*, *Count them in 2026* (stesso giorno e mese, per i refusi) o *Load them in their own year*. Il controllo dice quanto valgono nei saldi.
   - **Voci e metodi sconosciuti**: si creano (in fondo alla lista) oppure si abbinano a uno che il sito ha.

### Il BANK di CASH FLOW

`getBank()` e lo snapshot (`bankOf` in `cashflow.service.ts`) leggono il BANK **dal registro**: Cassa + Banca alla fine di un giorno, che è oggi, o l'ultimo giorno di una stagione già finita. Se il registro non può dirlo (non ha un saldo iniziale fino a quell'anno, quindi nemmeno movimenti sparsi di un anno prima) resta il BANK scritto a mano, e le stagioni vecchie funzionano come prima. Il calcolo di CASH FLOW e del Gantt non cambia: riceve lo stesso importo con la sua data. Con un BANK che viene dal registro il confronto con la data BANK è **sempre per giorno**, anche nel Gantt (le due impostazioni di Settings valgono solo per il BANK scritto a mano). In CASH FLOW il BANK dice «From the register» e il pulsante «Set BANK» non c'è.

## 5. I collegamenti con il resto

Il principio: **il registro è la verità su ciò che è già successo; CASH FLOW e Gantt (la tabella del Team's fund) sono la previsione e ripartono da lì.** Per ogni collegamento vale: **senza collegamenti vale la regola di prima**, e la previsione cambia solo per ciò che è collegato. Le correzioni qui sotto valgono **solo con un BANK che viene dal registro**: con un BANK scritto a mano i soldi del registro non sono in quel BANK e la previsione resta com'era.

### 5.1 BANK = saldo del registro

Vedi §4.

### 5.2 Inflow ↔ entrata del registro («Mark as received»)

- Un inflow **EXPECTED** è denaro promesso. In CASH FLOW la sua riga ha la colonna **STATUS** e due pulsanti (per chi gestisce i soldi del team): la spunta **Mark as received** e la freccia **Not received**.
- **Mark as received** apre un pannello con due strade: **aggiungere il movimento al registro** (data, conto, importo, Voce, metodo: l'importo parte da quello atteso e si corregge se è arrivato meno; la Voce parte da quella delle sponsorizzazioni se l'inflow lo è; la spunta Sponsorship è quella dell'inflow) oppure **«è già nel registro»**: si sceglie un'entrata che c'è già (per esempio importata dal foglio), non ancora legata a un inflow, con quelle dello stesso importo in cima. Un inflow ha un'entrata, un'entrata un inflow.
- **Not received** toglie il collegamento (l'entrata resta nel registro). Cancellare l'entrata fa tornare l'inflow «non ricevuto». Un'entrata che ha ricevuto un inflow non può diventare un'uscita.
- **Nella previsione** (BANK dal registro):
  - un inflow **ricevuto** conta con la **data e l'importo veri dell'entrata**, e con la sua spunta Sponsorship: se la data è prima di quella del BANK i soldi sono già nel BANK e non si contano due volte, mentre l'11% di IVA di una sponsorizzazione, che scade il primo giorno del trimestre dopo, resta da pagare;
  - un inflow **non ricevuto con la data già passata** (o di oggi) è **in ritardo** («Late» in tabella): conta dal giorno dopo il BANK, perché la regola di prima lo faceva sparire (ciò che è prima della data BANK è ignorato);
  - un inflow senza data o con la data futura resta com'era.
- **La tabella ACTUAL** diventa le **entrate del registro con la spunta Sponsorship** dentro la stagione (per data), in sola lettura: sono le sole che generano IVA; le entrate normali (una quota associativa) sono già nel BANK e non compaiono una per una. «New inflow» ha solo il lato Expected (l'API risponde `400` a un inflow ACTUAL). Gli inflow ACTUAL scritti a mano **non si usano** finché il BANK è quello del registro; restano nel database e tornano validi se il BANK torna a mano.
- Nelle pagine **TOTAL** di stagione le entrate datate fino al giorno del BANK non si contano una seconda volta (sono già nel BANK); in un anno solare si contano tutte, come prima (`moneyIn` in `packages/calc/src/moneyIn.ts`).
- API: `GET /api/inflows/receivable` (le entrate che possono ricevere un inflow), `POST /api/inflows/:id/receive` (`{ entryId }`, oppure `{ on, account, amount?, categoryId?, methodId?, description? }`), `DELETE /api/inflows/:id/receive`. Solo un inflow EXPECTED, solo chi gestisce i soldi del team, e non in una stagione in sola lettura.

### 5.3 Uscita ↔ riga del budget

- Un'uscita del registro si collega alle righe che ha pagato, **anche a rate** (più uscite per una riga) **e per più righe** (un'uscita per più righe), ognuna con un importo. Si collega alla **quota del fondo del team** della fase ACTUAL (`teamFundCents`, IVA esclusa: l'IVA ha la sua scadenza), perché sono i soli soldi che escono dal conto del team: una riga pagata da uno sponsor non ha uscite.
- Nel registro, sulle uscite c'è il pulsante **collegamento** (la catena): apre sopra la tabella l'elenco delle righe ACTUAL pagate dal fondo del team, con quanto paga il fondo, quanto hanno già pagato le altre uscite e una casella per **questa uscita** (il pulsante **Rest** mette quel che manca, per quanto basta all'uscita). C'è una ricerca (mostra le prime 40) e il totale contro l'importo dell'uscita.
- **Regole** (l'API le fa rispettare): solo un'uscita; la somma delle righe non supera l'uscita; i pagamenti di una riga, tutti insieme, non superano la quota del fondo del team; solo righe ACTUAL pagate dal fondo del team; una riga una volta sola; la stagione in sola lettura rifiuta (`409`). Si sostituiscono i collegamenti **della stagione scelta nel menù**, quelli di altre stagioni restano. Un'uscita non può scendere sotto la somma dei suoi collegamenti né diventare un'entrata.
- **Nella previsione** (BANK dal registro): una riga con pagamenti collegati conta solo **quello che manca** (quota meno pagato), alla data d'acquisto o, se è già passata, dal giorno dopo il BANK (è in ritardo); una riga pagata per intero non conta (i soldi sono già usciti). Una riga **senza** collegamenti resta com'era (data d'acquisto), così non serve collegare tutto il budget in un giorno. EXPECTED non cambia.
- Nel budget il suggerimento del campo del fondo dice «Paid from the register: X of Y» e sulle schede del telefono c'è «Paid …».
- Nel calcolo: `Snapshot.payments` e `Snapshot.lateFrom` (presenti solo con il BANK dal registro); `PhaseCalc` ha `paidCents`, `teamFundDueCents` (quel che manca) e `cashDate` (quando esce); CASH FLOW e la tabella del Team's fund del Gantt usano questi al posto di `teamFundCents` e della data d'acquisto. Senza pagamenti sono uguali a prima: la riconciliazione col foglio del budget non cambia.
- API: `GET /api/cash/payable-lines`, `PUT /api/cash/entries/:id/lines` (`{ lines: [{ lineId, amount }] }`).

## 6. Cosa manca

- **Fuori per ora:** il rendiconto («voci di ricavocosto»: lo stesso calcolo, un SUMIF per Voce con i totali di sezione), «Pagamenti e Scadenze» (diventeranno previsioni che alimentano lo stesso calcolo), lo stato patrimoniale, i pagamenti dell'IVA collegati alle scadenze, gli allegati delle fatture.
- Da chiedere alla tesoriera: le 6 righe del 2025 e il «saldo al 01/01/2025» sono errori di battitura? Le Voci 9.4 e 9.5 vanno nel rendiconto? ([da-decidere.md](da-decidere.md), D7)
- Una scheda per riga sul telefono, e le spunte riga per riga nell'import.
- Il collegamento di un'uscita guarda le righe della stagione scelta nel menù; un'uscita che paga righe di due stagioni si collega una stagione per volta.
- Gli inflow ACTUAL scritti a mano prima del registro non si trasformano da soli in entrate: con il BANK dal registro conta il registro.

## 7. Prove

- **Calcolo** (`register.test.ts`, 10): progressivi con saldi iniziali e riporto fra anni, il saldo a un giorno (nullo prima del primo saldo iniziale e con movimenti sparsi), l'abbinamento dell'import (uguali, cambiate, nuove, solo nel sito, ripetizioni, rilanciabile). IVA solo sugli inflow spuntati (`cash.test.ts`).
- **API** (`cash.routes.test.ts` 19, `cash-import.routes.test.ts` 13, `cash-links.routes.test.ts` 14): permessi (admin e pm con la spunta Treasury sì; pm senza spunta, pm con la sola spunta Sponsors e viewer `403`; la tesoreria non tocca CASH FROM; chi ha la spunta Sponsors tiene gli sponsor e nient'altro; le due spunte si mettono da Users, si spengono cambiando ruolo e non si possono mettere a un viewer); registro (progressivi per conto, riporto fra anni, saldi negativi, cambiare e cancellare, valori rifiutati, spunta solo per le entrate, storico); liste con USED BY; la spunta sugli inflow; il BANK dal registro (a mano finché non può, poi il registro, ritorno al valore a mano, inflow dopo la sua data, Gantt per giorno, stagione finita); l'import (controllo senza salvare, i due modi, ripetibile, le tre scelte per un altro anno, Voci mappate o create, tutto o niente, conferma dell'anno nella sostituzione, storico); **i collegamenti** (un inflow in ritardo conta dal giorno dopo il BANK; ricevuto conta con data e importo del movimento e l'IVA resta dovuta; collegare un movimento già nel registro, una volta sola e solo se è un'entrata; «Not received» e cancellare il movimento; chi può; l'ACTUAL dal registro in sola lettura e gli inflow ACTUAL scritti a mano ignorati; con il BANK a mano tutto come prima; una riga conta solo quel che manca, alla sua data o dal giorno dopo il BANK, e senza collegamenti è com'era, anche nel Gantt; i collegamenti dei movimenti e delle righe, le somme che non tornano, i permessi e la stagione chiusa).
- **Sito** (`cashSheet.test.ts`, 11): fogli inventati costruiti nel test (colonne dalle intestazioni anche in altro ordine, saldi iniziali, righe vuote, progressivi che non tornano e da quale riga, problemi, note, date scritte in tre modi, euro esatti, scelta del foglio nel file).
- **Con il foglio vero** (in `fonti/`, ignorata da git: il test si salta se manca): letto senza problemi di lettura, e l'unico conto i cui progressivi non tornano è il Paypal. Passato all'API come controllo (senza salvare): le Voci e i metodi del foglio sono tutti nell'elenco del sito; con le 6 righe del 2025 contate nel 2026, **Cassa e Banca coincidono al centesimo con i saldi salvati nel foglio**, e il Paypal è quello che danno i movimenti (il foglio ha la formula sbagliata).
- **Calcolo dei pagamenti** (`payments.test.ts`, 7): una riga senza pagamenti è com'era; con pagamenti conta il resto, alla sua data o dal giorno dopo il BANK; pagata per intero non conta; EXPECTED non cambia; il Gantt segue. `moneyIn.test.ts`: nella stagione le entrate fino al giorno del BANK non si contano due volte.
- **Mutazioni:** contando le ripetizioni una volta sola falliscono 4 test del calcolo; togliendo la conferma dell'anno nella sostituzione, 1 dell'API. Senza lo spostamento «in ritardo» degli inflow falliscono 4 test dell'API; senza i pagamenti nello snapshot, 2.
- **Browser** (dati inventati, poi tolti per id, anche dallo storico): il modulo «New movement», il movimento salvato, import di un foglio inventato (controllo, Voce e metodo nuovi, spunta Sponsorship dalla Voce, saldi iniziali), errore leggibile per un file rovinato; **Mark as received** di un inflow di prova (in ritardo → ricevuto, il BANK sale una volta sola, compare in ACTUAL dal registro) e il collegamento di un'uscita a una riga di prova (riga pagata 30 € su 50 €, ne mancano 20 €).

## 8. Per andare online

- Servono le migrazioni **`0018_cash_register.sql`** (registro, Voci, metodi, spunta sugli inflow), **`0019_roles_sp_and_treasury.sql`** (la spunta `treasury`; chi aveva il ruolo `treasurer` diventa pm con la spunta), **`0020_register_links.sql`** (i collegamenti inflow ↔ entrata e uscita ↔ riga) e **`0021_sponsors_box.sql`** (la spunta `sponsors`; chi aveva il ruolo `sp` diventa pm con la spunta e il ruolo sparisce). Il passo `setup` le applica da solo e `db:roles` dà i permessi a `erp_app` su tutte le tabelle (anche le nuove). Se invece si lancia a mano `db:migrate` come proprietario, servono i `GRANT SELECT, INSERT, UPDATE, DELETE` sulle tabelle `cash_*`.
- Poi: da Users mettere la spunta **Treasury** al pm giusto e la spunta **Sponsors** a chi tiene gli sponsor; in Settings controllare le Voci e i metodi; in «Register», caricare il foglio con **Import from Excel › Replace the year**.
- Subito dopo, il BANK di CASH FLOW dice «From the register». Da quel momento: gli inflow ACTUAL scritti a mano non si usano più (conta il registro); gli inflow attesi con la data passata risultano **Late** finché non si segnano ricevuti; le righe del budget cambiano solo dove si collega un'uscita.

## 9. Dove sta il codice

| Cosa | Dove |
| --- | --- |
| progressivi e abbinamento | `packages/calc/src/register.ts` |
| IVA sugli inflow spuntati | `inflowVat` in `packages/calc/src/cash.ts` |
| tabelle e migrazioni | `apps/api/src/db/schema.ts` (`cash_*`, `team_inflow.sponsorship`, `team_inflow.cash_entry_id`, `app_user.treasury`), `apps/api/drizzle/0018_cash_register.sql`, `0019_roles_sp_and_treasury.sql`, `0020_register_links.sql` |
| registro, liste, import, collegamenti alle righe | `apps/api/src/modules/cash/` (`cash.service.ts`, `cash-lists.service.ts`, `cash-import.service.ts`, `cash-links.service.ts`, `cash.schema.ts`, `cash.routes.ts`, `defaults.ts`) |
| inflow ricevuti, ACTUAL dal registro, ritardo | `loadInflows`, `receiveInflow`, `unreceiveInflow`, `listReceivable` in `apps/api/src/modules/cashflow/cashflow.service.ts`; i pagamenti e il giorno dopo il BANK entrano nello snapshot in `apps/api/src/snapshot.ts` |
| pagamenti nel calcolo | `packages/calc/src/lines.ts` (`paidCents`, `teamFundDueCents`, `cashDate`), `cashflow.ts`, `gantt.ts` |
| BANK dal registro | `bankOf` in `apps/api/src/modules/cashflow/cashflow.service.ts`, usato da `getBank` e da `loadSnapshot` |
| permessi | `canManageCash` e `canManageFunds` in `apps/api/src/modules/auth/auth.service.ts` |
| lettura del foglio | `apps/web/src/lib/cashSheet.ts` |
| pagina, import, liste | `apps/web/src/pages/CashRegisterPage.tsx`, `components/CashImport.tsx`, `pages/CashListsPanel.tsx` |
| inflow ricevuti e righe pagate | `apps/web/src/components/ReceiveInflow.tsx` (usato da `pages/CashFlowPage.tsx`), `components/PayLines.tsx` (usato dal registro) |

| Metodo | Percorso | Cosa |
| --- | --- | --- |
| `GET` | `/api/cash/register?year=` | il registro dell'anno con i progressivi, i saldi e i totali |
| `POST` `PATCH` `DELETE` | `/api/cash/entries`, `/api/cash/entries/:id` | un movimento (`on`, `description`, `categoryId`, `methodId`, `account`, `direction`, `amount`, `invoiceChecked`, `sponsorship`) |
| `PUT` | `/api/cash/openings` | il saldo iniziale di un conto in un anno (`amount: null` lo toglie) |
| `GET` `POST` `PATCH` `DELETE` `PUT order` | `/api/cash/categories`, `/api/cash/methods` | le due liste |
| `POST` | `/api/cash/import/preview`, `/api/cash/import` | il controllo e l'applicazione del foglio |
| `GET` | `/api/bank` | ora dice anche `source` (`register` o `typed`) |
| `GET` `POST` `DELETE` | `/api/inflows/receivable`, `/api/inflows/:id/receive` | le entrate che possono ricevere un inflow; segnare un inflow come ricevuto o no (§5.2) |
| `GET` `PUT` | `/api/cash/payable-lines`, `/api/cash/entries/:id/lines` | le righe ACTUAL pagate dal fondo del team; le righe che un'uscita ha pagato (§5.3) |
| `GET` | `/api/inflows?phase=` | con il BANK dal registro, ACTUAL sono le entrate Sponsorship del registro (`source: "register"`); EXPECTED dice `late`, `cashEntryId`, `receivedOn`, `receivedAmount` |
