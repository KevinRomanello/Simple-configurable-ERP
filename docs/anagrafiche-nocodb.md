# Anagrafiche e NocoDB: il confronto funzione per funzione

Questo documento mette a fianco **tutto ciò che offre NocoDB** come database (tabelle, campi, viste, record, moduli, condivisione, webhook, import ed export, API, permessi) e ciò che fa il modulo delle anagrafiche dell'ERP ([anagrafiche.md](anagrafiche.md)). Per ogni voce c'è com'è qui e, quando manca, il perché e come si aggiunge.

**Fonte.** La documentazione ufficiale di NocoDB del 22 novembre 2026:
- l'indice completo `nocodb.com/llms.txt`;
- le pagine in Markdown `nocodb.com/docs/product/…`, tra cui le funzioni delle formule e il filtro `where`;
- la descrizione dell'API v3, `nocodb.com/apis/v3/swagger-v3.json`, versione 3.0.0.

La documentazione segna anche il piano che serve: «CE» vale per la Community Edition gratuita, quella che il team ha in casa; «a pagamento» per Plus, Business, Scale e Cloud.

**Legenda.**
- ✓ c'è, come in NocoDB;
- ↔ c'è in un altro modo, che dà lo stesso risultato;
- ✗ manca: il motivo è scritto accanto.

**In sintesi.**
- **Tabelle, campi, formule, filtri, viste, API dei dati e webhook:** tutto quello che NocoDB ha nella sua edizione gratuita c'è, comprese la mappa, i codici QR e a barre e le cartelle di viste. C'è anche gran parte di quello a pagamento:
  - permessi per campo e sicurezza per record;
  - colori delle righe e validazione dei moduli;
  - timeline e gantt con barre da trascinare e date dei successori spostate;
  - webhook per campo e con modello del corpo;
  - UUID e colore.
- **Quello che resta ✗** sono rifiniture d'uso (annulla e ripeti, emoji e menzioni nei commenti, temi dei moduli…) o cose che dipendono da un servizio esterno o da un database collegato; il motivo è scritto accanto a ciascuna.
- **I prodotti di NocoDB che non sono il database** (automazioni, script, dashboard, documenti, AI, sincronizzazioni) restano fuori di proposito: li fa n8n, o un altro modulo dell'ERP (sezione N).

## A. Tipi di campo

