# Regole di calcolo dello script attuale

Specifica di parità: le regole estratte leggendo `fonti/script attuale` (Google Apps Script, 3370 righe) e **verificate sul foglio reale** `fonti/Budget 26-27.xlsx`. Ogni regola avrà almeno un test in `packages/calc`.

> **Dal 21 ottobre 2026** il modello degli sponsor e dei fondi va oltre lo script: l'aliquota e la copertura di una riga vengono dallo sponsor scelto e una riga può avere più fondi ([sponsor-e-fondi.md](sponsor-e-fondi.md)). Questo documento resta la specifica di parità col foglio: con i dati del foglio i numeri sono gli stessi (1.995 controlli), e le righe senza fondo usano ancora la formula del §3.
>
> **Dal 26 ottobre 2026** altre due differenze volute: un fondo copre sempre l'IVA dei suoi acquisti (la casella «paga IVA» non c'è più: per non farla pagare si mette 0%) e **ogni inflow di CASH FLOW paga l'11% di IVA** il primo giorno del trimestre successivo (lo script non aveva IVA sugli inflow). Il foglio reale non ha inflow e tutti i suoi sponsor coprono l'IVA, quindi i 1.995 controlli restano uguali.

- `L123` = riga dello script. ⚠ = comportamento da confermare col tesoriere (domande Q1–Q7 del piano originale), isolato in un'impostazione di `getSettings()` (vedi [hardcoded-registry.md](hardcoded-registry.md)).
- Fasi: **estimate** = colonne EXPECTED/ESTIMATED, **actual** = colonne ACTUAL. Le regole sono identiche per le due fasi, salvo dove indicato.
- Gli esempi sono sintetici: i dati reali stanno solo in `fonti/` (ignorata da git).

## 0. Verifica sul foglio reale

`pnpm reconcile` legge i dati di input dell'xlsx (52 voci, 6 aree), li passa al motore e confronta ogni valore che il foglio aveva calcolato e salvato. **Tutti i 1.995 confronti coincidono**:

| Gruppo | Confronti |
| --- | --- |
| Importi di riga: netto, IVA, lordo, sponsor, outflow (104 righe-fase) | 520 |
| IVA a carico del team e relative scadenze | 104 + 3 |
| Saldi dei fondi (CASH FROM) | 7 |
| Riepilogo CASH FLOW | 6 |
| TOTAL: 8 blocchi × 7 righe × 6 colonne, più le varianze | 336 + 112 |
| Report IVA di ogni area (scadenze e importi per progetto) | 196 |
| EXPECTED GANTT e ACTUAL GANTT: tabelle per area, progetto e mese | 63 + 20 |
| Tabella "Team's fund" dell'ACTUAL GANTT | 67 |
| CASH FROM ANALYSES e BOUGHT FROM ANALYSES | 216 + 336 |
| CATEGORY ANALYSES | 9 |

Il foglio non arrotonda (saldi con quattro decimali): il confronto tollera 0,012 € per riga che contribuisce al totale. **Limite**: i dati reali sono semplici (IVA quasi sempre al 22%, nessun ingresso in CASH FLOW, BANK a metà ottobre, ogni fondo con la casella IVA spuntata), quindi i rami sugli ingressi, sullo sponsor parziale e sui due confronti con BANK sono coperti dai test unitari (casi del §17) e non dal foglio. La tabella "Team's fund" dell'EXPECTED GANTT nel file è vuota: lì non c'è un valore atteso.

Cose emerse dal file che lo script da solo non mostrava:

