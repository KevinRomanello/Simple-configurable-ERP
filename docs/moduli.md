# Moduli: accendere e spegnere parti dell'ERP

**Stato: fatto (27 novembre 2026, fine della fase G).** L'ERP è un **nucleo** sempre acceso, quattro **moduli** che un admin può spegnere (budget, tesoreria, inventario, anagrafiche) e tre **ponti** che si accendono da soli quando sono accesi i loro moduli. Il perché e il come, passo per passo, sono in [moduli-architettura.md](moduli-architettura.md) (ADR-2); qui c'è ciò che serve per usarli e per aggiungerne uno.

## 1. Le parti

| Parte | Cosa tiene | Indirizzi |
| --- | --- | --- |
| **nucleo** (`platform`) | login, utenti e spunte, aree, stagioni, liste comuni (categorie, aliquote IVA), Settings › App, History, token dei servizi | `/api/me`, `/api/users`, `/api/areas`, `/api/seasons`, `/api/settings`… |
| **budget** | le righe delle aree, sponsor e fondi (CASH FROM), fornitori (BOUGHT FROM), CASH FLOW, Gantt, TOTAL, analisi | `/api/budget/…` |
| **tesoreria** | il registro di cassa (Cassa, Banca, Paypal), il suo import, il rendiconto | `/api/treasury/…` |
| **inventario** | i pezzi e dove sono, i movimenti, i componenti con la distinta, le statistiche | `/api/inventory/…` |
| **anagrafiche** (Registry) | le tabelle del team, i moduli pubblici, webhook e chiavi per n8n | `/api/registry/…` |
| ponte **tesoreria×budget** | TO PAY, gli inflow ricevuti nel registro, i pagamenti legati alle righe, l'area ADMINISTRATION, la Voce di partenza per categoria | `/api/treasury-budget/…` |
| ponte **inventario×budget** | PENDING, gli arrivi delle righe del budget, ARRIVED, i progetti nell'inventario | `/api/inventory-budget/…` |
| ponte **anagrafiche×accesso** | i ruoli dell'ERP presi dal registro | `/api/registry-access/…` |

## 2. Spegnere un modulo

In **Settings › App › Modules** (solo admin) ogni modulo ha un interruttore **On / Off**, con la sua descrizione e cosa si spegne con lui («Turning it off also hides …»: i ponti che ne hanno bisogno). Un modulo **spento**:

- **non compare nel sito:** niente gruppo nel menù, le sue pagine portano alla prima pagina, la sua scheda di Settings non c'è, e i suoi pezzi nelle pagine degli altri spariscono (con l'inventario spento il budget non mostra ARRIVED; con il budget spento l'inventario non chiede il progetto…: l'elenco completo è nel §4.4 e nella sezione «G8» di [moduli-architettura.md](moduli-architettura.md));
- **non risponde alle API:** ogni suo indirizzo, e quello dei ponti che ne hanno bisogno, dà **404** con «The Budget module is turned off» (codice `module-off`), anche i moduli pubblici e le chiavi dei servizi quando puntano lì;
- **non viene più interrogato:** domande, eventi e porte del nucleo e degli altri moduli lo saltano, e i numeri degli altri cambiano di conseguenza (con la tesoreria spenta CASH FLOW conta il BANK e gli inflow scritti a mano, e non c'è ADMINISTRATION; con l'inventario spento nessuna riga del budget risulta arrivata). Gli eventi che tengono in ordine i dati (una categoria rinominata, una stagione nuova) arrivano comunque, così riaccendendo i dati sono giusti;
- **non perde niente:** le tabelle restano, le migrazioni girano sempre, e riaccendendolo **torna tutto com'era**.

Lo spegnimento va nello storico come ogni altra modifica (tabella `app_module`). Un ponte non ha interruttore. Tutti sanno cosa è acceso (`GET /api/me`: `modules` e `bridges`), perché il menù e le pagine ne dipendono.

**Cosa non cambia:**
- **i permessi:** un modulo spento non si vede, ma chi poteva fare una cosa la può ancora fare (con la tesoreria spenta il BANK di CASH FLOW si scrive a mano, da chi teneva i soldi). Le **spunte** di Users sono solo quelle dei moduli accesi, e quelle dei moduli spenti restano salvate;
- **le liste del nucleo:** categorie, stagioni e aliquote IVA stanno nella sezione di Settings di un modulo; spento quel modulo passano in Settings › App ([impostazioni.md](impostazioni.md));
- **la pagina iniziale** è la prima pagina del primo modulo acceso, nell'ordine budget → inventario → tesoreria → anagrafiche; con tutto spento, Settings (`homeOf`, [hardcoded-registry.md](hardcoded-registry.md), riga 16).

