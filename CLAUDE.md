# CLAUDE.md

Gestionale custom per budget e inventario del team: sostituisce il foglio Google gestito dallo "script attuale" (Google Apps Script) con un'app web su database. Per capire il progetto parti da [docs/README.md](docs/README.md).

## Regole

1. **Documenta tutto in `docs/`.** Ogni cosa (decisioni, architettura, regole di business, avvio, come si estende) va in un file `.md` dentro `docs/`. Se cambi il codice, aggiorna nello stesso lavoro il documento che lo riguarda; ogni nuovo file va indicizzato in `docs/README.md`.
2. **I commit li fa solo l'utente.** Non eseguire `git commit`, `git push` né altri comandi git che modificano lo stato (`add`, `merge`, `rebase`, `reset`, `stash`, cambio ramo). Lascia le modifiche nel working tree; di git usa solo i comandi di lettura (`status`, `diff`, `log`).
3. **Semplice e pulito.** Ogni funzionalità nel modo più semplice e pulito possibile: la soluzione più piccola che funziona, funzioni brevi con un solo compito, nomi chiari, nessuna dipendenza o astrazione che non serva adesso. L'unica predisposizione al futuro ammessa è quella della regola 4.
4. **Hardcode dentro la funzione-API.** Se per ora hardcodi qualcosa che in futuro andrà implementato davvero (liste, soglie, regole, utente corrente, permessi…), il valore va scritto *nel corpo della funzione di servizio che in futuro sarà quell'API* (esempio: `listCategories()` ↔ `GET /api/lookups/categories`), mai in costanti sparse né nei chiamanti: gli altri la usano chiamando la funzione. Così, quando la funzionalità verrà implementata davvero, cambia solo il corpo di quella funzione. Marca il punto con `// HARDCODED: <cosa sarà in futuro>` e aggiungi una riga a [docs/hardcoded-registry.md](docs/hardcoded-registry.md).
5. **Prima il piano.** Prima di iniziare qualsiasi lavoro, spiega all'utente il piano d'azione (cosa farai, in che ordine, cosa lasci fuori, i dubbi) e aspetta il suo via.
6. **Le interfacce seguono gli stili Figma.** Ogni interfaccia va fatta seguendo gli stili definiti su Figma (colori, tipografia, spaziature, componenti), non inventati. Cartelle di riferimento: [folder 354010286](https://www.figma.com/files/team/1170826409918235978/folder/354010286) e [folder 70751470](https://www.figma.com/files/team/1170826409918235978/folder/70751470). Prima di scrivere UI leggi gli stili dai file con gli strumenti Figma (servono i link ai singoli file), riportali come token in un unico punto del web app e documentali in [docs/stile-interfaccia.md](docs/stile-interfaccia.md). Se per ciò che devi costruire non c'è un riferimento su Figma, chiedilo all'utente invece di improvvisare.

## Convenzioni

- Codice, tabelle e campi in inglese; **i commenti nel codice sempre in inglese**; documenti in italiano; l'interfaccia mantiene i termini del foglio (CASH FROM, BOUGHT FROM, outflow…).
- Soldi: centesimi interi nel codice, `numeric` nel database, mai virgola mobile. Date come stringhe ISO (`YYYY-MM-DD`), mai `Date` locali nel calcolo.
- `packages/calc` è puro: nessun I/O e nessun import da `apps/*`. I valori hardcoded gli arrivano dallo snapshot, che li ottiene chiamando le funzioni-API (regola 4).
- `fonti/` è ignorata da git e contiene dati reali (nomi di persone e sponsor, importi). Non copiare mai dati reali in file tracciati (docs, test, seed, fixture): lì solo dati sintetici. I test che leggono `fonti/` devono saltarsi se la cartella manca.

## Stato

v0 = parità con lo script attuale, ma su database: [docs/piano-azione-v0.md](docs/piano-azione-v0.md). Materiale di partenza in `fonti/` (locale, non nel repository): `fonti/script attuale` (il comportamento da replicare), `fonti/Budget 26-27.xlsx` (foglio reale: dati d'esempio e oracolo per i test di riconciliazione) e `fonti/Piano d'azione — Budget e Inventario custom.md` (visione completa, domande per il tesoriere).
