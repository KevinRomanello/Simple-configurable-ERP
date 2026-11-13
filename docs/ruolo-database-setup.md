# Problema: `setup` si ferma su `db:roles` (utente dell'API già esistente)

Scritto il 13 novembre 2026, dopo il rilascio v0.8.0. Riguarda i server dove il **proprietario delle tabelle non è un superutente** di PostgreSQL. Il rilascio in generale: [rilascio.md](rilascio.md); i ruoli del database: [produzione.md](produzione.md) e [accesso-e-storico.md](accesso-e-storico.md).

## 1. Come si riconosce

Dopo `docker compose up -d` il passo `setup` esce con errore e l'API non riparte. Nel log di `setup` (`docker compose logs setup`) c'è:

```
code: '42501',
detail: 'Only roles with the SUPERUSER attribute may change the SUPERUSER attribute.',
where: SQL statement "alter role erp_app with login nosuperuser nocreatedb nocreaterole password '…'"
```

> **Attenzione:** la riga `where` contiene **la password dell'utente dell'API in chiaro**. Quando si incolla un log (in una chat, in un'issue), quella riga va coperta; se è già stata incollata, la password va cambiata (§5).

Le migrazioni, in quel caso, **sono già state applicate**: `db:migrate` gira prima di `db:roles` e finisce bene. A fallire è solo il passo dei ruoli.

## 2. Perché succede

`db:roles` (`ensureAppRole` in `apps/api/src/db/app-role.ts`) crea l'utente del database dell'API, `erp_app`, e lo rimette a posto a ogni avvio:

- se l'utente **non esiste**, lo crea con `create role … nosuperuser nocreatedb nocreaterole`: questo **riesce** anche a un proprietario che non è superutente (ma ha `CREATEROLE`);
- se l'utente **esiste già**, lo modifica con `alter role … nosuperuser nocreatedb nocreaterole password …`: questo **fallisce** a chi non è superutente, **anche se l'utente è già senza privilegi**, perché PostgreSQL controlla che nel comando compaia la parola `nosuperuser`, non il valore che ha adesso.

Quindi nel tuo caso l'utente esiste già (è stato creato la prima volta, o a mano) e il comando che lo "rinfresca" è proprio quello che il proprietario non può fare. L'utente `erp_app` in sé non ha niente che non va.

**Provato su PostgreSQL 16** (ruoli temporanei, poi tolti):

| Cosa fa un proprietario che non è superutente | Esito |
| --- | --- |
| `alter role erp_app with login nosuperuser nocreatedb nocreaterole password …` su un utente che ha creato lui | **errore** (quello del log) |
| `alter role erp_app with password …` (solo la password) su un utente che ha creato lui | riesce |
| `alter role erp_app with password …` su un utente creato da un altro | **errore**: serve `CREATEROLE` **e** l'opzione `ADMIN` sull'utente |
| `create role erp_app … nosuperuser …` | riesce (se ha `CREATEROLE`) |

## 3. Cosa succede quando `setup` si ferma

`setup` esegue `db:migrate && db:roles && db:seed`: la catena si ferma al primo errore. E `db:roles` lavora **in una transazione**, che al primo errore si annulla. Quindi:

| Passo | Stato |
| --- | --- |
| `db:migrate` | **fatto** (le migrazioni nuove sono applicate) |
| `db:roles`: permessi sulle tabelle | **non dati**: le tabelle create dalle migrazioni nuove (per la v0.8.0, le cinque `cash_*` del registro) possono non avere i permessi per `erp_app` |
| `db:roles`: regola per le tabelle future | **non messa** |
| `db:seed` | **non fatto**: per la v0.8.0 manca la riga dell'area ADMINISTRATION |
| l'API | `depends_on: setup` con `service_completed_successfully`: **non riparte**. Se gira ancora, è il contenitore **vecchio**, su un database già migrato |

Per questo «sembra andare perfettamente» inganna: il sito può mostrare la versione nuova (il contenitore `web` non aspetta `setup`) con l'API vecchia, o il contrario, e le pagine nuove si rompono a pezzi.

## 4. Come si risolve, a mano

**Prima controlla in che stato sei:**

```bash
docker compose ps
```
```bash
docker compose logs setup
```

`api` deve usare l'immagine della versione nuova (`docker compose images api`). Poi, nell'ordine:

1. **Dati di base** (`db:seed`), con il servizio `setup` perché ha le credenziali del proprietario. `--no-deps` impedisce di rilanciare `setup`, che fallirebbe ancora:

```bash
docker compose run --rm --no-deps setup pnpm db:seed
```

2. **Permessi** di `erp_app` sulle tabelle che ci sono e su quelle che verranno. Si può ripetere senza danni; vanno dati dal proprietario (`$POSTGRES_USER`, come nel backup):

```bash
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "GRANT USAGE ON SCHEMA public TO erp_app;" -c "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO erp_app;" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO erp_app;" -c "REVOKE INSERT, UPDATE, DELETE ON audit_log FROM erp_app;"'
```

   Le ultime due righe fanno quello che farebbe `db:roles`: le tabelle future prendono gli stessi permessi, e **lo storico (`audit_log`) resta leggibile ma non scrivibile** dall'API (lo scrive solo il trigger, con i diritti del proprietario: [accesso-e-storico.md](accesso-e-storico.md)). Non saltare il `REVOKE`: la `GRANT … ON ALL TABLES` dà all'API anche la scrittura di `audit_log`.

3. **Avvia API e sito** senza passare da `setup`:

```bash
docker compose up -d --no-deps api web
```

4. **Controlla**: `docker compose ps` (api e web in esecuzione), `curl https://IL-TUO-DOMINIO/api/health` deve rispondere `{"ok":true,"db":true}`; nel sito il menù Budget ha le sue aree e, per la v0.8.0, in **Settings › Register: Voci** c'è la colonna COUNTS.

Finché `setup` fallisce, ogni aggiornamento richiede questi passi (`up -d --no-deps api web` al posto di `up -d`). Per applicare le **migrazioni nuove** a mano: `docker compose run --rm --no-deps setup pnpm db:migrate`, e poi i punti 1–3.

## 5. Cambiare la password dell'utente dell'API a mano

`db:roles` è anche il modo di cambiare la password di `erp_app`, ma qui non può. A mano, dal proprietario, **solo se ha creato lui l'utente** (tabella del §2):

```bash
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

e dentro `psql`:

```sql
ALTER ROLE erp_app WITH PASSWORD 'la-nuova-password';
```

Poi la stessa password in `.env` (`APP_DB_PASSWORD`) e `docker compose up -d --no-deps api` (l'API legge la password all'avvio). Se il proprietario non può (utente creato da un altro), la password la cambia un superutente. Una password lunga e casuale; non va scritta in chat né nei log.

## 6. La correzione nel codice (non ancora fatta)

Per non dover più fare i passi del §4, `ensureAppRole` andrebbe cambiato così:

- se l'utente **esiste già** e ha già gli attributi giusti (`rolsuper`, `rolcreatedb`, `rolcreaterole` falsi, `rolcanlogin` vero), **non si ripetono** le parole `nosuperuser nocreatedb nocreaterole`;
- la password si prova a rimettere **da sola** (`alter role … with password`): se il proprietario non può, lo si dice a video e si continua (se la password nel `.env` fosse diversa, l'API non entrerebbe e si vedrebbe subito);
- i permessi, la regola per le tabelle future e il `REVOKE` su `audit_log` restano come adesso;
- se l'utente esiste **con attributi sbagliati** (per esempio superutente), si fallisce con un messaggio chiaro: è un caso che deve decidere una persona;
- la prova ricostruisce il tuo caso: un proprietario non superutente che lancia il comando su un utente già esistente. Oggi fallisce, dopo deve passare.

È la domanda D14 di [da-decidere.md](da-decidere.md): aspetta il via.
