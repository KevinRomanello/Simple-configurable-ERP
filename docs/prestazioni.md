# Prestazioni: come si misurano e a che punto siamo

**Stato: fatto il 26 novembre 2026** (passo G0 della fase G, [moduli-architettura.md](moduli-architettura.md)). La fase G sposta molto codice e fa passare dalle funzioni quello che oggi sono query dirette: questo documento è il modo di dire, con numeri, che **non è diventato più lento e non è cambiata nessuna risposta**.

## 1. Come si lancia

```bash
docker compose exec api sh -c "cd /app/apps/api && pnpm bench"
```

- Gira sul **database di prova** (`erp_test`, ricreato da zero a ogni lancio): non tocca i dati di sviluppo. Dura circa un minuto.
- `BENCH_SCALES=real` misura solo la taglia reale (circa 10 secondi); `BENCH_SAVE=1` scrive i numeri di questa corsa come nuova **baseline** in `apps/api/test/perf/baseline.json`.
- Le prove normali (`pnpm test`) non lo eseguono: i suoi 3 test risultano «saltati».
- Stampa, per ogni pagina, la **mediana** e il **p95** in millisecondi, i kilobyte della risposta, la **differenza dalla baseline** e se **la risposta è la stessa**.

## 2. Cosa misura e come

| Cosa | Come |
| --- | --- |
| i dati | una stagione inventata e sempre uguale (`apps/api/test/perf/dataset.ts`, con un seme fisso). **Taglia `real`**: 1.000 righe di budget, 2.500 movimenti del registro, 500 pezzi: quello che la squadra può avere. **Taglia `stress`**: cinque volte tanto. Con il registro che dà il BANK, sponsor, rate, pagamenti legati alle righe, arrivi e componenti |
| il giorno | fissato al 26 novembre 2026, così ciò che dipende da oggi (giorni di attesa, inflow in ritardo) è uguale a ogni corsa |
| le richieste | `app.inject` dentro lo stesso processo, con il cookie di un admin: misura il **server** (permessi, calcolo, database, JSON), non la rete |
| i giri | 3 di riscaldamento e 15 misurati per pagina; si guarda la **mediana** |
| la risposta | un'impronta (sha1) del corpo. Il confronto dice «same answer» o **«DIFFERENT ANSWER»** (le righe dello storico hanno un'ora fissa, perché l'ora di inserimento cambierebbe la risposta a ogni corsa): è la prova che spostare il codice non ha cambiato un centesimo. Lo snapshot (l'input del calcolo) è confrontato con le righe in ordine qualsiasi, perché il database può dare in un altro ordine le righe di una query senza ORDER BY |
| le pagine | 31 pagine (21 del budget, del registro e dell'inventario, 10 del nucleo: stagioni, Settings, utenti, storico, aree, liste) e la lettura dello snapshot (`calculation: snapshot of the season`), con nomi che restano uguali quando gli indirizzi cambiano (G4–G6): nella prova si aggiorna solo l'indirizzo |
| i contratti | quanto costa una chiamata al meccanismo di `core/contracts.ts` (§4) |

**Cosa non misura:** le scritture (salvare una riga, un pagamento), più richieste insieme, la rete e il browser (la tabella e i grafici del sito).

## 3. I numeri di riferimento (baseline di fine G5, 27 novembre 2026; rinnovate solo le righe la cui risposta è cambiata apposta: `core: settings` in G6, `me` in G8, `me`, TO PAY e le righe da pagare nella fase D)

Rispetto alla baseline di fine G4: **tutte le risposte identiche** tranne `core: settings`, che dalla tappa 2 di G5 non ha più unità, posti e campi (stanno nella pagina nuova `inventory: lists of Settings`); le pagine dentro il ±10% (la corsa salvata: lo snapshot +1% e -1%, PENDING -4% e +1%, l'elenco degli articoli +4% e +4%). Le pagine `core: units` e `core: places` si chiamano ora `inventory: units` e `inventory: places` (sono dell'inventario, a `/api/inventory/units` e `/locations`), e PENDING si misura a `/api/inventory-budget/pending`. Prima di G1 le pagine del budget, del registro e dell'inventario erano queste stesse, dentro il rumore.

Millisecondi, mediana di 15 richieste, su questo computer (Docker su Mac). **I numeri si confrontano solo sullo stesso computer.**

| Pagina | real: mediana | real: p95 | real: KB | stress: mediana | stress: p95 | stress: KB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| calculation: snapshot of the season | 25.67 | 40.28 | 819 | 96.08 | 107.1 | 3492 |
| me (every page starts here) | 0.83 | 1.03 | 0 | 0.63 | 0.66 | 0 |
| core: seasons | 0.86 | 0.93 | 0 | 1.08 | 1.11 | 0 |
| core: settings | 1.31 | 1.88 | 0 | 2.05 | 2.1 | 0 |
| core: users | 0.79 | 0.98 | 0 | 0.81 | 0.9 | 0 |
| core: history | 1.17 | 3.77 | 20 | 1.33 | 5.84 | 20 |
| core: history of a table | 1.28 | 1.37 | 20 | 1.27 | 1.49 | 20 |
| core: areas | 0.54 | 0.57 | 0 | 0.49 | 0.53 | 0 |
| core: categories | 0.45 | 0.57 | 0 | 0.48 | 2.14 | 0 |
| inventory: units | 0.45 | 0.57 | 0 | 0.5 | 0.57 | 0 |
| inventory: places | 0.5 | 0.66 | 1 | 0.5 | 0.52 | 1 |
| core: settings of the calculation | 0.64 | 0.74 | 0 | 0.63 | 0.74 | 0 |
| budget: area sheet | 29.4 | 41.86 | 326 | 113.26 | 127.54 | 1670 |
| budget: funds | 1.14 | 1.25 | 6 | 1.12 | 1.3 | 6 |
| budget: CASH FLOW | 33.89 | 36.14 | 2 | 154.38 | 188.76 | 2 |
| budget: gantt expected | 30.05 | 38.54 | 47 | 119.82 | 137.78 | 184 |
| budget: gantt actual | 28.23 | 31.57 | 50 | 115.77 | 133.78 | 168 |
| budget: TOTAL | 27.73 | 28.74 | 115 | 116.33 | 134.74 | 414 |
| budget: funds summary | 26.68 | 30.03 | 4 | 112.06 | 133.04 | 4 |
| budget: analysis of the funds | 32.85 | 34.26 | 30 | 141.76 | 171.08 | 30 |
| budget: analysis of the suppliers | 35.42 | 48.63 | 68 | 152.91 | 183.65 | 69 |
| budget: items view | 28.29 | 29.5 | 265 | 119.15 | 140.88 | 999 |
| budget: inflows | 6.07 | 6.69 | 8 | 25.38 | 26.11 | 8 |
| treasury: register | 7.5 | 8.13 | 351 | 34.36 | 48.75 | 1783 |
| treasury: financial statement | 5.07 | 5.53 | 9 | 26.25 | 28.11 | 9 |
| treasury×budget: TO PAY | 27.97 | 39.59 | 223 | 118.69 | 141.69 | 1257 |
| treasury×budget: payments to tie | 1.21 | 1.33 | 4 | 2.37 | 2.6 | 20 |
| treasury×budget: lines to pay | 25.64 | 26.66 | 65 | 113.41 | 152.18 | 369 |
| inventory: items | 7.9 | 9.16 | 173 | 34.69 | 41.42 | 872 |
| inventory×budget: PENDING | 33.38 | 47.38 | 231 | 240.12 | 258.3 | 1193 |
| inventory: components | 14.08 | 14.98 | 4 | 237.09 | 256.72 | 21 |
| inventory: statistics | 31.46 | 34.26 | 11 | 138.6 | 158.1 | 53 |
| inventory: lists of Settings | 1.19 | 1.26 | 2 | 2.47 | 2.58 | 2 |

**Come si rinnova:** con `BENCH_SAVE=1`, solo quando il computer è libero (niente browser o build che girano: alla chiusura di G4 una corsa salvata con il pannello del browser aperto aveva pagine al +10–15%, ed è stata rifatta), poi una seconda corsa di conferma senza salvare.

**Rumore:** ripetendo la corsa, la mediana cambia di circa ±5%, e fino a ±25% nelle pagine sotto i 3 ms o dove qualcos'altro gira sul computer. Un cambio sotto il 10% non vuol dire niente; il p95 è più instabile ancora.

## 4. Cosa se ne ricava

- **Alla taglia reale ogni pagina risponde in meno di 40 ms**; alla taglia cinque volte più grande in 100–250 ms. Non c'è niente da correggere oggi.
- **Quasi tutto il tempo delle pagine del budget è la lettura dello snapshot**: 24 ms su 29 alla taglia reale (96 su 113 allo stress). Ogni pagina rilegge e ricalcola tutta la stagione. Cresce in modo lineare con le righe, ed è il punto a cui guardare se un giorno servisse andare più veloci. Non lo tocca la fase G, e le porte di G6 fanno le **stesse query**, solo divise per proprietario.
- **Due pagine escono dalla riga allo stress:** PENDING (240 ms) e l'elenco dei componenti (238 ms, e non passa dallo snapshot: calcola i costi di tutti i pezzi che si fanno). Alla taglia reale sono 35 e 14 ms. Da tenere d'occhio, fuori dalla fase G.
- **I contratti costano poco:** una domanda a una porta (`contracts.ask`) è circa 100 ns, contro i 6 ns di una chiamata normale; una query al database costa almeno 100.000 ns. La differenza è un millesimo di una query. Il meccanismo non tiene elenchi fatti a ogni chiamata: cerca in una mappa e scorre pochi elementi.
- **Lo stato dei moduli** (G8) si leggerà **una volta per richiesta**, non a ogni domanda (`activeOwners` in `core/contracts.ts` lo costruisce da un'unica lettura), e solo nelle richieste di un modulo. Lo si controlla con `/api/me`, che oggi costa 0,7 ms: se dopo G8 sale, qualcosa legge più del dovuto.

- **G4, tappa 3 (il ponte tesoreria×budget):** tutte le risposte identiche alla baseline, e i tempi dentro il rumore alla taglia reale e a quella da stress (due corse). Il registro era la pagina più colpita: l'elenco di ciò a cui è legato ogni movimento passava da un join a due letture più le etichette di migliaia di righe, +28% alla prima misura. Il costo era la lista di id: passata come **un solo parametro** (`anyOf`, `core/sql.ts`) la lettura delle etichette scende da 9,4 a 2,2 ms a 3.273 righe pagate, e il registro torna entro il rumore (+1% / +11% alla taglia reale, +5% / +10% allo stress). Prima della correzione, una corsa con il computer occupato aveva dato +28…+84% su pagine che il codice non ha toccato: **un cambio grande su tutte le pagine insieme è il computer, non il codice**; si ripete la corsa.

- **G4, tappa 4 (gli indirizzi):** le pagine del registro e del ponte si misurano ai nuovi indirizzi (`/api/treasury/…`, `/api/treasury-budget/…`; i nomi delle righe non cambiano) e tutte le risposte sono identiche. Il registro ora legge i movimenti e i loro legami **insieme** (`Promise.all`), non uno dopo l'altro: con il ponte i legami costano due letture in più, e così il registro torna come prima (+2% alla taglia reale, +8% allo stress, dove nelle corse precedenti stava fra +5% e +13%).
- **Il foglio di un'area allo stress** è stato fra +7% e +25% in tutte le corse di G4, ma il suo unico lavoro sul server è lo snapshot, che nelle stesse corse è fra -8% e +4%. È la baseline a essere fortunata: lì il foglio dell'area (105,7 ms) costa quanto lo snapshot da solo (105,2 ms), mentre nella baseline di prima costava 12 ms più dello snapshot (105,4 contro 93,4), come ci si aspetta dal calcolo e da 1,7 MB di risposta. Rinnovata alla chiusura di G4 (§3).

- **G5, tappe 1 e 2 (i legami con il budget in tabelle del ponte; le liste dell'inventario nel suo modulo):** con il computer libero (la misura dei contratti di nuovo a 107–123 ns), tutte le risposte identiche alla baseline di fine G4 tranne una voluta: `core: settings` (`GET /api/settings`) non ha più unità, posti e campi, che stanno nella pagina nuova `inventory: lists of Settings` (`GET /api/inventory/lists`, 1,2 ms alla taglia reale). `core: units` e `core: places` si misurano ai nuovi indirizzi (`/api/inventory/units`, `/locations`) con lo stesso nome, e rispondono uguali. Tempi dentro il ±10% in tre corse; l'elenco degli articoli alla taglia reale +7…+12% (+0,5–1 ms: le due letture dei legami dei movimenti), sotto 1 ms. Prima, con il computer occupato, tutte le pagine erano al +30…+60% e la misura dei contratti a 145–195 ns: quelle corse non valgono.

- **G5, tappa 3 (il ponte inventario×budget):** tutte le risposte identiche (tranne `core: settings`, cambiata apposta nella tappa 2), tempi dentro il rumore in tre corse. Lo snapshot chiede ARRIVED a una porta: il ponte legge i suoi legami e chiede all'inventario quantità e date dei movimenti (una lista di id come un solo parametro), e lo snapshot resta com'era (-5…+1%). L'elenco degli articoli alla taglia reale +10…+12%, cioè 0,8–0,9 ms: le due letture dei legami dei movimenti, sotto la soglia di 1 ms.

- **G6 (il budget in un modulo):** tutte le risposte identiche alla baseline di fine G5, tranne `core: settings`, che dalla tappa 1 non ha più gli interruttori del calcolo (ora `/api/budget/lookups/settings`): solo quella riga della baseline è rinnovata. Una baseline intera nuova **non** è stata salvata: in quattro tentativi il computer era occupato (la misura dei contratti a 109–163 ns contro 101, pagine di tutti i moduli oltre il +10% insieme, anche lo snapshot misurato da solo, che G6 non tocca); un confronto con il computer meno carico dà le pagine del budget fra -3% e +12%. Si rinnova a computer libero, prima della prossima tappa che ne ha bisogno.

- **G8, tappa 1 (gli interruttori):** il cancello legge gli interruttori **una volta a ogni richiesta**, tutte, non solo quelle di un modulo (serve a `currentActive()` anche nel nucleo: `/api/settings` chiede ai moduli accesi chi usa una categoria). Costa una query piccola, circa 0,05–0,2 ms: si vede in percentuale sugli indirizzi da meno di 1 ms (fino a +40% su `inventory: places` allo stress, da 0,5 a 0,7 ms) e sparisce nelle pagine del budget e dei ponti (fra −9% e +3%). Nessuna pagina oltre la regola del §5 (+10% e +1 ms insieme). Tutte le risposte identiche tranne `me`, che dice anche i ponti e i quattro moduli: rinnovata solo quella riga della baseline. Misura dei contratti a 112–122 ns (computer un po' occupato).

- **G8, tappe 2 e 3 (il sito che si spegne a pezzi, l'area ADMINISTRATION solo con il registro):** le 66 risposte identiche alla baseline, le pagine pesanti fra −12% e +3%; sugli indirizzi più piccoli resta il costo della lettura degli interruttori (sotto 1 ms). Misura dei contratti a 113 ns: computer non libero, baseline non rinnovata (si rinnova a computer libero, quando la misura torna a 101–105 ns).

- **Fase D, tappa 1 (gli ordini nel server):** TO PAY e le righe da pagare portano l'ordine di ogni riga, e TO PAY anche se la persona può raggrupparla e gli ordini della stagione (due letture piccole in più, limitate alle stagioni mostrate). Cambiano apposta le risposte di `me` (due permessi nuovi), di TO PAY e delle righe da pagare: rinnovate solo quelle tre righe della baseline (la taglia grande misurata da sola, a computer più tranquillo). Con il controllo «può raggruppare» fatto una volta per area, TO PAY è a −4%…+9% e le righe da pagare a −1%…+6% nelle corse complete; le altre 63 risposte identiche. **Da sapere:** lanciare una taglia sola (`BENCH_SCALES=stress`) dà «DIFFERENT ANSWER» sulle risposte con gli id (lo snapshot, i fondi, il foglio di un'area), perché i dati di prova nascono con id diversi: le risposte si confrontano solo con le due taglie in fila, come è registrata la baseline.

## 5. La regola per i passi della fase G

Alla fine di **ogni passo** (G1–G8) si rilancia il benchmark e si confronta con la baseline:

1. **nessuna risposta «DIFFERENT ANSWER»** (un cambio voluto si dice e si spiega, poi si rinnova la baseline);
2. **nessuna pagina più lenta del 10% e di 1 ms** sulla mediana, a entrambe le taglie (le pagine del nucleo stanno sotto i 5 ms: lì un +10% è rumore; si ripete la corsa se il dubbio resta);
3. se una delle due non vale, **ci si ferma** e lo si dice all'utente prima di andare avanti.

Dopo G4–G6 si aggiornano gli indirizzi nell'elenco delle pagine di `perf.test.ts` (fatto per G4 e G5); nuove pagine pesanti (gli ordini della fase D) si aggiungono all'elenco e alla baseline nello stesso lavoro.

## 6. Dove sta

| File | Cosa |
| --- | --- |
| `apps/api/test/perf/perf.test.ts` | le misure, il confronto e la stampa |
| `apps/api/test/perf/dataset.ts` | la stagione inventata |
| `apps/api/test/perf/baseline.json` | i numeri e le impronte di riferimento (`real` e `stress`) |
