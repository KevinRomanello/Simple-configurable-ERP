# Design dei prossimi lavori (26 novembre 2026)

**File di lavoro, da eliminare a lavoro finito** (come [tesoreria-design.md](tesoreria-design.md)): quando una fase è fatta, ciò che descrive passa nei documenti stabili indicati nella fase, e qui resta solo «fatta». In questa chat **non è stato scritto codice**: questo è il design, da implementare in un'altra chat, **una fase alla volta**.

Sette richieste dell'utente:

| Fase | Cosa | Peso |
| --- | --- | --- |
| A | La spunta **«ACTUAL same as EXPECTED»** nel form «Add item» | piccolo — **fatta** (26 novembre 2026) |
| B | Le azioni di una riga (collegare, pagare, ricevere, cambiare…) si aprono in un **popup** invece che in cima alla pagina | piccolo-medio — **fatta** (26 novembre 2026) |
| C | **Cancellare un inflow** di CASH FLOW scegliendo da dove: EXPECTED, ACTUAL, registro di cassa | piccolo-medio — **fatta** (26 novembre 2026) |
| D | **TO PAY** visibile a chi tiene il budget, e gli **ordini** (più righe comprate in un solo ordine) | medio-grande — **fatta** (27 novembre 2026, in tre tappe: server, sito, chiusura) |
| E | **Non perdere quello che si sta scrivendo** quando si cambia pagina (bozze) | medio — **fatta** (26 novembre 2026, in due passi: E1 la base e i form più usati, E2 tutti gli altri) |
| F | **Ctrl+Z** (annulla) e Ctrl+Shift+Z (rifai) | grande |
| G | **I moduli**: budget, tesoreria, inventario e anagrafiche spegnibili, che si parlano solo con «API come funzioni». Design a parte: [moduli-architettura.md](moduli-architettura.md) (ADR-2) | molto grande, a passi — **fatta**: G0–G8 (26–27 novembre 2026) |

