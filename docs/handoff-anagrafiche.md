# Handoff: le anagrafiche (REGISTRY), per riprendere in un'altra chat

Il punto della situazione al 23 novembre 2026, per chi continua il lavoro senza la chat in cui è stato fatto. I dettagli stanno nei documenti indicati: qui c'è cosa è stato fatto, dove sta, cosa resta e cosa sapere prima di toccarlo.

## 1. L'obiettivo e com'è finito

L'obiettivo (dato con `/goal` il 21 novembre 2026, tolto dall'utente il 23 con `/goal stop`):
1. capire NocoDB e tutto quello che il team ci ha costruito sopra (documentazione IT del team e istanza NocoDB, **in sola lettura**);
2. costruire un modulo **generico** di anagrafiche dentro l'ERP: interfaccia semplice come quella di NocoDB e API vasta come la sua;
3. unire i pezzi: **ruoli dell'ERP** presi dalle anagrafiche e **moduli** al posto dei Google Form;
4. un'architettura ben legata all'ERP, con moduli legati ma indipendenti che si parlano con «API», il più semplice e generica possibile.

**Esito:**
- fatto, provato nel browser e documentato;
- l'utente l'ha dichiarato concluso il 22 novembre e ha giudicato l'architettura ottima il 23;
- **nessun commit**: tutto è nel working tree (§6).

## 2. I documenti da leggere, in quest'ordine

| Documento | Cosa c'è |
| --- | --- |
| [anagrafiche.md](anagrafiche.md) | il progetto completo: com'è oggi il team, principi, modello dati, tipi di campo, formule, viste, permessi, moduli, ruoli (`rolesync`), API, interfaccia, limiti, cosa resta fuori, import da NocoDB, dove sta il codice (§14), come provarlo (§15) |
| [anagrafiche-nocodb.md](anagrafiche-nocodb.md) | il confronto con NocoDB voce per voce, dalla sua documentazione ufficiale (indice `llms.txt` e API v3 3.0.0): ✓, ↔ o ✗ con il perché |
| [anagrafiche-architettura.md](anagrafiche-architettura.md) | ADR-1: le scelte con le alternative, le misure, i confini verificati dalle prove, cosa ha trovato la revisione |
| [produzione.md](produzione.md), punto A7 | cosa deve fare IT sul proxy |
| [accesso-e-storico.md](accesso-e-storico.md), §12–§14 | indirizzi pubblici anonimi, `/ext/`, token, ruoli dal registro |
| [collaudo.md](collaudo.md), voci del 21 e 22 novembre | cronologia delle prove, dei difetti trovati e corretti |

## 3. Cosa c'è, in breve

- **Motore puro**, `packages/registry` (nessun I/O, nessun orologio): valori e tipi di campo, formule con tutte le funzioni di NocoDB, filtri e sintassi `where` di NocoDB, interrogazioni (gruppi su più livelli, riepiloghi, colori), permessi per tabella, gruppo, campo e proprio record, invio dei moduli, CSV, modelli del corpo dei webhook, hash.
- **Modulo API**, `apps/api/src/modules/registry`, sotto `/api/registry`:
  - tabelle, campi, viste;
  - record: lista, conteggio, upsert, operazioni in blocco, copie, collegati a pagine;
  - commenti (modificati e risolti), file, storico;
  - CSV, JSON, iCalendar;
  - webhook con metodo, intestazioni, corpo, campi e «becomes»;
  - viste pubbliche con password e download;
  - moduli pubblici e moduli per chi è entrato;
  - link personali firmati, OpenAPI, mappe tramite il server, import da NocoDB.
