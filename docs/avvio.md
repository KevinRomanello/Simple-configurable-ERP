# Avvio: dal computer vuoto all'app funzionante

Tempo: circa 15 minuti, quasi tutti per il primo scaricamento di Docker. Ogni comando di questa guida è stato provato sul progetto.

**Per avviare e provare tutto serve solo Docker.** Node e pnpm sul tuo computer servono soltanto se vuoi lavorare sul codice fuori dai contenitori (parte 5).

## 0. Cosa serve

| Cosa                                                                           | Perché                                                     | Come controllare                                                   |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| **Docker Desktop** (Mac, Windows) o Docker Engine con Compose v2 (Linux) | fa girare database, API e sito senza installare nient'altro | `docker --version` e `docker compose version`                  |
| **Docker aperto**                                                        | il programma deve essere in esecuzione, non solo installato | l'icona della balena nella barra deve essere ferma, non "starting" |
| **Git**                                                                  | per scaricare il progetto                                   | `git --version`                                                  |
| Porte libere **3000**, **5173**, **5432**                    | API, sito, database                                         | se un'altra app le usa vedi "Problemi comuni"                      |
| Il file `fonti/Budget 26-27.xlsx`                                            | solo per caricare i dati reali (parte 2)                    | è nella cartella `fonti/`, che git ignora                       |

```bash
docker --version
```

```bash
docker compose version
```

## 1. Avviare il sistema

**Passo 1 — entra nella cartella del progetto.** Sostituisci il percorso con il tuo.

```bash
cd ~/Documents/Eagle/Simple-configurable-ERP
```

**Passo 2 — crea il file di configurazione locale.** `.env.example` contiene i valori di sviluppo (nome e password del database locale, segreto dei token, accesso di sviluppo); `.env` è la tua copia, ignorata da git. Si fa una volta sola.

