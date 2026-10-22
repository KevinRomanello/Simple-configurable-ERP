# Stagioni, anni fiscali e macchine

**Stato: piano, non ancora fatto** (22 ottobre 2026). Nessun codice è stato scritto: questo documento dice cosa si farà, in che ordine, e le decisioni che servono prima di partire. Quando si implementa, il documento diventa la descrizione di com'è fatto (come [sponsor-e-fondi.md](sponsor-e-fondi.md)).

## 1. Cosa si vuole

Dividere i pezzi **comprati** in tre modi:

- per **stagione**, da settembre ad agosto;
- per **anno fiscale**;
- per **macchina**.

L'idea di partenza è basarsi sulla **data** dell'acquisto, e far sì che prendere un pezzo per **una macchina precedente** sia sempre una scelta volontaria.

## 2. Cosa dicono i dati (prima di decidere)

Nel foglio reale quasi tutti gli acquisti con una data sono di **maggio 2026**, cioè **prima** di settembre: sono pezzi comprati in anticipo per la macchina nuova, dentro il budget 2026-27. Alcune voci non hanno data. Quindi:

- la **stagione** e l'**anno fiscale** si ricavano bene dalla data: quei soldi sono davvero usciti nella stagione 2025-26;
- la **macchina** no: se si ricavasse dalla sola data, quasi tutti gli acquisti finirebbero sulla macchina precedente, che è sbagliato.

Per questo la macchina non segue la data ma il **budget in cui sta la voce**.

## 3. Le tre divisioni

| | Da dove viene | Si sceglie a mano? |
| --- | --- | --- |
| **Stagione** (1 settembre – 31 agosto, "2026-27") | dalla **data d'acquisto** | no, è calcolata |
| **Anno fiscale** | dalla **data d'acquisto** | no, è calcolato |
| **Macchina** | dal **budget** in cui sta la voce; per gli arrivi fuori budget dalla stagione della data | **solo per scegliere una macchina diversa** (per esempio quella precedente) |

Altre regole:

- Vale la data della fase: la fase ACTUAL (quello che è davvero comprato) e la fase EXPECTED (quello che è previsto) hanno ciascuna la sua data, quindi ciascuna ha la sua stagione e il suo anno fiscale.
- Una voce **senza data** va nel gruppo "(no date)": non si inventa una stagione.
- Una voce che sta nel budget 2026-27 ma ha una data di maggio 2026 ha **stagione 2025-26** e **macchina 2026-27**: sono due informazioni diverse e le si vedono entrambe.
- L'anno fiscale è, per ora, l'**anno solare** (1 gennaio – 31 dicembre): da confermare (§7).

## 4. Come si fa

### Fase 1 — calendario e macchina

- **Calcolo** (`packages/calc`): un file nuovo `periods.ts` con due funzioni pure, `seasonOf(date)` e `fiscalYearOf(date)`, che lavorano sulle date ISO senza `Date` (come il resto del calendario, vedi [architettura.md](architettura.md)). Test: i confini (31 agosto → 1 settembre, 31 dicembre → 1 gennaio), gli anni bisestili, ogni giorno dal 2000 al 2100 confrontato con un calcolo indipendente.
- **Hardcode** (regola 4): `getPeriods()` in `lookups.service.ts` dice quando iniziano la stagione (mese 9) e l'anno fiscale (mese 1); `listCars()` dà l'elenco delle macchine ("Car 2025-26", "Car 2026-27", ciascuna legata alla sua stagione). Entrambe con `// HARDCODED:` e una riga nel [registro](hardcoded-registry.md); `listCars()` diventerà la tabella `car`, come le stanze diventeranno `location`.
- **Database**: una colonna `car` (testo, vuoto = automatico) su `budget_line` e su `stock_movement` (per gli arrivi fuori budget). Una sola migrazione; le due tabelle hanno già il trigger dello storico, quindi ogni scelta di macchina finisce nella cronologia.
- **API**: `GET /api/lookups/cars` e `/periods`; `PATCH /api/lines/:id` accetta `car` e rifiuta una macchina che non esiste.
- **Motore**: ogni voce calcolata porta la `car` effettiva e se è stata scelta a mano (`carChosen`), e ogni fase porta `season` e `fiscalYear` (nulli senza data).
- **Griglia del budget**: una colonna **CAR** accanto a PRIORITY. Vuota mostra in grigio la macchina automatica; per una macchina diversa si sceglie dalla tendina, e la scelta resta ben visibile.

