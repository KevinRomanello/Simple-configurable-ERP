# Com'è organizzato il database

Le **34 tabelle** di PostgreSQL, disegnate. La fonte vera è [apps/api/src/db/schema.ts](../apps/api/src/db/schema.ts) (e le migrazioni in `apps/api/drizzle/`): se cambia lo schema, questo documento va aggiornato nello stesso lavoro. Per le regole di business di ogni area si vedano i documenti indicati in ogni sezione; per l'elenco in tabella e la descrizione di ogni colonna, [architettura.md](architettura.md) (Modello dati).

**Come leggere i diagrammi.** Ogni riquadro è una tabella con le colonne che contano (chiave `PK`, chiave esterna `FK`); le altre sono in `schema.ts`. Le linee sono le chiavi esterne con la loro cardinalità («zampa di gallina»):

| Simbolo | Significa |
| --- | --- |
| `\|\|` | esattamente uno |
| `\|o` | zero o uno |
| `o{` | zero o molti |
| `\|{` | uno o molti |

Esempio: `project ||--o{ budget_line` = un progetto ha zero o più voci, e una voce è di un solo progetto.

## 1. La mappa: sei gruppi e i ponti fra loro

Dentro un gruppo le tabelle sono unite da chiavi esterne (sezioni 2–6). **Fra i gruppi i ponti sono pochi**, ed è qui che si capisce cosa è collegato a cosa. Una linea tratteggiata è un collegamento **per nome** (un testo che deve coincidere con un elenco), non una chiave esterna (sezione 7).

```mermaid
flowchart LR
  bud["<b>Budget</b><br/>season, area, project,<br/>budget_line, line_figures,<br/>line_fund, supplier"]
  fon["<b>Fondi e CASH FLOW</b><br/>fund, fund_contract,<br/>team_inflow, bank_snapshot"]
  reg["<b>Registro di cassa</b><br/>cash_entry, cash_entry_line,<br/>cash_opening, cash_category,<br/>cash_method"]
  inv["<b>Inventario</b><br/>inventory_item, item_type,<br/>item_type_param, item_param_value,<br/>item_image, item_datasheet,<br/>item_datasheet_file,<br/>stock_movement, component_part"]
  acc["<b>Accesso e storico</b><br/>app_user, user_area, audit_log"]
  set["<b>Impostazioni e liste</b><br/>category, category_field,<br/>vat_rate, unit, location, setting"]

  fon -->|"season_id<br/>(fund, team_inflow, bank_snapshot)"| bud
  bud -->|"line_fund.fund_id<br/>chi paga una voce"| fon
  reg -->|"cash_entry_line.line_id<br/>quale uscita ha pagato quale voce"| bud
  fon -->|"team_inflow.cash_entry_id<br/>quale entrata ha ricevuto un inflow"| reg
  inv -->|"stock_movement: project_id,<br/>budget_line_id, car_season_id<br/>inventory_item e item_type: area_id"| bud
  acc -->|"user_area.area_id"| bud
  inv -->|"item_datasheet.uploaded_by"| acc
  bud -.->|"per nome:<br/>category, aliquote"| set
  inv -.->|"per nome:<br/>category, unit, location"| set
```

In parole, i cinque ponti che contano:

