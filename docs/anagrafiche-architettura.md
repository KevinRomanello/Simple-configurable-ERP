# ADR-1: l'architettura delle anagrafiche

**Stato:** accettata
**Data:** 22 novembre 2026
**Chi decide:** il team. L'utente ha dichiarato concluso il lavoro il 22 novembre 2026 e, letta questa valutazione, ha giudicato l'architettura ottima il 23 novembre 2026.

Questa è la valutazione dell'architettura del modulo delle anagrafiche ([anagrafiche.md](anagrafiche.md)), fatta dopo averlo finito e dopo il confronto completo con NocoDB ([anagrafiche-nocodb.md](anagrafiche-nocodb.md)). Per ogni scelta dice:
- le alternative considerate;
- che cosa costa;
- che cosa è stato verificato sul codice, non solo dichiarato.

La revisione ha trovato due difetti, ora corretti (sezione «Che cosa ha trovato la revisione»), e ha aggiunto prove automatiche che tengono l'architettura così com'è.

## Contesto

Che cosa si chiedeva:
- **un modulo generico** per le anagrafiche del team, semplice da usare come NocoDB e con un'API vasta come la sua;
- **i ruoli dell'ERP** presi dalle anagrafiche;
- **moduli** al posto dei Google Form;
- **moduli dell'ERP legati ma indipendenti**, che si parlano con delle API;
- **il più semplice e generico possibile.**

Le forze in gioco:
- **Dimensioni:** il team ha qualche centinaio di persone e qualche migliaio di record in tutto. Non milioni.
- **Persone che lo mantengono:** un team universitario che cambia ogni anno. Pochi pezzi, una sola tecnologia, niente servizi da tenere in piedi.
- **L'ERP esistente:** un'API Fastify su Postgres, con lo storico fatto dai trigger e l'utente del database **senza diritti sulla struttura** (non crea né modifica tabelle).
- **Dati personali** (codice fiscale, documenti, IBAN): servono i permessi per campo, uno storico, e nessun servizio esterno che li veda.
- **Oggi:** NocoDB su SQLite, con n8n, Google Form e Keycloak in arrivo. Problemi scritti dal team: blocchi, persone doppie, nessun permesso per campo, API v2 deprecate.

## Le decisioni

### D1. Un modulo dentro l'ERP, non un programma a parte

| Opzione | Complessità | Costo | Crescita | Familiarità del team |
| --- | --- | --- | --- | --- |
| **A. Modulo dell'ERP** (scelta) | bassa: stesso server, database, login, storico, backup | nessun servizio in più | fino a migliaia di record per tabella (D3) | TypeScript come il resto |
| B. Tenere NocoDB e collegarlo all'ERP | media: due login, due storici, due backup, una sincronizzazione | un servizio in più da tenere aggiornato | NocoDB regge di più | il team lo usa già |
| C. Un microservizio nuovo delle anagrafiche | alta: rete, autenticazione tra servizi, versioni dell'API | un servizio in più | come A | nuovo |

**Perché A:**
- i ruoli dell'ERP, lo storico e i permessi vengono gratis da quello che l'ERP ha già;
- B lascia i problemi che il team ha scritto (SQLite, permessi per campo a pagamento, due sistemi da allineare);
- C aggiunge rete e versioni senza che serva.

**Il prezzo:** quello che NocoDB fa fuori dal database (automazioni, dashboard, AI) non c'è; resta a n8n (anagrafiche-nocodb.md, N).

### D2. Tabelle fisse con i valori in JSONB, non una tabella vera per ogni tabella dell'utente

| Opzione | Complessità | Rischi | Note |
| --- | --- | --- | --- |
| **A. Poche tabelle fisse** (`reg_table`, `reg_field`, `reg_record` con `data jsonb`, `reg_link`…) (scelta) | bassa: nessuna migrazione quando qualcuno aggiunge un campo | i vincoli (unico, obbligatorio, tipo) li controlla il servizio, non il database | lo storico funziona da solo con il trigger che c'è già |
| B. Una tabella Postgres per ogni tabella dell'utente (come NocoDB) | alta: SQL di struttura dall'applicazione, migrazioni a ogni campo | l'utente del database dovrebbe poter creare e cambiare tabelle: si perde una difesa di sicurezza (accesso-e-storico.md, §8.2) | vincoli e indici veri |
| C. Documenti (un database a parte) | media | un secondo database | nessun vantaggio a queste dimensioni |