**Ordine consigliato: A → B → C → E → G → D → F.**
- **Prima le fasi che toccano solo il sito o poco più** (A, B, C, E).
- **Poi la divisione in moduli** (G, a passi, con l'app sempre funzionante). Così D e F nascono già nella forma giusta invece di essere rifatte:
  - D (gli ordini) collega budget e tesoreria, quindi vive in un «ponte»;
  - F (Ctrl+Z) ha una regola per ogni modulo.
- **Dipendenze fra fasi**: B dà il popup che usano C e D; E deve conoscere tutti i form (D aggiunge il suo alla tabella del §5.3).
- **Ogni fase si chiude da sola** (codice, test, documenti, prova nel browser) e si può rilasciare da sola.

---

## 0. Regole per chi implementa

Valgono quelle di [CLAUDE.md](../CLAUDE.md), in particolare:

- **Prima il piano** (regola 5): per ogni fase si presenta all'utente il piano (cosa, in che ordine, cosa resta fuori, i dubbi) e si aspetta il suo via. Questo documento è la base del piano, non lo sostituisce: va riletto contro il codice di quel momento.
- **I commit li fa solo l'utente** (regola 2): niente `git add/commit/push`; solo comandi git di lettura.
- **Documentare** (regola 1): ogni fase aggiorna i documenti indicati in «Documenti da aggiornare», e [collaudo.md](collaudo.md) con quello che è stato provato.
- **Hardcode dentro la funzione-API** (regola 4): i valori fissati qui (24 ore, 5.000 righe…) vanno nel corpo della funzione che un giorno li leggerà dalle impostazioni, marcati `// HARDCODED:` e scritti in [hardcoded-registry.md](hardcoded-registry.md). L'elenco è al §7.
- **Generico, mai pagina per pagina** (memoria dell'utente): ogni comportamento nuovo nasce una volta sola in un pezzo comune (`Table`, `SearchSelect`, `FormPanel`, `Peek`, `request()`, `runWrite()`…) e una prova automatica lo fa rispettare.
- **L'interfaccia è in inglese**, i documenti in italiano, i commenti del codice in inglese. Le etichette fra «» in questo documento sono quelle da mettere nel sito.
- **Dati**: solo sintetici in test e documenti; nelle prove nel browser si annota `max(id)` di `audit_log` prima, si cancellano dopo solo le proprie righe di prova e le proprie righe di storico (`docker compose exec db psql -U erp -d erp`).
- **Prove**: girano nei container (`docker compose exec -T api|web sh -c "cd /app/... && ..."`); il numero dei test in [avvio.md](avvio.md) va aggiornato.

### Le decisioni dell'utente (26 novembre 2026)

1. **Ctrl+Z annulla solo le modifiche fatte nella pagina in cui sei.**
2. **Le bozze restano un giorno** e si cancellano al **logout**. Lo stesso vale per la lista di ciò che si può annullare.
3. **EXPECTED e ACTUAL uguali**: una spunta (in inglese: «ACTUAL same as EXPECTED»); con la spunta **c'è un solo campo per tipo** (una quantità, un prezzo, un CASH FROM…). Poi precisato: **solo nel form di compilazione**.
4. **Le azioni di una riga** non devono aprirsi in cima alla pagina: l'utente ha proposto «un popup oppure il menù appena sotto la riga». Poi confermato: **popup, ovunque** (§2).
5. **Cancellare uno sponsor in CASH FLOW** scegliendo se toglierlo da EXPECTED, da ACTUAL, dal registro di cassa, o da uno o due di questi.
6. **TO PAY** visibile a **tutti quelli che possono modificare il budget**, con la possibilità di **raggruppare più righe in un ordine**; gli User del budget **non pagano**, possono solo cambiare gli ordini. Un pm vede le righe di **tutte le aree**. **Niente colonna «ORDER»** nel budget per ora.
7. **Gli import non si annullano con Ctrl+Z.**
8. **Budget, inventario e tesoreria diventano moduli spegnibili** come le anagrafiche, e i moduli si parlano solo con «API come funzioni» (fase G, [moduli-architettura.md](moduli-architettura.md)).

Le cose da verificare durante il lavoro sono segnate con ⚠️; le risposte alle domande sono al §8.

---

## 1. Fase A — «ACTUAL same as EXPECTED» nel form «Add item»: **fatta** (26 novembre 2026)

Ciò che descriveva è passato nei documenti stabili: come funziona la spunta nel form, i fondi validi in tutte e due le fasi e cosa non fa in [stile-interfaccia.md](stile-interfaccia.md) (paragrafo «Lo stesso vale per ogni inserimento dentro la pagina»); le prove e il giro nel browser in [collaudo.md](collaudo.md). Il codice è in `modules/budget/lineDraft.ts` (`sameActual`, `lineBody`, `withSameActual`, `fundsOfBoth`) e `modules/budget/NewLine.tsx`.

---

## 2. Fase B — Le azioni di una riga si aprono in un popup: **fatta** (26 novembre 2026)

Ciò che descriveva è passato nei documenti stabili: la regola, `Peek` in modalità `form`, il contesto `InPeek` e la prova di architettura in [stile-interfaccia.md](stile-interfaccia.md) (punto 31); dove si apre ogni azione in [registro-di-cassa.md](registro-di-cassa.md) (§5.2–5.4), [inventario.md](inventario.md) e [anagrafiche.md](anagrafiche.md); le prove e cosa non è coperto in [collaudo.md](collaudo.md).

**Poi ridisegnata (stesso giorno):** i popup della prima versione «non c'entravano con l'app», e al loro posto c'è `RowAction` con quattro modi, di base sotto la riga ([stile-interfaccia.md](stile-interfaccia.md), punto 31).

**Decisioni prese con l'utente facendola:** il popup è alto quanto il suo contenuto (stesso massimo del record), non sempre grande; «Add a field», «Add a webhook» e «New form» aprono il popup come la matita; salvataggio vero provato solo dove si poteva rimettere a posto; il telefono provato accendendo per un momento la modifica da telefono.

---

## 3. Fase C — Cancellare un inflow scegliendo da dove: **fatta** (26 novembre 2026)

Ciò che descriveva è passato nei documenti stabili: come funziona il pannello «Delete <azienda>», cosa è «della stessa azienda», le regole di chi può cancellare cosa e i due endpoint in [registro-di-cassa.md](registro-di-cassa.md) (§5.2); le prove e cosa non è coperto in [collaudo.md](collaudo.md).

**Decisioni prese con l'utente facendola:** con un movimento spuntato compare l'avviso «N movements of the register will be deleted»; un movimento che paga righe del budget si rifiuta con un messaggio; la prova con il pm che ha la sola spunta Sponsors è nelle prove dell'API (nel browser non si può senza cambiare l'utente di sviluppo). Il pannello è un `RowAction` (sotto la riga di base).

---

## 4. Fase D — TO PAY per chi tiene il budget, e gli ordini: **fatta** (27 novembre 2026)

Ciò che descriveva è passato nei documenti stabili: chi vede TO PAY e cosa può fare chi non paga, l'ordine (regole, API, la riga dell'ordine, raggruppare, aggiungere, rinominare, sciogliere, pagare un ordine, gli ordini in «Link to lines») in [registro-di-cassa.md](registro-di-cassa.md) (§5.3, §5.4 e §5.4bis); i permessi `canSeeToPay` e `canGroupOrders` in [accesso-e-storico.md](accesso-e-storico.md); le tabelle `purchase_order` e `order_line` in [schema-database.md](schema-database.md); il menù (un gruppo senza voci visibili non si disegna) in [moduli-architettura.md](moduli-architettura.md) (§7) e [stile-interfaccia.md](stile-interfaccia.md); le prove delle tre tappe in [collaudo.md](collaudo.md). Il codice è nel ponte tesoreria×budget: `apps/api/src/bridges/treasury-budget/orders.service.ts` e, nel sito, `bridges/treasury-budget/toPayOrders.ts`, `OrderForms.tsx`, `ToPayPage.tsx`, `PayLines.tsx`.

**Decisioni prese facendola:**
- fatta dopo la fase G, quindi il legame riga → ordine è la tabella del ponte `order_line` (migrazione `0043`), e il budget non sa degli ordini;
- un ordine rimasto senza righe lo toglie un **trigger del database**, invece di una funzione da chiamare in ogni punto che cancella o sposta righe: vale anche quando il budget cancella una riga;
- la riga dell'ordine prende il posto della sua prima riga; la ricerca, se trova una riga dell'ordine, mostra l'ordine intero;
- un ordine pagato **resta** (non si vede più in TO PAY perché le sue righe non ci sono più, e il suo nome resta usato nella stagione); se si cancella il pagamento, le righe tornano in TO PAY nel loro ordine;
- facendola è venuto fuori un errore di «Link to lines» che c'era già: contava due volte la parte di un pagamento su righe fuori dall'elenco. È stato corretto nella tappa 2.

---

## 5. Fase E — Non perdere quello che si sta scrivendo

### 5.0 Stato: fatta (E1 e E2, 26 novembre 2026)

