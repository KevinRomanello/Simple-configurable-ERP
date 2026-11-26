# Moduli: accendere e spegnere parti dell'ERP

**Stato: fatto (23 novembre 2026).** Per ora c'è un modulo che si può spegnere, **Registry** (le anagrafiche); l'elenco si allunga con una riga (sotto, «Come si aggiunge un modulo»).

**In progetto (26 novembre 2026)**: spegnere anche budget, tesoreria e inventario. Non basta aggiungere righe a questo elenco, perché oggi quei moduli leggono le tabelle gli uni degli altri. Il design è in [moduli-architettura.md](moduli-architettura.md) (ADR-2): nucleo, moduli, ponti e «API come funzioni». Quando sarà fatto, questo documento va riscritto.

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
| elenco dei moduli | `listModuleDefs` in `apps/api/src/modules/appmodules/appmodules.service.ts` | per ogni modulo: chiave, nome, descrizione, **indirizzi API** (`/api/registry`, `/api/role-sync`). Valore fisso nel corpo della funzione, con `// HARDCODED:` ([hardcoded-registry.md](hardcoded-registry.md)) |
| stato | tabella `app_module` (chiave, acceso), migrazione `0039_app_module.sql` | **una riga solo per chi è stato spento o riacceso**: un modulo senza riga è acceso. Nello storico |
| il controllo | `addModuleGate` (`appmodules.routes.ts`), una riga in `app.ts` | prima delle rotte: un indirizzo di un modulo spento risponde 404. Solo se l'indirizzo è di un modulo legge lo stato (una lettura di una riga) |
| leggere e cambiare | `GET /api/modules` e `PATCH /api/modules/:key` `{ enabled }` | solo admin (403 agli altri; 404 a un modulo che non c'è) |
| chi lo sa | `GET /api/me` → `modules: { registry: true }` | lo leggono menù, pagine e impostazioni (`moduleOn` in `lib/modules.ts`, `IfModule` per le pagine, `settingsSections` per le schede di Settings) |
| il ponte dei ruoli | `rolesync.service.ts` | con il Registry spento non dichiara gestito nessun account |

**I moduli non sanno di poter essere spenti.** `appmodules` conosce solo gli **indirizzi** (testi), non importa nessun modulo; i moduli non importano `appmodules`. Chi lo usa: `app.ts` (il controllo), il sign-in (`/api/me`) e il ponte `rolesync` (una sola domanda: il Registry è acceso?). Lo controlla `apps/api/src/architecture.test.ts`.

## 3. Come si aggiunge un modulo

1. Una voce in `listModuleDefs` (chiave, nome, descrizione, prefissi delle sue rotte API) e una riga in [hardcoded-registry.md](hardcoded-registry.md) se cambia.
2. Nel sito, il suo gruppo del menù (`Shell.tsx`) dentro `moduleOn(me, "chiave")`, le sue pagine dentro `<IfModule name="chiave">` (`App.tsx`), e quel che mostra in Settings.
3. Se qualcosa di un altro modulo dipende da lui (come i ruoli dal Registry), quel ponte chiede `isModuleOn("chiave")`.
4. Prove: lo stato spento dà 404 sui suoi indirizzi e li ridà riaccesi (`appmodules.routes.test.ts`).

Non serve nessuna migrazione.

## 4. Lasciato fuori

- Gli altri moduli (budget, inventario, cassa): si aggiungono con i passi sopra quando serve.
- Permessi per modulo (chi vede cosa): restano quelli dei ruoli.
- Spegnere solo una parte di un modulo (per esempio solo i moduli pubblici).