1. **Stagione → tutto il budget e i soldi.** `season` è la radice: progetti, fondi, inflow e BANK sono di una stagione. Il registro di cassa **non** ha stagione (è dell'anno solare) e l'inventario nemmeno.
2. **Fondo → riga del budget** (`line_fund`): chi paga una riga in una fase.
3. **Registro → riga del budget** (`cash_entry_line`): quale uscita ha pagato quale riga.
4. **Registro → inflow** (`team_inflow.cash_entry_id`): quale entrata ha ricevuto un inflow atteso.
5. **Inventario → budget** (`stock_movement`): un arrivo completa una riga e si attribuisce a un progetto.

## 2. Budget

Stagioni, aree, progetti, voci e le loro cifre. Una voce ha **al più due righe di cifre** (`line_figures`, una per fase: `estimate` e `actual`); una fase senza riga vale tutti zeri. Le regole: [come-funziona.md](come-funziona.md), [stagioni-anni-fiscali-e-macchine.md](stagioni-anni-fiscali-e-macchine.md).

```mermaid
erDiagram
  season {
    integer id PK
    text name "2026-2027, unico"
    date starts_on
    date ends_on
    text car "la macchina della stagione"
    boolean read_only "sola lettura"
  }
  area {
    integer id PK
    text code "slug, unico"
    text name
    integer position
  }
  project {
    integer id PK
    integer season_id FK
    integer area_id FK
    text name
    text owner_name
    integer position
  }
  budget_line {
    integer id PK
    integer project_id FK
    integer car_season_id FK "macchina di un'altra stagione"
    text item
    text category "per nome (sezione 7)"
    text priority
    integer version "blocco ottimistico"
  }
  line_figures {
    integer id PK
    integer line_id FK
    integer supplier_id FK
    phase phase "estimate o actual"
    numeric quantity
    numeric unit_net_cost
    sponsor_type sponsor_type "none, partial, total"
    numeric vat_rate
    date purchase_date
    date arrival_date
  }
  line_fund {
    integer id PK
    integer figures_id FK
    integer fund_id FK
    integer position "ordine di prelievo"
  }
  supplier {
    integer id PK
    text name "unico senza maiuscole"
  }
  fund {
    integer id PK
  }

  season ||--o{ project : "ha"
  area ||--o{ project : "contiene"
  project ||--o{ budget_line : "ha le voci"
  season |o--o{ budget_line : "car_season_id"
  budget_line ||--o{ line_figures : "una per fase"
  supplier |o--o{ line_figures : "comprato da"
  line_figures ||--o{ line_fund : "pagata da"
  fund ||--o{ line_fund : "paga"
```

- Cancellare un **progetto** cancella le sue voci, le loro cifre e i fondi di quelle cifre (cascata). Cancellare una voce, idem.
- `fund` è solo accennata qui: è disegnata nella sezione 3.
- Una voce paga con uno o più fondi **in ordine** (`position`): il successivo paga ciò che il precedente non copre ([sponsor-e-fondi.md](sponsor-e-fondi.md)).

## 3. Fondi e CASH FLOW

Gli sponsor sono **fondi virtuali** (o in cassa); il fondo del team è uno solo per stagione. I soldi che arrivano al team (gli inflow) e il BANK stanno qui, indipendenti dai fondi. Regole: [sponsor-e-fondi.md](sponsor-e-fondi.md).

```mermaid
erDiagram
  season {
    integer id PK
  }
  fund {
    integer id PK
    integer season_id FK
    text name "unico per stagione"
    fund_kind kind "team o external"
    fund_type type "fund, gift, gift_vat"
    numeric vat_rate "aliquota dello sponsor"
    text group_name "fondi dello stesso gruppo"
  }
  fund_contract {
    integer id PK
    integer fund_id FK
    phase phase
    numeric amount "il valore del fondo"
    date inflow_date
  }
  line_fund {
    integer id PK
    integer fund_id FK
    integer figures_id FK
  }
  team_inflow {
    integer id PK
    integer season_id FK
    phase phase "estimate o actual"
    text source_name
    numeric amount
    date inflow_date
    boolean sponsorship "paga l'IVA dell'11%"
    integer cash_entry_id FK "entrata del registro che l'ha ricevuto"
  }
  bank_snapshot {
    integer id PK
    integer season_id FK "uno per stagione"
    numeric amount
    date as_of_date
  }
  cash_entry {
    integer id PK
  }

  season ||--o{ fund : "ha"
  fund ||--o{ fund_contract : "uno per fase"
  fund ||--o{ line_fund : "paga le voci"
  season ||--o{ team_inflow : "riceve"
  season ||--o| bank_snapshot : "BANK scritto a mano"
  cash_entry |o--o| team_inflow : "cash_entry_id"
```

- **Un solo fondo del team per stagione** e **un contratto per fondo e fase**: sono vincoli del database (indice unico parziale su `kind = 'team'`, unicità di `fund_id + phase`).
- Il fondo del team è «semplice»: niente tipo speciale, aliquota o gruppo (un controllo lo impone); l'aliquota IVA si sceglie sulla singola voce.
- `team_inflow.cash_entry_id` è **unico**: un'entrata riceve al più un inflow. Se l'entrata si cancella, il campo torna vuoto (`ON DELETE SET NULL`) e l'inflow torna «non ricevuto».
- `bank_snapshot` serve solo finché il BANK si scrive a mano: con un saldo iniziale nel registro il BANK viene dal registro e questa riga non conta.

## 4. Registro di cassa

Il fondo del team: ogni movimento su Cassa, Banca o Paypal. **I saldi non si salvano mai**: i progressivi si ricalcolano dai movimenti a ogni lettura. Regole: [registro-di-cassa.md](registro-di-cassa.md).

```mermaid
erDiagram
  cash_entry {
    integer id PK
    date entry_on
    text description
    integer category_id FK "la Voce"
    integer method_id FK "il metodo di pagamento"
    cash_account account "cash, bank, paypal"
    numeric amount "con segno: + entrata, - uscita"
    boolean invoice_checked
    boolean sponsorship "solo le entrate"
  }
  cash_category {
    integer id PK
    text name "unico senza maiuscole"
    integer position
    boolean sponsorship "valore di partenza"
  }
  cash_method {
    integer id PK
    text name "unico senza maiuscole"
    integer position
  }
  cash_opening {
    integer id PK
    integer year
    cash_account account
    numeric amount "saldo al 1 gennaio"
  }
  cash_entry_line {
    integer id PK
    integer entry_id FK
    integer line_id FK
    numeric amount "quanto ha pagato di quella voce"
  }
  budget_line {
    integer id PK
  }
  team_inflow {
    integer id PK
    integer cash_entry_id FK
  }

  cash_category |o--o{ cash_entry : "Voce"
  cash_method |o--o{ cash_entry : "metodo"
  cash_entry ||--o{ cash_entry_line : "paga"
  budget_line ||--o{ cash_entry_line : "è pagata da"
  cash_entry |o--o| team_inflow : "ha ricevuto"
```

- `cash_opening` non ha chiavi esterne: è una riga per **anno e conto** (unica). Un anno senza saldo iniziale proprio riparte dalla chiusura dell'anno prima.
- Un movimento ha **un solo conto** e un importo **mai zero**; la spunta Sponsorship ha senso solo se l'importo è positivo (due controlli del database).
- `cash_entry_line`: l'importo è sempre sopra zero ed è unico per coppia uscita+voce. Le somme (non oltre l'uscita, non oltre la quota del fondo del team) le controlla l'API.
- Cancellare un movimento cancella i suoi collegamenti alle voci (cascata) e libera l'eventuale inflow; cancellare una voce del budget cancella i collegamenti che la riguardano.

