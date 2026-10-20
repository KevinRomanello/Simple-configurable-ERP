# Accesso, ruoli e storico delle modifiche

**Stato: proposta da confermare.** Niente di questo è ancora scritto nel codice. Nasce dalle risposte del 20 ottobre: login solo con Google (account del team), tre ruoli (`admin`, `pm`, `viewer`), storico delle modifiche, server proprio con Ubuntu e Tailscale. In fondo ci sono le domande aperte.

## 1. Il principio: si cambiano solo i corpi di funzioni che già esistono

Il progetto ha già i punti dove questo si innesta (regola 4):

| Punto                      | Oggi                             | Dopo                                                         |
| -------------------------- | -------------------------------- | ------------------------------------------------------------ |
| `getCurrentUser()`       | restituisce sempre "Local admin" | restituisce l'utente della sessione, o risponde 401          |
| `canWrite(utente, area)` | `true`                         | applica i ruoli                                              |
| `runWrite(utente, fn)`   | apre la transazione              | in più, dice al database chi sta scrivendo (per lo storico) |

I servizi che usano queste funzioni (tutti) **non cambiano**.

## 2. Login con Google

### 2.1 Come funziona (passo per passo)

```mermaid
sequenceDiagram
  participant B as Browser
  participant A as API
  participant G as Google
  B->>A: GET /api/auth/login
  A-->>B: redirect a Google (state + PKCE)
  B->>G: la persona sceglie l'account del team
  G-->>B: redirect a /api/auth/callback?code&state
  B->>A: GET /api/auth/callback
  A->>G: scambia il code con il token (con il segreto del client)
  G-->>A: ID token (firmato)
  A->>A: controlla firma, destinatario, scadenza, email verificata e dominio del team
  A->>A: trova o crea l'utente; crea la sessione nel database
  A-->>B: cookie di sessione + redirect all'app
```

1. L'API manda la persona a Google con un valore casuale (`state`, contro i falsi callback) e una prova crittografica (PKCE, contro l'intercettazione del codice).
2. Google autentica e rimanda alla nostra pagina con un `code` monouso.
3. L'API, **da server a server**, scambia il `code` con un token firmato che contiene email, nome e, per gli account Workspace, il dominio (`hd`).
4. L'API verifica la firma del token con le chiavi pubbliche di Google, che sia destinato a noi, non scaduto, che l'email sia verificata e che **il dominio sia quello del team**. Il controllo del dominio si fa nel server: il parametro `hd` mandato a Google è solo un suggerimento grafico.
5. Se l'utente non esiste lo crea (vedi la domanda 2), se è disattivato rifiuta.
6. Crea una **sessione**: un codice casuale di 256 bit; nel database si salva solo il suo hash; al browser va in un cookie `HttpOnly` (non leggibile da JavaScript), `Secure` (solo HTTPS) e `SameSite=Lax`. Scade dopo un'inattività e dopo un massimo.

### 2.2 Perché una sessione nel database e non un token autonomo (JWT)

Se disattivi un utente o cambi un ruolo, la sessione lo sa **subito**; con un token firmato valido per ore, no. Costa una lettura del database per richiesta, che per decine di utenti non si nota.

### 2.3 Come si protegge l'API

- Un controllo comune prima di ogni rotta: tutto `/api/*` richiede una sessione valida, tranne `/api/health` e `/api/auth/*`. Senza sessione: 401.
- **`getCurrentUser()` resta senza argomenti**: l'utente della richiesta viene messo in un contesto asincrono di Node (`AsyncLocalStorage`) dal controllo comune, e la funzione lo legge da lì. I servizi non vanno toccati; un test verifica che il contesto arrivi fino ai servizi.
- **CSRF** (un altro sito che manda richieste a nome tuo): `SameSite=Lax` blocca già i cookie nelle richieste cross-site di scrittura; in più il server controlla che l'intestazione `Origin` delle richieste che modificano dati sia quella del sito.
- Il sito: `GET /api/me` dice chi sei e cosa puoi fare; se risponde 401 mostra la pagina "Accedi con Google". Un 401 in qualunque momento riporta lì.
- **Uscita**: `POST /api/auth/logout` cancella la sessione e il cookie.

### 2.4 Sviluppo senza Google

In locale non vogliamo credenziali Google per ogni sviluppatore. Si aggiunge un accesso **solo per sviluppo**: con `DEV_LOGIN_EMAIL=nome@dominio` nel `.env` si entra come quell'utente senza passare da Google. Il server **si rifiuta di avviarsi** se `DEV_LOGIN_EMAIL` è impostato mentre `NODE_ENV=production`. È un elemento temporaneo dichiarato (e va nel [registro](hardcoded-registry.md)).