**Perché A:**
- tiene l'utente del database senza diritti sulla struttura;
- non tocca le migrazioni;
- dà lo storico di ogni modifica senza codice in più.

Rinominare un campo non tocca i dati, perché i valori stanno sotto l'id del campo.

**Il prezzo:** il database non sa che una mail è unica. Lo garantisce `saveRecords`, che **blocca la tabella** (`lockTable`) e controlla tutte le bozze contro i record esistenti nella stessa transazione.

**Verificato** (`parity.routes.test.ts`):
- una prima transazione scrive una mail e resta aperta;
- una seconda con la stessa mail aspetta, e quando la prima chiude trova il doppione (409).

Controprova: togliendo `lockTable` la prova fallisce (la seconda non aspetta e salverebbe il doppione). Dieci richieste insieme con la stessa mail danno un solo record.

### D3. Un motore puro, e le interrogazioni in memoria

| Opzione | Complessità | Sicurezza | Crescita |
| --- | --- | --- | --- |
| **A. Motore puro** (`packages/registry`: valori, formule, filtri, permessi, moduli, senza I/O né orologio) e interrogazioni in memoria (scelta) | bassa: una sola semantica per sito, API, moduli, webhook e ruoli | nessun SQL costruito dai filtri, quindi nessuna SQL injection possibile | misurata qui sotto |
| B. Filtri, ordinamenti e formule tradotti in SQL sul JSONB | alta: un traduttore per ogni operatore e per ogni funzione delle formule, due semantiche da tenere uguali | SQL generato | regge milioni di righe |

**Misura (22 novembre 2026).** Una lista con filtro, ricerca in tutti i campi, ordinamento su una formula, raggruppamento e una media, sul motore, nel container dell'API:

| Persone | Tempo |
| --- | --- |
| 1.000 | 17 ms |
| 5.000 | 77 ms |
| 20.000 | 0,8 s |

**Perché A:**
- il team ha qualche centinaio di persone: c'è più di un ordine di grandezza di margine;
- B costerebbe migliaia di righe e una seconda semantica da tenere allineata.

**Quando cambiare:** sopra le 5.000 righe per tabella. Il punto da toccare è uno solo: `registry.data.ts` (cosa carica) e `query.ts` (come filtra). Si possono passare a SQL i soli filtri sui campi salvati e lasciare il resto al motore (anagrafiche.md, §12).

### D4. I moduli si parlano con funzioni pubbliche e «ganci», non importandosi a vicenda

| Opzione | Accoppiamento | Complessità |
| --- | --- | --- |
| **A. Funzioni pubbliche e ganci** (scelta) | basso, in una sola direzione | bassa: chiamate di funzione nella stessa transazione |
| B. I moduli si importano liberamente | alto: ogni modulo conosce le tabelle degli altri | bassa all'inizio, alta dopo |
| C. Un bus di eventi asincrono | basso | alta: code, consegne, ordine, errori; la modifica e la sua conseguenza non sono più nella stessa transazione |

**Come funziona:**
- `registry.public.ts` è l'unica porta del registro: `peopleInViews`, `groupsOfRegistry`, `onRegistryChange`, `onRegistryUse`.
- `rolesync` è il ponte, l'unico che conosce le due parti:
  - ascolta i cambiamenti del registro (`onRegistryChange`, dentro la stessa transazione, quindi con lo stesso autore nello storico);
  - dice al registro cosa non si può cancellare (`onRegistryUse`);
  - dice agli utenti chi è gestito dal registro (`setManagedCheck`).
- Il registro non sa che `rolesync` esiste. Gli utenti nemmeno. Budget, cassa e inventario non sanno che c'è il registro.
- Togliere `rolesync` è una riga in `app.ts`, e restano due moduli che funzionano da soli.