## 5. Inventario

Quello che c'è sullo scaffale **non è un numero salvato**: è la somma dei movimenti (`stock_movement`). Un arrivo congela il prezzo; una produzione congela il costo delle parti. Regole: [inventario.md](inventario.md).

```mermaid
erDiagram
  inventory_item {
    integer id PK
    text code "unico se c'è"
    text name "unico senza maiuscole"
    integer area_id FK "vuoto = tutte le aree"
    integer type_id FK
    text category "per nome (sezione 7)"
    text unit "per nome (sezione 7)"
    item_origin origin "bought o made"
    boolean flammable
    boolean toxic
    boolean carcinogenic
  }
  item_type {
    integer id PK
    text name "Resistor, Screw..."
    integer area_id FK
    boolean hazards
  }
  item_type_param {
    integer id PK
    integer type_id FK
    text name "Resistance, Package..."
    param_kind kind "number, list, text, yesno"
    text unit
    text_array choices
  }
  item_param_value {
    integer id PK
    integer item_id FK
    integer param_id FK
    numeric number "uno solo dei tre"
    text text
    boolean flag
  }
  item_image {
    integer item_id PK
    text mime
    bytea full
    bytea thumb
  }
  item_datasheet {
    integer id PK
    integer item_id FK
    integer uploaded_by FK
    text name
  }
  item_datasheet_file {
    integer datasheet_id PK
    bytea data "il PDF, a parte"
  }
  stock_movement {
    integer id PK
    integer item_id FK
    integer project_id FK
    integer budget_line_id FK "l'acquisto che completa"
    integer car_season_id FK
    integer built_by FK "la produzione che le ha usate"
    movement_kind kind "receipt, use, transfer, adjustment, disposal, build"
    date occurred_on
    numeric quantity
    text location "per codice (sezione 7)"
    numeric unit_net "solo arrivi e produzioni"
  }
  component_part {
    integer id PK
    integer component_id FK "il componente fatto da noi"
    integer part_id FK "la parte che serve"
    numeric quantity
  }
  area {
    integer id PK
  }
  project {
    integer id PK
  }
  budget_line {
    integer id PK
  }
  season {
    integer id PK
  }
  app_user {
    integer id PK
  }

  area |o--o{ inventory_item : "di quale area"
  area |o--o{ item_type : "di quale area"
  item_type |o--o{ inventory_item : "di che tipo"
  item_type ||--o{ item_type_param : "parametri"
  inventory_item ||--o{ item_param_value : "valori"
  item_type_param ||--o{ item_param_value : "di quale parametro"
  inventory_item ||--o| item_image : "immagine"
  inventory_item ||--o{ item_datasheet : "schede dati"
  item_datasheet ||--|| item_datasheet_file : "il file"
  app_user |o--o{ item_datasheet : "caricata da"
  inventory_item ||--o{ stock_movement : "movimenti"
  project |o--o{ stock_movement : "per quale progetto"
  budget_line |o--o{ stock_movement : "completa l'acquisto"
  season |o--o{ stock_movement : "macchina di un'altra stagione"
  stock_movement |o--o{ stock_movement : "built_by"
  inventory_item ||--o{ component_part : "component_id"
  inventory_item ||--o{ component_part : "part_id"
```