| NocoDB | Piano | Qui |
| --- | --- | --- |
| Single line text, Long text, Email, Phone, URL | CE | ✓ `text`, `longtext`, `email`, `phone`, `url` |
| Rich text | CE | ↔ `longtext` con `rich` (markdown) |
| Smart text (editor a blocchi con tabelle e incorporamenti) | a pagamento | ✗ un editor di documenti è un altro prodotto; per i testi lunghi c'è il markdown |
| Number, Decimal, Percent, Currency | CE | ✓ `number`, con `precision` e `format` (`plain`, `percent`, `currency`) |
| Date, Date and time | CE | ✓ `date`, `datetime` |
| Time | CE | ✓ `time` (`HH:MM:SS`; accetta anche «2:30 pm») |
| Duration (h:mm, h:mm:ss, h:mm:ss.s…) | CE | ✓ `duration`: secondi nel dato, come l'API di NocoDB; formato `durationFormat` |
| Year (nelle versioni del team) | CE | ↔ `number` da 1000 a 9999 (l'import lo fa così) |
| Single select, Multi select | CE | ✓ `select`, `multiselect`, con i colori |
| Links / Link to another record (1-1, 1-n, n-n; con se stessa) | CE | ✓ `link`, con il lato inverso |
| Lookup, Rollup | CE | ✓ (rollup nella sezione D) |
| Attachment | CE | ✓ `attachment`, con tipi ammessi, MB e numero di file |
| Barcode, QR code | CE | ✓ `barcode` e `qrcode`: il testo di un altro campo (`fieldId`), disegnato nel sito con le stesse librerie di NocoDB (JsBarcode per gli 11 formati CODE128, EAN13, EAN8, EAN5, EAN2, UPC, CODE39, ITF14, MSI, pharmacode, codabar; qrcode-generator per il QR) |
| Geometry (forme spaziali) | CE | ✗ nessun uso; l'import lo porta come testo |
| GeoData (latitudine e longitudine) | CE | ✓ `geodata` (`lat;lng`, controllato), con il link alla mappa di OpenStreetMap |
| JSON | CE | ✓ `json` |
| Checkbox, Rating | CE | ✓ `checkbox`, `rating` (fino a 10) |
| Colour | a pagamento | ✓ `color` (`#RRGGBB`), con il selettore |
| UUID | a pagamento | ✓ `uuid`: dato dal server alla creazione (e a tutti i record quando si aggiunge il campo); nessuno lo scrive |
| Auto number | a pagamento | ✓ `autonumber` (l'id del record) |
| Formula | CE | ✓ (sezione C) |
| Button: apre un indirizzo, chiama un webhook | CE | ✓ `button` con `url` (una formula; solo `http(s)`) o `webhookId` |
| Button: script, automazione, azione AI | a pagamento | ✗ non ci sono script né AI: il pulsante chiama n8n con il webhook |
| User (uno o più membri) | CE | ✓ `user`: persone dell'ERP, con `@me` nei filtri e nei valori predefiniti |
| Created time, Last modified time, Created by, Last modified by | CE | ✓ `created`, `modified`, `creator`, `modifier` |
| Specific DB type | CE | ✗ ha senso solo su un database esterno collegato a NocoDB (sezione N) |

## B. Impostazioni e azioni di un campo

| NocoDB | Qui |
| --- | --- |
| Nome, tipo, descrizione (il suggerimento sull'intestazione) | ✓ |
| Valore predefinito: fisso o dinamico (la data di oggi, l'utente) | ✓ `options.default`: fisso, `today`, `now`, `@me`. Vale solo per i record nuovi, e non quando un valore viene svuotato apposta, come in NocoDB |
| Valori unici (a pagamento) | ✓ |
| Unico e predefinito insieme vietati | ✓ rifiutato con un messaggio |
| Obbligatorio | ✓ (NocoDB lo ha solo nei moduli; qui vale ovunque) |
| Rinomina, cambia tipo, nascondi, larghezza, campo che dà il nome | ✓ (cambiando tipo i valori si convertono e il server dice quanti sono andati persi) |
| Duplica il campo | ✓ `POST /fields/:id/duplicate`, con i valori; non per i collegamenti (vanno a coppie) |
| Inserisci prima o dopo, riordina | ✓ `PUT /tables/:t/fields/order` |
| Cancella; il lato inverso di un collegamento diventa testo | ↔ si cancellano tutti e due i lati, e la cancellazione è rifiutata finché qualcosa usa il campo |

## C. Formule

Tutte le funzioni dell'elenco di NocoDB, con gli stessi nomi e gli stessi esempi della sua documentazione (verificati da `nocodb-parity.test.ts`):

| Gruppo | Funzioni |
| --- | --- |
| Numeri | ABS, ADD, AVG, CEILING, COUNT, COUNTA, COUNTALL, EVEN, EXP, FLOOR, INT, LOG, MAX, MIN, MOD, ODD, POWER, ROUND, ROUNDDOWN, ROUNDUP, SQRT, SUM, VALUE |
| Testo | CONCAT, FIND, LEFT, LEN, LOWER, MID, REGEX_EXTRACT, REGEX_MATCH, REGEX_REPLACE, REPEAT, REPLACE, RIGHT, SEARCH, SUBSTITUTE (anche l'n-esima), SUBSTR, TEXTAFTER, TEXTBEFORE, TEXTSPLIT, TRIM, UPPER, URL, URLENCODE, MD5, SHA256, SHA512, ISBLANK, ISNOTBLANK |
| Date | DATETIME_DIFF (ms… anni, anche `m` minuti e `M` mesi), DATEADD, NOW, TODAY, WEEKDAY (0 = lunedì, come NocoDB), WEEKNUM, DATESTR, DATETIME_FORMAT (formati di Day.js), DATETIME_PARSE, DAY, MONTH, YEAR, HOUR, MINUTE, SECOND, WORKDAY, WORKDAY_DIFF, CREATED_TIME, IS_SAME, IS_BEFORE, IS_AFTER, FROMNOW, TONOW |
| Liste | ARRAYJOIN, ARRAYSORT, ARRAYUNIQUE, ARRAYCOMPACT, ARRAYSLICE, ARRAYFLATTEN |
| Logica | IF, SWITCH, AND, OR, NOT, BLANK, TRUE, FALSE |
| Altro | JSON_EXTRACT, RECORD_ID |
| Operatori | `+ - * /`, `&`, `= == != <> < <= > >=` |

Le differenze, tutte volute:
- **Fuso orario.** Le date e le ore delle formule sono in UTC, come tutte le date dell'ERP. NocoDB usa il fuso del campo.
- **Funzione dopo il punto.** NocoDB permette `{Link}.SUM()` su un collegamento; qui si usa un rollup o `SUM({Lookup})`.
- **Un esempio sbagliato della documentazione.** Il suo `MID` conta da 0, mentre `SUBSTR` della stessa pagina conta da 1. Qui si conta da 1 per tutte e due, come in SQL.

## D. Collegamenti, lookup, rollup

| NocoDB | Qui |
| --- | --- |
| Rollup: Count, Count All, Count Distinct, Sum, Sum Distinct, Average, Average Distinct, Min, Max | ✓ `countValues`, `count`, `countDistinct`, `sum`, `sumDistinct`, `avg`, `avgDistinct`, `min`, `max`; in più `concat`. Il minimo e il massimo di date sono date |
| Rollup con formula o con condizioni (a pagamento) | ↔ un rollup sul campo di una formula, o un filtro di vista. Le condizioni dentro il rollup non ci sono |
| Lookup, anche di un lookup | ✓ |
| Finestra dei collegati: cerca, scollega, «link more», nuovo record collegato, pagine | ✓ nel record; per l'API `GET …/links/:field?q=&limit=&offset=` |
| Limitare i record sceglibili a una vista | ✓ `limitViewId` sul campo: la scelta mostra i record di quella vista della tabella collegata (`GET /tables/:t/names?view=`). Come in NocoDB, non limita l'API |
| Limitare con un filtro proprio del campo, anche dinamico (a pagamento) | ↔ il filtro della vista scelta; i filtri che dipendono dal record corrente no |
| Incolla su più celle per collegare | ✗ si fa dal record, dall'import CSV o dall'API in blocco |

## E. Viste

| NocoDB | Piano | Qui |
| --- | --- | --- |
| Grid | CE | ✓ |
| Form | CE | ✓ (sezione H) |
| Gallery | CE | ✓ con la foto di copertina |
| Kanban | CE | ✓ trascinamento con mouse, dito e automazione |
| Calendar | CE | ✓ mese, record trascinabili a un altro giorno, esportazione `.ics` |
| Map (segnaposti da un campo GeoData) | CE | ✓ `map` con `geoField`: punti con il nome, clic che apre il record, trascinamento e zoom (pulsanti e rotella). Le mattonelle della mappa passano dall'ERP (`GET /registry/tiles/:z/:x/:y.png`, tenute una settimana): il browser non parla con nessun altro, come vuole la CSP del sito (`img-src 'self'`), e il server delle mappe non sa chi guarda cosa. Mancano i gruppi di punti vicini («cluster») e il clic destro per creare un record nel punto |
| Timeline (barre da una data a un'altra) | a pagamento | ✓ tre mesi alla volta; le barre si trascinano (le due date insieme) e si allungano dai bordi, con mouse, dito e automazione |
| Gantt (timeline con dipendenze) | a pagamento | ✓ la timeline con `dependencyField` (un collegamento della tabella a se stessa) disegna le frecce, e spostando o allungando una barra sposta in avanti i record dopo che comincerebbero prima della sua fine, tenendo la loro durata. Mancano i giorni festivi saltati, i giorni di margine e le modalità di pianificazione |
| List (record annidati per collegamento, su più livelli) | a pagamento | ↔ la griglia raggruppata per un collegamento (fino a cinque livelli) |
| Cartelle di viste | CE | ✓ `folder`: le schede delle viste raggruppate per cartella |

## F. Strumenti di una vista

| NocoDB | Qui |
| --- | --- |
| Filtri annidati, E/O | ✓ |
| Operatori: eq, neq, gt, ge, lt, le, like, nlike (anche `%…`), blank, notblank, empty, null, checked, notchecked, anyof, allof, nanyof, **nallof**, in, btw, **nbtw**, is, isnot, **isWithin**, **~not** | ✓ tutti, nel `where` dell'API e nei filtri della vista (`notAllOf`, `within`, gruppi con `not`) |
| Sotto-operatori delle date: today, tomorrow, yesterday, oneWeekAgo, oneWeekFromNow, oneMonthAgo, oneMonthFromNow, daysAgo N, daysFromNow N, exactDate | ✓ (`today-1m`, `today+7`…) |
| isWithin: pastWeek…pastNumberOfDays, this/last/nextCalendarWeek/Month/Year, dateRange | ✓ tutti |
| Valori tra virgolette nel `where` (v3), `@` per la sintassi v3 nella v2 | ✓ |
| Filtro sull'utente corrente (a pagamento) | ✓ `@me` |
| Filtri «pinned» e «toggle» (a pagamento) | ✗ i filtri sono quelli della vista più quelli che la persona aggiunge; il «toggle» si fa con due viste |
| Ordinamenti multipli; una scelta nell'ordine delle sue opzioni | ✓ |
| Raggruppamento fino a cinque livelli | ✓ `groupBy` come elenco; nella griglia un pannello per gruppo («SW › In trial») |
| Spostare un record in un altro gruppo trascinandolo | ↔ nel kanban sì; nella griglia raggruppata si cambia il valore |
| Campi nascosti, ordine, larghezza | ✓ |
| Altezza delle righe: Short, Medium, Tall, Extra | ✓ `rowHeight` |
| Colonne ferme («freeze») | ✓ `frozen` |
| Colori dei record (a pagamento): per scelta o per condizioni | ✓ `colorBy` (il colore della scelta) e `colors` (regole con filtro) |
| Ricerca in un campo o in tutti | ↔ in tutti i campi visibili |
| Riepiloghi a piè di griglia: Filled, Empty, Unique, % filled/empty/unique, Sum, Avg, Median, Std dev, Min, Max, Range, Checked, Unchecked, % checked | ✓ tutti (`aggregate`) |
| Riepiloghi per gruppo | ✓ con `groupBy` e `aggregate` insieme, ogni gruppo ha i suoi (sotto il titolo del gruppo) |
| Vista collaborativa, bloccata, personale | ✓ collaborativa (chi gestisce la tabella) e bloccata (`locked`). ↔ personale: filtri, ordinamenti e campi scelti dalla persona restano suoi finché non li salva nella vista |
| Rinomina, duplica, cancella, descrizione, icona | ✓ (l'icona è della tabella) |
| Copiare la configurazione di un'altra vista (a pagamento) | ↔ si duplica la vista |
| Filtro nell'indirizzo (`?where=`) | ✓ nell'API; il sito usa `?view=` e `?record=` |

## G. Record

| NocoDB | Qui |
| --- | --- |
| Nuovo, modifica, cancella; cancellazione e modifica in blocco (questa a pagamento) | ✓ e, nella griglia, la selezione di più righe con «Change a field of all» e «Delete them»; via API `bulk-update` e `bulk-delete`, anche per `where` |
| Duplica il record | ✓ valori e collegamenti, non i file |
| Record espanso con tutti i campi | ✓ a lato della tabella |
| Copia l'indirizzo del record | ✓ `/registry/<tabella>?record=<id>` |
| Storico del record (audit) | ✓ solo i campi che chi guarda può vedere |
| Commenti: scrivi, modifica, cancella, cerca | ✓ (la ricerca no) |
| Commenti: risolvi (a pagamento) | ✓ |
| Commenti: emoji, file allegati, annotare immagini, menzioni, notifiche | ✗ l'ERP non manda notifiche. Il webhook `comment` porta ogni commento a n8n, che può avvisare su Telegram |
| Navigazione da tastiera, copia e incolla | ✓ quella di AG Grid |
| Trascinare per riordinare, «inserisci qui» | ✗ l'ordine viene dai campi. Si aggiunge con un campo di posizione e un ordinamento su quello |
| Annulla e ripeti (Ctrl+Z) | ✗ lo storico dice cosa c'era prima. Si aggiunge tenendo nel sito le ultime modifiche della griglia e rimandando i valori precedenti |
| Modelli di record e date che dipendono una dall'altra (a pagamento) | ✗ i modelli ↔ duplicare un record; le dipendenze tra date restano a n8n |
| Presenza in tempo reale (chi guarda la stessa vista) | ✗ servirebbero i websocket; il blocco ottimistico (`version`) impedisce di sovrascrivere |

## H. Moduli

| NocoDB | Qui |
| --- | --- |
| Titolo, descrizione (markdown), domande mostrate e ordinate, etichetta e aiuto per domanda, obbligatori | ✓ |
| Messaggio finale, reindirizzamento, «invia un'altra risposta», modulo vuoto dopo 5 secondi | ✓ `successMessage`, `redirectUrl`, `submitAnother`, `blankAfter` |
| Apertura e chiusura programmate (a pagamento) | ✓ `opensOn`, `closesOn` |
| Precompilazione dall'indirizzo: modificabile, nascosta, bloccata | ✓ `prefill`: `true`, `"hide"`, `"lock"` |
| Survey mode (una domanda alla volta) | ✓ `survey` |
| Bozza salvata nel browser per 30 giorni | ✓ per i moduli che creano un record |
| Domande con condizione (a pagamento) | ✓ `showIf` |
| Validazioni (a pagamento): lunghezza, «inizia con», «contiene», espressione regolare, intervalli di numeri e date (anche «oggi»), file | ✓ `validate`: `minLength`, `maxLength`, `pattern`, `min`, `max` (anche `today`), `message`; i file con le regole del campo |
| Mail a ogni invio | ✗ l'ERP non manda mail: il webhook (`source: "form:<slug>"`) le fa mandare a n8n |
| Tema, sfondo, banner, logo, senza marchio, colonne affiancate, suggerimenti di autocompletamento, scelte come elenco | ✗ le pagine seguono lo stile del sito (regola 6 di `CLAUDE.md`) |
| In più, rispetto a NocoDB | moduli che **aggiornano** un record (il proprio, quello di un link personale firmato, uno scelto da una vista), valori impostati all'invio con condizioni, moduli per un gruppo |

## I. Condivisione

| NocoDB | Qui |
| --- | --- |
| Link pubblico di sola lettura di una vista | ✓ |
| Indirizzo scelto | ✓ `slug` |
| Password | ✓ `sharedPassword`, conservata come hash scrypt e mandata nell'intestazione `X-View-Password`, mai nell'indirizzo; i tentativi passano dal limite di richieste dei moduli |
| Permetti il download (CSV, XLSX) | ✓ CSV (`sharedDownload`) |
| Sync tra basi, lingua forzata | ✗ il sync serve tra istanze di NocoDB; l'interfaccia ha una lingua sola |
| Base condivisa, link d'invito con ruolo | ↔ chi entra nel sito ha i permessi delle regole della tabella |

## J. Webhook

| NocoDB | Qui |
| --- | --- |
| Dopo inserimento, modifica, cancellazione; pulsante | ✓ `create`, `update`, `delete`, `button` |
| Commenti (a pagamento) | ✓ `comment` (aggiunto) |
| Viste e campi creati o cambiati (a pagamento) | ✗ i cambi di struttura sono nello storico dell'ERP |
| Condizioni: scatta quando la condizione **diventa** vera | ✓ `when: "becomes"`; con `"matches"` (il comportamento di prima) scatta a ogni modifica di un record che corrisponde |
| Solo se cambiano certi campi (a pagamento) | ✓ `fields` |
| Solo per un certo modulo (a pagamento) | ↔ il corpo porta `source: "form:<slug>"` |
| GET, POST, PUT, PATCH, DELETE; intestazioni | ✓ `method` (tranne HEAD), `headers` |
| Corpo con template Handlebars: `{{path}}`, `{{json …}}`, `{{#each}}`, `{{#if}}`/`{{else}}`, `@index`, `@last` | ✓ `body`, controllato al salvataggio |
| Prova, log delle chiamate, attiva o disattiva | ✓ (log: le ultime 200) |
| Duplica il webhook | ✓ `POST /webhooks/:id/duplicate` (spento, con un segreto suo) |
| Firma delle chiamate | in più: `X-Registry-Signature` (HMAC) |

## K. Import ed export

| NocoDB | Qui |
| --- | --- |
| Nuova tabella da CSV, Excel, JSON, con i tipi indovinati | ✓ CSV ed Excel (il sito legge il primo foglio); i tipi indovinati tra numero, data, mail, indirizzo, casella e testo. JSON ↔ `POST …/records` con un elenco |
| Import in una tabella esistente, con le colonne abbinate ai campi | ✓ CSV ed Excel, controllo prima di salvare, «aggiungi» o «aggiorna quelli uguali» |
| Download CSV, JSON, Excel (numeri come numeri) | ✓ `export.csv`, `export.json`, Excel fatto nel sito |
| iCalendar di una vista calendario | ✓ `export.ics`, per calendario e timeline |
| Import da Airtable | ↔ import da NocoDB (§13bis di anagrafiche.md): schema, record, collegamenti, file, valori predefiniti |

## L. API v3

| NocoDB (`/api/v3/…`) | Qui (`/api/registry/…`) |
| --- | --- |
| `GET/POST/PATCH/DELETE data/{base}/{table}/records` | ✓ `tables/:t/records` (uno o più, tutto o niente) |
| `POST …/records/upsert` | ✓ `tables/:t/records/upsert` `{match, records}` |
| `GET …/records/{id}` | ✓ |
| `GET …/count` | ✓ `tables/:t/count` |
| `GET/POST/DELETE …/links/{field}/{record}` | ✓ `tables/:t/records/:id/links/:field` (la lettura a pagine, con ricerca) |
| `POST …/records/{id}/fields/{field}/upload` | ✓ `…/files/:field` |
| `POST …/actions/{column}` | ✓ `…/buttons/:field` (un pulsante-indirizzo risponde con l'`url`) |
| Parametri: `fields`, `sort`, `where`, `page`, `pageSize`, `limit`, `offset`, `viewId`, `fieldIdOnResult` | ✓ `fields`, `sort` (`-Date,Name`), `where`, `page`, `pageSize`, `limit`, `offset`, `view`, `fieldKey=id`; in più `filter` (JSON), `q`, `groupBy`, `aggregate`; la risposta ha `total`, `page`, `next` |
| `nestedPage`, `nestedLimit`, `linksAsLtar` | ↔ i collegati arrivano sempre come `{id, name}`; a pagine con l'endpoint dei collegamenti |
| `whereTz` | ✗ le date sono giorni e i momenti sono in UTC |
| `meta/bases/{base}/tables` (lista, crea, leggi, aggiorna, cancella) | ✓ `tables`; la «base» è la sezione |
| `meta/…/fields` (crea, leggi, aggiorna, cancella), `fields/{id}/options` | ✓ `fields/:id`; le scelte si cambiano con `PATCH` |
| `meta/…/views` (lista, crea, leggi, aggiorna, cancella) | ✓ `views/:id` |
| `meta/…/views/{id}/filters`, `…/sorts` | ✓ `GET/PUT views/:id/filters` e `…/sorts` |
| `meta/…/hooks` | ✓ `webhooks/:id` (anche `log` e `test`) |
| `meta/…/records/{id}/comments`, `comments/{id}`, `…/resolve` | ✓ `…/comments`, `PATCH/DELETE comments/:id`, `POST comments/:id/resolve` |
| `meta/tokens` (lista, crea, aggiorna, cancella) | ✓ `/api/tokens` (cancellare = revocare) |
| `meta/bases/{base}/members`, `…/permissions` | ↔ gli utenti dell'ERP (`/api/users`) e le regole della tabella (`PATCH tables/:t` con `access`) |
| `meta/workspaces`, `teams`, `environments`, `scripts`, `dashboards`, `workflows`, `docs`, `feedback` | ✗ sezione N |
| Swagger per base | ✓ `openapi.json`, fatto sulle tabelle e sui campi di chi lo chiede |
| Token `xc-token` | ↔ `Authorization: Bearer erp_…` |
| Copie (dall'interfaccia di NocoDB) | ✓ `POST tables/:t/duplicate` (con o senza record), `views/:id/duplicate`, `fields/:id/duplicate`, `records/:id/duplicate`; `POST tables/import` (da CSV) |

## M. Collaborazione e permessi

| NocoDB | Qui |
| --- | --- |
| Ruoli Owner, Creator, Editor, Commenter, Viewer, No access | ↔ livelli `read` (legge e commenta), `edit`, `manage` per tabella, per gruppo o sul proprio record; gli admin dell'ERP sono gli owner |
| Permessi per tabella (a pagamento) | ✓ |
| Permessi per campo (a pagamento) | ✓ nascosti o in sola lettura |
| Sicurezza per record (Scale) | ✓ la regola `self` (il proprio record, i record collegati a sé) |
| Team e sotto-team (Business, Scale) | ↔ i gruppi sono viste della tabella delle persone, e possono dare i ruoli dell'ERP (`rolesync`) |
| Token API | ✓ |
| Log di audit del workspace (a pagamento) | ✓ lo storico dell'ERP |

## N. Fuori di proposito: i prodotti di NocoDB che non sono il database

| NocoDB | Perché non qui |
| --- | --- |
| Workflows e automazioni, script, «Run script» | Li fa **n8n**, che il team usa già: legge e scrive con l'API, riceve i webhook (anche con modello del corpo, metodo, intestazioni). Un motore di automazioni dentro l'ERP sarebbe un secondo n8n |
| Dashboard e widget | L'ERP ha le sue pagine di analisi; un riepilogo del registro si ha con `aggregate` e i gruppi |
| Docs (documenti) | Il team usa Outline |
| Classic apps (interfacce) | I moduli e le viste sono le interfacce; le pagine apposite dell'ERP si fanno come moduli dell'ERP |
| NocoAI, campi AI, server MCP | Fuori dal perimetro del gestionale; l'OpenAPI permette a un agente di usare l'API |
| App Sync (CRM, HRIS…), NocoDB Sync | Le integrazioni passano da n8n e dall'API |
| Estensioni (bulk update, dedupe, organigramma, page designer…) | Bulk update ✓ (sezione G); dedupe ↔ i valori unici; il resto si fa con l'API |
| Basi su database esterni (PostgreSQL, MySQL già esistenti) | Il registro vive nel database dell'ERP, con le sue regole e il suo storico |
| Snapshot delle basi | I backup di Postgres dell'ERP (produzione.md) |
| Workspace, ambienti, piani, crediti | Un solo team, un solo ERP |