La fase si fa in due passi (decisione dell'utente, 26 novembre 2026).

**E1 — fatta (26 novembre 2026).** La base comune (`core/drafts.ts`, `core/useDraft.ts` con `useDraft` e `useRemembered`, `core/draftGuard.tsx`, `core/DraftNote.tsx`; `RowAction`, `AddSection` e `PageHeader` che chiedono prima di chiudere; `dropAllDrafts` al logout) e questi form: new item (`new-line:<progetto>`), modifica di una riga sul telefono (`line-edit:<riga>`, base `version`), Pay, Link to budget lines, Receive / More arrived / Add goods, Use-move-count, Mark as received, New inflow, Set BANK, il movimento del registro (nuovo e modifica). «Cosa è aperto» è ricordato su TO PAY (il pannello Pay e il collegamento ai pagamenti), PENDING, CASH REGISTER, CASH FLOW (i due lati), pagina del pezzo (posto e «Add goods»), schede del telefono. La prova di architettura c'è, con l'elenco delle eccezioni. Documentato in [stile-interfaccia.md](stile-interfaccia.md), punto 33.

**E2 — fatta (26 novembre 2026).** Tutti gli altri form: «New project» (`new-project:<area>`), «New sponsor» (`new-sponsor`), «New supplier», «New season», le liste delle impostazioni (`quick-add:<lista>`, `new-place`), il pannello Calculation (`settings:calculation`), Item types (`new-type:<padre o root>`, `new-param:<tipo>`), «Edit» di un pezzo (`item-edit:<pezzo>`), «New component», «Add a part», «Make new» (`build:<componente>`), i due form dei token (`new-token`, `new-service-account`) e, nelle anagrafiche, «New table», il record (`registry:record:<tabella>:<record o new>`, solo i campi cambiati), il campo, la vista nuova e le impostazioni della vista, le regole di accesso, il webhook, il modulo (form builder) e le impostazioni della tabella. La prova di architettura **non ha più l'elenco dei form da fare**: restano solo le tre eccezioni (la cornice `FormPanel`, la scelta di un file in `Datasheets`, il modulo pubblico `FormPage`). «Cosa è aperto» è ricordato anche per Item types, il record aperto di una tabella e il pannello delle impostazioni di una tabella (`useRemembered` con un elenco di chiavi o l'inizio di chiavi con `*`, `hasDraft`).

**Non tenuto, di proposito:** le intestazioni di un webhook (di solito c'è una chiave: `Authorization`), la password di una vista pubblica, il token appena creato, i file scelti (CSV delle anagrafiche e «New table» da un file, import dell'Excel, schede tecniche). Il pannello «Import» delle anagrafiche e i form senza pulsante Save (celle, spunte, `CommitInput`) salvano da soli o non hanno nulla da tenere.

