# Le spese e le entrate fuori budget (l'area ADMINISTRATION)

Nasce dalla richiesta 3 della tesoreria (11 novembre 2026): un movimento del registro che **non è nel budget** (l'imposta di bollo, una quota associativa, un'assicurazione) deve contare **come se fosse un progetto**, sotto un'area a parte, così compare anche nelle viste con i totali. Fatto il 12 novembre 2026. Il registro: [registro-di-cassa.md](registro-di-cassa.md); il rendiconto: [registro-di-cassa.md](registro-di-cassa.md), §5.5.

## 1. In breve

- Ogni **Voce** del registro ha un **ambito** (colonna **COUNTS** in Settings › «Register: Voci»): *On a project*, *Outside the budget* o *Ignored*.
- I movimenti delle Voci «fuori budget» **non collegati a niente** diventano le righe di un'**area derivata**, **ADMINISTRATION**: **calcolata a ogni lettura dal registro**, senza righe salvate e **senza una pagina propria** (i movimenti si vedono e si cambiano nel registro; l'area è una riga dei totali). Il 12 novembre la pagina c'era, ed è stata tolta su richiesta: non serviva, c'è il registro.
- Da lì conta **come ogni altra area**: SEASON, YEAR e CAR TOTAL, il Gantt e le analisi per categoria la vedono senza altro lavoro. Le entrate fuori budget (le quote) sono righe di «Money in».

## 2. La regola: l'ambito di una Voce

| Ambito | Significa | Valore di partenza |
| --- | --- | --- |
| **On a project** (`project`) | è una spesa di un progetto: conta attraverso la riga del budget a cui è collegata (TO PAY elenca i pagamenti ancora da collegare) | **1.1 Attrezzature** e **1.4 Altro**, e ogni Voce nuova (finché non si sceglie: così non cambia i totali) |
| **Outside the budget** (`outside`) | non è di un progetto: conta nell'area ADMINISTRATION | tutte le altre (bollo, quote associative, assicurazioni, spese di conto, 9.4, 9.5…) |
| **Ignored** (`ignore`) | non conta mai in quest'area: il budget lo conta già | **6.1 Da pubblicità e sponsorizzazioni** (sono già inflow) e **9.1, 9.2, 9.3** (l'IVA) |

I valori di partenza li mette la migrazione `0024` sulle Voci che il registro ha già (per nome); li cambia chi gestisce i soldi del team da Settings, e l'area si aggiorna subito.

**Quando un movimento conta come «fuori budget»** (`outsideEntries` in `outside-budget.service.ts`): tutte e cinque le condizioni insieme.

1. la sua Voce è *Outside the budget*;
2. la data è dentro la **stagione** scelta nel menù (settembre–agosto);
3. **non è collegato a una riga del budget**: se lo è conta la riga, e non si somma due volte (se si toglie il collegamento, torna in ADMINISTRATION);
4. **non ha ricevuto un inflow** (`team_inflow.cash_entry_id`) e **non ha la spunta Sponsorship**: sono già inflow di CASH FLOW;
5. conta in qualsiasi conto (Cassa, Banca, Paypal): sono soldi veri del team.

Un movimento senza Voce, o di una Voce *On a project* non collegata, **non conta da nessuna parte**: i totali del budget non si gonfiano per sbaglio, e il pagamento resta in «Payments to tie to a line» (TO PAY), che ora elenca **solo** i pagamenti senza Voce o di Voci *On a project* (le altre non sono da collegare).

## 3. Com'è fatta l'area

Il calcolo è **puro** (`outsideBudget` in `packages/calc/src/outside.ts`) e lo snapshot lo aggiunge alle aree, ai progetti e alle righe di sempre (`loadSnapshot`): il resto del motore non sa che è «speciale».

