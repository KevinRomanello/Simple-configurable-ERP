# Impostazioni (pagina Settings)

**Stato: fatto** (26 ottobre 2026). Gli elenchi da cui le altre pagine scelgono e gli interruttori del calcolo erano scritti nel codice (gli «hardcode» della regola 4, [hardcoded-registry.md](hardcoded-registry.md)). Ora stanno nel database e li cambia l'**admin** dalla pagina **Admin → Settings**. Un cambiamento vale subito per tutte le pagine e finisce nella cronologia (History), come il resto.

## 1. Cosa si imposta

| Riquadro | Cosa | Regole |
| --- | --- | --- |
| **Calculation** | soglia degli scostamenti evidenziati in TOTAL (15%); IVA sugli inflow (11%); su cosa si calcola l'IVA quando uno sponsor copre tutta la riga (Q1); confronto con la data del BANK nel riepilogo di CASH FLOW e nel Gantt (Q2) | ogni voce ha accanto la sua **spiegazione** con un esempio; si salva con **Save** (Undo torna ai valori salvati) |
| **Categories** | le categorie del budget e dell'inventario, il loro **ordine** (è quello dei blocchi di TOTAL e del Gantt: frecce ↑↓) e, per ognuna, quali campi facoltativi mostra un articolo (a cosa serve, codici di sicurezza, smaltimento, stoccaggio, manutenzione); in fondo, i campi degli articoli **senza categoria** | rinominare una categoria la rinomina su **tutte** le righe e gli articoli che la usano; una nuova categoria va in fondo e parte con i campi degli articoli senza categoria |
| **VAT rates** | le aliquote che una riga, uno sponsor o un arrivo possono usare | al massimo due decimali, tra 0 e 100. **Non** decidono l'aliquota degli sponsor di merce: lo 0% della merce senza IVA e l'**11%** della merce con controfattura sono fissi ([sponsor-e-fondi.md](sponsor-e-fondi.md)) e valgono anche se quei valori non sono nell'elenco |
| **Units** | come si conta un articolo (pcs, m, kg…) | rinominare un'unità la rinomina su tutti gli articoli contati con quella |
| **Places** | dove si tengono le cose: sede e stanza, in un ordine | ogni posto ha un **codice** che i movimenti del magazzino salvano: si fa dai nomi quando lo si crea e **non cambia più**, così rinominare un posto non rovina la sua storia |

Regole comuni:

- **Si cancella solo ciò che non è usato.** La colonna **USED BY** dice quante volte (righe e articoli per una categoria, sponsor e righe per un'aliquota, articoli per un'unità, movimenti per un posto); il cestino è spento finché è usato, e il server rifiuta comunque (`409`, con cosa lo usa).
- **Nomi unici** senza badare alle maiuscole (`409` se esiste già).
- **Solo l'admin** legge e scrive questa pagina: lo controlla il server (`403` per gli altri), il menù la mostra solo all'admin (`canManageSettings`).
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

**API** (con login; solo admin):

| Metodo | Percorso | Cosa fa |
| --- | --- | --- |
| `GET` | `/api/settings` | tutto ciò che la pagina mostra, con USED BY |
| `POST` / `PATCH` / `DELETE` | `/api/settings/categories[/:id]` | nuova (`name`, `fields` facoltativi), rinomina e/o campi, cancella |
| `PUT` | `/api/settings/categories/order` | `{ ids }`: il nuovo ordine, con ogni categoria una volta |
| `PUT` | `/api/settings/uncategorized-fields` | `{ fields }` degli articoli senza categoria |
| `POST` / `DELETE` | `/api/settings/vat-rates[/:id]` | `{ rate }` |
| `POST` / `PATCH` / `DELETE` | `/api/settings/units[/:id]` | `{ name }` |
| `POST` / `PATCH` / `DELETE` | `/api/settings/locations[/:id]` | `{ site, room }`; la creazione restituisce il codice |
| `PUT` | `/api/settings/locations/order` | `{ ids }` |
| `PATCH` | `/api/settings/calculation` | `varianceThreshold` (0–1), `inflowVatRate` (%), `vatBaseWhenTotalSponsor`, `bankCompare.summary` / `.timeline` (`day`/`month`); ciò che manca resta com'è |

Le letture per le altre pagine restano quelle di prima (`GET /api/lookups/...`), aperte a chi ha fatto l'accesso.

**La riconciliazione col foglio** (`pnpm reconcile`) usa i valori del vecchio foglio (`defaultLookups()`), **non** quelli scelti dall'admin: deve confrontare col foglio com'era, qualunque cosa sia cambiata dopo. Il caricamento del foglio nel database (`load`) usa invece quelli del database.

## 3. Cosa resta nel codice

Restano hardcode, nel [registro](hardcoded-registry.md):

- **le scadenze IVA trimestrali e l'orizzonte del report IVA**: spariranno quando l'IVA delle righe si pagherà alla data di pagamento (in attesa della risposta su VAT OUTFLOW / PROJECT, [sponsor-e-fondi.md](sponsor-e-fondi.md));
- **la stagione corrente**: fa parte del lavoro su stagioni, anni fiscali e macchine ([stagioni-anni-fiscali-e-macchine.md](stagioni-anni-fiscali-e-macchine.md)).

## 4. Prove

- `apps/api/src/modules/settings/settings.routes.test.ts` (16): solo l'admin (pm e viewer `403`, il permesso in `/api/me`); i valori di partenza; categorie (in fondo con i campi giusti, nomi unici, rinomina con righe e articoli, cancellazione rifiutata con il motivo, ordine seguito da TOTAL, ordine sbagliato rifiutato, campi e articoli senza categoria, campo sconosciuto rifiutato); aliquote (una volta sola, due decimali, fuori scala, subito usabili da uno sponsor, in uso non cancellabili); unità (rinomina con gli articoli, in uso non cancellabili); posti (codice dai nomi che non cambia, doppione rifiutato, con movimenti non cancellabili, ordine); interruttori (l'IVA degli inflow cambia CASH FLOW, la scelta Q1 cambia le righe dello sponsor tipo C, valori fuori scala rifiutati, ciò che non si manda resta); storico (chi ha cambiato cosa).
- Riconciliazione col foglio: **1.995 controlli uguali**, con i valori del foglio.
- Nel browser: la pagina con i cinque riquadri, aggiunta e cancellazione di un'unità, cestino spento su un'unità usata, Save attivo solo dopo una modifica e Undo.
