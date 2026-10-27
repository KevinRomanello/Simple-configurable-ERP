# Integrazione continua (CI) su GitHub

**A cosa serve.** A ogni modifica caricata su GitHub, un computer di GitHub rifà da zero i controlli che faresti a mano: se qualcosa si rompe, lo vedi subito sulla pagina della modifica (una spunta verde o una croce rossa), prima che arrivi in produzione. È un'assicurazione contro "sul mio computer funzionava".

**Dove.** `.github/workflows/ci.yml`. Non serve nessun segreto e non pubblica né mette online niente: controlla soltanto.

## Quando parte

- a ogni **push su `main`**;
- a ogni **pull request**;
- se fai due push di fila sullo stesso ramo, il controllo vecchio viene annullato (non ha senso finirlo).

## Cosa controlla

**Job 1 — "Types, tests and build"** (su una macchina Linux pulita, con un PostgreSQL 16 acceso accanto):

| Passo | Cosa fa | Se fallisce |
| --- | --- | --- |
| Install dependencies | `pnpm install --frozen-lockfile`: installa esattamente le versioni di `pnpm-lock.yaml` | hai cambiato `package.json` senza aggiornare il lockfile: lancia `pnpm install` e committa `pnpm-lock.yaml` |
| Audit dependencies | `pnpm audit --prod --audit-level=high`: vulnerabilità note in ciò che va in produzione (gli strumenti di sviluppo restano fuori; solo "high" o peggio ferma la build) | aggiorna la dipendenza o, se non c'è ancora una versione corretta, aggiungi un `override` in `pnpm-workspace.yaml` e annotalo |
| Type check | `pnpm typecheck`: i tipi di tutto il codice | c'è un errore di tipo: lo stesso comando lo mostra in locale |
| Tests | `pnpm test`: motore, API (con il database), importer, sito | un test è rosso: lancialo in locale (vedi [avvio.md](avvio.md)) |
| Build the web app | `pnpm --filter @erp/web build`: il sito compilato per la produzione | un import sbagliato o un errore che il server di sviluppo tollerava |

**Job 2 — "Docker image and Compose file"**:

| Passo | Cosa fa |
| --- | --- |
| The Compose file is valid | `docker compose config --quiet` sul `docker-compose.yml` |
| The image builds | `docker build .`: il `Dockerfile` funziona con il lockfile attuale |
| The production Compose file is valid | `docker compose -f docker-compose.prod.yml config` con `.env.prod.example` |
| The production images build | `Dockerfile.prod`, gli stadi `api` e `web`: non si caricano, ma un errore si vede prima di fare il tag ([rilascio.md](rilascio.md)) |

I due job girano in parallelo. In più **Dependabot** (`.github/dependabot.yml`) apre ogni settimana una pull request con gli aggiornamenti di npm, delle azioni di GitHub e del `Dockerfile`. I test del database usano `DATABASE_OWNER_URL` (il proprietario: crea il database di prova e l'utente limitato con cui poi gira tutta la suite); la riconciliazione col foglio (`pnpm reconcile`) **non** gira in CI, perché dipende da `fonti/` (dati reali, mai su GitHub).

## Provarlo in locale

Gli stessi passi del job 1, dalla cartella principale e con il database acceso (`docker compose up -d db`):

```bash
pnpm install --frozen-lockfile
```

```bash
pnpm typecheck
```

```bash
pnpm test
```

```bash
pnpm --filter @erp/web build
```

**Se in CI fallisce un test che in locale passa**, quasi sempre i test dipendono dall'ordine dei file (tutti usano lo stesso database e l'ordine cambia da un computer all'altro). Per provocarlo in locale si mescola l'ordine, scegliendo il seme:

```bash
pnpm --filter @erp/api exec vitest run --sequence.shuffle.files --sequence.seed=2
```

Con semi diversi (1, 2, 3…) il difetto si ripete finché non si corregge; un test deve toccare solo le righe che ha creato.

Prima della consegna, i passi sono stati eseguiti in una copia del progetto **senza** `node_modules`, `.env` e `fonti/` (come un computer nuovo), tutti verdi. Il workflow è stato controllato con `actionlint`, l'analizzatore ufficiale dei file di GitHub Actions. Il primo vero esito è quello del primo push.

## Come leggere un fallimento

Sulla pagina del commit o della pull request, accanto alla croce rossa c'è "Details": mostra i passi in ordine e il log di quello fallito. Nove volte su dieci l'errore è lo stesso che otterresti lanciando in locale il comando di quel passo.

## Cosa non c'è (ancora)

- **Rilascio automatico** (CD): quando avremo il server si sceglierà tra rilascio manuale e automatico; vedi [produzione.md](produzione.md).
- **Test dell'interfaccia nel browser** (Playwright): da fare; l'accesso e i ruoli sono stati provati a mano nel browser con admin, capo area e sola lettura, e i permessi sono coperti dai test dell'API.
- **Aggiornamento automatico delle azioni** (`actions/checkout@v4`, ecc.): si può attivare con Dependabot; per ora le versioni sono fisse.
- Si può **proteggere `main`**: su GitHub, *Settings → Branches → Branch protection rule*, "Require status checks to pass" scegliendo i due job, così non si può unire una modifica con la CI rossa.