- **Ponte** `apps/api/src/modules/rolesync`: ruoli dell'ERP (attivo, admin, User con aree, spunte Treasury e Sponsors) calcolati dalle viste-gruppo della tabella delle persone, con anteprima.
- **Token** per i servizi (`Authorization: Bearer erp_…`): `modules/auth/api-tokens.service.ts`.
- **Sito**:
  - le pagine `apps/web/src/pages/registry/`: viste griglia, galleria, kanban, calendario, timeline e gantt trascinabili, mappa;
  - il record a lato;
  - le impostazioni di tabella, campi, viste, moduli, accesso, webhook e import CSV o Excel;
  - Settings › Registry;
  - `pages/FormPage.tsx`, la pagina dei moduli: precompilazione, una domanda alla volta, bozza nel browser.
- **Proxy:** gli indirizzi `/api/registry/public/*` non riconoscono nessuno. Nel `Caddyfile`, `/ext/*` porta all'API senza l'intestazione della mail (vale solo il token) e la mail è tolta anche dai pubblici.
- **Database:** migrazioni `0033_registry` … `0037_registry_map` (tabelle `reg_*`, `role_sync`, `app_secret`, `api_token`), tutte nello storico tranne file, log dei webhook e segreti.

## 4. Le prove (tutte verdi al 22 novembre)

| Suite | Numero | Come si lancia (nei container: pnpm non è sul computer) |
| --- | --- | --- |
| calc | 278 | `docker compose exec -T api sh -c "cd /app/packages/calc && npx vitest run"` |
| motore delle anagrafiche | 64 | `docker compose exec -T api sh -c "cd /app/packages/registry && npx vitest run"` |
| API | 538 | `docker compose exec -T api sh -c "cd /app/apps/api && pnpm exec vitest run"` |
| importer | 3 (+1 saltata senza `fonti/`) | `docker compose exec -T api sh -c "cd /app/tools/import-xlsx && npx vitest run"` |
| sito | 185 (+1 saltata) | `docker compose exec -T web sh -c "cd /app/apps/web && npx vitest run"` |

I controlli dei tipi: `npx tsc -p tsconfig.json --noEmit` in `apps/api` e `apps/web`, `npx tsc -p tsconfig.json` in `packages/registry`.

Le prove dei confini (`apps/api/src/architecture.test.ts`, `apps/web/src/lib/architecture.test.ts`) falliscono se:
- un motore importa qualcosa da fuori;
- il registro importa un altro modulo (tranne `auth`);
- un modulo entra nel registro senza passare da `registry.public`;
- qualcuno dipende da `rolesync`;
- il sito importa codice del motore invece dei soli tipi.

## 5. Cosa resta aperto (non è codice)

| Punto | Chi | Dove |
| --- | --- | --- |
| Il proxy di IT deve lasciar passare senza login `/forms/`, `/assets/`, `/api/registry/public/`, `/ext/` | IT | produzione.md, A7 |
| L'import dei **dati veri** da NocoDB | il team: l'utente ha detto «non ora» (dati personali) | anagrafiche.md, §13bis (comando pronto; prima le regole di accesso) |
| Il rilascio: commit, migrazioni 0033–0037 fuori dal locale, ricostruzione dell'immagine del sito (librerie `qrcode-generator`, `jsbarcode`) | l'utente | rilascio.md |
| Per la mappa in produzione: il server deve poter uscire in HTTPS verso `tile.openstreetmap.org` | chi gestisce il server | anagrafiche.md, §12; hardcoded-registry.md, riga 11 |

Le cose lasciate fuori di proposito sono elencate con il motivo in anagrafiche-nocodb.md: automazioni, dashboard, AI (le fa n8n), annulla e ripeti, emoji e menzioni nei commenti, temi dei moduli, cluster della mappa, festivi del gantt. Come aggiungerle: anagrafiche.md, §13.

## 6. Stato di git