- **Distinta dei componenti** (`component_part`): `component_id` è il componente fatto da noi, `part_id` una sua parte. Un componente non può contenere se stesso, e la coppia è unica.
- **Immagini e PDF** stanno in tabelle a parte (`item_image`, `item_datasheet_file`), così elencare gli articoli non legge mai i byte. Non sono nello storico perché sono binari.
- `item_param_value`: **uno solo** fra `number`, `text`, `flag` è pieno (controllo del database). Un numero è salvato nell'unità del parametro, esatto (10 kΩ = 10000).
- `stock_movement.built_by` punta a un'altra riga della stessa tabella: l'uso di una parte da parte di una **produzione**. Annullare la produzione cancella anche quelle righe (cascata).
- Tipi, parametri e valori sono quelli di Settings › Item types.

## 6. Accesso, impostazioni e storico

Chi può entrare, le liste e gli interruttori che l'admin sceglie in Settings, e il registro delle modifiche. Regole: [accesso-e-storico.md](accesso-e-storico.md), [impostazioni.md](impostazioni.md).

```mermaid
erDiagram
  app_user {
    integer id PK
    text email "unica senza maiuscole"
    text name
    user_role role "admin, pm (User), viewer"
    boolean treasury "spunta del pm: i soldi del team"
    boolean sponsors "spunta del pm: gli sponsor"
    boolean active
  }
  user_area {
    integer id PK
    integer user_id FK
    integer area_id FK
  }
  area {
    integer id PK
    text code
  }
  audit_log {
    bigint id PK
    timestamptz at
    integer actor_id "senza chiave esterna"
    text table_name
    integer row_id
    text action "insert, update, delete"
    jsonb before
    jsonb after
  }
  category {
    integer id PK
    text name
    integer position
  }
  category_field {
    integer id PK
    integer category_id FK "vuoto = senza categoria"
    text field
  }
  vat_rate {
    integer id PK
    numeric rate "0-100"
  }
  unit {
    integer id PK
    text name
  }
  location {
    integer id PK
    text code "non cambia mai"
    text site
    text room
  }
  setting {
    integer id PK "sempre 1"
    numeric variance_threshold
    text vat_base_when_total_sponsor
    numeric inflow_vat_rate
    text bank_compare_summary
    text bank_compare_timeline
  }

  app_user ||--o{ user_area : "aree del pm"
  area ||--o{ user_area : "chi la cambia"
  category |o--o{ category_field : "campi mostrati"
```