## 3. Com'è fatto

| Pezzo | Dove | Cosa fa |
| --- | --- | --- |
| chi c'è | il contratto di ogni modulo (`moduleInfo`: chiave, nome, descrizione, posto) e di ogni ponte (`bridgeInfo`: chiave, moduli di cui ha bisogno, cosa si spegne con lui) | `listModuleDefs` e `listBridges` (`apps/api/src/platform/appmodules/appmodules.service.ts`) leggono le dichiarazioni |
| stato | tabella `app_module` (chiave, acceso) | **una riga solo per chi è stato spento o riacceso**: un modulo senza riga è acceso |
| il cancello | `addModuleGate` (`appmodules.routes.ts`), in `app.ts` prima delle rotte | legge gli interruttori una volta per richiesta e tiene chi è acceso per tutta la richiesta (`currentActive()`, `appmodules.context.ts`); un indirizzo `/api/<chiave>/…` di un modulo spento, o di un ponte con un modulo spento, risponde 404 |
| leggere e cambiare | `GET /api/modules` e `PATCH /api/modules/:key` `{ enabled }` | solo admin (403 agli altri; 404 a un modulo che non c'è e a un ponte) |
| il sito | un **manifesto** per parte (`apps/web/src/modules/<chiave>/index.tsx`, `bridges/<a>-<b>/index.tsx`, `platform/index.tsx`), l'elenco in `apps/web/src/manifests.ts` | pagine, menù, sezioni di Settings e pezzi nelle pagine degli altri vengono dai manifesti di ciò che è acceso ([moduli-architettura.md](moduli-architettura.md), §7) |

**I moduli non sanno di poter essere spenti.** Il nucleo legge solo le dichiarazioni e non importa nessun modulo; i moduli chiedono `currentActive()` al nucleo e parlano fra loro solo con i contratti (`*.public.ts`, porte, domande, eventi) e, nel sito, con i `public.ts` e i punti di aggancio. Lo controllano le prove di architettura del server (`apps/api/src/architecture.test.ts`) e del sito (`apps/web/src/architecture.test.ts`), tutte e due senza eccezioni.

## 4. Come si aggiunge un modulo

1. **Nel server:** la cartella `apps/api/src/modules/<chiave>/` con i suoi servizi e le sue rotte, registrate in `app.ts` sotto `/api/<chiave>`; il suo `<chiave>.contract.ts` con `moduleInfo` (e le sue spunte, i suoi permessi, i nomi per lo storico), importato in `app.ts`; il suo `<chiave>.public.ts` con ciò che gli altri possono usare; le sue tabelle in `db/schema/<chiave>.ts`. Una riga in `architecture.map.ts` (chi possiede la cartella e lo schema).
2. **Nel sito:** la cartella `apps/web/src/modules/<chiave>/` con `index.tsx` (il manifesto: pagine, gruppi e voci del menù, sezioni di Settings, prima pagina), `api.ts`, `types.ts`, e se serve `slots.ts` e `public.ts`; una riga in `MANIFESTS` (`manifests.ts`) e, se ha una prima pagina, nell'ordine di `homeOf` (`platform/home.tsx`).
3. **Se ha bisogno di un altro modulo,** quel che serve a tutti e due va in un **ponte**: nel server `apps/api/src/bridges/<a>-<b>/` con il suo contratto (`bridgeInfo` con `needs`, e le porte che riempie); nel sito `apps/web/src/bridges/<a>-<b>/index.tsx` con `needs` e i `fills` dei punti di aggancio dei due moduli.
4. **Prove:** le sue letture nella prova delle combinazioni (`combinations.routes.test.ts`: senza, la prova non passa) e le sue voci nei manifesti (`manifests.test.ts` prova da sé tutte le combinazioni).

Non serve nessuna migrazione per gli interruttori.

## 5. Lasciato fuori

- Spegnere solo una parte di un modulo (per esempio solo i moduli pubblici del registro).
- La pagina iniziale scelta da ognuno (sopra la regola automatica: [moduli-domande.md](moduli-domande.md), domanda 5).
- Caricare il codice di un modulo solo quando è acceso: spento vuol dire nascosto e fermo, non scaricato.
