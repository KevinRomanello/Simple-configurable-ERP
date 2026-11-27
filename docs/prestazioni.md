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

## 3. I numeri di riferimento (baseline rinnovata il 27 novembre 2026, nella tappa dei dati di G4: la stagione di prova ha ora 12 inflow ricevuti e 4 Voci di partenza)

Prima di G1 le pagine del budget, del registro e dell'inventario erano queste stesse, dentro il rumore; la pagina Settings è più veloce (3,3 → 1,7 ms alla taglia reale) perché conta chi usa un elenco con una query per elenco; `me` e `users` hanno un'altra forma di risposta (le spunte).

Millisecondi, mediana di 15 richieste, su questo computer (Docker su Mac). **I numeri si confrontano solo sullo stesso computer.**

| Pagina | real: mediana | real: p95 | real: KB | stress: mediana | stress: p95 | stress: KB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| calculation: snapshot of the season | 24.63 | 25.74 | 819 | 105.18 | 116.03 | 3492 |
| me (every page starts here) | 0.79 | 0.9 | 0 | 0.6 | 0.72 | 0 |
| core: seasons | 0.93 | 3.63 | 0 | 1.1 | 1.2 | 0 |
| core: settings | 1.67 | 2.33 | 2 | 2.89 | 3.16 | 2 |
| core: users | 0.8 | 0.89 | 0 | 0.83 | 0.9 | 0 |
| core: history | 1.19 | 1.28 | 20 | 1.11 | 2.6 | 20 |
| core: history of a table | 1.23 | 1.32 | 20 | 1.1 | 1.28 | 20 |
| core: areas | 0.51 | 0.56 | 0 | 0.5 | 0.56 | 0 |
| core: categories | 0.46 | 0.55 | 0 | 0.47 | 0.54 | 0 |
| core: units | 0.48 | 0.55 | 0 | 0.46 | 0.51 | 0 |
| core: places | 0.49 | 0.52 | 1 | 0.5 | 0.58 | 1 |
| core: settings of the calculation | 0.61 | 0.73 | 0 | 0.63 | 0.71 | 0 |
| budget: area sheet | 28.62 | 41.28 | 326 | 105.67 | 118.46 | 1670 |
| budget: funds | 1.03 | 1.27 | 6 | 1.1 | 1.35 | 6 |
| budget: CASH FLOW | 34.56 | 38.11 | 2 | 148.86 | 177.4 | 2 |
| budget: gantt expected | 29.35 | 37.43 | 47 | 113.7 | 144.83 | 184 |
| budget: gantt actual | 28.93 | 35.3 | 50 | 110.05 | 128.39 | 168 |
| budget: TOTAL | 29.14 | 31.29 | 115 | 109.13 | 128.76 | 414 |
| budget: funds summary | 29 | 32.11 | 4 | 105.73 | 121.74 | 4 |
| budget: analysis of the funds | 35.75 | 38.07 | 30 | 136.47 | 170 | 30 |
| budget: analysis of the suppliers | 36.4 | 50.92 | 68 | 147.48 | 171.8 | 69 |
| budget: items view | 29.92 | 41.26 | 265 | 110.65 | 125.22 | 999 |
| budget: inflows | 5.78 | 6.63 | 8 | 24.95 | 26.13 | 8 |
| treasury: register | 7.38 | 7.74 | 351 | 35.68 | 51.12 | 1783 |
| treasury: financial statement | 5.21 | 5.86 | 9 | 26.22 | 28 | 9 |
| treasury×budget: TO PAY | 28.88 | 37.2 | 223 | 110.89 | 138.35 | 1257 |
| treasury×budget: payments to tie | 1.14 | 1.3 | 4 | 2.76 | 2.99 | 20 |
| treasury×budget: lines to pay | 26.5 | 27.88 | 65 | 104.18 | 123.63 | 369 |
| inventory: items | 7.76 | 8.86 | 173 | 34.56 | 47.85 | 872 |
| inventory×budget: PENDING | 36.47 | 52.9 | 231 | 238.51 | 407.47 | 1193 |
| inventory: components | 13.84 | 14.99 | 4 | 239.37 | 407.88 | 21 |
| inventory: statistics | 32.05 | 39.85 | 11 | 127.46 | 149.99 | 53 |

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