**Da sapere per chi aggiunge un form** (cose imparate nella E1 e nella E2):
- `initial` di `useDraft` è «il form vuoto» e serve a sapere se c'è qualcosa di scritto: se il form di partenza dipende da dati che arrivano dopo (un valore letto dal server), il form va montato solo quando i dati ci sono (vedi `BankForm`).
- I form con più viste dello stesso (il form «rapido» del popover e quello intero) usano la stessa chiave: la bozza è una sola.
- Un form che dopo «Add» resta aperto per un altro inserimento (il movimento nuovo del registro) deve fare `saved.discard()` e poi rimettere sé stesso a un valore iniziale nuovo (`setInitial`/`setDraft`).
- Una lista di cose aperte con più copie nella stessa pagina (i due lati di CASH FLOW, un progetto per scheda) vuole la chiave di `useRemembered` con ciò che le distingue.
- `FormPanel` e `.inline-form` mettono `DraftNote` su una riga sola in alto (`.inline-form > .hint`, `.form-grid > .hint`).
- Un pannello che resta aperto dopo il Save (le impostazioni di una tabella, il pannello Calculation) si rimonta con una `key` fatta dei valori salvati: così riparte dai valori nuovi, e una bozza partita da valori vecchi lo dice. Dopo il Save si chiama `saved.discard()` prima del nuovo rendering.
- Un form dentro un pannello che vive più a lungo (il record di una tabella, tra un record e l'altro) va in un componente con una `key` per cosa riguarda (`RecordFields`); la conferma «Discard what you wrote?» la chiede il contenitore (`useGuard`, `run`).
- Lo stato aperto che teneva un oggetto intero (`RegView`, `Webhook`, `RegField`) tiene ora solo l'id: la bozza dice quale form è, e l'oggetto si ritrova dalla lista.

### 5.1 Cosa vede l'utente

- **Ogni form si salva da solo nel browser mentre si scrive**: nuova riga, modifica del pezzo, movimento, record, arrivi, impostazioni…
- **Cambiando pagina e tornando**, il form (o il popup) è di nuovo aperto con quello che c'era scritto. In cima una riga dice «Unsaved changes kept from 14:32 · Discard».
- **Save** salva e la bozza sparisce.
- **Cancel, Close e la × del popup** buttano via la bozza. Se c'è qualcosa di scritto chiedono prima: «Discard what you wrote?»
- **Una bozza dura un giorno** e sparisce al **logout** (decisione 2).
- **Se la cosa è cambiata sul server** dopo che si è cominciato a scrivere (un altro l'ha modificata), la riga avvisa: «"<nome>" changed after you started writing: check before saving · Start again from the current values».
- **Non serve** dove si salva già da solo: celle della griglia, `EditCell`, `CommitInput`, caselle di spunta. Quando si cambia pagina, la casella perde il focus e salva.

### 5.2 La base comune

- **`core/drafts.ts`**:
  - legge, scrive e cancella in `localStorage`, con la chiave `erp.draft:<userId>:<chiave del form>` e il valore `{ value, at, base }`;
  - le bozze più vecchie di un giorno si buttano alla lettura;
  - `dropAllDrafts()` le cancella tutte;
  - ogni lettura e scrittura sta in un `try/catch`: senza `localStorage` il form funziona come oggi;
  - la durata sta nel corpo di una funzione (per esempio `draftRules()`) con `// HARDCODED:` (§7).
- **Il hook `useDraft(chiave, valoreIniziale, { base? })`**:
  - sostituisce lo `useState` dello stato di un form e restituisce `[valore, cambia, { discard, keptAt, stale, dirty }]`;
  - scrive dopo una breve pausa (circa 300 ms) e solo se il valore è diverso da quello iniziale; tornato uguale, cancella la bozza;
  - `base` è ciò da cui la bozza è partita: per una modifica, la `version` della riga o del record, oppure il JSON dei valori del server. Se alla riapertura è diverso, `stale` è vero.
- **Lo stesso hook tiene anche «cosa è aperto»**: quale popup, con quale riga (`useDraft("cash-register:dialog", null)`). Così tornando si riapre il popup giusto, e dentro il form ritrova la sua bozza.
- **`AddSection` e il pulsante giallo di `PageHeader`**: una proprietà `draftKey`. Partono aperti se esiste la bozza di quel form, e la loro «Close» si comporta come Cancel.
- **`FormPanel`**: una proprietà per la riga della bozza (componente `DraftNote`: «kept from», «Discard», e l'avviso «changed after you started» con «Start again…»), e Cancel che chiede conferma quando `dirty`. I form che non usano `FormPanel` mostrano `DraftNote` da soli.
- **Logout**: dove si esce (`forgetUser` in `platform/auth.tsx` e il pulsante di uscita) si chiama `dropAllDrafts()`. Si svuota anche la lista di Ctrl+Z della fase F.
- **Mai nella bozza**: file scelti, password, il token mostrato una volta, il segreto di un webhook.

### 5.3 I form e le loro chiavi

Le chiavi sono proposte: l'importante è che siano stabili e contengano ciò che il form riguarda (riga, pezzo, tabella…).

| Form | File | Chiave | Base (per le modifiche) |
| --- | --- | --- | --- |
| «New item in <progetto>» | `modules/budget/NewLine.tsx` | `new-line:<projectId>` | — |
| Modifica di una riga (telefono) | `modules/budget/LineCards.tsx` (`EditLine`) | `line-edit:<lineId>` | `version` della riga |
| «New project» | `modules/budget/AreaPage.tsx` | `new-project:<area>` | — |
| «New sponsor» | `modules/budget/FundsPage.tsx` | `new-sponsor` | — |
| «New inflow» | `modules/budget/CashFlowPage.tsx` | `new-inflow` | — |
| «Set BANK» | `modules/budget/CashFlowPage.tsx` | `bank` | il BANK salvato |
| «Mark as received» | `bridges/treasury-budget/ReceiveInflow.tsx` | `receive-inflow:<inflowId>` | — |
| «New movement» / «Change movement» (registro) | `modules/treasury/CashRegisterPage.tsx` | `cash-movement:new` / `cash-movement:<id>` | il movimento |
| «Link to budget lines» | `bridges/treasury-budget/PayLines.tsx` | `pay-lines:<entryId>` | le righe già legate |
| «Pay…» | `bridges/treasury-budget/PayForm.tsx` | `pay:<id delle righe, in ordine>` | — |
| «Group as one order» / «Add to order…» (fase D) | `bridges/treasury-budget/OrderForms.tsx` | `order:new` / `order:add` (il popup aperto, con le righe, in `open:to-pay:grouping`) | — |
| Cancellare un inflow (fase C) | `bridges/treasury-budget/DeleteInflow.tsx` | non serve (solo spunte, si rifà in un attimo) | — |
| «New supplier» | `modules/budget/SuppliersPage.tsx` | `new-supplier` | — |
| «New season» | `platform/SeasonsPanel.tsx` | `new-season` | — |
| «New place» e le altre liste delle impostazioni | `modules/inventory/InventorySettings.tsx`, `core/QuickAdd.tsx` | `new-place`, `quick-add:<lista>` | — |
| «New type» / sotto-tipo | `modules/inventory/ItemTypesPanel.tsx` (`NewType`) | `new-type:<parentId o root>` | — |
| «Add parameter» | `modules/inventory/ItemTypesPanel.tsx` (`NewParam`) | `new-param:<typeId>` | — |
| «Edit» di un pezzo | `modules/inventory/ItemPage.tsx` | `item-edit:<itemId>` | i valori del pezzo (`draftOf`) |
| «Use, move, count…» | `modules/inventory/MovementForm.tsx` | `stock:<itemId>:<posto>` | — |
| «Receive» / «More arrived» | `modules/inventory/ReceiveForm.tsx` | `receive:line:<lineId>` / `receive:item:<itemId>` | — |
| Nuovo pezzo (pulsante giallo di INVENTORY) | `modules/inventory/InventoryPage.tsx` | `new-item` | — |
| «New component» | `modules/inventory/ComponentsPage.tsx` | `new-component` | — |
| «Add a part» | `modules/inventory/ComponentPage.tsx` | `new-part:<componentId>` | — |
| «Make new» | `modules/inventory/BuildForm.tsx` | `build:<componentId>` | — |
| «New token» / «New account for a service» | `platform/TokensPanel.tsx` | `new-token`, `new-service-account` | — (mai il token mostrato) |
| «New table» (anagrafiche) | `modules/registry/RegistryHome.tsx` | `registry:new-table` | — |
| Campo nuovo o modificato | `modules/registry/ManagePanels.tsx` (`FieldForm`) | `registry:field:<tableId>:<fieldId o new>` | il campo |
| «New view» | `modules/registry/ManagePanels.tsx` | `registry:new-view:<tableId>` | — (mai la password) |
| Webhook | `modules/registry/ManagePanels.tsx` (`WebhookForm`) | `registry:webhook:<tableId>:<id o new>` | il webhook (mai il segreto) |
| Modulo (form builder) | `modules/registry/FormBuilder.tsx` (`FormEditor`) | `registry:form:<tableId>:<viewId o new>` | il modulo |
| Record | `modules/registry/RecordPanel.tsx` | `registry:record:<tableId>:<recordId o new>` | `version` del record |

**Esclusi, con il motivo scritto nell'elenco delle eccezioni della prova:**
- «Add a data sheet» (`modules/inventory/Datasheets.tsx`): il file non si può tenere;
- «Import from Excel» (`modules/treasury/CashImport.tsx`): un file;
- i moduli pubblici `/forms/…` (`modules/registry/FormPage.tsx`): fuori dal sito, persone senza account;
- la pagina di login.

**Stato «cosa è aperto»** da tenere con lo stesso hook: CASH REGISTER, TO PAY, CASH FLOW, PENDING, pagina di un pezzo, Item types, impostazioni di una tabella delle anagrafiche, il record aperto di una tabella delle anagrafiche.

### 5.4 La prova che lo fa rispettare

In `architecture.test.ts`: ogni file che contiene `<FormPanel` o `<form` deve usare `useDraft`. Le eccezioni sono nell'elenco, ognuna con il motivo. È come le prove di oggi su `<table` → `Table` e `<img` → `Picture`.

### 5.5 Prove

- **`core/drafts.test.ts`**:
  - scrivere, leggere, scadenza dopo un giorno;
  - utente diverso → niente;
  - uguale al valore iniziale → niente bozza;
  - `dropAllDrafts`;
  - `localStorage` che lancia un errore → funziona lo stesso;
  - `stale` con una base diversa.
- **Prova di architettura** (sopra).
- **Browser**:
  - scrivere metà di una riga nuova, andare in un'altra pagina, tornare: il form è aperto con il testo;
  - Save la toglie;
  - Cancel chiede conferma;
  - logout e login: sparita;
  - modificare un pezzo, cambiarlo da un'altra scheda, tornare: avviso «changed after you started».

### 5.6 Documenti da aggiornare

[stile-interfaccia.md](stile-interfaccia.md) (i form e le bozze), [hardcoded-registry.md](hardcoded-registry.md) (la durata), [collaudo.md](collaudo.md).

---

## 6. Fase F — Ctrl+Z (annulla e rifai)

### 6.1 Cosa vede l'utente

- **Dentro una casella** mentre si scrive, Ctrl+Z (⌘Z su Mac) è quello del browser: annulla il testo. Non lo si tocca.
- **Fuori dalle caselle** (dopo aver salvato, cliccato fuori o premuto Esc, su una cella della griglia non in modifica), **Ctrl+Z annulla l'ultima modifica salvata fatta in questa pagina**: una cella del budget, un pezzo, un movimento, un record, un ordine…
- **Ctrl+Shift+Z** (⌘⇧Z), o Ctrl+Y su Windows, la rifà.
- **Un messaggio dice cosa**: «Undone: budget line "Brake pads": quantity 3 → 2 (Ctrl+Shift+Z to redo)». Se non c'è niente: «Nothing to undo on this page».
- **Solo le proprie modifiche, solo quelle fatte in questa pagina** (decisione 1), **solo dell'ultimo giorno** (decisione 2), e si perdono al logout. Ogni scheda del browser ha le sue, come in ogni programma.
- **Annullare è rifiutato, con un messaggio chiaro, se:**
  - dopo, qualcuno (anche la stessa persona, da un'altra pagina) ha cambiato di nuovo le stesse cose: «"Brake pads" was changed again afterwards: change it by hand»;
  - annullare toccherebbe altro: per esempio si è creata una riga e poi qualcuno ci ha legato un pagamento;
  - oggi la persona non potrebbe più fare quella modifica (stagione chiusa, area tolta, spunta Treasury tolta, modulo spento).

### 6.2 L'idea (perché così)

**Il server lo sa già.** Il database scrive ogni modifica nello storico (`audit_log`), con la riga prima e dopo, nella stessa transazione (trigger `audit_row()`, migrazione `0002_audit_triggers.sql`; 41 tabelle, tutte nella tabella del §6.6). Mancano due cose:
1. sapere quali righe dello storico sono **un salvataggio** (una cella della griglia può toccare la riga, le cifre e i fondi);
2. un modo di **rimetterle com'erano**.

**L'idea dell'utente, in versione leggera.** L'utente pensava di tenere lo storico nella cache del browser. Il browser tiene **la lista dei numeri** dei salvataggi suoi, pagina per pagina; i dati da rimettere li prende il server dallo storico, che è la fonte vera.

**Perché non rifare tutto nel browser:**
- dovrebbe sapere come disfare ogni operazione di ogni pagina, cioè codice pagina per pagina;
- sovrascriverebbe alla cieca ciò che altri hanno cambiato dopo;
- non saprebbe ricreare una cosa cancellata con tutto ciò che c'era sotto.

**Rifare è annullare l'annullamento**: l'annullamento è a sua volta un salvataggio con il suo numero. Non servono due meccanismi.

### 6.3 Database

- **Una sequenza `change_seq`** e una colonna **`audit_log.change_id bigint`** (vuota per le scritture fuori dall'API: seed, caricatore, SQL a mano), con indice.
  - Una sequenza e non l'id della transazione di Postgres (`pg_current_xact_id()`): la sequenza si salva e si ripristina con il backup, l'id della transazione in un database nuovo ricomincia e potrebbe ripetersi.
- **`audit_row()` va riscritta** (`CREATE OR REPLACE` in una migrazione) per scrivere anche `change_id` da `current_setting('app.change_id', true)`, come oggi fa con `app.actor_id`.
- **Permessi del ruolo dell'API** (`erp_app`): `USAGE` sulla sequenza. Va aggiunto dove si danno i permessi (`db:roles`, vedi [ruolo-database-setup.md](ruolo-database-setup.md)) e in [rilascio.md](rilascio.md). Il ruolo non può cambiare né cancellare `audit_log`, e non deve: l'annullamento scrive nello storico solo attraverso i trigger, come ogni altra modifica.

### 6.4 Server: il numero di ogni salvataggio

- **`runWrite`** (`core/tx.ts`) all'inizio della transazione:
  - prende un numero da `change_seq`;
  - lo mette in `app.change_id` (insieme a `app.actor_id`, nella stessa istruzione);
  - lo aggiunge alla lista della richiesta in corso.
- **La lista della richiesta** è un `AsyncLocalStorage`, come `userStorage` in `platform/auth/auth.context.ts`.
  - Si apre in un hook `onRequest` per i metodi che scrivono.
  - Un hook `onSend` mette l'intestazione **`X-Change-Ids: 123`** (più numeri separati da virgola se la richiesta ha fatto più transazioni).
  - Le richieste GET non ce l'hanno.
  - Una prova deve mostrare che `onSend` vede la lista aperta in `onRequest`. Se così non fosse, la lista si appende alla `request` di Fastify.
  - ⚠️ Il proxy dell'IT non deve togliere le intestazioni sconosciute: da verificare al rilascio.
- **Scritture che non si annullano**: `runWrite(actor, fn, { undoable: false })` non prende il numero (nessuna intestazione, e lo storico ha `change_id` vuoto). Riguarda:
  - le **immagini** dei pezzi (`item_image` non è nello storico; `setImage` e `removeImage` in `items.service.ts`);
  - le **schede dati** (`datasheets.service.ts`, file non nello storico);
  - i **file delle anagrafiche** (`reg_file`);
  - i **token** (`api-tokens.service.ts`: rimettere un token revocato è una questione di sicurezza);
  - **la sincronizzazione dei ruoli** (`rolesync.service.ts`, la fa il sistema);
  - gli **import**: il registro dall'Excel (`cash-import.service.ts`), le anagrafiche da CSV, Excel, JSON e NocoDB (decisione dell'utente);
  - le scritture del **login**, se ce ne sono;
  - il seed.

### 6.5 Server: annullare

**`POST /api/changes/undo`** `{ ids: number[] }`: i numeri di un salvataggio, cioè l'intestazione di una risposta. Risponde `{ changeId, summary: string[] }`, dove `changeId` è il numero dell'annullamento (serve per rifare) e `summary` sono le frasi del messaggio.

Il modulo nuovo è `apps/api/src/modules/changes/`. Passi, tutti dentro **una** `runWrite` dell'utente:

1. **Leggere** le righe di `audit_log` con quei `change_id`, in ordine di `id`.
   - Nessuna, o anche una di un altro autore → **404**. Non si dice che esistono.
   - La prima più vecchia di **24 ore** → **409** «older than a day: change it by hand (the History shows what it was)».
   - Più di **5.000** righe → **409** «too big to undo». È una protezione: gli import sono già esclusi (§6.4).
2. **Tabelle**: se una riga è di una tabella che non si annulla (§6.6) → 409.
3. **I controlli dei moduli**, prima di toccare nulla (§6.6): permessi di oggi, stagione aperta, modulo acceso. Un rifiuto → 403/404/409 con il messaggio del modulo.
4. **Bloccare** le righe toccate che esistono ancora (`select … for update` per tabella e id).
5. **Controllare che nessuno le abbia cambiate dopo**: per ogni coppia (tabella, id) toccata, non deve esistere in `audit_log` una riga con quella coppia e un `id` più grande dell'ultima di questo salvataggio. È un confronto esatto, fatto dopo il blocco, quindi senza gare. Se esiste → 409 con il nome (da `labelOf`) e l'autore.
6. **Rimettere** le righe percorrendo lo storico **al contrario** (dall'ultima alla prima):
   - un `insert` → `DELETE` di quella riga;
   - un `update` → `UPDATE` di tutte le colonne ai valori di `before`;
   - un `delete` → `INSERT … OVERRIDING SYSTEM VALUE` di `before`, con lo stesso id (le chiavi sono `generated always as identity`).

   Le colonne si leggono da `information_schema` e i valori da `jsonb_populate_record(null::<tabella>, before)`. I nomi delle tabelle passano solo se sono fra quelle dello storico, e si citano come identificatori, mai incollati nel testo.
7. **La colonna `version`** (`budget_line`, `reg_record`) non torna indietro: diventa quella attuale **+1**, così una griglia aperta altrove si accorge del cambio. Il resto torna esattamente com'era.
8. **Controllare che non si sia toccato altro**: le righe dello storico dell'annullamento (`change_id` nuovo) devono riguardare esattamente le stesse coppie (tabella, id). Se una cancellazione ha trascinato a cascata righe arrivate dopo (un pagamento legato alla riga creata), qui compaiono → 409 «"<nome>" is now used by …», e la transazione torna indietro.
9. **I seguiti dei moduli** (§6.6), dentro la transazione e dopo il commit.
10. **Rispondere** con le frasi. Si fanno con `labelOf` e `changesOf` di `platform/audit/audit.service.ts`, da esportare (un solo modo di nominare le cose).

**Perché «al contrario» basta, anche con le cascate.**
- In Postgres i trigger AFTER della stessa tabella scattano in ordine di nome.
- Quelli delle chiavi esterne si chiamano `RI_ConstraintTrigger_…` e vengono prima di `audit_<tabella>`.
- Quindi lo storico registra prima le righe figlie cancellate a cascata e poi la madre. Al contrario si rimette prima la madre e poi le figlie.
- Per gli inserimenti è lo stesso ragionamento rovesciato.

Le prove del §6.9 lo verificano sui casi veri. Se un caso fallisse, il rimedio è rendere `DEFERRABLE` le chiavi esterne (oggi nessuna delle 66 lo è) e rinviarle nella transazione dell'annullamento.

### 6.6 Le regole dei moduli

Il modulo `changes` **non conosce nessun modulo**, come `appmodules`. Sono i moduli a iscriversi, come `rolesync` si iscrive alle anagrafiche con `onRegistryChange`. Con la fase G le regole di annullamento diventano una parte del contratto di ogni modulo e di ogni ponte ([moduli-architettura.md](moduli-architettura.md) §5), e la tabella qui sotto si riparte fra loro.

**Funzione di iscrizione**, per esempio `undoRules(modulo, { tables, check, after?, afterCommit? })`:
- `check(righe, utente)` lancia un errore se oggi l'utente non potrebbe fare quella modifica;
- `after(tx, righe)` gira nella transazione;
- `afterCommit(righe)` gira dopo il commit.

**Una prova di architettura**: ogni tabella con il trigger dello storico è di **esattamente un** modulo, oppure nell'elenco di quelle che non si annullano. Così una tabella nuova senza regola fa fallire la prova.

| Modulo | Tabelle | Controllo (lo stesso del servizio che scrive) |
| --- | --- | --- |
| budget | `project`, `budget_line`, `line_figures`, `line_fund`, `purchase_order` e `order_line` (fase D, del ponte tesoreria×budget) | `canWrite` sull'area del progetto della riga; stagione aperta (`assertSeasonOpen`). Gli ordini con le loro regole ([registro-di-cassa.md](registro-di-cassa.md), §5.4bis). |
| funds | `fund`, `fund_contract` | `canManageFunds`; stagione aperta |
| cashflow | `team_inflow`, `bank_snapshot` | come oggi: aggiungere e cancellare inflow `canChangeInflows`, ricevuti e BANK `canManageCash`; stagione aperta |
| cash | `cash_entry`, `cash_entry_line`, `cash_opening`, `cash_category`, `cash_method` | `canManageCash` (le liste come in Settings) |
| inventory | `inventory_item`, `stock_movement`, `component_part`, `item_param_value`, `item_type`, `item_type_param` | `canManageInventory` (`assertCanManageInventory`); tipi e parametri come `asManager` in `types.service.ts` |
| suppliers | `supplier` | `canManageSuppliers` |
| settings e liste | `category`, `category_field`, `vat_rate`, `unit`, `location`, `setting`, `season` | admin (come le loro scritture) |
| users | `app_user`, `user_area` | admin |
| appmodules | `app_module` | admin |
| registry | `reg_table`, `reg_field`, `reg_view`, `reg_record`, `reg_link`, `reg_comment`, `reg_settings`, `reg_webhook` | modulo acceso; i permessi del registro per quella tabella (`registry.access.ts`); un commento solo chi l'ha scritto. **Dopo**: dentro la transazione gli ascoltatori di `onRegistryChange` (i ruoli calcolati), dopo il commit i webhook, come una scrittura normale (`registry.write.ts`). Rifiutato se rimetterebbe il riferimento a un file che non c'è più. |
| **non si annullano** | `api_token`, `role_sync`, `item_datasheet` | — |

Le tabelle senza storico (`item_image`, `item_datasheet_file`, `reg_file`, `reg_webhook_log`, `app_secret`, `area`) non compaiono mai in un salvataggio annullabile: chi le scrive usa `{ undoable: false }`.

### 6.7 Sito

**`core/undo.ts`: la lista**
- In `sessionStorage`, per scheda; chiave con l'id dell'utente.
- Per ogni **pagina** (`location.pathname`) due pile: annullabili e da rifare. Ogni voce: `{ ids, at }`.
- Al massimo 100 voci per pagina; le voci più vecchie di un giorno si buttano.
- Si svuota al logout (insieme alle bozze, fase E). Una modifica nuova svuota la pila «da rifare» di quella pagina.

**`core/api.ts`, `request()`**
- Dopo una risposta riuscita a una richiesta che scrive, legge `X-Change-Ids` e aggiunge la voce alla pagina corrente.
- È un punto solo per tutto il sito, quindi funziona su ogni pagina senza toccarle.
- La chiamata di annullamento usa una funzione sua, che mette il numero nella pila giusta invece che in quella normale.

**`useUndoKeys()`**, montato una volta in `platform/Shell.tsx` (come `ignorePasswordManagers`):
- ascolta `keydown` sulla finestra;
- **ignora** il tasto se l'evento è già gestito, o se il bersaglio è `input`, `textarea`, `select`, `[contenteditable]`, o è dentro un editor di cella di AG Grid (`.ag-cell-inline-editing`, `.ag-popup-editor`);
- altrimenti Ctrl/⌘+Z annulla, Ctrl/⌘+Shift+Z o Ctrl+Y rifà;
- dopo annulla `invalidateQueries()` (come `useAction`), così ogni pagina si ridisegna;
- messaggio informativo con le frasi del server, oppure errore con il motivo.

**AG Grid**: controllare che `undoRedoCellEditing` resti spento, altrimenti la griglia si prenderebbe Ctrl+Z.

**Lo stesso vale nei popup** (fase B): la pagina è quella sotto.

### 6.8 Cosa resta fuori

- Un pulsante «Undo» sulla pagina e l'annullamento dalla pagina History. Il motore è lo stesso: si possono aggiungere dopo.
- Annullare le modifiche di altri.
- Annullare oltre le 24 ore.
- I moduli pubblici `/forms/…`.

### 6.9 Prove

**API** (`changes.routes.test.ts`):
- una cella del budget: annulla e rifà; `version` +1;
- un pezzo creato con i parametri: annullare cancella pezzo e valori;
- una riga del budget cancellata con cifre e fondi: torna tutto, con gli stessi id;
- un'entrata del registro cancellata che aveva ricevuto un inflow: torna, e torna il legame;
- un ordine creato (fase D);
- la spunta ACTUAL della fase A (una sola modifica);
- due inflow e un'entrata cancellati insieme (fase C);
- conflitti:
  - qualcuno ha cambiato dopo → 409 e nulla cambia;
  - una riga creata e poi legata a un pagamento → 409 e nulla cambia;
  - la modifica di un altro → 404;
  - più vecchia di 24 ore (cambiando `at` nel database di prova) → 409;
  - più di 5.000 righe → 409;
- regole dei moduli: stagione in sola lettura, pm a cui è stata tolta l'area, modulo anagrafiche spento → 404;
- non annullabili: immagine, token, scheda dati, un import del registro o delle anagrafiche → nessuna intestazione e 404;
- intestazione `X-Change-Ids` solo sulle scritture riuscite;
- anagrafiche: un record annullato fa girare i ruoli calcolati;
- prova di architettura: ogni tabella dello storico ha una regola.

**Sito**: `core/undo.test.ts` (pile per pagina, rifare svuotato da una modifica nuova, scadenza, logout, massimo 100) e il filtro dei tasti come funzione pura (caselle, editor della griglia, ⌘ su Mac, Ctrl su Windows).

**Browser**:
- cambiare una cella del budget, cliccare fuori, Ctrl+Z: torna; Ctrl+Shift+Z: rifatto;
- in un'altra pagina «Nothing to undo on this page»;
- dentro una casella Ctrl+Z annulla solo il testo;
- un pezzo modificato e annullato dalla sua pagina;
- conflitto da due schede.

### 6.10 Documenti da aggiornare

[accesso-e-storico.md](accesso-e-storico.md) (storico e annulla), [architettura.md](architettura.md) (il modulo `changes`, le regole dei moduli), [schema-database.md](schema-database.md) (colonna e sequenza), [come-funziona.md](come-funziona.md) (la vita di un salvataggio), [ruolo-database-setup.md](ruolo-database-setup.md) e [rilascio.md](rilascio.md) (permesso sulla sequenza, intestazione al proxy), [hardcoded-registry.md](hardcoded-registry.md), [collaudo.md](collaudo.md).

---

## 7. Riepilogo

### Tabelle e colonne nuove

| Fase | Cosa |
| --- | --- |
| A | nessuna (solo il sito) |
| D | tabelle `purchase_order` e `order_line` del ponte tesoreria×budget (con lo storico; migrazione `0043`) |
| G | le tabelle dei ponti al posto delle colonne che attraversano i moduli ([moduli-architettura.md](moduli-architettura.md) §6) |
| F | sequenza `change_seq`, `audit_log.change_id`, `audit_row()` riscritta, permesso `USAGE` sulla sequenza al ruolo dell'API |

### Endpoint nuovi o cambiati

| Fase | Endpoint |
| --- | --- |
| A | nessuno (il form manda le due fasi, come se fossero scritte a mano) |
| C | `GET /api/treasury-budget/inflows/related`, `POST /api/treasury-budget/inflows/delete` (erano sotto `/api/budget/inflows/`: spostati nel passo G4) |
| D (dopo G) | `GET /api/treasury-budget/to-pay` aperto a chi tiene il budget (con gli ordini), `GET /api/treasury-budget/payable-lines` (con gli ordini), `POST/PATCH/DELETE /api/treasury-budget/orders`, `/me` con `canSeeToPay` e `canGroupOrders` |
| G | tutti gli indirizzi di budget, tesoreria, inventario e ponti sotto il loro nome: tabella in [moduli-architettura.md](moduli-architettura.md) §8.2 |
| F | `POST /api/changes/undo`, intestazione `X-Change-Ids` su ogni scrittura |

### Valori hardcoded (regola 4: dentro la funzione, `// HARDCODED:`, riga in hardcoded-registry.md)

| Valore | Dove (funzione) | Cosa diventerà |
| --- | --- | --- |
| Una bozza dura 24 ore | `draftRules()` in `core/drafts.ts` | un'impostazione |
| Si annulla per 24 ore | la funzione delle regole di `changes` (per esempio `undoLimits()`) | un'impostazione |
| Al massimo 5.000 righe in un annullamento | la stessa funzione | un'impostazione |
| Al massimo 100 voci da annullare per pagina | `core/undo.ts` (una funzione, non una costante sparsa) | un'impostazione |

### Prove di architettura nuove

- **Fase B**: niente `row-panel` né `FragmentRow`.
- **Fase E**: ogni form usa `useDraft`, con le eccezioni motivate.
- **Fase F**: ogni tabella dello storico ha una regola di annullamento.

---

## 8. Domande aperte

Le cinque domande del primo giro hanno avuto risposta (26 novembre 2026):

1. **(Fase A)** Solo nel form di compilazione: niente database, niente griglia. Il §1 è stato riscritto così.
2. **(Fase B)** Popup ovunque, anche dove il form oggi è sotto la riga.
3. **(Fase D)** Un pm vede le righe di **tutte** le aree (un ordine può avere pezzi di più aree, per esempio Amazon US per HW e MT).
4. **(Fase D)** Niente colonna «ORDER» nel budget, per ora.
5. **(Fase F)** Gli import non si annullano con Ctrl+Z.

Per la fase G (i moduli) le domande sono in [moduli-architettura.md](moduli-architettura.md) §14.
