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

## 3. I numeri di partenza (26 novembre 2026, prima di G1; il 26 novembre se ne sono aggiunte le pagine del nucleo)

Millisecondi, mediana di 15 richieste, su questo computer (Docker su Mac). **I numeri si confrontano solo sullo stesso computer.**

| Pagina | real: mediana | real: p95 | real: KB | stress: mediana | stress: p95 | stress: KB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| calculation: snapshot of the season | 24.93 | 26.76 | 819 | 93.36 | 121.59 | 3492 |
| me (every page starts here) | 0.79 | 0.93 | 0 | 0.59 | 0.7 | 0 |
| core: seasons | 0.98 | 3.75 | 0 | 1.2 | 1.42 | 0 |
| core: settings | 3.24 | 4.09 | 2 | 4.29 | 5.93 | 2 |
| core: users | 0.75 | 2.15 | 0 | 0.7 | 0.78 | 0 |
| core: history | 1.18 | 1.37 | 20 | 1.06 | 1.17 | 20 |
| core: history of a table | 1.24 | 1.35 | 20 | 1.1 | 1.16 | 20 |
| core: areas | 0.51 | 0.56 | 0 | 0.38 | 1.12 | 0 |
| core: categories | 0.49 | 0.53 | 0 | 0.32 | 0.35 | 0 |
| core: units | 0.48 | 1.38 | 0 | 0.34 | 0.52 | 0 |
| core: places | 0.51 | 0.58 | 1 | 0.5 | 0.55 | 1 |
| core: settings of the calculation | 0.67 | 0.81 | 0 | 0.65 | 0.71 | 0 |
| budget: area sheet | 29.62 | 39.69 | 326 | 105.41 | 126.82 | 1670 |
| budget: funds | 1.12 | 1.33 | 6 | 1.08 | 1.2 | 6 |
| budget: CASH FLOW | 34.1 | 34.92 | 1 | 145.2 | 167.74 | 1 |
| budget: gantt expected | 29.71 | 39.32 | 47 | 113.27 | 244.83 | 183 |
| budget: gantt actual | 29.54 | 31.85 | 50 | 112.85 | 132.59 | 168 |
| budget: TOTAL | 28.64 | 31.71 | 115 | 119.71 | 203.94 | 414 |
| budget: funds summary | 27.89 | 41.74 | 4 | 110.17 | 156.49 | 4 |
| budget: analysis of the funds | 33.74 | 36.14 | 30 | 142.57 | 322.89 | 30 |
| budget: analysis of the suppliers | 37.31 | 46.05 | 68 | 148.77 | 204.39 | 69 |
| budget: items view | 30.45 | 59.35 | 265 | 110.62 | 129.26 | 999 |
| budget: inflows | 5.62 | 6.57 | 8 | 25.54 | 27.75 | 8 |
| treasury: register | 7.19 | 7.95 | 351 | 36.51 | 49.86 | 1783 |
| treasury: financial statement | 5.12 | 5.75 | 9 | 26.31 | 27.59 | 9 |
| treasury×budget: TO PAY | 28.11 | 41.93 | 224 | 115.92 | 194.39 | 1261 |
| treasury×budget: payments to tie | 1.09 | 1.39 | 4 | 2.79 | 2.96 | 20 |
| treasury×budget: lines to pay | 26.41 | 27.19 | 65 | 103.75 | 125.41 | 369 |
| inventory: items | 7.88 | 9.51 | 173 | 35.8 | 43.48 | 872 |
| inventory×budget: PENDING | 40.54 | 53.5 | 231 | 233.89 | 259.51 | 1193 |
| inventory: components | 14.16 | 15.45 | 4 | 262.44 | 332.29 | 21 |
| inventory: statistics | 32.63 | 48.55 | 11 | 127.28 | 145.02 | 53 |

**Rumore:** ripetendo la corsa, la mediana cambia di circa ±5%, e fino a ±25% nelle pagine sotto i 3 ms o dove qualcos'altro gira sul computer. Un cambio sotto il 10% non vuol dire niente; il p95 è più instabile ancora.

## 4. Cosa se ne ricava

- **Alla taglia reale ogni pagina risponde in meno di 40 ms**; alla taglia cinque volte più grande in 100–250 ms. Non c'è niente da correggere oggi.
- **Quasi tutto il tempo delle pagine del budget è la lettura dello snapshot**: 24 ms su 29 alla taglia reale (96 su 113 allo stress). Ogni pagina rilegge e ricalcola tutta la stagione. Cresce in modo lineare con le righe, ed è il punto a cui guardare se un giorno servisse andare più veloci. Non lo tocca la fase G, e le porte di G6 fanno le **stesse query**, solo divise per proprietario.
- **Due pagine escono dalla riga allo stress:** PENDING (240 ms) e l'elenco dei componenti (238 ms, e non passa dallo snapshot: calcola i costi di tutti i pezzi che si fanno). Alla taglia reale sono 35 e 14 ms. Da tenere d'occhio, fuori dalla fase G.
- **I contratti costano poco:** una domanda a una porta (`contracts.ask`) è circa 100 ns, contro i 6 ns di una chiamata normale; una query al database costa almeno 100.000 ns. La differenza è un millesimo di una query. Il meccanismo non tiene elenchi fatti a ogni chiamata: cerca in una mappa e scorre pochi elementi.
- **Lo stato dei moduli** (G8) si leggerà **una volta per richiesta**, non a ogni domanda (`activeOwners` in `core/contracts.ts` lo costruisce da un'unica lettura), e solo nelle richieste di un modulo. Lo si controlla con `/api/me`, che oggi costa 0,7 ms: se dopo G8 sale, qualcosa legge più del dovuto.

## 5. La regola per i passi della fase G

Alla fine di **ogni passo** (G1–G8) si rilancia il benchmark e si confronta con la baseline:

1. **nessuna risposta «DIFFERENT ANSWER»** (un cambio voluto si dice e si spiega, poi si rinnova la baseline);
2. **nessuna pagina più lenta del 10% e di 1 ms** sulla mediana, a entrambe le taglie (le pagine del nucleo stanno sotto i 5 ms: lì un +10% è rumore; si ripete la corsa se il dubbio resta);
3. se una delle due non vale, **ci si ferma** e lo si dice all'utente prima di andare avanti.

Dopo G4–G6 si aggiornano gli indirizzi nell'elenco delle pagine di `perf.test.ts`; nuove pagine pesanti (gli ordini della fase D) si aggiungono all'elenco e alla baseline nello stesso lavoro.

## 6. Dove sta

| File | Cosa |
| --- | --- |
| `apps/api/test/perf/perf.test.ts` | le misure, il confronto e la stampa |
| `apps/api/test/perf/dataset.ts` | la stagione inventata |
| `apps/api/test/perf/baseline.json` | i numeri e le impronte di riferimento (`real` e `stress`) |