### 2.5 Cosa serve su Google (lo fa chi amministra il Workspace)

1. In **Google Cloud Console**, un progetto dentro l'organizzazione del team.
2. *Schermata di consenso OAuth* di tipo **Interno**: solo gli account dell'organizzazione possono accedere. È la seconda barriera, dopo il controllo del dominio.
3. Un **ID client OAuth** di tipo "Applicazione web", con gli URI di reindirizzamento: `https://<indirizzo-del-sito>/api/auth/callback` e, per lo sviluppo, `http://localhost:5173/api/auth/callback`.
4. Il **client ID** e il **client secret** vanno nel `.env` del server (mai nel repository).

Nota da verificare: Google accetta come URI di reindirizzamento solo indirizzi HTTPS con un nome di dominio vero (non un IP privato), oltre a `localhost`. Con Tailscale va bene un nome come `<macchina>.<tailnet>.ts.net` con HTTPS; ne parliamo al punto delle domande sul server.

## 3. Ruoli

Tre ruoli, in una colonna `app_user.role`. Il `pm` è legato alle **aree** che può modificare (tabella `user_area`: utente, area).

| Azione                                            | `admin`     | `pm`                               | `viewer`             |
| ------------------------------------------------- | ------------- | ------------------------------------ | ---------------------- |
| Vedere tutto: aree, viste, grafici, analisi       | sì           | sì                                  | sì                    |
| Modificare voci e progetti                        | tutte le aree | **solo le sue aree**           | no                     |
| Aggiungere o eliminare progetti                   | tutte le aree | le sue aree *(da confermare)*      | no                     |
| Fondi, contratti, flag "paga IVA", ingressi, BANK | sì           | no *(da confermare)*               | no                     |
| Fornitori                                         | sì           | può aggiungerli *(da confermare)* | no                     |
| Utenti, ruoli, aree assegnate                     | sì           | no                                   | no                     |
| Storico delle modifiche                           | tutto         | le sue aree *(da confermare)*      | no *(da confermare)* |

`canWrite(utente, area)` diventa: `admin` → sì; `pm` → sì solo se l'area è tra le sue; `viewer` → no. Per i dati condivisi (fondi, ingressi, BANK) chiede `canWrite(utente, null)`: oggi solo `admin`. **I permessi si applicano nel server**; l'interfaccia nasconde o disabilita i comandi per chi non può usarli, ma è una comodità, non la protezione.

**Perché i `pm` per area e non su tutto.** Un capo area che sbaglia riga modifica per errore un'altra area: con le aree assegnate non può. Se un `pm` deve poter modificare tutto, gli si assegnano tutte le aree. Il modello copre entrambi i casi.

**Utenti.** Tabella `app_user`: email (unica, senza distinzione di maiuscole), nome, ruolo, attivo, ultimo accesso. Chi lascia il team si **disattiva**, non si cancella, per non rompere lo storico. Il primo amministratore si indica con la variabile `ADMIN_EMAILS` nel `.env`: al primo accesso di quell'email nasce un `admin`. Poi si gestisce da una pagina "Utenti" riservata agli admin.

## 4. Storico delle modifiche

### 4.1 Tabella, non file

Hai proposto un file di log o una tabella. **Consiglio la tabella**, scritta nella stessa transazione della modifica:

|                                                       | File di log                                                           | Tabella nel database                                                  |
| ----------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Coerenza con i dati                                   | no: se il server cade tra la scrittura e il log, i due non coincidono | **sì**: o c'è la modifica e il suo storico, o nessuno dei due |
| "Cos'è successo alla voce 91?"                       | si cerca nel testo                                                    | una query                                                             |
| Interfaccia (pagina "Storico")                        | va costruito un lettore                                               | si legge dal database                                                 |
| Sopravvive a una rotazione dei log, a un nuovo server | no, se non lo si cura                                                 | sì, è nel backup                                                    |
| Rumore                                                | alto                                                                  | solo le modifiche vere                                                |

Il log normale (una riga JSON per richiesta, già presente) resta utile per il debug, ma non è lo storico.

### 4.2 Come si scrive: un trigger nel database

La tabella `audit_log`: istante, chi (`actor_id`), tabella, id della riga, azione (`insert`/`update`/`delete`), **valori prima e dopo** (`jsonb`).

Si scrive con un **trigger** di PostgreSQL su ogni tabella da tracciare (`project`, `budget_line`, `line_figures`, `fund`, `fund_contract`, `team_inflow`, `bank_snapshot`, `supplier`, `app_user`, `user_area`): una funzione unica che, a ogni inserimento, modifica o cancellazione, registra la riga. Chi sta scrivendo glielo dice `runWrite`: all'inizio della transazione esegue `select set_config('app.actor_id', '<id>', true)` (valido solo per quella transazione).