- Ramo `main`; ultimo commit `ccdb2b4 feat: arrival date`. **Nessun commit è stato fatto in questo lavoro**: i commit li fa solo l'utente (regola 2 di `CLAUDE.md`).
- Il working tree contiene anche **modifiche di sessioni precedenti**, non legate alle anagrafiche (data d'arrivo, sponsor di merce, pm Sponsors…). Vanno guardate prima di un commit unico.
- I file nuovi delle anagrafiche:
  - `packages/registry/`;
  - `apps/api/src/modules/registry/` e `rolesync/`, `modules/auth/api-tokens.service.ts`;
  - `apps/api/src/db/import-nocodb.ts`, `seed-registry.ts`;
  - `apps/api/src/architecture.test.ts`;
  - `apps/api/drizzle/0033…0037` con i loro snapshot;
  - nel sito: `apps/web/src/api/registry.ts`, `components/registry/`, `lib/registry.ts`, `lib/registrySheet.ts`, `lib/architecture.test.ts`, `pages/registry/`, `pages/FormPage.tsx`;
  - i documenti `docs/anagrafiche*.md` e questo file.
- Ci sono anche file **modificati** per le anagrafiche: `app.ts`, `auth.routes.ts`, `users.*`, `audit.service.ts`, `core/security.ts`, `core/errors.ts`, `db/schema.ts`, `Caddyfile`, `docker-compose.yml` (monta `apps/api/test`), `apps/web/package.json`, `pnpm-lock.yaml`, `App.tsx`, `client.ts`, `Shell.tsx`, `components.css` e diversi documenti.

## 7. Da sapere prima di toccare qualcosa

- **NocoDB non si modifica mai**: solo letture (`GET`). L'utente è «Viewer» su NocoDB.
- **Dati personali:** la documentazione IT del team e NocoDB contengono dati veri (nomi, codici fiscali, IBAN). Nei file tracciati va solo la struttura, mai i dati; nei test e nei seed solo dati inventati.
- **Database di sviluppo:** l'utente ci lavora in contemporanea. Prima delle prove nel browser:
  1. annota `max(id)` di `audit_log` (oggi **4057**);
  2. lavora con il registro dimostrativo (`seed-registry.ts`);
  3. alla fine toglilo (`seed-registry.ts --remove`);
  4. cancella **solo** le tue righe di storico: `delete from audit_log where id > <baseline> and table_name like 'reg\_%'`.

  Oggi il registro di sviluppo è vuoto e le migrazioni sono applicate tutte (38 su 38).
- **Prove nel browser:** l'accesso nel sito di sviluppo è già fatto (Developer, admin). Non inserire mai password: chi deve entrare entra da sé.
- **Convenzioni:**
  - codice e commenti in inglese, documenti in italiano, nomi delle pagine del menù in inglese;
  - le interfacce seguono i token di Figma; per le anagrafiche non c'è un disegno Figma, quindi usano i componenti esistenti;
  - un valore fisso va nella funzione-API con `// HARDCODED:` e una riga in hardcoded-registry.md;
  - prima di un lavoro nuovo, il piano all'utente;
  - ogni cambiamento aggiorna il documento che lo riguarda, e ogni file nuovo di `docs/` va nell'indice.
- **Architettura:** i moduli si parlano solo con funzioni pubbliche e ganci (`registry.public.ts`: `peopleInViews`, `groupsOfRegistry`, `onRegistryChange`, `onRegistryUse`; `users.service.ts`: `setManagedCheck`). Le prove dei confini lo controllano.
- **Lockfile:** quando cambia una dipendenza, si aggiorna dal computer con `npx -y pnpm@12.14.0 install --lockfile-only`, e poi si ricostruisce il container (`docker compose up --build -d`).

## 8. Come provarlo in due minuti

```bash
docker compose exec api sh -c "cd apps/api && pnpm exec tsx src/db/seed-registry.ts"
```

Poi, nel sito:
- **REGISTRY** › **People**: viste, gruppi, kanban, calendario, timeline «Path», galleria;
- **Table settings**: campi, viste, moduli, accesso, webhook, import;
- **`/forms/apply`**: il modulo pubblico.

Per toglierlo: lo stesso comando con `--remove`, e poi le tue righe di storico come al §7.