**Verificato sul codice** (`apps/api/src/architecture.test.ts`, che gira con le prove dell'API):
- i due motori (`packages/registry`, `packages/calc`) importano solo i propri file;
- il registro non importa nessun altro modulo tranne `auth` (chi sta entrando); delle tabelle comuni usa solo `app_user`, lo storico e i propri segreti;
- gli altri moduli raggiungono il registro solo da `registry.public`;
- nessuno importa `rolesync`, tranne `app.ts`;
- budget, cassa, inventario e gli altri non sanno niente del registro.

Nel sito, `apps/web/src/architecture.test.ts` verifica che le pagine usino del motore **solo i tipi**: i valori li calcola il server. Provato al contrario: con un import vietato messo apposta, le prove indicano il file e l'import.

### D5. Permessi, moduli e indirizzi pubblici dentro le stesse regole

- **I permessi** sono regole per tabella (tutti, un gruppo, il proprio record), con campi nascosti o in sola lettura. Valgono record per record e campo per campo, nel motore (`access.ts`), e quindi per lista, record, storico, CSV, OpenAPI e filtri.
- **I gruppi** sono viste della tabella delle persone: un'idea sola invece di un sistema di gruppi a parte, e gli stessi gruppi possono andare a Keycloak.
- **I moduli** sono viste di tipo `form`: stesse regole dei valori, stessa scrittura (`saveRecords`), stessi webhook.
- **Gli indirizzi pubblici non riconoscono nessuno.** I moduli per i membri hanno il loro indirizzo dietro il login, così il proxy di IT può lasciar passare i pubblici senza rischi (anagrafiche.md, §8.3; provato con un `X-Email` falso).

## Che cosa ha trovato la revisione (e com'è stato corretto)

| Trovato | Perché era un problema | Correzione |
| --- | --- | --- |
| Il registro leggeva la tabella di `rolesync` (`role_sync`) per rifiutare la cancellazione di un campo o di un gruppo usati dai ruoli | una dipendenza al contrario: il registro conosceva il modulo che dipende da lui | il gancio `onRegistryUse`: `rolesync` dice al registro cosa usa, il registro chiede senza sapere a chi. Prova nuova: il campo delle aree dei ruoli non si cancella |
| `schema.service.ts` era arrivato a quasi 800 righe (tabelle, campi, viste, impostazioni, webhook) | un file con troppi compiti | i webhook in `webhooks.service.ts` (127 righe); `schema.service.ts` scende a 676 |
| Nessuna prova faceva rispettare i confini | una regola scritta solo nei documenti si perde | le prove dei confini (D4) |
| Nessuna prova mostrava che il blocco della tabella serve: dieci richieste insieme passavano anche senza | la finestra di gara è stretta, quindi una prova che passa comunque non dimostra niente | una prova deterministica con la prima transazione tenuta aperta, che fallisce senza il blocco (D2) |

## Conseguenze

**Più facile:**
- aggiungere un tipo di campo, una funzione delle formule, un operatore, una vista: un punto nel motore, un componente nel sito, nessuna migrazione;
- togliere o sostituire `rolesync` (domani Keycloak) senza toccare il registro;
- provare tutto senza infrastruttura: il motore ha 64 prove pure;
- spiegarlo: la mappa dei file è in anagrafiche.md, §14.

**Più difficile, e accettato:**
- **i vincoli** del database sui valori li tiene il servizio (D2);
- **oltre le 5.000 righe per tabella** serve il passo descritto in D3;
- **i file** stanno nel database (10 MB di base, 50 al massimo per campo): per i video servirà uno storage a parte;
- **un solo processo:** la cache della mappa e il limite di richieste stanno in memoria; con più processi servirebbe un posto comune.

**Da rivedere quando succede:**
- una tabella supera le 5.000 righe (D3);
- arriva Keycloak (anagrafiche.md, §9.3);
- il team vuole un suo server di mappe (`tileAddress`, hardcoded-registry.md).

## Fuori da questo lavoro

- **Proxy di IT.** Va configurato da IT: le quattro regole sono in produzione.md, A7. Tutto quello che dipende dall'ERP è fatto e provato: gli indirizzi pubblici anonimi, `/ext/` per i token, il Caddyfile.
- **Import dei dati veri da NocoDB.** Il team ha deciso di rimandarlo: anagrafiche.md, §13bis.
- **Migrazioni `0033`–`0039`** (le anagrafiche, poi marca e modello dell'inventario e i moduli). Si applicano da sole rilasciando, e le immagini includono già le librerie nuove (rilascio.md).
