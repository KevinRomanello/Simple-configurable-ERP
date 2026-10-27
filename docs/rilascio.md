# Rilascio: dalle immagini su GitHub al server

**Stato: fatto e provato in locale** (27 ottobre 2026), tranne ciò che richiede GitHub o un server vero (vedi §7). Qui c'è come si fanno le immagini Docker di produzione, come si mettono su un server e come si aggiorna. **Il modo di entrare in uso è il proxy dell'organizzazione con l'header `X-Email`** ([accesso-e-storico.md](accesso-e-storico.md), §12): l'HTTPS e il login li fa IT, qui si resta in HTTP. Il perché dell'architettura (Caddy, HTTPS, backup, sicurezza) è in [produzione.md](produzione.md); la CI che controlla ogni modifica è in [ci.md](ci.md).

## 1. Cosa c'è

Un workflow di GitHub costruisce **due immagini** e le carica sul registro di GitHub (**ghcr.io**), da dove il server le scarica:

| Immagine | Cosa contiene | Da dove si costruisce |
| --- | --- | --- |
| `ghcr.io/kevinromanello/simple-configurable-erp-api` | l'API (Node), le migrazioni, `tsx` e **solo** le dipendenze che servono per girare; gira come utente `node`, non `root` | `Dockerfile.prod`, stadio `api` |
| `ghcr.io/kevinromanello/simple-configurable-erp-web` | **Caddy** con il sito già compilato (`vite build`): serve le pagine, inoltra `/api` all'API, **fa passare solo il proxy** (`PROXY_IPS`) e, se serve, l'HTTPS | `Dockerfile.prod`, stadio `web` |

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
- L'API in produzione **rifiuta** il login di sviluppo e un database da superutente; vuole un `PUBLIC_URL` con `https://` (l'indirizzo del proxy) e **o** `TRUSTED_EMAIL_HEADER` **o** le tre variabili Google.
- **Solo il proxy può parlare con il sito** (`PROXY_IPS`, §4): l'API si fida dell'header `X-Email`, quindi chi lo scrivesse a mano diventerebbe chiunque.

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

Serve un server con **Docker** e **Compose v2**, raggiungibile dal proxy di IT sulla porta 80 (con HTTPS diretto, senza proxy: un record DNS verso il server e le porte 80 e 443 raggiungibili). Preparare il server (utente, firewall, aggiornamenti) è in [produzione.md](produzione.md) §5.3.

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

5. **Controlla**: `docker compose ps` (tutto `running`, `setup` `exited (0)`), `curl https://IL-TUO-DOMINIO/api/health` deve rispondere `{"ok":true,"db":true}`, poi apri il sito dall'indirizzo del proxy: entri da solo, con la tua mail, e se è in `ADMIN_EMAILS` sei admin. Se il sito risponde `Forbidden (your address: …)`, quell'indirizzo è quello che Caddy vede: mettilo in `PROXY_IPS` (se è del proxy) e riavvia `web`. Se qualcosa non parte: `docker compose logs api` o `docker compose logs setup`.

## 4. Il file `.env` del server