Se avevi già un `.env` di prima dell'arrivo del login, **aggiungi il blocco `# --- Login ---`** di `.env.example` (`JWT_SECRET`, `PUBLIC_URL`, `ADMIN_EMAILS`, `DEV_LOGIN_EMAIL`, …): senza, l'API non parte e dice quale variabile manca. Lo stesso vale per le righe nuove del database (`APP_DB_PASSWORD`, `DATABASE_URL` con l'utente `erp_app`, `DATABASE_OWNER_URL`, `TRUST_PROXY`): copiale da `.env.example`, poi lancia `db:migrate` e `db:roles` (passo 4).

```bash
cp .env.example .env
```

**Passo 3 — avvia tutto.** `--build` costruisce l'immagine la prima volta (qualche minuto: scarica Node e installa le dipendenze). Il comando resta in primo piano e stampa i log: lascia aperto questo terminale.

```bash
docker compose up --build
```

È pronto quando nei log vedi, dal servizio `web`, `VITE ... ready` e, dal servizio `api`, righe `Server listening at http://...:3000`.

**Passo 4 — crea le tabelle.** Apri un **secondo terminale**, entra nella cartella e lancia le migrazioni. Il database appena nato è vuoto: questo comando applica i file SQL di `apps/api/drizzle/`. Si può rilanciare quante volte vuoi: non rifà ciò che è già fatto.

```bash
docker compose exec api pnpm db:migrate
```

Poi crea l'**utente del database dell'API**. Il programma si collega a PostgreSQL con un utente suo (`erp_app`), che può leggere e scrivere i dati ma non cambiare la struttura né riscrivere lo storico; le migrazioni invece le fa il proprietario (`erp`). Si lancia dopo le migrazioni e si può ripetere (serve anche a cambiare la password):

```bash
docker compose exec api pnpm db:roles
```

**Passo 5 — inserisci i dati di base** (la stagione 2026-2027, le sei aree, il "Team's fund"). Anche questo si può ripetere senza danni.

```bash
docker compose exec api pnpm db:seed
```

**Passo 6 — apri l'app.**

- Il sito: [http://localhost:5173](http://localhost:5173)
- Controllo di salute dell'API: [http://localhost:3000/api/health](http://localhost:3000/api/health) deve rispondere `{"ok":true,"db":true}`

La prima schermata è **Sign in**. In sviluppo non serve Google: premi **Sign in as developer** (entri come `dev@localhost.test`, che è admin perché sta in `ADMIN_EMAILS`). Poi vedi le sei aree, ma vuote. Se apri il sito **prima** dei passi 4 e 5 vedrai errori: è normale, le tabelle non esistono ancora.

**Apri sempre `http://localhost:5173`** (non `127.0.0.1`): è l'indirizzo scritto in `PUBLIC_URL`, e l'API rifiuta le scritture che arrivano da un altro indirizzo.

## 2. Caricare il foglio reale (facoltativo)

Carica nel database tutto ciò che c'è in `fonti/Budget 26-27.xlsx`: progetti, voci, fondi, fornitori, BANK. Il file viene montato nel contenitore in sola lettura.

```bash
docker compose run --rm -v "$PWD/fonti:/app/fonti:ro" api pnpm --filter @erp/import-xlsx load
```

Se il database ha già dei progetti il comando si rifiuta (`The season already has N projects`) per non cancellare niente. Per **sostituire** i dati con quelli del foglio:

```bash
docker compose run --rm -v "$PWD/fonti:/app/fonti:ro" api pnpm --filter @erp/import-xlsx load -- --replace
```

Su Windows PowerShell scrivi `${PWD}` al posto di `$PWD`.

**Verifica che i numeri siano giusti.** Questo comando rilegge i dati dal database, li fa calcolare dal motore e li confronta, uno per uno, con i valori che il foglio Google aveva salvato (1.995 confronti). Deve finire con `All checks match.`

```bash
docker compose run --rm -v "$PWD/fonti:/app/fonti:ro" api pnpm reconcile -- --db
```

## 3. Un giro in cinque minuti

0. **In basso a sinistra** vedi chi sei e il tuo ruolo; il pulsante accanto è l'uscita. Nel gruppo **Admin** del menu ci sono **Users** (ruoli e aree dei capi area, solo admin) e **History** (chi ha cambiato cosa, per admin e capi area).
1. **MT + DMT** (menu a sinistra): vedi i progetti con le loro voci. Clicca una cella per modificarla (le celle grigie a destra sono calcolate, non si toccano). Cambia la quantità di una voce e guarda cambiare subito netto, IVA e totali.
2. **Triangolo arancione** accanto a una voce: manca il tipo di sponsor o l'aliquota IVA, quindi l'IVA non è ancora contata.
3. **Add project** e **Add item**: nuovi progetti e nuove voci. Il cestino in fondo alla riga elimina.
4. **CASH FROM**: contratti dei fondi, saldo residuo (rosso se negativo) e la casella "DOES IT PAY VAT?".
5. **CASH FLOW**: il saldo BANK e gli ingressi; "Left value" è ciò che resta dopo le spese del team.
6. **EXPECTED / ACTUAL GANTT**, **TOTAL**, le tre **ANALYSES**: sono viste di sola lettura, sempre ricalcolate dai dati.
7. Se il tuo sistema è in modalità scura, il sito è scuro; in chiara è chiaro (i colori vengono da Figma).

## 4. Comandi di ogni giorno

| Cosa vuoi fare                                                | Comando                                                    |
| ------------------------------------------------------------- | ---------------------------------------------------------- |
| Fermare tutto (i dati restano)                                | `docker compose down`                                    |
| Riavviare in sottofondo                                       | `docker compose up -d`                                   |
| Vedere lo stato                                               | `docker compose ps`                                      |
| Leggere i log in diretta                                      | `docker compose logs -f api` (oppure `web`, `db`)    |
| Lanciare i test                                               | quattro comandi, vedi sotto la tabella                     |
| Aprire il database a mano                                     | `docker compose exec db psql -U erp -d erp`              |
| Dopo aver cambiato `package.json` o aggiunto una dipendenza | `docker compose up --build -d`                           |
| **Cancellare anche il database** e ripartire da zero    | `docker compose down -v`, poi di nuovo i passi 3-5 (e 2) |

**I test, uno per pacchetto.** Ognuno va lanciato nel contenitore che ha quel codice condiviso con il tuo computer (così provi sempre la versione che stai scrivendo):

```bash
docker compose exec api pnpm --filter @erp/calc test
```

```bash
docker compose exec api pnpm --filter @erp/api test
```

```bash
docker compose exec web pnpm --filter @erp/web test
```

```bash
docker compose exec api pnpm --filter @erp/import-xlsx test
```

Risultati attesi: 99 (motore), 129 (API), 13 (sito), 3 (importer). I test dell'API usano un database a parte, `erp_test`, ricreato a ogni esecuzione: i tuoi dati di sviluppo non si toccano. Se hai pnpm sul computer (parte 5), `pnpm test` li lancia tutti insieme.

Dentro `psql` (il terminale del database) servono pochi comandi: `\dt` elenca le tabelle, `select * from fund;` mostra i fondi, `\q` esce.

**Cambiare la struttura del database.** Modifichi `apps/api/src/db/schema.ts`, poi generi il file SQL della modifica e lo applichi:

```bash
docker compose exec api pnpm db:generate
```

```bash
docker compose exec api pnpm db:migrate
```

Il file nuovo compare in `apps/api/drizzle/`: va committato insieme allo schema.

**Quali modifiche al codice si vedono subito?** Dipende dal contenitore: ognuno vede solo le cartelle che gli sono *condivise* con il tuo computer; di tutte le altre ha la copia fatta quando è stata costruita l'immagine.

| Contenitore | Cartelle condivise (si aggiornano subito)                                                |
| ----------- | ---------------------------------------------------------------------------------------- |
| `api`     | `apps/api/src`, `apps/api/drizzle`, `packages/calc/src`, `tools/import-xlsx/src` |
| `web`     | `apps/web/src`, `apps/web/index.html`, `packages/calc/src`                         |

Nell'`api` il server si riavvia da solo quando salvi; nel `web` il sito si aggiorna da solo. Per tutto il resto (dipendenze, `Dockerfile`, `docker-compose.yml`, configurazioni) serve `docker compose up --build -d`.

## 5. Lavorare sul codice fuori da Docker (facoltativo)

Serve quando vuoi gli strumenti dell'editor (suggerimenti, tipi) o lanciare i comandi senza passare da Docker.

1. Installa **Node 24 o più recente**.
2. Installa pnpm alla versione del progetto. (Il `corepack` incluso in alcune versioni di Node ha un bug di verifica delle firme: usa npm.)

```bash
npm install -g pnpm@12.14.0
```

3. Installa le dipendenze del progetto.

```bash
pnpm install
```

4. Il database deve essere acceso (`docker compose up -d db`). Il file `.env` punta già a `localhost:5432`.

Comandi utili, tutti dalla cartella principale:

| Comando                                 | Cosa fa                                             |
| --------------------------------------- | --------------------------------------------------- |
| `pnpm test`                           | tutti i test (motore, API, importer, formattazione) |
| `pnpm typecheck`                      | controlla i tipi di tutto il codice                 |
| `pnpm db:migrate`, `pnpm db:roles`, `pnpm db:seed` | come nei passi 4 e 5, ma da fuori            |
| `pnpm reconcile -- --db`              | la riconciliazione con il foglio, senza Docker      |
| `pnpm --filter @erp/import-xlsx load` | il caricamento del foglio, senza Docker             |

Se avvii l'API o il sito anche fuori da Docker mentre i contenitori sono accesi, le porte 3000 e 5173 si scontrano: ferma prima il servizio con `docker compose stop api` (o `web`).

## Problemi comuni

| Cosa vedi                                                                                              | Perché                                                                                  | Cosa fare                                                                                                                |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `Cannot connect to the Docker daemon`                                                                | Docker non è aperto                                                                     | apri Docker Desktop e aspetta che sia pronto                                                                             |
| `port is already allocated` (3000, 5173 o 5432)                                                      | un altro programma usa la porta (spesso un PostgreSQL installato sul computer)           | ferma quel programma, oppure cambia il numero a sinistra dei due punti in `docker-compose.yml`                         |
| Il sito dice `API or DB not reachable`, o ci sono errori 500                                         | tabelle non create, oppure API non partita                                               | passi 4 e 5; poi `docker compose logs api`                                                                             |
| `password authentication failed for user "erp_app"`, o l'health dice `db: false` dopo un aggiornamento | manca l'utente del database dell'API (o la password nel `.env` non è quella usata) | `docker compose exec api pnpm db:migrate` e poi `docker compose exec api pnpm db:roles` |
| `permission denied for table …` | l'API sta provando a fare ciò che il suo utente non può (cambiare la struttura, scrivere lo storico) | è un errore nel codice o in una migrazione: la struttura si cambia solo da migrazione, con il proprietario |
| `Too many requests: wait a minute and try again` (429) | troppe richieste dallo stesso indirizzo (10 al minuto per l'accesso) | aspetta un minuto |
| `relation "..." does not exist`                                                                      | le migrazioni non sono state applicate                                                   | `docker compose exec api pnpm db:migrate`                                                                              |
| `Current season not found: run pnpm db:seed`                                                         | mancano i dati di base                                                                   | `docker compose exec api pnpm db:seed`                                                                                 |
| `The season already has N projects`                                                                  | il caricamento non cancella senza permesso                                               | aggiungi `-- --replace` (cancella e ricarica)                                                                          |
| `ENOENT ... Budget 26-27.xlsx`                                                                       | il file non c'è o non è stato montato                                                  | controlla che sia in `fonti/` e di aver messo `-v "$PWD/fonti:/app/fonti:ro"`                                        |
| `Cannot find matching keyid` lanciando `corepack`                                                  | bug del corepack di alcune versioni di Node                                              | `npm install -g pnpm@12.14.0` e non usare corepack                                                                     |
| Il sito non trova un pacchetto appena aggiunto, o l'API dice `Cannot find package '@fastify/cookie'` | l'immagine è vecchia                                                                    | `docker compose up --build -d`                                                                                         |
| L'API non parte e cita `JWT_SECRET` o `PUBLIC_URL`                                                 | il `.env` non ha il blocco Login                                                       | copia il blocco `# --- Login ---` da `.env.example`                                                                  |
| Si vede sempre la pagina **Sign in**                                                             | token scaduto (24 ore), persona disattivata o cookie cancellato                          | rientra; se ti hanno disattivato, un altro admin ti riattiva da **Users** (l'ultimo admin non si può disattivare) |
| `Cross-site request refused` quando si salva                                                         | hai aperto il sito da un indirizzo diverso da `PUBLIC_URL` (per esempio `127.0.0.1`) | apri `http://localhost:5173`, oppure cambia `PUBLIC_URL`                                                             |
| `You cannot change this area` / `Only an admin can do this`                                        | il tuo ruolo non lo permette (è il server a decidere)                                   | un admin ti cambia ruolo o aree dalla pagina **Users**                                                             |
| Cambio un file e non succede niente, o un test usa codice vecchio                                      | quel contenitore non condivide quella cartella (ha la copia dell'ultima costruzione)     | vedi "Quali modifiche al codice si vedono subito?" e lancia il test nel contenitore giusto                               |
| I test dell'API falliscono su `erp_test`                                                             | il database non è acceso o non è "healthy"                                             | `docker compose ps`; aspetta che `db` sia `healthy`                                                                |
| Dopo le prove i dati sono sporchi                                                                      | hai modificato dati d'esempio                                                            | ricarica il foglio con `-- --replace`                                                                                  |

## Provare i ruoli

Gli utenti nascono al primo accesso come `viewer`. Per vedere l'app con gli altri ruoli, con un solo browser:

1. Esci e rientra con un'altra email di sviluppo: `DEV_LOGIN_EMAIL=altra@localhost.test docker compose up -d api`, poi **Sign in as developer** (nasce `viewer`: tutto in sola lettura, nessun gruppo Admin).
2. Torna admin: `docker compose up -d api` (senza la variabile; vale il `.env`), entra, apri **Users** e dai a quella persona il ruolo `pm` e qualche area.
3. Rientra con quell'email: ora può modificare solo quelle aree, gestire i fornitori e leggere lo storico.

Per togliere gli utenti di prova: `docker compose exec db psql -U erp -d erp -c "delete from app_user where email = 'altra@localhost.test'"`.

## Accesso con Google vero

Non serve in sviluppo. Quando il Workspace avrà un client OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `GOOGLE_ALLOWED_DOMAIN` nel `.env` (e, se vuoi, togli `DEV_LOGIN_EMAIL`); i passi su Google Cloud sono in [accesso-e-storico.md](accesso-e-storico.md#cosa-serve-su-google-lo-fa-chi-amministra-il-workspace).

## Sicurezza

Le porte sono pubblicate solo su `127.0.0.1`: l'app si raggiunge dal tuo computer e da nessun altro. C'è il login (Google; in sviluppo l'accesso "Sign in as developer"), un token di 24 ore e i ruoli applicati nel server, ma **non esporre le porte su una rete** finché non c'è la configurazione di produzione con HTTPS e backup ([produzione.md](produzione.md)). La password del database e il `JWT_SECRET` nel `.env.example` sono valori di sviluppo, pubblici: da non riusare altrove.
