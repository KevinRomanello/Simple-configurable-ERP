# Collaudo: cosa è stato provato, cosa è stato trovato

Questo documento dice **come si controlla che l'app non abbia difetti** (i livelli di prova, dove stanno, cosa non coprono) e conserva l'elenco dei difetti trovati nel collaudo del **20 ottobre 2026** con la correzione e il test che li tiene lontani. Quando trovi un difetto nuovo, aggiungilo qui.

## 1. I livelli di prova

| Livello | Dove | Cosa prova | Quanti |
| --- | --- | --- | --- |
| Motore di calcolo | `packages/calc/src/*.test.ts` | ogni regola del foglio; **esattezza**: fino a 60.000 righe casuali e 100.000 arrotondamenti confrontati con un calcolo esatto in `BigInt`; **calendario**: ogni giorno dal 2000 al 2100 (giorno della settimana, trimestre, scadenza IVA, lettura di ogni notazione di data) contro l'oggetto `Date` | 164 |
| API con database vero | `apps/api/src/**/*.test.ts` | percorsi, regole, **ruoli**, accesso, storico, limiti dell'input, **richieste in parallelo**, attacchi (iniezione SQL, token falsi, CSRF), intestazioni, limite di richieste, permessi del database. Tutta la suite gira con l'utente limitato dell'API | 224 |
| Sito | `apps/web/src/**/*.test.ts` | formattazione, permessi, parole degli errori di accesso, messaggi di errore | 27 |
| Importer | `tools/import-xlsx/src/*.test.ts` | dal foglio allo snapshot | 3 |
| Riconciliazione | `pnpm reconcile` (e `-- --db`) | il motore contro 1.995 valori salvati dal foglio reale | 1.995 confronti |
| Browser, a mano | nel browser, come admin, capo area e sola lettura | clic veri nella griglia, tendine, form, conflitti tra due schede, sessione scaduta, tutte le pagine | vedi §4 |

Gira tutto in CI a ogni modifica, tranne la riconciliazione e il giro nel browser.

## 2. Difetti trovati il 20 ottobre 2026 e corretti

Cercati apposta: numeri e testi fuori misura, richieste simultanee, date estreme, confronto del motore con un calcolo esatto, giro nel browser.

