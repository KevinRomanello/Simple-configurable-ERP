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

## 3. I numeri di riferimento (baseline rinnovata il 27 novembre 2026, alla chiusura di G4: la tesoreria in `modules/treasury` e il ponte `bridges/treasury-budget` ai loro indirizzi)

Rispetto alla baseline di prima di G4 (stessa stagione di prova, con 12 inflow ricevuti e 4 Voci di partenza): **tutte le 64 risposte identiche**, e le pagine dentro il ±12% (il registro +1% alla taglia reale e -2% allo stress; il foglio di un'area 0% e +12%, ma quella baseline era fortunata: vedi §4). Prima di G1 le pagine del budget, del registro e dell'inventario erano queste stesse, dentro il rumore; la pagina Settings è più veloce (3,3 → 1,7 ms alla taglia reale) perché conta chi usa un elenco con una query per elenco; `me` e `users` hanno un'altra forma di risposta (le spunte).

Millisecondi, mediana di 15 richieste, su questo computer (Docker su Mac). **I numeri si confrontano solo sullo stesso computer.**

| Pagina | real: mediana | real: p95 | real: KB | stress: mediana | stress: p95 | stress: KB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| calculation: snapshot of the season | 25.3 | 28.58 | 819 | 97.02 | 112.16 | 3492 |
| me (every page starts here) | 0.81 | 0.99 | 0 | 0.62 | 0.73 | 0 |
| core: seasons | 0.94 | 1.21 | 0 | 1.1 | 1.17 | 0 |
| core: settings | 1.78 | 5.04 | 2 | 2.89 | 12.4 | 2 |
| core: users | 0.87 | 0.98 | 0 | 0.83 | 0.92 | 0 |
| core: history | 1.16 | 1.44 | 20 | 1.18 | 1.56 | 20 |
| core: history of a table | 1.27 | 3.2 | 20 | 1.15 | 1.32 | 20 |
| core: areas | 0.53 | 0.61 | 0 | 0.52 | 0.59 | 0 |
| core: categories | 0.52 | 0.55 | 0 | 0.5 | 0.54 | 0 |
| core: units | 0.5 | 0.56 | 0 | 0.48 | 0.5 | 0 |
| core: places | 0.55 | 0.61 | 1 | 0.54 | 1.56 | 1 |
| core: settings of the calculation | 0.67 | 0.72 | 0 | 0.67 | 0.74 | 0 |
| budget: area sheet | 28.64 | 39.71 | 326 | 118.12 | 141.77 | 1670 |
| budget: funds | 1.11 | 1.3 | 6 | 1.09 | 1.27 | 6 |
| budget: CASH FLOW | 35 | 39.58 | 2 | 150.43 | 185.66 | 2 |
| budget: gantt expected | 30.85 | 42.93 | 47 | 121.71 | 150.46 | 184 |
| budget: gantt actual | 28.33 | 30.83 | 50 | 115.15 | 138.52 | 168 |
| budget: TOTAL | 30.3 | 37.46 | 115 | 114.82 | 136.39 | 414 |
| budget: funds summary | 28.67 | 34.67 | 4 | 111.9 | 125.49 | 4 |
| budget: analysis of the funds | 34.34 | 55.64 | 30 | 141.29 | 167.36 | 30 |
| budget: analysis of the suppliers | 37.3 | 53.7 | 68 | 153.61 | 175.43 | 69 |
| budget: items view | 29.46 | 32.69 | 265 | 114.61 | 130.9 | 999 |
| budget: inflows | 6.22 | 6.63 | 8 | 25.7 | 32.68 | 8 |
| treasury: register | 7.47 | 8.16 | 351 | 35.13 | 45.63 | 1783 |
| treasury: financial statement | 5.32 | 5.85 | 9 | 25.86 | 28.04 | 9 |
| treasury×budget: TO PAY | 28.7 | 38.13 | 223 | 115.38 | 156.36 | 1257 |
| treasury×budget: payments to tie | 1.28 | 1.62 | 4 | 2.5 | 2.67 | 20 |
| treasury×budget: lines to pay | 26.59 | 30.84 | 65 | 109.95 | 123.31 | 369 |
| inventory: items | 7.62 | 8.79 | 173 | 33.49 | 34.8 | 872 |
| inventory×budget: PENDING | 34.73 | 41.92 | 231 | 237.27 | 262.76 | 1193 |
| inventory: components | 13.4 | 15.36 | 4 | 239.37 | 342.53 | 21 |
| inventory: statistics | 31.16 | 32.5 | 11 | 132.86 | 155.65 | 53 |

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

## 5. La regola per i passi della fase G

Alla fine di **ogni passo** (G1–G8) si rilancia il benchmark e si confronta con la baseline:

1. **nessuna risposta «DIFFERENT ANSWER»** (un cambio voluto si dice e si spiega, poi si rinnova la baseline);
2. **nessuna pagina più lenta del 10% e di 1 ms** sulla mediana, a entrambe le taglie (le pagine del nucleo stanno sotto i 5 ms: lì un +10% è rumore; si ripete la corsa se il dubbio resta);
3. se una delle due non vale, **ci si ferma** e lo si dice all'utente prima di andare avanti.

Dopo G4–G6 si aggiornano gli indirizzi nell'elenco delle pagine di `perf.test.ts` (fatto per G4); nuove pagine pesanti (gli ordini della fase D) si aggiungono all'elenco e alla baseline nello stesso lavoro.

## 6. Dove sta

| File | Cosa |
| --- | --- |
| `apps/api/test/perf/perf.test.ts` | le misure, il confronto e la stampa |
| `apps/api/test/perf/dataset.ts` | la stagione inventata |
| `apps/api/test/perf/baseline.json` | i numeri e le impronte di riferimento (`real` e `stress`) |