| Osservazione | Conseguenza |
| --- | --- |
| Nella riga gialla di ogni progetto, colonna A, c'è il nome di una persona (il responsabile); il nome del progetto sta nella prima riga del blocco | `project.owner_name` (testo) |
| Le date di incasso (CASH FROM, CASH FLOW) e la data BANK hanno il **giorno** (es. 15 del mese); il formato le mostra come "mmm yyyy" | si salva la data intera, si mostra il mese; il confronto con BANK per giorno ha senso (⚠ Q2) |
| Nelle tabelle CASH FROM ci sono contratti con importo 0 e senza data | `inflow_date` ammette null; l'importo ammette 0 |
| Un fondo compare più volte nella stessa tabella (più contratti) e le liste stima/consuntivo differiscono (fondi e fornitori) | più contratti per fondo; una sola lista di fondi e di fornitori (come da piano) |
| 17 voci su 52 senza categoria, quasi tutte senza priorità | categoria e priorità opzionali |
| Nel Gantt EXPECTED la tabella "Team's fund" è vuota (c'è solo il titolo), nell'ACTUAL no | probabile errore silenzioso dello script (il `try/catch` a L2540 lo nasconde): l'app la calcola comunque |
| Le intestazioni del report IVA partono da una scadenza anteriore al default (20/08/2026) e includono un lunedì spostato dal weekend (17/05/2027) | conferma l'estensione automatica dell'orizzonte (§6) e lo spostamento del weekend (§4) |

## 1. Anagrafiche (L4–L10, L43–L58)

| Cosa | Nello script | Nell'app |
| --- | --- | --- |
| Aree | MT + DMT, SW, HW, CM, MGT, RT | tabella `area` (seed) |
| Categorie | Components, Manufacturing, Consumable, Asset, Logistic, Administration, Software | `listCategories()` hardcoded |
| Priorità | High, Medium, Low (rosso, arancio, verde); vecchi valori 1/2/3 = High/Medium/Low | enum; la mappatura 1/2/3 solo nell'importer |
| Opzioni "TOTAL SPONSORIZED" | 9 voci: {nessuno, parziale, totale} × {senza IVA, IVA 11%, IVA 22%} | due campi: `sponsor_type` e `vat_rate` (0, 11, 22) |
| Fondo speciale | "Team's fund" sempre nelle tendine | `fund` con `kind = team`, sempre presente |

## 2. Riga di budget (colonne dei fogli area, L384–L391)

| Foglio | Campo |
| --- | --- |
| A PROJECT (cella unita sul blocco) | `project.name` |
| A della riga gialla | `project.owner_name` |
| B ITEM, C CATEGORY, D PRIORITY, AC NOTE | `budget_line.item`, `category`, `priority`, `note` |
| E/Q quantità, F/R costo netto unitario | `line_figures.quantity`, `unit_net_cost` |
| G/S totale netto, H/T IVA, L/X totale lordo, N/Z outflow | calcolati |
| I/U CASH FROM, J/V BOUGHT FROM | `fund_id`, `supplier_id` |
| K/W tipo sponsor + IVA | `sponsor_type`, `vat_rate` |
| M/Y valore sponsor | `sponsor_value` (derivato se "totale") |
| O/AA data acquisto, P/AB data arrivo | `purchase_date`, `arrival_date` |
| AE/AG IVA a carico del team, AF/AH relativa scadenza | calcolati (§4) |

Una riga ha due `line_figures` (estimate, actual); quello mancante vale zero.

## 3. Calcoli di riga (L149–L230, L760–L797)

```
netto     = quantità × costo netto unitario
sponsor   = nessuno → 0 · parziale → valore inserito · totale → netto
IVA       = nessuno o totale → netto × aliquota          (⚠ Q1: nel caso "totale" l'IVA è sull'intero netto)
            parziale        → (netto − sponsor) × aliquota
            senza IVA       → 0
lordo     = netto + IVA
outflow   = lordo − sponsor
```

Se tipo sponsor o aliquota non sono scelti la riga è "incompleta": nell'app IVA = 0 e un'etichetta lo segnala. Arrotondamento: per riga al centesimo (⚠ Q7, il foglio non arrotonda).

Esempio, netto 1000,00:

| Tipo | Aliquota | Sponsor | IVA | Lordo | Outflow |
| --- | --- | --- | --- | --- | --- |
| nessuno | 22% | 0 | 220,00 | 1220,00 | 1220,00 |
| nessuno | 0% | 0 | 0 | 1000,00 | 1000,00 |
| parziale (400,00) | 22% | 400,00 | 132,00 | 1132,00 | 732,00 |
| totale | 22% | 1000,00 | 220,00 | 1220,00 | 220,00 |

⚠ Differenza voluta: con "totale" il foglio copia il netto nel valore sponsor *una volta*, alla scelta dell'opzione; se poi cambia la quantità il valore resta vecchio. L'app lo ricalcola sempre.

## 4. IVA a carico del team e scadenza (L234–L266, L3287–L3308)

- **IVA a carico del team** (AE/AG) = IVA della riga se la riga ha una voce e IVA > 0 **e** (fondo = Team's fund **oppure** il fondo ha "DOES IT PAY VAT?" = falso per quella fase); altrimenti nessun valore. Predefinito per un nuovo fondo: falso, cioè l'IVA resta al team. ⚠ Q5 (il flag è per fase).
- **Scadenza** (AF/AH): richiede data d'acquisto e IVA a carico del team. Trimestre della data d'acquisto → scadenza; se cade di sabato o domenica slitta al lunedì; nessuna festività né proroga ⚠ Q3.

| Acquisto | Scadenza |
| --- | --- |
| gennaio–marzo | 16 maggio, stesso anno |
| aprile–giugno | 20 agosto, stesso anno |
| luglio–settembre | 16 novembre, stesso anno |
| ottobre–dicembre | 16 febbraio, anno successivo |

Esempi: 05/08/2026 → 16/11/2026 (lun) · 10/11/2026 → 16/02/2027 (mar) · 10/02/2027 → 16/05/2027 è domenica → **17/05/2027** · 20/05/2027 → 20/08/2027 (ven).

## 5. Subtotali (L675–L758)

Per ogni progetto e per l'area: somma di netto, IVA, lordo, sponsor, outflow, per stima e per consuntivo. Il totale dell'area è la somma dei progetti. Non sono dati salvati: l'app li calcola.

## 6. Report IVA per area (L254–L358)

Per ogni progetto due righe, EXPECTED VAT OUTFLOW e ACTUAL VAT OUTFLOW; le colonne sono le scadenze trimestrali. Orizzonte predefinito: dal 3° trimestre 2026 (16/11/2026) al 4° trimestre 2027 (16/02/2028), esteso automaticamente se una data d'acquisto (stima o consuntivo, qualunque voce dell'area) cade in un trimestre fuori. La cella è la somma dell'IVA a carico del team delle righe del progetto con quella scadenza.

## 7. CASH FROM → fondi (L967–L1052, L1223–L1248, L1431–L1635)

- Due tabelle (stima, consuntivo) di contratti: azienda, valore, data d'incasso. Ordinate per nome (senza distinzione di maiuscole) e data. Un fondo può avere più contratti (nell'app uno solo per fase: [sponsor-e-fondi.md](sponsor-e-fondi.md)).
- Inserimento valido solo con nome, valore numerico e data valida (nell'app la data può mancare, come nel file reale). Eliminazione: il foglio cancella per nome esatto (con numero di riga facoltativo); l'app per riga.
- **Riepilogo per fondo**: TOTAL CONTRACT = somma dei contratti.
  `LEFT VALUE = contratto − (Σ outflow delle righe con quel fondo − (se NON paga l'IVA: Σ IVA di quelle righe, altrimenti 0))`. Rosso se negativo. Il flag "DOES IT PAY VAT?" è per fondo e per fase (⚠ Q5).
- **Riepilogo mensile**: mesi continui dal primo all'ultimo con incassi (solo valori > 0); per mese la somma e l'elenco dei fondi. Serve anche per CASH FLOW (§9).

## 8. BOUGHT FROM → fornitori (L1721–L1771)

Elenco di nomi (stima e consuntivo separati nel foglio; una lista unica nell'app), ordinato senza distinzione di maiuscole, nomi unici senza distinzione di maiuscole. L'app impedisce di eliminare un fornitore in uso; il foglio non controlla.

## 9. CASH FLOW (L1850–L1987)

- Due tabelle di ingressi (stima, consuntivo), come i contratti ma indipendenti da CASH FROM (⚠ Q4): nome, importo, data. Più il **BANK**: un importo e una data, unici e validi per le due fasi.
- **TOTAL CASH FLOW** (per fase):
  - senza BANK → somma degli ingressi;
  - BANK senza data → BANK + somma di tutti gli ingressi;
  - BANK con data → BANK + somma degli ingressi con data **maggiore** della data BANK (confronto per giorno).
- **LEFT VALUE** = TOTAL CASH FLOW − uscite del team, dove le uscite del team sono
  - (A) righe con fondo Team's fund: Σ outflow − Σ IVA, e
  - (B) Σ IVA a carico del team (Team's fund e fondi che non pagano l'IVA).

  Con BANK e data: in (A) solo righe con data d'acquisto > data BANK, in (B) solo IVA con scadenza > data BANK. ⚠ Q2.
- **LEFT VALUE − CASH FROM** = LEFT VALUE + somma dei LEFT VALUE negativi dei fondi esterni (il team copre gli sforamenti). Rosso se negativo.

## 10. EXPECTED GANTT e ACTUAL GANTT (L1989–L2560)

Per fase. Per ogni riga con voce:

```
uscita_acquisto = IVA a carico del team ? outflow − IVA : outflow
```

La riga entra nella linea temporale solo se ha la data d'acquisto: `uscita_acquisto` nel mese d'acquisto; l'IVA a carico del team nel mese della sua scadenza.

- **Tabelle per blocco** (ALL + una per categoria): per area → progetto → importo per mese; in ogni area un finto progetto "VAT Outflow" con l'IVA per mese di scadenza; riga "Monthly sum <area>"; riga TOTAL del blocco; colonna "Sum project". I blocchi senza dati si omettono.
- **Mesi**: continui dal minimo al massimo tra mesi d'acquisto, mesi di scadenza IVA, mese BANK e mesi degli ingressi CASH FLOW; senza dati, il mese corrente.
- **Tabella "Team's fund"** (L2407–L2542), per mese `m`; "dopo BANK" significa: nessun BANK con data, oppure `m` strettamente maggiore del mese BANK (confronto per mese, ⚠ Q2):
  - INFLOW[m] = Σ ingressi CASH FLOW del mese (solo dopo BANK) + importo BANK nel mese BANK;
  - OUTFLOW <categoria>[m] = Σ `uscita_acquisto` delle righe con fondo Team's fund e quella categoria (solo dopo BANK);
  - OUTFLOW VAT[m] = Σ IVA a carico del team con scadenza nel mese, di qualunque fondo (solo dopo BANK);
  - OUTFLOW ALL[m] = Σ `uscita_acquisto` delle righe Team's fund (anche senza categoria) + OUTFLOW VAT;
  - FINAL ALL: saldo progressivo, parte da BANK se c'è BANK senza data, altrimenti da 0; vuoto prima del mese BANK; ogni mese `saldo += INFLOW − OUTFLOW ALL`. Verde se ≥ 0, rosso se < 0.

## 11. TOTAL (L3094–L3285)

Per area (6 righe + TOTAL) e per blocco (ALL + 7 categorie), considerando le righe con voce (e categoria = blocco): grand total stima, sponsor stima, outflow stima, grand total consuntivo, sponsor consuntivo, outflow consuntivo.
`varianza outflow = (outflow actual − outflow estimate) / outflow estimate` (vuota se il denominatore è 0); `varianza sponsor` analoga. Rosso se fuori da ±15% (soglia configurabile). Nella riga TOTAL l'outflow è verde se actual ≤ estimate, rosso altrimenti.

## 12. Analisi per fondo e per fornitore (L2562–L2813)

- Nomi: per i fondi, quelli dei contratti più quelli usati nelle righe; per i fornitori, la lista più quelli usati. Ordinati senza distinzione di maiuscole; stima e consuntivo allineati sulla stessa riga quando il nome coincide.
- Per nome e per blocco (ALL + 7 categorie), righe con voce: grand total (L/X), sponsor (M/Y), outflow (N/Z). Confronto dei nomi senza distinzione di maiuscole.
- Nell'app i **fornitori** compaiono in una fase solo se usati in una voce di quella fase (il foglio mostrava tutta la lista di quella fase, anche con soli zeri; la lista ora è unica).
- Per i **fondi**: outflow = Σ outflow, ma se il fondo non paga l'IVA (flag della fase) e non è Team's fund, outflow = Σ outflow − Σ IVA. Per i **fornitori**: Σ outflow.
- Riga TOTAL per colonna; outflow positivo evidenziato in rosso.

## 13. CATEGORY ANALYSES (L2869–L3092)

Elenco di sola lettura delle voci, con tre filtri:

| Filtro | Valori |
| --- | --- |
| Categorie (selezione multipla) | All Categories o un sottoinsieme |
| Priorità | All priorities, High, Medium, Low, High → Low, Low → High |
| Ordinamento | data d'acquisto stimata (più vecchia prima), data d'acquisto effettiva, Area / Progetto A–Z |

Colonne: Area, Project, Item, Category, Priority, Expected outflow, Expected cash from, Expected bought from, Expected buy date, Actual outflow, Actual cash from, Actual bought from, Actual buy date.

Ordine, in sequenza: se l'ordinamento è per area, prima l'area (ordine fisso delle aree, con una riga d'intestazione per area); se la priorità è "High → Low"/"Low → High", poi la priorità (le voci senza priorità sempre in fondo); poi, per area, progetto A–Z e ordine originale; altrimenti la data scelta (senza data in fondo) e a parità area → progetto A–Z → ordine originale. Un filtro su una priorità singola esclude le altre. ⚠ Nel foglio le voci **senza categoria non compaiono mai** in questo elenco, nemmeno con "All Categories" (17 voci su 52 nel file reale): l'app lo replica; probabilmente conviene mostrarle, da decidere.

## 14. Date (L3310–L3361)

L'app usa date vere (selettore di data, selettore di mese). Il parser flessibile serve solo all'importer: `gg/mm/aa(aa)`, `gg-mm-aa(aa)`, `mmm aa(aa)` con mesi italiani o inglesi (→ 1° del mese). Chiave di mese: `AAAA-MM`.

## 15. Domande aperte → dove sono isolate

| Domanda | Comportamento portato | Si cambia in |
| --- | --- | --- |
| Q1 IVA con sponsor totale | IVA sull'intero netto, a carico del team — **confermato** (21/10/2026: è il tipo C degli sponsor, [sponsor-e-fondi.md](sponsor-e-fondi.md)) | `getSettings().vatBaseWhenTotalSponsor` |
| Q2 confronto con BANK | per giorno nel riepilogo CASH FLOW, per mese nel Gantt (ingressi e uscite del mese BANK) | `getSettings().bankCompare` |
| Q3 scadenze IVA | tabella §4, weekend → lunedì, niente proroghe — **confermato** (21/10/2026) | `getVatRules()` |
| Q4 CASH FROM e CASH FLOW | due tabelle indipendenti, in sospeso; fa eccezione il contratto di uno sponsor **cash**, che conta da solo come ingresso ([sponsor-e-fondi.md](sponsor-e-fondi.md#5-sponsor-in-cassa)) | schema (collegamento facoltativo, dopo) |
| Q5 flag "paga IVA" | nel foglio uno per fase — chiusa il 21/10/2026 con una sola casella per sponsor; **tolta il 26/10/2026**: un fondo copre sempre l'IVA, 0% = niente IVA | nessuna colonna |
| Q6 fondo in negativo | solo evidenziazione rossa | interfaccia |
| Q7 arrotondamento | per riga, al centesimo — **confermato** | `roundDiv` in `calc/money.ts` |

## 16. Cosa non si porta

| Nello script | Nell'app |
| --- | --- |
| "Update All", creazione e colori dei fogli, celle unite, formattazione condizionale | non serve: le viste si calcolano alla lettura |
| Celle calcolate sovrascrivibili a mano | solo calcolate |
| Tendine non vincolanti (si può scrivere un refuso) | chiavi esterne: si sceglie da un elenco |
| 4 righe vuote per ogni nuovo progetto | si aggiungono le righe che servono |
| Valore sponsor "totale" copiato una volta (§3) | sempre derivato |
| Eliminazione di fondi e fornitori in uso | bloccata |
| Esecuzione lenta/timeout dei trigger | non esiste |

## 17. Casi di prova per i test

**Fondo** — contratto 10.000,00; righe con quel fondo (aliquota 20% dello sponsor): outflow totale 6.000,00, di cui IVA 1.000,00. Non paga l'IVA → LEFT VALUE 5.000,00; la paga → 4.000,00.

**Cash flow con BANK** — BANK 5.000,00 al 15/11/2026; ingressi stima: 10/11/2026 2.000,00, 05/12/2026 1.000,00. Un acquisto su Team's fund il 20/11/2026 con outflow 600,00 di cui IVA 100,00 (scadenza 16/02/2027).

| Cosa | Risultato |
| --- | --- |
| TOTAL CASH FLOW | 5.000 + 1.000 = 6.000 (l'ingresso del 10/11 è prima della data BANK) |
| LEFT VALUE (per giorno) | (A) 600 − 100 = 500, (B) 100 → 6.000 − 600 = **5.400** |
| Gantt, INFLOW | nov-26: 5.000 (solo BANK) · dic-26: 1.000 |
| Gantt, OUTFLOW | nov-26: escluso (stesso mese del BANK) · feb-27: 100 (IVA) |
| Gantt, FINAL ALL | nov-26 5.000 · dic-26 6.000 · gen-27 6.000 · feb-27 **5.900** |

I due 5.400 / 5.900 differiscono perché i confronti sono diversi (⚠ Q2): il test lo documenta finché la domanda non ha risposta.