| # | Difetto | Come si vedeva | Correzione | Test |
| --- | --- | --- | --- | --- |
| 1 | **Numeri enormi** accettati o rifiutati con un **500** | un contratto da 13 cifre, una quantità da 12 cifre, una versione enorme: errore del server; una quantità da 99 miliardi × costo da 10 miliardi era accettata e i **totali diventavano sbagliati senza avviso** (`1,22e+23`) | limiti per ogni campo e un limite sul costo netto della riga (§ limiti in [architettura.md](architettura.md)) | `robustness.test.ts`, `core/validation.test.ts` |
| 2 | **Id oltre il massimo** di una colonna `integer` → 500 | `DELETE /api/lines/2147483648`, e così su ogni percorso con un id | gli id sono numeri interi in cifre, da 1 al massimo; `0x10` e `1e3`, che `Number()` leggeva come 16 e 1000, ora sono 400 | `robustness.test.ts` |
| 3 | Il carattere **NUL** nel testo → 500 | un nome con `\u0000` in fornitori, progetti, voci, fondi, filtri | tutti i testi lo rifiutano | `robustness.test.ts` |
| 4 | **Nomi lunghi** → 500 | un nome di 3.000 caratteri casuali non entrava nell'indice che lo rende unico | lunghezze massime su ogni testo; un controllo del codice che fallisce se compare un testo senza `.max(` | `robustness.test.ts`, `security.test.ts` |
| 5 | **Date fuori periodo** | l'anno 0000 → 500; gli anni 0001 e 9999 erano accettati e una vista mensile diventava una risposta di **5,5 MB** (8.000 anni di mesi) | le date devono essere giorni veri tra il 2000 e il 2100 | `robustness.test.ts`, `core/validation.test.ts` |
| 6 | **Posizioni doppie** con richieste simultanee | 15 voci aggiunte insieme avevano quasi tutte la stessa posizione, e l'ordine sul foglio poteva cambiare tra una lettura e l'altra | la creazione si mette in fila sul progetto (o sull'area, per i progetti); a parità l'ordine è quello di creazione | `robustness.test.ts` (provato togliendo la correzione: il test fallisce) |
| 7 | **Due admin che si retrocedono insieme** | in parallelo passavano entrambi e il sistema restava **senza admin** | il controllo "almeno un admin" blocca prima le righe degli admin: il secondo aspetta e vede il cambiamento del primo (409) | `robustness.test.ts` (idem) |
| 8 | **Contratti sullo stesso fondo nuovo, insieme** | 15 contratti sullo stesso nome nuovo: solo 6 riusciti, gli altri 409 | (oggi) un solo sponsor per nome, gli altri 409; i soldi di uno sponsor sono una sola riga per fase, scritta in un colpo solo | `robustness.test.ts` (idem) |
| 9 | **Pagina bianca** su un indirizzo che non esiste | `/qualcosa` mostrava una pagina vuota, senza menu | "This page does not exist." dentro lo stesso schema, con il menu | giro nel browser |
| 10 | **Barre di scorrimento** della griglia diverse dal resto | in modo scuro la barra orizzontale delle griglie era bianca con il cursore grigio | `browserColorScheme: "inherit"` nel tema della griglia ([stile-interfaccia.md](stile-interfaccia.md)) | giro nel browser, anche in modo chiaro |
| 11 | **Anni sotto il 100** sbagliati nel motore | `weekday("0001-01-01")` dava martedì invece di lunedì (`Date.UTC` legge 0–99 come 1900–1999) | il calendario non passa più da `Date.UTC` | `calendar.test.ts` |
| 12 | "Il messaggio di rifiuto era solo **Invalid input**" | l'utente non sapeva quale campo né perché | l'avviso dice il campo e il motivo (`amount: The value cannot be more than 1,000,000,000`) | `api/client.test.ts` |
| 13 | "**with all its 1 lines**" | la domanda di conferma dell'eliminazione di un progetto non andava al singolare | `line` / `lines` | giro nel browser |

### Durante la costruzione dell'inventario (21 ottobre 2026)

Trovati scrivendo i test e provando le schermate nel browser; tutti corretti, con il test che li tiene lontani.

| # | Difetto | Come si vedeva | Correzione | Test |
| --- | --- | --- | --- | --- |
| 14 | **Due modifiche opposte alla distinta insieme** ("A dentro B" e "B dentro A") | il database dava uno **stallo** e l'utente un 500; senza il blocco passavano entrambe e nasceva un anello | le aggiunte di parti si mettono in fila con un blocco unico; qualunque stallo residuo diventa 409 "riprova" | `components.routes.test.ts` (provato togliendo il blocco: fallisce) |
| 15 | Una **modifica senza campi validi** a un articolo | `PATCH` con solo `origin` (che non si cambia) dava un errore del database | non c'è niente da cambiare: risponde con l'articolo | `inventory.routes.test.ts` |
| 16 | La **nota di una parte** era obbligatoria | aggiungere una parte senza nota dava 400, e il controllo "usato in una distinta" non scattava | la nota è facoltativa | `inventory.routes.test.ts` |
| 17 | Nel **menu** risultavano accese insieme INVENTORY e PENDING | `/inventory` corrispondeva a ogni pagina sotto di lui | il collegamento si accende solo per la sua pagina | giro nel browser |
| 18 | Il **selettore del prezzo** perdeva un cambio se ne arrivavano due ravvicinati | giorno, prezzo e metodo cambiati insieme: restava solo l'ultimo | si parte dall'indirizzo com'è nel momento del cambio | giro nel browser |
| 19 | La **barra di scorrimento** della griglia stava **sopra la riga dei subtotali** e con una sola riga di dati la copriva (segnalato guardando la schermata) | su Mac AG Grid disegna la barra "a comparsa" in posizione assoluta, a 32 px dal fondo (l'altezza dei subtotali) | fascia di 16 px riservata sotto i subtotali e barra portata in fondo (`components.css`); misurato: la barra occupa 431–447 px, i subtotali finiscono a 431 | giro nel browser |
| 20 | Le **icone** di stato (clessidra, spunta, triangolo) avevano solo il suggerimento del browser, lento | il significato compariva dopo circa un secondo, o per niente | suggerimento immediato di AG Grid, con più righe quando le icone sono due | giro nel browser |

### Durante gli sponsor e i fondi cumulabili (21 ottobre 2026)

| # | Difetto | Come si vedeva | Correzione | Test |
| --- | --- | --- | --- | --- |
| 21 | La **migrazione** `0006` toglieva due volte il vincolo del vecchio `fund_id` | il database di prova, ricreato da zero a ogni esecuzione, la rifiutava: "constraint does not exist" | un solo `DROP CONSTRAINT`, dopo aver copiato i fondi nella nuova tabella | l'intera suite API (la migrazione gira all'avvio) |
| 22 | I numeri della riconciliazione col database di sviluppo non tornavano dopo la migrazione | 220 differenze, ma erano modifiche fatte a mano nell'app dopo il caricamento del foglio (BANK cambiato, una voce spostata), non della migrazione | prova ripetuta su un database a parte caricato di nuovo dal foglio (`load --replace`): **tutti i controlli uguali** | `pnpm reconcile -- --db` |

Controlli che **non** hanno trovato difetti: la riconciliazione col foglio dopo il nuovo modello dei fondi (1.995 controlli, sul foglio e su un database caricato da zero), il tetto dei fondi e la divisione per `1 + aliquota` (tolti uno alla volta, i test falliscono), il giro nel browser degli sponsor (creazione, ALSO FROM con la tendina dei soli fondi compatibili, avviso e cella rossa che spariscono aggiungendo il fondo, ingresso e IVA di uno sponsor in cassa), il motore di calcolo contro il calcolo esatto (255.000 righe, 400.000 arrotondamenti, ogni giorno 2000–2100), la riconciliazione col foglio (anche sul database), l'iniezione SQL (8 payload in tutti i campi di testo, 17 richieste ostili), il campo extra nelle modifiche, la scadenza della sessione a metà lavoro, il conflitto di versione tra due schede, il ripristino del BANK, l'ordine delle pagine di storico.

## 3. Cosa non è coperto

- **Prove automatiche nel browser** (Playwright): il giro del §4 è a mano. È la lacuna più grande: si può aggiungere quando i percorsi si stabilizzano.
- **Accesso con Google vero**: provato solo con un Google finto (vedi [accesso-e-storico.md](accesso-e-storico.md)).
- **Carico** (molte persone insieme) e **telefono/tablet**: l'app è pensata per il computer; il layout non è stato adattato a schermi stretti.
- **Altri browser** oltre al browser incorporato nell'app (Chrome); **accessibilità** oltre alle etichette di base.
- **Sorgenti del foglio nuovi**: se il foglio cambia struttura, la riconciliazione lo dice, ma l'importer va riprovato.

## 4. Il giro nel browser (da ripetere dopo modifiche grandi)

Con `docker compose up -d` e l'accesso di sviluppo (vedi [avvio.md](avvio.md)):

1. Tutte le pagine del menu, più un indirizzo sbagliato: nessun errore in console, nessun `NaN` o `undefined` a schermo.
2. In un'area: crea un progetto e una voce dal form; modifica **a clic** la voce, la quantità, il costo unitario, lo sponsor e l'IVA e controlla netto, IVA, totale e subtotale (7 × 12,50 € con IVA 22% = 87,50 + 19,25 = 106,75 €).
3. Conflitto: cambia la stessa voce con la versione vecchia (da un'altra scheda o dalla console) e poi modificala dalla pagina: deve comparire l'avviso e il dato dell'altra persona deve restare.
4. CASH FROM: contratto con data, casella "paga IVA", cancellazione. CASH FLOW: BANK (poi **rimettilo com'era**) e un ingresso. BOUGHT FROM: aggiungi, duplicato (avviso), elimina.
5. Esci dalla console (`/api/auth/logout`) e fai un'azione: deve comparire la pagina di accesso.
6. History: filtro per tipo e "Load older changes".
7. Un valore fuori misura (contratto da 5 miliardi): l'avviso dice il campo e il limite.
8. Come `pm` e come `viewer` (vedi "Provare i ruoli" in [avvio.md](avvio.md)): comandi nascosti, scrittura rifiutata.
9. Modo chiaro e modo scuro: le barre di scorrimento delle griglie e delle tabelle devono essere uguali.
   Il menù laterale si nasconde e si riapre, e resta nascosto cambiando pagina o ricaricando.
10. **Ripulisci**: cancella quello che hai creato e, se serve, le righe di storico dei tuoi giri.
