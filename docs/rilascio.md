# Rilascio: dalle immagini su GitHub al server

**Stato: fatto e provato in locale** (27 ottobre 2026), tranne ciò che richiede GitHub o un server vero (vedi §7). Qui c'è come si fanno le immagini Docker di produzione, come si mettono su un server e come si aggiorna. Il perché dell'architettura (Caddy, HTTPS, backup, sicurezza) è in [produzione.md](produzione.md); la CI che controlla ogni modifica è in [ci.md](ci.md).

## 1. Cosa c'è

Un workflow di GitHub costruisce **due immagini** e le carica sul registro di GitHub (**ghcr.io**), da dove il server le scarica:

| Immagine | Cosa contiene | Da dove si costruisce |
| --- | --- | --- |
| `ghcr.io/kevinromanello/simple-configurable-erp-api` | l'API (Node), le migrazioni, `tsx` e **solo** le dipendenze che servono per girare; gira come utente `node`, non `root` | `Dockerfile.prod`, stadio `api` |
| `ghcr.io/kevinromanello/simple-configurable-erp-web` | **Caddy** con il sito già compilato (`vite build`): serve le pagine, inoltra `/api` all'API e fa l'HTTPS | `Dockerfile.prod`, stadio `web` |

Sono due perché il sito lo serve Caddy (come previsto in [produzione.md](produzione.md) §5), e quindi l'API resta com'è: non serve cambiarne le intestazioni di sicurezza né aggiungere librerie.

| File | A cosa serve |
| --- | --- |
| `Dockerfile.prod` | la ricetta delle due immagini (a più stadi). Copia solo le cartelle elencate: **mai** `fonti/`, copie del database o `.env`, perché le immagini vanno su un registro |
| `Caddyfile` | la configurazione del web server: pagine, `/api`, intestazioni di sicurezza, cache |
| `docker-compose.prod.yml` | lo stack del server: `db`, `setup`, `api`, `web`. Non costruisce niente, scarica le immagini |
| `.env.prod.example` | le variabili del server: si copia in `.env` **sul server** e si compila |
| `.github/workflows/docker-image.yml` | il workflow che costruisce e carica le immagini |

Il `Dockerfile` e il `docker-compose.yml` di sempre restano quelli dello **sviluppo** ([avvio.md](avvio.md)).

### Cosa fa lo stack del server

```
Internet ──80/443──> web (Caddy) ──/api──> api ──> db (volume)
                         │
                         └── il sito compilato (/srv/web)
setup: a ogni avvio, prima dell'api: migrazioni → utente erp_app → dati di base (si possono ripetere)
```

- Solo `web` pubblica porte (80 e 443). `db` e `api` non ne hanno: li raggiunge solo chi sta nello stesso stack.
- **`setup`** è un passo che finisce e sparisce: `db:migrate`, `db:roles`, `db:seed`. L'`api` parte solo se è andato a buon fine, quindi non ci si può dimenticare le migrazioni.
- L'API in produzione **rifiuta** il login di sviluppo e un database da superutente; vuole un `PUBLIC_URL` con `https://` e le tre variabili Google.

## 2. Fare un rilascio

1. Aspetta che la **CI del commit** sia verde (il workflow delle immagini **non** rilancia i test).
2. Dalla cartella principale, con il tag della versione (i comandi git li esegui tu, come sempre):

```bash
git tag v0.1.0
```

```bash
git push origin v0.1.0
```