- **Un progetto per sezione del rendiconto**: «8. IMPOSTE E TASSE», «6. COSTI PER COLLABORATORI»… La sezione di una Voce è quella del rendiconto ([registro-di-cassa.md](registro-di-cassa.md), §5.5, `sectionsOfVoci`); le Voci che il rendiconto non ha (9.4, 9.5) stanno in un ultimo progetto, **«Voci not in the statement»**. Nell'ordine del rendiconto. Un progetto c'è solo se ha righe.
- **Una riga per Voce e per mese**: nome «8.2 Imposta di bollo - 2026-03», nota «2 movements in the register», **categoria «Administration»**, **solo ACTUAL**, quantità 1, importo = uscite meno entrate del mese su quella Voce, **senza IVA**, data = quella dell'**ultimo movimento** del mese (il mese del Gantt). Il «previsto» è vuoto: **nessun allarme di scostamento**.
- **Nessun fondo paga la riga**: i soldi sono già usciti dalla cassa, quindi **CASH FLOW e la tabella del Team's fund non cambiano**.
- **Già arrivata** (una ricevuta per tutta la quantità): non è mai in PENDING dell'inventario; e non è in TO PAY (non c'è niente da pagare).
- **Un mese in cui su una Voce è entrato più di quanto è uscito** (le quote associative; un rimborso più grande della spesa) **non è una riga**: è una voce di **«Money in»**, con il nome della Voce, di tipo «outside the budget».
- **Gli id sono negativi** e le righe non esistono nel database: nessuno può scriverci (il server risponde `400`/`404` su `PATCH`/`DELETE` e `403` se si prova ad aggiungere un progetto, anche l'admin). Non è nel menù, e l'indirizzo `/budget/administration` dà «Area not found» (l'API la dà ancora, `GET /api/areas/administration/sheet`, ed è come la leggono le prove).

## 4. Cosa si vede nelle viste

| Vista | Cosa si vede |
| --- | --- |
| SEASON, YEAR e CAR TOTAL | una riga di area in più in ogni blocco: in ALL e nel blocco «Administration»; entra nei totali. La **CAR TOTAL** la conta come ogni riga della stagione (la macchina della stagione) |
| «Money in» di YEAR TOTAL | le entrate fuori budget **dell'anno**, Voce per Voce («outside the budget») |
| «Money in» di SEASON TOTAL | solo quelle **dopo il giorno del BANK**, come gli inflow: fino a quel giorno sono già nel BANK. Con il BANK dal registro, di solito non ce ne sono |
| Gantt | l'area e i progetti nei costi per mese; «Administration» nei blocchi per categoria. La tabella del Team's fund non cambia |
| CATEGORY ANALYSES | la categoria «Administration» |
| CASH FLOW | **invariato** |
| PENDING e TO PAY | **escluse** |
| Menù, Users, tipi di articolo | l'area non ha una pagina e non si assegna a nessuno (il sito la toglie dagli elenchi) |

## 5. I dati e il codice

- `cash_category.scope` (`project` / `outside` / `ignore`, di partenza `project`, con un controllo sui valori) e `area.derived` (booleano, falso di partenza), migrazione **`0024_outside_budget.sql`**. L'area è una riga di `area` messa da `db:seed` (`seedBase`: codice `administration`, nome `ADMINISTRATION`, ultima per posizione); le righe e i progetti **non** sono nel database.
- **Hardcode** (regola 4): la categoria delle righe, `getDerivedAreaCategory` («Administration», una categoria di Settings): riga 10 di [hardcoded-registry.md](hardcoded-registry.md). Le sezioni vengono da `getStatementLayout` (riga 9).
- Calcolo: `packages/calc/src/outside.ts` (`outsideBudget`, `CASH_SCOPES`), `sectionsOfVoci` in `statement.ts`, la riga «register» in `moneyIn.ts`, `AreaInput.derived` e `Snapshot.registerIncome` in `snapshot.ts`. API: `apps/api/src/modules/cash/outside-budget.service.ts`, `snapshot.ts`, il filtro di `listToLink` in `cash-links.service.ts`, la guardia di `createProject` in `budget.service.ts`. Sito: la colonna COUNTS in `CashListsPanel.tsx`, `TotalPage.tsx`, e gli elenchi di aree che la escludono: il menù (`Shell.tsx`), `AreaPage.tsx` (l'indirizzo dà «Area not found»), `UsersPage.tsx`, `ItemTypesPanel.tsx` e `lib/inventory.ts`.

## 6. Da sapere

- **Solo ACTUAL**: non c'è un preventivo per Voce (per esempio il previsto dell'anno per le assicurazioni). È la fase 4, rimandata: le decisioni da prendere sono in [da-decidere.md](da-decidere.md), D13.
- **Se una Voce passa da «fuori budget» a «di progetto»** i suoi movimenti escono dall'area e tornano in «Payments to tie to a line»: è il modo per scoprire se erano pagamenti di righe del budget (un dubbio vero per **9.5 saldo fattura**, [da-decidere.md](da-decidere.md), D12).
- Il mese è quello **della data del movimento**: un'uscita di dicembre in una stagione che finisce ad agosto non c'è; un'uscita dopo il 31 agosto è della stagione dopo.
- La categoria «Administration» è una categoria come le altre di Settings: se un admin la cancella o la rinomina, le righe dell'area restano nel blocco ALL ma non in un blocco di categoria.
- Un mese che si annulla (uscita e rimborso uguali) non fa né una riga né un'entrata.

## 7. Prove

- **Calcolo** (`outside.test.ts`, 11): le sezioni delle Voci (`sectionsOfVoci`); una riga per Voce e mese nel progetto della sua sezione, nell'ordine del rendiconto, con il costo positivo; i rimborsi che si sottraggono e un mese che si annulla; le entrate come «money in» con il giorno dell'ultimo movimento; la Voce senza riga nel rendiconto, in un ultimo progetto; e **nel motore vero**: righe ACTUAL senza fondo, complete e arrivate, la riga di TOTAL (in ALL e nel blocco della categoria, senza scostamento), **CASH FLOW uguale con e senza**, il «money in» di un anno e di una stagione (dopo il BANK).
- **API** (`outside-budget.routes.test.ts`, 16): l'ambito di partenza, il cambio da Settings (e il valore sbagliato, `400`, e i permessi), l'area ultima e derivata e il `403` ad aggiungerle un progetto, le righe da un registro inventato, **ciò che non conta** (Voce di progetto, ignorata, senza Voce, sponsorship, un'altra stagione, collegato a una riga, che ha ricevuto un inflow), il collegamento che toglie e rimette la riga, l'ambito che si cambia, la scrittura impossibile, TOTAL, YEAR TOTAL con il «money in», CASH FLOW e Gantt, PENDING e TO PAY, e i pagamenti da collegare.
- **Mutazioni** (tutte prese): contare anche i movimenti collegati, la sponsorship, un inflow ricevuto, le Voci di progetto, o un'altra stagione (API); togliere il filtro dei pagamenti da collegare; togliere la regola del giorno del BANK sul «money in»; sommare i rimborsi invece di sottrarli; non segnare le righe come arrivate (calcolo).
- **Con i dati veri** (browser, in sola lettura): l'area ha i progetti delle sezioni 6, 7, 8 e «Voci not in the statement» (nei TOTAL), in YEAR TOTAL il «money in» fuori budget ha le Voci delle quote e dei rimborsi, e i movimenti delle Voci 9.4 e 9.5 della stagione sono in quell'ultimo progetto. La riconciliazione col budget del foglio resta «All checks match».

## 8. Per andare online

- Serve la migrazione **`0024_outside_budget.sql`** e poi **`db:seed`** (il passo `setup` fa tutte e due): la seconda mette la riga dell'area ADMINISTRATION. Senza quella riga la funzione resta spenta e il sito va come prima.
- Poi, in Settings › «Register: Voci», controllare la colonna COUNTS e correggerla dove serve.