Perché un trigger e non una chiamata in ogni servizio:

- **non si può dimenticare**: ogni nuova scrittura è tracciata, anche quelle fatte a mano con SQL;
- registra anche le **cancellazioni a cascata** (cancellare un progetto registra ogni voce che sparisce);
- si scrive **una volta** (una migrazione "personalizzata" di drizzle-kit) invece di cento punti nel codice.

Cosa non fa: non sa *perché* è stato modificato, vede solo i valori. Per un bilancio basta.

### 4.3 Come si legge

- `GET /api/audit?table=&row=&area=&user=&from=&to=` (solo chi ha il permesso).
- Una pagina "Storico": le ultime modifiche con **solo i campi cambiati** ("Quantità: 10 → 12"), filtrabili per area, persona e data.
- Sulla riga di una voce, un modo di aprire la sua cronologia.

L'insieme dei dati è piccolo (poche modifiche al giorno): si tiene tutto, senza cancellazioni automatiche.

## 5. Le migrazioni restano

Hai scritto che le migrazioni non servono "dal momento che basterà caricare il file". Sono due cose diverse:

- **Il caricamento del foglio** riempie le tabelle con i dati. Si fa **una volta**, sul server nuovo.
- **Le migrazioni** *creano* le tabelle (e le cambiano nel tempo). Senza, il file non ha dove andare. E quando aggiungeremo `app_user`, `session`, `audit_log` il database **di produzione, già pieno di dati**, deve ricevere le nuove tabelle senza perdere niente: è esattamente ciò che fa una migrazione.

Quindi sul server la sequenza è: **migrazioni → dati di base → caricamento del foglio (una volta)**; dopo, l'app è la fonte dei dati e il foglio non si ricarica più. Le migrazioni diventano un passo automatico di ogni rilascio.

## 6. Cosa si costruisce, in ordine

| # | Blocco                                                                                                                                 | Taglia |
| - | -------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1 | Tabelle `app_user`, `user_area`, `session`, `audit_log` + trigger (migrazioni)                                                 | M      |
| 2 | Accesso con Google: `/api/auth/login`, `/callback`, `/logout`, sessione nel database, accesso di sviluppo                        | L      |
| 3 | Controllo comune delle richieste, `getCurrentUser()` con il contesto, `canWrite()` con i ruoli, `runWrite` che comunica l'attore | M      |
| 4 | Sito: pagina di accesso, `GET /api/me`, interfaccia che segue i permessi, gestione del 401                                           | M      |
| 5 | Pagina "Utenti" (ruoli e aree)                                                                                                         | M      |
| 6 | Storico: API di lettura e pagina                                                                                                       | M      |
| 7 | Test di tutto (utente non autenticato, ruoli, aree, storico) e documentazione                                                          | M      |

Prima di scrivere il codice servono le risposte alle domande qui sotto.

## 7. Domande aperte

**Sul login e i ruoli**

1. **`pm` per area** (la mia proposta) o su tutto? E può un `pm` creare/eliminare progetti nella sua area? Può toccare fondi, contratti e BANK (propongo di no: sono del tesoriere)? Può aggiungere fornitori?
2. **Primo accesso**: chiunque abbia un account del team entra automaticamente come `viewer` (e un admin lo promuove), oppure entra solo chi un admin ha **invitato prima**?
3. Il **dominio** esatto degli account Google del team, e chi può creare il client OAuth su Google Cloud (serve un amministratore del Workspace).
4. Chi sono i **primi admin** (email) per `ADMIN_EMAILS`.
5. **Durata della sessione**: propongo 12 ore di inattività, massimo 7 giorni.
6. **Chi vede lo storico**: solo admin, o anche i `pm` per le loro aree?

**Sul server** (vedi anche [produzione.md](produzione.md))

7. L'app sarà raggiungibile **solo via Tailscale** (mia raccomandazione) o anche da Internet? Per l'HTTPS: `tailscale serve` con un nome `*.ts.net`, oppure un sottodominio vostro con certificato Let's Encrypt (serve poter automatizzare il DNS)?
8. Sul server c'è già **Docker**? Le porte **80/443** sono occupate dal sito standard o da un reverse proxy (nginx, Traefik, Caddy)? In quel caso l'app si mette dietro il proxy che c'è.
9. **Rilascio**: manuale (`git pull` e uno script sul server) o automatico da GitHub quando si crea un tag (con la CI che entra nella rete Tailscale)?
10. Dove si tengono i **backup**: un altro vostro server raggiungibile via Tailscale?
