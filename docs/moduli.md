# Moduli: accendere e spegnere parti dell'ERP

**Stato: si spengono tutti e quattro (27 novembre 2026, fase G, passo G8, tappa 1).** Budget, tesoreria, inventario e anagrafiche (Registry); con uno di loro si spengono i ponti che ne hanno bisogno. Il design è in [moduli-architettura.md](moduli-architettura.md) (ADR-2): nucleo, moduli, ponti e «API come funzioni». Questo documento descrive ancora soprattutto il Registry, il primo modulo spegnibile: si riscrive alla fine del passo G8 (tappa 3).

## 1. Cosa fa

In **Settings › App › Modules** ogni modulo ha un interruttore **On / Off**. Un modulo **spento**:

- **non compare da nessuna parte nel sito:** niente gruppo nel menù laterale, le sue pagine (`/registry…`) riportano alla prima pagina, e in Settings **la scheda Registry non c'è** (un indirizzo `/settings/registry` porta alla prima scheda). Le **chiavi e gli account dei servizi** valgono per tutto l'ERP e non sono del registro: stanno in **Settings › App**, e restano anche a modulo spento;
- **non risponde più alle API:** ogni suo indirizzo dà **404** con «The Registry module is turned off» (codice `module-off`), anche i moduli pubblici (`/api/registry/public/…`, che nel sito mostrano quella frase), i link personali, i webhook che partono dalle sue scritture, e le chiavi dei servizi (`/ext/…` arriva agli stessi indirizzi) quando puntano al modulo; le chiavi continuano a funzionare per il resto dell'ERP;
- **non tocca niente di quello che tiene:** i dati, i moduli, i webhook e i ruoli restano dove sono e **tornano com'erano** riaccendendolo.

Lo spegnimento va nello storico come ogni altra modifica (tabella `app_module`, «module registry»).

**Con il Registry spento il collegamento dei ruoli si ferma:** gli account restano come sono e la pagina Users torna modificabile a mano (`rolesync` non dice più quali account sono gestiti). Riaccendendo, il collegamento riparte da sé alla prima modifica del registro.

**Solo un admin vede e cambia questa opzione:** il riquadro Modules non c'è per gli altri e le API rispondono 403 (anche a leggere l'elenco); tutti, invece, sanno cosa è acceso (`/api/me`), perché menù e pagine ne dipendono.

## 2. Com'è fatto

| Pezzo | Dove | Cosa fa |
| --- | --- | --- |
| elenco dei moduli | `listModuleDefs` e `listBridges` in `apps/api/src/platform/appmodules/appmodules.service.ts` | leggono ciò che ogni modulo dichiara nel suo contratto (`moduleInfo`: chiave, nome, descrizione, posto nel pannello) e ogni ponte nel suo (`bridgeInfo`: chiave, moduli di cui ha bisogno, cosa si spegne con lui). Un modulo e un ponte rispondono sotto `/api/<chiave>/…` |
| stato | tabella `app_module` (chiave, acceso), migrazione `0039_app_module.sql` | **una riga solo per chi è stato spento o riacceso**: un modulo senza riga è acceso. Nello storico |
| il controllo | `addModuleGate` (`appmodules.routes.ts`), una riga in `app.ts` | prima delle rotte legge gli interruttori una volta (una lettura piccola) e tiene **chi è acceso** per tutta la richiesta (`currentActive()`, `appmodules.context.ts`). Un indirizzo di un modulo spento, o di un ponte con uno dei suoi moduli spento, risponde 404 («The Budget module is turned off», codice `module-off`) |
| leggere e cambiare | `GET /api/modules` e `PATCH /api/modules/:key` `{ enabled }` | solo admin (403 agli altri; 404 a un modulo che non c'è) |
| chi lo sa | `GET /api/me` → `modules: { budget: true, … }` e `bridges: { "treasury-budget": true, … }` | lo leggono menù, pagine e impostazioni (`moduleOn` in `platform/modules.ts`; dal passo G7 il sito usa solo i manifesti dei moduli accesi, `useManifests` in `platform/manifest.tsx`: menù, pagine e schede di Settings vengono da lì) |
| il ponte dei ruoli | `rolesync.service.ts` | con il Registry spento (`currentActive()`) non dichiara gestito nessun account |

**I moduli non sanno di poter essere spenti.** `appmodules` legge solo le dichiarazioni, non importa nessun modulo; i moduli non importano `appmodules`, chiedono `currentActive()` al nucleo. Chi usa gli interruttori: `app.ts` (il controllo), il sign-in (`/api/me`) e `currentActive()` di `platform.public.ts`. Lo controlla `apps/api/src/architecture.test.ts`. **I permessi non cambiano con gli interruttori:** un modulo spento non si vede, ma chi poteva fare una cosa la può ancora fare (con la tesoreria spenta il BANK di CASH FLOW si scrive a mano, da chi teneva i soldi).

## 3. Come si aggiunge un modulo

1. Una voce in `listModuleDefs` (chiave, nome, descrizione, prefissi delle sue rotte API) e una riga in [hardcoded-registry.md](hardcoded-registry.md) se cambia.
2. Nel sito, il suo **manifesto** (`modules/<chiave>/index.tsx`: pagine, gruppi e voci del menù, sezioni di Settings; [moduli-architettura.md](moduli-architettura.md), §7.2) e una riga nell'elenco `MANIFESTS` (`apps/web/src/manifests.ts`). Spento, le sue pagine portano alla prima pagina e il resto sparisce da solo.
3. Se qualcosa di un altro modulo dipende da lui (come i ruoli dal Registry), quel ponte chiede `isModuleOn("chiave")`. Nel sito un ponte ha il suo manifesto in `bridges/<a>-<b>/index.tsx` con `needs` (si accende solo con tutti e due i moduli) e mette le sue parti nelle pagine dei moduli con i `fills`, nei punti di aggancio che ogni modulo definisce nel suo `slots.ts` e presta dal suo `public.ts` ([moduli-architettura.md](moduli-architettura.md), §7.3 e §7.4).
4. Prove: lo stato spento dà 404 sui suoi indirizzi e li ridà riaccesi (`appmodules.routes.test.ts`).

Non serve nessuna migrazione.

## 4. Lasciato fuori

- Gli altri moduli (budget, inventario, cassa): si aggiungono con i passi sopra quando serve.
- Permessi per modulo (chi vede cosa): restano quelli dei ruoli.
- Spegnere solo una parte di un modulo (per esempio solo i moduli pubblici).
