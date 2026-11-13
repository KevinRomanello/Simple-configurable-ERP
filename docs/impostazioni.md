# Impostazioni (pagina Settings)

**Stato: fatto** (26 ottobre 2026; tipi dell'inventario il 4 novembre). Gli elenchi da cui le altre pagine scelgono e gli interruttori del calcolo erano scritti nel codice (gli «hardcode» della regola 4, [hardcoded-registry.md](hardcoded-registry.md)). Ora stanno nel database e li cambia l'**admin** dalla pagina **Admin → Settings**; gli elenchi con cui si scrive l'**inventario** (**categorie, unità, posti, tipi**) li cambiano anche i **pm** (nel sito «User»), perché senza non si può usare l'inventario (10 novembre 2026). Un cambiamento vale subito per tutte le pagine e finisce nella cronologia (History), come il resto.

## 1. Cosa si imposta

| Riquadro | Cosa | Regole |
| --- | --- | --- |
| **Register: Voci** e **Register: payment methods** (dopo Item types; gli admin e i pm con la spunta **Treasury**) | le Voci e i metodi di pagamento del registro di cassa, con il loro ordine; per ogni Voce «Sponsorship by default» | USED BY, ordine, nomi unici e niente cancellazione di ciò che è usato, come le categorie; rinominare non rovina niente (i movimenti tengono l'id). Tutto in [registro-di-cassa.md](registro-di-cassa.md) |
| **Seasons and cars** (il primo) | le stagioni (1/9 – 31/8): date, la **macchina** di ognuna (si rinomina sul posto), **READ-ONLY**, quante righe ha il budget; **New season** con l'anno di settembre in cui parte e la macchina | una nuova stagione parte dalla più recente (stessi progetti vuoti, stessi sponsor senza soldi, un Team's fund suo); una stagione in sola lettura si guarda ma il suo budget non si cambia; le stagioni non si cancellano. Tutto in [stagioni-anni-fiscali-e-macchine.md](stagioni-anni-fiscali-e-macchine.md) |
| **Calculation** | soglia degli scostamenti evidenziati in TOTAL (15%); IVA sugli inflow (11%); su cosa si calcola l'IVA quando uno sponsor copre tutta la riga (Q1); confronto con la data del BANK nel riepilogo di CASH FLOW e nel Gantt (Q2) | ogni voce ha accanto la sua **spiegazione** con un esempio; si salva con **Save** (Undo torna ai valori salvati) |
| **Categories** | le categorie del budget e dell'inventario, il loro **ordine** (è quello dei blocchi di TOTAL e del Gantt: frecce ↑↓) e, per ognuna, quali campi facoltativi mostra un articolo (a cosa serve, codici di sicurezza, smaltimento, stoccaggio, manutenzione); in fondo, i campi degli articoli **senza categoria** | rinominare una categoria la rinomina su **tutte** le righe e gli articoli che la usano; una nuova categoria va in fondo e parte con i campi degli articoli senza categoria |
| **VAT rates** | le aliquote che una riga, uno sponsor o un arrivo possono usare | al massimo due decimali, tra 0 e 100. **Non** decidono l'aliquota degli sponsor di merce: lo 0% della merce senza IVA e l'**11%** della merce con controfattura sono fissi ([sponsor-e-fondi.md](sponsor-e-fondi.md)) e valgono anche se quei valori non sono nell'elenco |
| **Units** | come si conta un articolo (pcs, m, kg…) | rinominare un'unità la rinomina su tutti gli articoli contati con quella |
| **Places** | dove si tengono le cose: una **stanza** e, se serve, uno **scaffale** e un **ripiano**, tutto testo libero (scaffale e ripiano sono facoltativi; un ripiano vuole uno scaffale), in un ordine. Nel modulo «New place», più ripiani separati da una virgola (`1, 2, 3, 4`) fanno un posto ciascuno, tutti o nessuno | ogni posto ha un **codice** che i movimenti del magazzino salvano: si fa dai nomi quando lo si crea e **non cambia più**, così rinominare un posto non rovina la sua storia |
| **Item types** (dopo Categories) | i tipi dell'inventario (Resistor, Screw…), **in albero** (Add sub-type, UNDER per spostare; i parametri dei padri si vedono in sola lettura): nome, area, **categoria del budget** (obbligatoria; i tipi fatti prima la chiedono con «Choose…»), se chiedono infiammabile/tossico/cancerogeno; con **Parameters** si apre sotto la tabella il riquadro dei loro parametri (nome, genere, unità, prefissi k/M/µ, scelte di una lista, ordine); **New type** e **Add parameter** come gli altri inserimenti | tutte le regole in [inventario.md](inventario.md#19-aree-tipi-e-parametri): rinomina sempre, genere che non cambia se c'è qualcosa scritto, scelte usate che non si tolgono, tipo cancellabile solo senza articoli |

Regole comuni:

- **Si cancella solo ciò che non è usato.** La colonna **USED BY** dice quante volte (righe e articoli per una categoria, sponsor e righe per un'aliquota, articoli per un'unità, movimenti per un posto); il cestino è spento finché è usato, e il server rifiuta comunque (`409`, con cosa lo usa).
- **Nomi unici** senza badare alle maiuscole (`409` se esiste già).
- **L'admin** legge e scrive tutta la pagina. **I pm** (`canManageInventory`, come il resto dell'inventario) leggono `GET /api/settings` e cambiano **Categories** (con i loro campi e l'ordine), **Units**, **Places** e **Item types**; restano **solo dell'admin** i **switch del calcolo** (Calculation), le **aliquote IVA** (VAT rates) e le **stagioni** (Seasons and cars): per loro il server risponde `403`. Una categoria serve anche al budget (i blocchi di TOTAL e del Gantt): chi la aggiunge o la rinomina cambia anche quelle pagine, e una categoria in uso non si cancella. **Le liste del registro**, che sono anche dei **pm con la spunta Treasury** (`canManageCash`). Il menù mostra Settings **a ogni ruolo**; ognuno vede solo i suoi riquadri. **Il riquadro «Appearance» (tema chiaro, scuro o come il dispositivo) è di tutti, anche del viewer**, che per il resto vede la pagina vuota: non passa dall'API e la scelta resta nel browser ([stile-interfaccia.md](stile-interfaccia.md), punto 14).
- Le priorità (High, Medium, Low) **non** sono qui: sono fisse per scelta (i colori del foglio).

### La scelta «IVA quando uno sponsor copre tutta la riga»

È la domanda Q1 del tesoriere, confermata il 21 ottobre 2026 con **On the whole value**. Riguarda gli sponsor che danno merce con controfattura (tipo C, [sponsor-e-fondi.md](sponsor-e-fondi.md)): il team paga comunque l'IVA della controfattura, e questa scelta dice su cosa.

| Scelta | Esempio: merce da 1.000,00 € di uno sponsor all'11% |
| --- | --- |
| **On the whole value** (`net`) | 110,00 € di IVA a carico del team |
| **On what the sponsor does not cover** (`net-minus-sponsor`) | lo sponsor copre tutto, quindi 0,00 €: la controfattura non costa niente |

Cambiarla cambia subito tutte le righe pagate da uno sponsor così. La pagina lo spiega accanto alla tendina.

## 2. Come è fatto

| Cosa | Dove |
| --- | --- |
| tabelle | `category`, `category_field` (categoria × campo; `category_id` vuoto = articoli senza categoria), `vat_rate`, `unit`, `location`, `setting` (una riga sola): migrazione `0010_admin_settings.sql`, che le crea **già riempite con i valori di prima** (quindi all'inizio non cambia niente) e mette il trigger dello storico |
| valori di partenza | `apps/api/src/modules/lookups/defaults.ts` (`LOOKUP_DEFAULTS`): gli stessi della migrazione. Li usano i test (ogni test riparte da lì) e la riconciliazione col foglio |
| lettura | le stesse funzioni di prima (`listCategories`, `listVatRates`, `getSettings`, `listLocations`, `listUnits`, `getCategoryFields` in `lookups.service.ts`): è cambiato **solo il loro corpo**, che ora legge il database (regola 4). Chi le chiamava non è cambiato |
| scrittura | `apps/api/src/modules/settings/` (servizio e rotte), solo admin |
| pagina | `apps/web/src/pages/SettingsPage.tsx`, fatta con i modelli dell'interfaccia ([stile-interfaccia.md](stile-interfaccia.md)); non c'è un riferimento Figma, come per Users e History |
| permesso | `canManageSettings` in `permissionsOf` (`auth.service.ts`) |

**API** (con login; admin, e i pm per le liste dell'inventario: categorie, unità, posti; il calcolo e le aliquote IVA solo admin):

| Metodo | Percorso | Cosa fa |
| --- | --- | --- |
| `GET` | `/api/settings` | tutto ciò che la pagina mostra, con USED BY |
| `POST` / `PATCH` / `DELETE` | `/api/settings/categories[/:id]` | nuova (`name`, `fields` facoltativi), rinomina e/o campi, cancella |
| `PUT` | `/api/settings/categories/order` | `{ ids }`: il nuovo ordine, con ogni categoria una volta |
| `PUT` | `/api/settings/uncategorized-fields` | `{ fields }` degli articoli senza categoria |
| `POST` / `DELETE` | `/api/settings/vat-rates[/:id]` | `{ rate }` |
| `POST` / `PATCH` / `DELETE` | `/api/settings/units[/:id]` | `{ name }` |
| `POST` / `PATCH` / `DELETE` | `/api/settings/locations[/:id]` | creazione `{ room, shelf?, levels?[] }` (un posto per ripiano, tutti o nessuno; restituisce il primo e quanti ne ha fatti), modifica `{ room?, shelf?, level? }` |
| `PUT` | `/api/settings/locations/order` | `{ ids }` |
| `PATCH` | `/api/settings/calculation` | `varianceThreshold` (0–1), `inflowVatRate` (%), `vatBaseWhenTotalSponsor`, `bankCompare.summary` / `.timeline` (`day`/`month`); ciò che manca resta com'è |

Le letture per le altre pagine restano quelle di prima (`GET /api/lookups/...`), aperte a chi ha fatto l'accesso.

**La riconciliazione col foglio** (`pnpm reconcile`) usa i valori del vecchio foglio (`defaultLookups()`), **non** quelli scelti dall'admin: deve confrontare col foglio com'era, qualunque cosa sia cambiata dopo. Il caricamento del foglio nel database (`load`) usa invece quelli del database.

## 3. Cosa resta nel codice

Restano hardcode, nel [registro](hardcoded-registry.md):

- **le scadenze IVA trimestrali e l'orizzonte del report IVA**: spariranno quando l'IVA delle righe si pagherà alla data di pagamento (in attesa della risposta su VAT OUTFLOW / PROJECT, [sponsor-e-fondi.md](sponsor-e-fondi.md));
- **i giorni di una stagione** (1 settembre – 31 agosto). Le stagioni stesse, con la loro macchina e la sola lettura, si gestiscono dal pannello **Seasons and cars** ([stagioni-anni-fiscali-e-macchine.md](stagioni-anni-fiscali-e-macchine.md)).

## 4. Prove

- `apps/api/src/modules/settings/settings.routes.test.ts` (19): solo l'admin (pm e viewer `403`, il permesso in `/api/me`); i valori di partenza; categorie (in fondo con i campi giusti, nomi unici, rinomina con righe e articoli, cancellazione rifiutata con il motivo, ordine seguito da TOTAL, ordine sbagliato rifiutato, campi e articoli senza categoria, campo sconosciuto rifiutato); aliquote (una volta sola, due decimali, fuori scala, subito usabili da uno sponsor, in uso non cancellabili); unità (rinomina con gli articoli, in uso non cancellabili); posti (codice dai nomi che non cambia, doppione rifiutato, con movimenti non cancellabili, ordine); interruttori (l'IVA degli inflow cambia CASH FLOW, la scelta Q1 cambia le righe dello sponsor tipo C, valori fuori scala rifiutati, ciò che non si manda resta); storico (chi ha cambiato cosa).
- `apps/api/src/modules/inventory/types.routes.test.ts` (14): i tipi dell'inventario e i loro parametri, anche i permessi (pm sì, viewer no); elenco in [inventario.md](inventario.md), §14.
- Riconciliazione col foglio: **1.995 controlli uguali**, con i valori del foglio.
- Nel browser: la pagina con i cinque riquadri, aggiunta e cancellazione di un'unità, cestino spento su un'unità usata, Save attivo solo dopo una modifica e Undo.