### Fase 2 — le viste

- Una funzione pura `purchasesBy(snapshot, dimension)` in `calc` (stesso stile di `analysisByFund`): per ogni valore della dimensione (stagione, anno fiscale o macchina) netto, IVA, lordo e outflow, previsto e consuntivo, con il gruppo "(no date)".
- `GET /api/views/purchases?by=season|fiscal-year|car` e una pagina nel menù **Views** con i tre selettori e un grafico, composta con i componenti esistenti (nessun Figma, vedi [stile-interfaccia.md](stile-interfaccia.md)).
- **Statistiche dell'inventario**: le tre divisioni diventano nuovi modi di "tagliare" (oggi: progetto, area, categoria, luogo), e PENDING si può filtrare per macchina.

### Fase 3 — il magazzino

- Gli **arrivi fuori budget** hanno un campo macchina nel modulo (automatica = la macchina della stagione della data dell'arrivo).
- Gli arrivi che vengono dal budget **ereditano** data e macchina dalla voce.
- I **prelievi** dallo scaffale (quale macchina usa un pezzo) restano fuori per ora: sono un'altra domanda (§7).

## 5. Cosa non cambia

Il budget resta **per stagione** (una stagione, un budget); la macchina è un'etichetta in più sulle voci, non una divisione del budget. I conti (netto, IVA, outflow, scadenze) non cambiano: si aggiungono solo modi di raggruppare. La riconciliazione col foglio non è toccata.

## 6. Limiti e rischi

- Le macchine sono un elenco nel codice finché non servono di più (nome libero, sigla vera).
- Cambiare la macchina di una voce **non sposta soldi**: cambia solo in quale gruppo compare nelle viste.
- Una voce senza data è fuori da stagione e anno fiscale finché non si data: le viste lo mostrano, non lo nascondono.
- Se i budget delle stagioni passate non sono nel sito, le viste per stagione mostrano solo quello che c'è.

## 7. Da decidere prima di partire

| # | Domanda | Mia proposta |
| --- | --- | --- |
| 1 | L'**anno fiscale** è l'anno solare (gennaio–dicembre)? Se è un altro periodo, quale? | anno solare |
| 2 | La **macchina automatica** si ricava dal budget in cui sta la voce (come sopra) o dalla sola data? | dal budget: con la sola data quasi tutti gli acquisti di maggio andrebbero corretti a mano |
| 3 | Come si chiamano le **macchine**: "Car 2026-27" o un nome vero (la sigla della macchina)? | "Car 2026-27" finché non c'è un nome |
| 4 | I **prelievi** dallo scaffale devono dire su quale macchina vanno? | non ora |
| 5 | Per le viste conta la data della **fase ACTUAL** (comprato davvero) o anche quella della fase EXPECTED? | entrambe, in due colonne |

## 8. Prove previste

- Calcolo: confini di stagione e anno fiscale, bisestili, tutti i giorni 2000–2100; una voce con data di maggio dentro il budget 2026-27 (stagione 2025-26, macchina 2026-27); una voce con macchina scelta; una voce senza data.
- API: macchina inesistente rifiutata (400), scelta e ritorno all'automatico, la cronologia registra la scelta, i permessi (solo chi può scrivere nell'area).
- Viste: i totali delle tre divisioni sommano allo stesso totale del TOTAL; il gruppo "(no date)".
- Riconciliazione col foglio e giro nel browser come per il resto.