- `user_area` serve solo ai `pm`; `app_user` non si cancella (si **disattiva**), così lo storico continua a puntare a una persona.
- `audit_log` **non ha chiavi esterne di proposito**: lo storico deve sopravvivere a tutto, anche a una riga cancellata o a una persona rimossa. `actor_id` vuoto = non una persona collegata (il seed, l'importer). Lo scrivono dei **trigger** del database nella stessa transazione della modifica: una modifica e la sua storia non possono divergere.
- `setting` ha **una sola riga** (controllo `id = 1`).

## 7. Collegamenti che non sono chiavi esterne

Alcuni elenchi si scrivono **come testo** nelle altre tabelle e si controllano nei servizi, non nel database. Succede perché nacquero come valori del codice (regola 4 di `CLAUDE.md`) e poi diventarono tabelle.

| Dove | Cosa contiene | Con quale elenco deve coincidere |
| --- | --- | --- |
| `budget_line.category`, `inventory_item.category` | il nome della categoria | `category.name` |
| `budget_line.priority` | High, Medium, Low | valori fissi nel codice |
| `line_figures.vat_rate`, `fund.vat_rate` | l'aliquota in percento | un valore di `vat_rate.rate` |
| `inventory_item.unit` | pcs, m, kg… | `unit.name` |
| `stock_movement.location`, `to_location` | il **codice** del posto (`s1-r2`) | `location.code` (non cambia mai) |
| `audit_log.actor_id` | chi ha scritto | `app_user.id` (nessuna chiave) |
| `audit_log.table_name` + `row_id` | quale riga è cambiata | qualunque tabella |
| `cash_opening.year` + `account` | l'anno e il conto del saldo | gli anni e i conti dei movimenti |

Conseguenza pratica: rinominare una **categoria** o un'**unità** in Settings aggiorna anche le righe e gli articoli che la usano (lo fa il servizio); una **categoria o unità in uso** non si cancella; un **posto** non cambia codice, quindi si può rinominare senza toccare i movimenti.

## 8. Cosa fa rispettare il database da solo

Oltre alle chiavi esterne, il database dice no a:

| Regola | Tabella |
| --- | --- |
| un fondo del team per stagione; il fondo del team è semplice; uno sponsor ha un'aliquota | `fund` |
| un contratto per fondo e fase; importo non negativo | `fund_contract` |
| una riga di cifre per voce e fase; quantità e costo non negativi | `line_figures` |
| un fondo una volta sola per riga di cifre, e una sola posizione | `line_fund` |
| importo non negativo; un'entrata riceve al più un inflow | `team_inflow` |
| importo mai zero; la spunta Sponsorship solo sulle entrate | `cash_entry` |
| importo sopra zero; una voce una volta sola per uscita | `cash_entry_line` |
| un saldo iniziale per anno e conto | `cash_opening` |
| quantità sopra zero (tranne il conteggio); prezzi solo su arrivi e produzioni; destinazione solo nei trasferimenti | `stock_movement` |
| un componente non contiene se stesso; quantità sopra zero | `component_part` |
| uno solo fra numero, testo e sì/no | `item_param_value` |
| nomi unici senza badare alle maiuscole (fornitori, articoli, categorie, unità, Voci, metodi, utenti…) | molte |
| una sola riga | `setting` |
| azione di storico solo `insert`, `update` o `delete` | `audit_log` |

## 9. Cosa è nello storico

I trigger `audit_row()` scrivono in `audit_log` ogni inserimento, modifica e cancellazione di **30 tabelle su 34**: tutto ciò che cambia soldi, budget, registro, liste, utenti e inventario. **Non** ci sono: `audit_log` stessa, `area` (le sei aree non cambiano) e i due file binari `item_image` e `item_datasheet_file` (la descrizione della scheda dati sì, `item_datasheet`).

## 10. Tipi enumerati

| Tipo | Valori |
| --- | --- |
| `phase` | `estimate`, `actual` |
| `sponsor_type` | `none`, `partial`, `total` |
| `fund_kind` | `team`, `external` |
| `fund_type` | `fund`, `gift`, `gift_vat` |
| `user_role` | `admin`, `pm` (nel sito «User»), `viewer` |
| `cash_account` | `cash`, `bank`, `paypal` |
| `movement_kind` | `receipt`, `use`, `transfer`, `adjustment`, `disposal`, `build` |
| `item_origin` | `bought`, `made` |
| `param_kind` | `number`, `list`, `text`, `yesno` |

Un valore di un enum **non si toglie** con una migrazione semplice: si ricrea il tipo (come ha fatto `0019` per `treasurer` e `0021` per `sp`).

## 11. Unità dei numeri

Soldi in `numeric(14,2)` nel database e in **centesimi interi** nel codice; quantità `numeric(14,3)` (millesimi nel codice); costi unitari `numeric(14,4)` (decimillesimi di euro nel codice); aliquote `numeric(5,2)` in percento. Le date sono `date` e nel codice stringhe `YYYY-MM-DD`. Mai virgola mobile.
