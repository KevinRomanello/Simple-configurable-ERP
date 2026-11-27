# Impostazioni (pagina Settings)

**Stato: fatto** (26 ottobre 2026; tipi dell'inventario il 4 novembre). Gli elenchi da cui le altre pagine scelgono e gli interruttori del calcolo erano scritti nel codice (gli «hardcode» della regola 4, [hardcoded-registry.md](hardcoded-registry.md)). Ora stanno nel database e li cambia l'**admin** dalla pagina **Admin → Settings**; gli elenchi con cui si scrive l'**inventario** (**categorie, unità, posti, tipi**) li cambiano anche i **pm** (nel sito «User»), perché senza non si può usare l'inventario (10 novembre 2026). Un cambiamento vale subito per tutte le pagine e finisce nella cronologia (History), come il resto.

## 1. Come è ordinata la pagina (16 novembre 2026)

La pagina non è più una colonna di undici riquadri: ha **cinque sezioni** (le quattro di sotto più **Registry**, delle anagrafiche, che c'è solo a modulo acceso), una alla volta, con le schede in cima e un **indirizzo** per ciascuna (`/settings/budget`, `/settings/inventory`, `/settings/register`, `/settings/app`; l'indirizzo vecchio `/settings/appearance` porta a quest'ultimo). Ognuno vede **solo le schede che può usare**; `/settings` (o un indirizzo che non è suo) porta alla **prima sezione sua**.

| Sezione | Riquadri, in ordine | Chi la vede |
| --- | --- | --- |
| **Budget** | Seasons and cars, Calculation, VAT rates | admin |
| **Inventory** | Categories, Item types, Units, Places | admin e pm («User») |
| **Register** | Register: Voci, Register: payment methods, Voce of a payment by budget category | admin e pm con la spunta **Treasury** |
| **App** (si chiamava Appearance, 23 novembre 2026) | il tema chiaro o scuro; per gli **admin**, anche «Editing on a phone» (§2) **Modules** (gli interruttori dei moduli, [moduli.md](moduli.md)) e **API tokens** con gli account dei servizi | il tema a tutti, anche al viewer; gli interruttori agli admin |

- Un **pm** vede Inventory (e Register con Treasury) più App; un **viewer** vede solo App, senza schede.
- **Categories** sta in Inventory (ci lavorano i pm e i tipi ne dipendono) ma vale **anche per il budget**: i blocchi di TOTAL e del Gantt seguono il suo ordine, e il riquadro lo dice.
- **L'ordine delle liste** (Categories, Places, Register: Voci, Register: payment methods e i parametri di un tipo) si cambia **trascinando la maniglia a sei puntini** a sinistra della riga, come per i progetti del budget (dal 18 novembre 2026; prima c'erano le frecce ↑↓): una linea gialla dice dove cade la riga e al rilascio l'ordine si salva sul server. Con la maniglia selezionata da tastiera, le frecce su e giù spostano la riga di un posto. I parametri che vengono da un tipo padre non hanno la maniglia e restano in cima. Un clic sulla maniglia non fa niente.
- Le schede sono i pulsanti a pillola delle altre pagine, fatti come link (`NavLink` con la classe `chip`): su Figma non c'è un riferimento per Settings. Sul telefono vanno a capo, la pagina non scorre di lato.
- Il codice: dal passo G7 ogni sezione la porta il **manifesto** del suo modulo (`modules/<modulo>/index.tsx`: chiave, nome, posto, chi può usarla e il componente), la sezione App quello della piattaforma (`platform/index.tsx`); con un modulo spento la sua sezione non c'è. `platform/settingsSections.ts` (`settingsSections`, `currentSection`: puri, provati in `settingsSections.test.ts`; le sezioni vere per ruolo in `manifests.test.ts`) e `platform/SettingsPage.tsx` (l'intestazione e le schede); l'indirizzo è la rotta `settings/:section?` del manifesto della piattaforma. I riquadri: Budget in `modules/budget/BudgetSettings.tsx` (con `platform/SeasonsPanel.tsx` e `platform/VatRatesPanel.tsx`), Inventory in `modules/inventory/InventorySettings.tsx` (Categories compreso), Register in `modules/treasury/CashListsPanel.tsx`, Registry in `modules/registry/RegistrySettings.tsx`, App in `platform/AppSettings.tsx`. L'API e i permessi non cambiano.
- **Le liste del nucleo con il loro modulo spento** (G8, tappa 2, scelta A): categorie, stagioni e aliquote IVA sono liste del nucleo, ma stanno nella sezione di un modulo (le categorie in Inventory, stagioni e aliquote in Budget). Ogni sezione dice quali mostra (`shows` del suo manifesto); quelle che nessuna sezione accesa mostra passano in fondo a **Settings › App**, subito dopo Appearance, per chi le teneva già: le categorie per admin e user, stagioni e aliquote per gli admin (`coreListsKeptInApp` in `platform/settingsSections.ts`). Con l'inventario spento il riquadro Categories non ha le colonne dei campi dei pezzi, che sono dell'inventario (`platform/CategoriesPanel.tsx`; l'inventario le aggiunge in `InventorySettings.tsx`). Con tutto acceso Settings non cambia.

## 2. Cosa si imposta

| Riquadro | Cosa | Regole |
| --- | --- | --- |
| **Register: Voci** e **Register: payment methods** (sezione **Register**; gli admin e i pm con la spunta **Treasury**) | le Voci e i metodi di pagamento del registro di cassa, con il loro ordine; per ogni Voce «Sponsorship by default» | USED BY, ordine, nomi unici e niente cancellazione di ciò che è usato, come le categorie; rinominare non rovina niente (i movimenti tengono l'id). Tutto in [registro-di-cassa.md](registro-di-cassa.md) |
| **Seasons and cars** (sezione **Budget**, il primo) | le stagioni (1/9 – 31/8): date, la **macchina** di ognuna (si rinomina sul posto), **READ-ONLY**, quante righe ha il budget; **New season** con l'anno di settembre in cui parte e la macchina | una nuova stagione parte dalla più recente (stessi progetti vuoti, stessi sponsor senza soldi, un Team's fund suo); una stagione in sola lettura si guarda ma il suo budget non si cambia; le stagioni non si cancellano. Tutto in [stagioni-anni-fiscali-e-macchine.md](stagioni-anni-fiscali-e-macchine.md) |
| **Calculation** | soglia degli scostamenti evidenziati in TOTAL (15%); IVA sugli inflow (11%); su cosa si calcola l'IVA quando uno sponsor copre tutta la riga (Q1); confronto con la data del BANK nel riepilogo di CASH FLOW e nel Gantt (Q2) | ogni voce ha accanto la sua **spiegazione** con un esempio; si salva con **Save** (Undo torna ai valori salvati) |
| **Categories** | le categorie del budget e dell'inventario, il loro **ordine** (è quello dei blocchi di TOTAL e del Gantt: si cambia con la maniglia) e, per ognuna, quali campi facoltativi mostra un articolo (a cosa serve, codici di sicurezza, smaltimento, stoccaggio, manutenzione); in fondo, i campi degli articoli **senza categoria** | rinominare una categoria la rinomina su **tutte** le righe e gli articoli che la usano; una nuova categoria va in fondo e parte con i campi degli articoli senza categoria |
| **VAT rates** | le aliquote che una riga, uno sponsor o un arrivo possono usare | al massimo due decimali, tra 0 e 100. **Non** decidono l'aliquota degli sponsor di merce: lo 0% della merce senza IVA e l'**11%** della merce con controfattura sono fissi ([sponsor-e-fondi.md](sponsor-e-fondi.md)) e valgono anche se quei valori non sono nell'elenco |
| **Units** | come si conta un articolo (pcs, m, kg…) | rinominare un'unità la rinomina su tutti gli articoli contati con quella |
| **Places** | dove si tengono le cose: una **stanza** e, se serve, uno **scaffale** e un **ripiano**, tutto testo libero (scaffale e ripiano sono facoltativi; un ripiano vuole uno scaffale), in un ordine. Nel modulo «New place», più ripiani separati da una virgola (`1, 2, 3, 4`) fanno un posto ciascuno, tutti o nessuno | ogni posto ha un **codice** che i movimenti del magazzino salvano: si fa dai nomi quando lo si crea e **non cambia più**, così rinominare un posto non rovina la sua storia |
| **Item types** (sezione **Inventory**, dopo Categories) | i tipi dell'inventario (Resistor, Screw…), **in albero** (Add sub-type, UNDER per spostare; i parametri dei padri si vedono in sola lettura): nome, area, **categoria del budget** (obbligatoria; i tipi fatti prima la chiedono con «Choose…»), se chiedono infiammabile/tossico/cancerogeno; con **Parameters** si apre sotto la tabella il riquadro dei loro parametri (nome, genere, unità, prefissi k/M/µ, scelte di una lista, ordine); **New type** e **Add parameter** come gli altri inserimenti | tutte le regole in [inventario.md](inventario.md#19-aree-tipi-e-parametri): rinomina sempre, genere che non cambia se c'è qualcosa scritto, scelte usate che non si tolgono, tipo cancellabile solo senza articoli |

Regole comuni:

- **Si cancella solo ciò che non è usato, e chi lo usa lo dice il modulo che lo usa** (dal 26 novembre 2026: il nucleo non legge più le tabelle del budget e dell'inventario, fa la domanda «chi usa questo?» e ogni modulo risponde con i suoi conti, in una query per elenco: [moduli-architettura.md](moduli-architettura.md), §5). Rinominare una categoria manda un evento che ogni modulo ascolta per le sue righe, anche se è spento. Unità, posti e campi per categoria, dal 27 novembre 2026 (G5), sono **liste dell'inventario**: li conta e li rinomina l'inventario stesso, e una categoria nuova riceve i campi degli articoli senza categoria dall'evento `categoryCreated` del nucleo. La colonna **USED BY** dice quante volte (righe e articoli per una categoria, sponsor e righe per un'aliquota, articoli per un'unità, movimenti per un posto); il cestino è spento finché è usato, e il server rifiuta comunque (`409`, con cosa lo usa).
- **Nomi unici** senza badare alle maiuscole (`409` se esiste già).
- **L'admin** legge e scrive tutta la pagina. **I pm** leggono `GET /api/settings` e cambiano **Categories** (nome e ordine: la regola è del nucleo, admin e pm, `canKeepCategories`) e, con `canManageInventory` come il resto dell'inventario, i **campi** delle categorie, **Units**, **Places** e **Item types** (da `GET /api/inventory/lists`); restano **solo dell'admin** i **switch del calcolo** (Calculation), le **aliquote IVA** (VAT rates) e le **stagioni** (Seasons and cars): per loro il server risponde `403`. Una categoria serve anche al budget (i blocchi di TOTAL e del Gantt): chi la aggiunge o la rinomina cambia anche quelle pagine, e una categoria in uso non si cancella. **Le liste del registro**, che sono anche dei **pm con la spunta Treasury** (`canManageCash`). Il menù mostra Settings **a ogni ruolo**; ognuno vede solo i suoi riquadri. **Il riquadro «Appearance» (tema chiaro, scuro o come il dispositivo) è di tutti, anche del viewer**, che per il resto vede la pagina vuota: non passa dall'API e la scelta resta nel browser ([stile-interfaccia.md](stile-interfaccia.md), punto 14).
- Le priorità (High, Medium, Low) **non** sono qui: sono fisse per scelta (i colori del foglio).

### Modificare dal telefono: «Editing on a phone» (16 novembre 2026)

Dal telefono è facile toccare qualcosa per sbaglio. Un **interruttore degli admin, uguale per tutta la squadra** (Settings › App, riquadro «Editing on a phone», **On** / **Off**), decide se dal telefono si può modificare il sito.

- **On** (di partenza): non cambia niente. **Off**: su uno **schermo fino a 767 px** (la soglia del layout «telefono») il sito è **di sola lettura per tutti, admin compresi**. Spariscono i pulsanti «Add…», le caselle modificabili, i cestini, Undo, «Make new», arrivi, usi, pagamenti e i comandi di Settings e Users; restano la ricerca, i filtri, le schede, i download, la cronologia e il tema. Su computer e tablet non cambia niente.
- **Come:** il valore è `setting.edit_on_phone` (migrazione `0030_edit_on_phone.sql`, di partenza vero), lo cambia `PATCH /api/settings/site` `{ editOnPhone }` (solo admin: `403` a pm, tesoriere e viewer; nello storico come gli altri interruttori) e arriva a tutti dentro `GET /api/me` (`editOnPhone`: il viewer non può leggere `/api/settings`). Nel sito `useMe()` (`platform/auth.tsx`), con l'interruttore spento e un telefono, restituisce la persona **senza i permessi di scrittura** (`lockEditing`, `platform/permissions.ts`): le pagine non sanno niente, perché decidono già cosa mostrare da lì, e `canEditArea` dice no. Sul telefono compare l'etichetta **«Read only»** nella barra in alto, e Users e Settings dicono perché sono chiuse.
- **Non è una protezione:** il server non sa che schermo hai, e ciò che il tuo ruolo permette resta com'è. È una guardia contro i tocchi sbagliati, non contro chi vuole scrivere.
- **Un admin che lo spegne e apre il sito dal telefono non può riaccenderlo da lì** (per lui il telefono è in sola lettura): lo riaccende da un computer.
- **Prove:** API (`settings.routes.test.ts`: di partenza acceso, tutti lo sanno anche il viewer, solo l'admin lo cambia, valori che non sono sì o no rifiutati, nello storico) e sito (`permissions.test.ts`: solo su un telefono e solo se spento, tolti tutti i permessi di scrittura anche all'admin e lasciata la lettura, la persona originale non cambia).

### La scelta «IVA quando uno sponsor copre tutta la riga»

È la domanda Q1 del tesoriere, confermata il 21 ottobre 2026 con **On the whole value**. Riguarda gli sponsor che danno merce con controfattura (tipo C, [sponsor-e-fondi.md](sponsor-e-fondi.md)): il team paga comunque l'IVA della controfattura, e questa scelta dice su cosa.

| Scelta | Esempio: merce da 1.000,00 € di uno sponsor all'11% |
| --- | --- |
| **On the whole value** (`net`) | 110,00 € di IVA a carico del team |
| **On what the sponsor does not cover** (`net-minus-sponsor`) | lo sponsor copre tutto, quindi 0,00 €: la controfattura non costa niente |

Cambiarla cambia subito tutte le righe pagate da uno sponsor così. La pagina lo spiega accanto alla tendina.

## 3. Come è fatto

| Cosa | Dove |
| --- | --- |
| tabelle | `category`, `category_field` (categoria × campo; `category_id` vuoto = articoli senza categoria; dell'inventario), `vat_rate`, `unit` e `location` (dell'inventario), `setting` (una riga sola): migrazione `0010_admin_settings.sql`, che le crea **già riempite con i valori di prima** (quindi all'inizio non cambia niente) e mette il trigger dello storico |
| valori di partenza | `apps/api/src/platform/lookups/defaults.ts` (`LOOKUP_DEFAULTS`): gli stessi della migrazione. Li usano i test (ogni test riparte da lì) e la riconciliazione col foglio |
| lettura | `listCategories`, `listVatRates` in `platform/lookups/lookups.service.ts`; `getSettings` (gli interruttori del calcolo, dal passo G6) in `modules/budget/lookups.service.ts`; `listLocations`, `listUnits`, `getCategoryFields` in `modules/inventory/lists.service.ts` (dal passo G5): leggono il database (regola 4) |
| scrittura | `apps/api/src/platform/settings/` (categorie, aliquote, «editing on a phone»); `modules/budget/lookups.service.ts` (`updateCalculation`, gli interruttori del calcolo); `apps/api/src/modules/inventory/lists.service.ts` (campi delle categorie, unità, posti) |
| pagina | `apps/web/src/platform/SettingsPage.tsx` (una sezione alla volta, §1; le sezioni dai manifesti dei moduli accesi), fatta con i modelli dell'interfaccia ([stile-interfaccia.md](stile-interfaccia.md)); non c'è un riferimento Figma, come per Users e History |
| permesso | `canManageSettings` in `permissionsOf` (`auth.service.ts`) |

**API** (con login; admin, e i pm per le categorie e le liste dell'inventario; il calcolo e le aliquote IVA solo admin):

| Metodo | Percorso | Cosa fa |
| --- | --- | --- |
| `GET` | `/api/settings` | ciò che la parte del nucleo mostra (categorie e aliquote), con USED BY; gli interruttori del calcolo sono del budget e si leggono da `GET /api/budget/lookups/settings` (dal passo G6) |
| `POST` / `PATCH` / `DELETE` | `/api/settings/categories[/:id]` | nuova (`name`), rinomina, cancella |
| `PUT` | `/api/settings/categories/order` | `{ ids }`: il nuovo ordine, con ogni categoria una volta |
| `POST` / `DELETE` | `/api/settings/vat-rates[/:id]` | `{ rate }` |
| `GET` | `/api/inventory/lists` | la parte dell'inventario: i campi di ogni categoria (per id) e degli articoli senza categoria, le unità e i posti con USED BY |
| `PUT` | `/api/inventory/category-fields/:id` | `{ fields }` di una categoria |
| `PUT` | `/api/inventory/uncategorized-fields` | `{ fields }` degli articoli senza categoria |
| `POST` / `PATCH` / `DELETE` | `/api/inventory/units[/:id]` | `{ name }` |
| `POST` / `PATCH` / `DELETE` | `/api/inventory/locations[/:id]` | creazione `{ room, shelf?, levels?[] }` (un posto per ripiano, tutti o nessuno; restituisce il primo e quanti ne ha fatti), modifica `{ room?, shelf?, level? }` |
| `PUT` | `/api/inventory/locations/order` | `{ ids }` |
| `PATCH` | `/api/budget/settings/calculation` | `varianceThreshold` (0–1), `inflowVatRate` (%), `vatBaseWhenTotalSponsor`, `bankCompare.summary` / `.timeline` (`day`/`month`); ciò che manca resta com'è |

Le letture per le altre pagine sono `GET /api/lookups/...` (categorie, priorità, aliquote, interruttori) e, per i moduli dell'inventario, `GET /api/inventory/locations`, `/units`, `/category-fields` (prima `/api/lookups/…`), aperte a chi ha fatto l'accesso.

**La riconciliazione col foglio** (`pnpm reconcile`) usa i valori del vecchio foglio (`defaultLookups()`), **non** quelli scelti dall'admin: deve confrontare col foglio com'era, qualunque cosa sia cambiata dopo. Il caricamento del foglio nel database (`load`) usa invece quelli del database.

## 3. Cosa resta nel codice

Restano hardcode, nel [registro](hardcoded-registry.md):

- **le scadenze IVA trimestrali e l'orizzonte del report IVA**: spariranno quando l'IVA delle righe si pagherà alla data di pagamento (in attesa della risposta su VAT OUTFLOW / PROJECT, [sponsor-e-fondi.md](sponsor-e-fondi.md));
- **i giorni di una stagione** (1 settembre – 31 agosto). Le stagioni stesse, con la loro macchina e la sola lettura, si gestiscono dal pannello **Seasons and cars** ([stagioni-anni-fiscali-e-macchine.md](stagioni-anni-fiscali-e-macchine.md)).

## 4. Prove

- `apps/api/src/platform/settings/settings.routes.test.ts` (19): solo l'admin (pm e viewer `403`, il permesso in `/api/me`); i valori di partenza; categorie (in fondo con i campi giusti, nomi unici, rinomina con righe e articoli, cancellazione rifiutata con il motivo, ordine seguito da TOTAL, ordine sbagliato rifiutato, campi e articoli senza categoria, campo sconosciuto rifiutato); aliquote (una volta sola, due decimali, fuori scala, subito usabili da uno sponsor, in uso non cancellabili); unità (rinomina con gli articoli, in uso non cancellabili); posti (codice dai nomi che non cambia, doppione rifiutato, con movimenti non cancellabili, ordine); interruttori (l'IVA degli inflow cambia CASH FLOW, la scelta Q1 cambia le righe dello sponsor tipo C, valori fuori scala rifiutati, ciò che non si manda resta); storico (chi ha cambiato cosa).
- `apps/api/src/modules/inventory/types.routes.test.ts` (14): i tipi dell'inventario e i loro parametri, anche i permessi (pm sì, viewer no); elenco in [inventario.md](inventario.md), §14.
- Riconciliazione col foglio: **1.995 controlli uguali**, con i valori del foglio.
- Nel browser: la pagina con i cinque riquadri, aggiunta e cancellazione di un'unità, cestino spento su un'unità usata, Save attivo solo dopo una modifica e Undo.