3. Su GitHub, scheda **Actions → Docker images**: due lavori (`api`, `web`), pochi minuti la prima volta, meno poi (c'è la cache). Se vuoi provare senza tag: **Run workflow** dalla stessa pagina; le immagini avranno solo l'etichetta `sha-<commit>`.
4. Le immagini compaiono in **Packages** del tuo profilo (o del repository). Etichette di `v0.1.0`: `0.1.0`, `0.1` e `latest`.

La CI costruisce le due immagini (senza caricarle) anche a ogni modifica, quindi un errore in `Dockerfile.prod` si vede prima del tag.

**Visibilità.** Un pacchetto nuovo è **privato**. Per scaricarlo il server deve entrare nel registro **una volta** (§3, punto 3). In alternativa si può rendere il pacchetto pubblico (Package settings → Change visibility): dentro non ci sono segreti né dati, ma ci sono il codice e le regole di calcolo, quindi meglio lasciarlo privato.

## 3. Mettere l'app su un server (la prima volta)

Serve un server con **Docker** e **Compose v2**. Se vuoi l'HTTPS con un dominio: un record DNS verso il server e le porte 80 e 443 raggiungibili. Preparare il server (utente, firewall, aggiornamenti) è in [produzione.md](produzione.md) §5.3.

1. **Due file sul server**, in una cartella (per esempio `~/erp`):

```bash
scp docker-compose.prod.yml utente@server:erp/docker-compose.yml
```

```bash
scp .env.prod.example utente@server:erp/.env
```

   Poi sul server: `chmod 600 .env` e compila `.env` (tabella §4). Segreti nuovi e lunghi: `openssl rand -hex 24` per le due password, `openssl rand -base64 48` per `JWT_SECRET`.

2. **Entra nel registro**, una volta: crea su GitHub un *Personal access token (classic)* con il solo permesso `read:packages`, poi sul server:

```bash
docker login ghcr.io -u IL-TUO-UTENTE-GITHUB
```

   (la password è il token). Il token resta salvato sul server: per questo è di sola lettura.

3. **I tuoi dati.** Se parti da zero salta al punto 4. Se vuoi portare quelli che hai ora, **prima di avviare tutto**: sul tuo computer fai la copia (come in [avvio.md](avvio.md))

```bash
docker compose exec -T db pg_dump -U erp -d erp -Fc > copia-erp.dump
```

   la porti sul server (`scp copia-erp.dump utente@server:erp/`) e lì avvii **solo il database** e la ripristini:

```bash
docker compose up -d db
```

```bash
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges' < copia-erp.dump
```

   (se avevi già avviato tutto e il database non è vuoto: `docker compose down`, poi `docker volume rm erp-prod_db-data`, e si ripete da qui; i certificati HTTPS stanno in un altro volume e restano). Poi il passo `setup` troverà le migrazioni già applicate e creerà l'utente `erp_app`.

4. **Avvia**:

```bash
docker compose up -d
```

5. **Controlla**: `docker compose ps` (tutto `running`, `setup` `exited (0)`), `curl https://IL-TUO-DOMINIO/api/health` deve rispondere `{"ok":true,"db":true}`, poi apri il sito e entra con Google come uno degli `ADMIN_EMAILS`. Se qualcosa non parte: `docker compose logs api` o `docker compose logs setup`.

## 4. Il file `.env` del server

| Variabile | Cosa |
| --- | --- |
| `ERP_VERSION` | la versione da far girare: il tag **senza** la «v» (`0.1.0`), oppure `latest` |
| `SITE_ADDRESS` | cosa digitano le persone. Un **dominio** (`budget.esempio.it`): Caddy ottiene e rinnova da solo il certificato HTTPS. Oppure `:80`: HTTP semplice, quando l'HTTPS lo fa un altro programma davanti (una VPN, un altro proxy) |
| `PUBLIC_URL` | lo stesso indirizzo, **con `https://`**: lì Google rimanda dopo l'accesso. In produzione l'API non parte con un indirizzo `http://`, anche se `SITE_ADDRESS` è `:80` (in quel caso l'HTTPS lo mette il programma davanti) |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | il proprietario delle tabelle (solo per le migrazioni, mai per l'API) |
| `APP_DB_PASSWORD` | la password dell'utente `erp_app`, con cui gira l'API. Solo lettere e cifre: sta dentro un indirizzo |
| `JWT_SECRET` | firma i token di accesso (24 ore), almeno 32 caratteri; cambiarlo fa uscire tutti |
| `ADMIN_EMAILS` | gli admin: il primo accesso e la via di rientro |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_ALLOWED_DOMAIN` | il login ([accesso-e-storico.md](accesso-e-storico.md)): obbligatori in produzione |

Se una variabile obbligatoria manca, `docker compose` si ferma subito e dice quale.

## 5. Aggiornare

1. **Backup** del database (a mano, finché non c'è quello notturno, A5 di [produzione.md](produzione.md)):

```bash
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > copia-$(date +%F).dump
```

2. In `.env` cambia `ERP_VERSION` con la nuova versione, poi:

```bash
docker compose pull
```

```bash
docker compose up -d
```

   `setup` applica le migrazioni nuove **prima** che l'API riparta. Controlla `/api/health` e due pagine.

**Tornare indietro.** Rimetti la `ERP_VERSION` di prima e rilancia i due comandi. Le migrazioni vanno **solo avanti**: se una ha cambiato i dati in modo sbagliato, si ripristina la copia del punto 1 (come al §3, punto 3, dopo aver tolto il volume del database).

## 6. Cosa c'è nelle immagini, e cosa no

- **Dentro**: il codice dell'API e del motore, le migrazioni, le dipendenze di produzione (e `tsx`, che serve a far girare il TypeScript); il sito compilato. L'API non contiene Vitest, Vite, Drizzle Kit né le librerie del sito.
- **Fuori**: `fonti/`, le copie del database (`*.dump`), `.env`, i test. Lo garantiscono `Dockerfile.prod` (copia solo cartelle elencate) e `.dockerignore`.
- **Intestazioni del sito** (le mette Caddy): `Content-Security-Policy` con solo ciò che serve (`script-src 'self'`, stili in linea per AG Grid, immagini `data:` e `blob:` per i grafici e le miniature), `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`. L'API ha già le sue.
- **Cache**: i file in `/assets` hanno l'impronta nel nome e restano nel browser per un anno; `index.html` e le pagine si rivalidano sempre, così una versione nuova arriva subito.
- **Utenti**: l'API gira come `node`. Caddy dentro la sua immagine resta `root` (per le porte 80 e 443).
- **Indirizzo di chi visita**: Caddy lo passa all'API (`X-Forwarded-For`) e l'API lo usa per il limite di richieste (`TRUST_PROXY=true` nel compose, valido perché l'API non ha porte pubbliche). Se davanti a Caddy c'è **un altro** proxy, Caddy non si fida del suo `X-Forwarded-For` e tutti sembrerebbero lo stesso indirizzo: serve `trusted_proxies` nel `Caddyfile` (non provato).

## 7. Prove

Fatte in locale (27 ottobre 2026, Docker Desktop):

| Prova | Esito |
| --- | --- |
| Le due immagini si costruiscono da zero | sì; l'API non ha nessuno strumento di sviluppo, gira come `node` (id 1000) |
| Un problema trovato e corretto durante la prova | `pnpm-workspace.yaml` aveva permessi `600` sul computer e finiva nell'immagine illeggibile per `node`: `Dockerfile.prod` ora rende tutto leggibile (`chmod -R a+rX`). In CI non sarebbe successo, ma non ci si deve contare |
| Lo stack parte da un database vuoto | `setup`: migrazioni, `erp_app`, dati di base; l'API in produzione sana (rifiuta un superutente: passa) |
| Risposte da Caddy | `/api/health` 200; `/budget/hw` riceve `index.html`; `/api/me` senza accesso 401; il login di sviluppo **non esiste** (404); i file in `/assets` compressi e `immutable`, `index.html` `no-cache` |
| Il sito dietro la CSP | tutte le 22 pagine si aprono, nessun messaggio in console né violazione; Download in **PDF ed Excel** su quattro pagine (anche TOTAL, coi grafici) e le miniature dell'inventario funzionano |
| Ripristino di una copia del database | in un database nuovo, prima di avviare `setup`: stesse righe in `budget_line`, `fund`, `inventory_item`, `stock_movement`, `audit_log`, `setting`, e l'API risponde con i dati |
| Il Compose di produzione e il workflow | `docker compose config` valido; il workflow e `ci.yml` passano `actionlint` |

Per la prova col browser ho usato un file di appoggio **fuori dal repository** che metteva l'API in modalità sviluppo (per entrare senza Google): in produzione quel login non esiste.

**Non provato** (serve GitHub, un server o credenziali vere):

- l'**esecuzione del workflow su GitHub** (la prima sarà al primo tag; se fallisce, il messaggio dice il passo) e il `docker pull` da ghcr.io;
- l'**HTTPS con un dominio vero** (Let's Encrypt) e il **login con Google** vero;
- l'**architettura `amd64`**: le immagini di prova sono state costruite su un Mac ARM; il workflow costruisce `amd64`, e non cambia niente nelle dipendenze perché `pnpm` sceglie i pezzi della piattaforma al momento dell'installazione. Se il server fosse ARM, si aggiunge `linux/arm64` in `platforms` (più lento);
- la configurazione con **un altro proxy davanti** a Caddy;
- il **backup notturno** e il suo ripristino (A5): per ora c'è solo il comando a mano del §5.

## 8. Dopo

Restano le attività di [produzione.md](produzione.md) che non riguardano le immagini: preparare il server e il dominio, le credenziali Google, il backup automatico fuori dal server e il suo ripristino provato, il responsabile del server.