| Variabile | Cosa |
| --- | --- |
| `ERP_VERSION` | la versione da far girare: il tag **senza** la «v» (`0.1.0`), oppure `latest` |
| `TRUSTED_EMAIL_HEADER` | il nome dell'header in cui il proxy mette la mail (`X-Email`). Se è impostato, **è l'unico modo di entrare**: niente Google, niente `JWT_SECRET` |
| `PROXY_IPS` | gli indirizzi (o le reti, `10.0.0.0/24`) da cui arriva il proxy, separati da spazi: **chiunque altro riceve 403**. Obbligatorio. Chiedilo a IT; per controllare, un indirizzo non ammesso riceve «Forbidden (your address: …)». Se il proxy è **sullo stesso server**, di solito è l'indirizzo del ponte di Docker (`172.x.0.1`). Senza proxy (Google, HTTPS diretto): `0.0.0.0/0 ::/0` |
| `SITE_ADDRESS` | `:80`: HTTP semplice, l'HTTPS lo fa il proxy (è il caso). Oppure un **dominio** (`budget.esempio.it`): Caddy ottiene e rinnova da solo il certificato HTTPS (senza proxy) |
| `WEB_BIND` | l'indirizzo del server su cui il sito ascolta le porte 80 e 443: quello che il proxy raggiunge, oppure `127.0.0.1` se il proxy è sullo stesso server. Predefinito: tutti |
| `PUBLIC_URL` | l'indirizzo che la gente digita, cioè quello del proxy, **con `https://`**. L'app lo usa per riconoscere le richieste del proprio sito (e con Google per il ritorno dopo l'accesso). In produzione l'API non parte con `http://`, anche se `SITE_ADDRESS` è `:80` |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | il proprietario delle tabelle (solo per le migrazioni, mai per l'API) |
| `APP_DB_PASSWORD` | la password dell'utente `erp_app`, con cui gira l'API. Solo lettere e cifre: sta dentro un indirizzo |
| `JWT_SECRET` | **solo con Google**: firma i token di accesso (24 ore), almeno 32 caratteri; cambiarlo fa uscire tutti |
| `ADMIN_EMAILS` | gli admin: il primo accesso e la via di rientro |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_ALLOWED_DOMAIN` | **solo con Google** (senza `TRUSTED_EMAIL_HEADER`): il login ([accesso-e-storico.md](accesso-e-storico.md)); con l'header l'API si rifiuta di partire se ci sono |

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
- **Indirizzo di chi visita**: il proxy lo mette in `X-Forwarded-For`; Caddy se ne fida **solo** se la richiesta arriva da `PROXY_IPS` (`trusted_proxies`), lo passa all'API e l'API lo usa per il limite di richieste (`TRUST_PROXY=true` nel compose, valido perché l'API non ha porte pubbliche).
- **Chi può parlare con l'app**: solo gli indirizzi di `PROXY_IPS` (gli altri: 403 con il loro indirizzo) e nessuna porta pubblica per `api` e `db`. Sul perché è indispensabile: [accesso-e-storico.md](accesso-e-storico.md), §12.

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
| **Accesso dietro un proxy** | vedi sotto |

**Accesso dietro un proxy** (stack in modalità proxy, con un **finto proxy** fuori dal repository che sostituisce `X-Email`; Caddy a `PROXY_IPS` sbagliato, poi corretto con l'indirizzo che lui stesso aveva indicato):

| Prova | Esito |
| --- | --- |
| Un indirizzo non ammesso | 403 «Forbidden (your address: 172.20.0.1)» su `/api` e sul sito. Un errore trovato e corretto: il blocco che rifiuta stava **dopo** gli altri nel `Caddyfile` e non scattava mai (all'inizio passava tutto con 200); ora è il primo |
| Un indirizzo ammesso | senza header 401; con `X-Email` dell'admin: admin; con quella di una persona nuova: `viewer` col nome ricavato; con due mail 401; il sito e `/budget/hw` rispondono; il login di sviluppo 404; `/api/auth/config` dice `proxy: true` |
| Il finto proxy sostituisce un `X-Email` falso mandato dal client | sì, entra la mail del proxy |
| Nel browser | si entra da soli come admin, nessun Sign out, 22 pagine senza errori, una scrittura e una cancellazione (controllo dell'`Origin` con `PUBLIC_URL` `https://` dietro un proxy `http://`), la pagina Users mostra le persone, un account disattivato vede «This account has been deactivated», una richiesta senza header vede la pagina «Try again» |

Per la prova con Google (provata prima) ho usato un file di appoggio **fuori dal repository** che metteva l'API in modalità sviluppo: in produzione quel login non esiste.

**Non provato** (serve GitHub, un server o credenziali vere):

- l'**esecuzione del workflow su GitHub** (la prima sarà al primo tag; se fallisce, il messaggio dice il passo) e il `docker pull` da ghcr.io;
- il **proxy vero di IT**: se sostituisce davvero l'header (lo hanno detto), da quale indirizzo arriva, cosa fa a una sessione scaduta, se c'è un indirizzo di uscita; **chi passa dal proxy** (decide se una mail mai vista deve essere `viewer`, [accesso-e-storico.md](accesso-e-storico.md), §12);
- l'**HTTPS con un dominio vero** (Let's Encrypt) e il **login con Google** vero (non servono con il proxy);
- l'**architettura `amd64`**: le immagini di prova sono state costruite su un Mac ARM; il workflow costruisce `amd64`, e non cambia niente nelle dipendenze perché `pnpm` sceglie i pezzi della piattaforma al momento dell'installazione. Se il server fosse ARM, si aggiunge `linux/arm64` in `platforms` (più lento);
- il **backup notturno** e il suo ripristino (A5): per ora c'è solo il comando a mano del §5.

## 8. Dopo

Restano le attività di [produzione.md](produzione.md) che non riguardano le immagini: preparare il server, farsi dare da IT gli indirizzi del proxy, il backup automatico fuori dal server e il suo ripristino provato, il responsabile del server.
