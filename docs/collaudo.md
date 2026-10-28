# Collaudo: cosa è stato provato, cosa è stato trovato

Questo documento dice **come si controlla che l'app non abbia difetti** (i livelli di prova, dove stanno, cosa non coprono) e conserva l'elenco dei difetti trovati nel collaudo del **20 ottobre 2026** con la correzione e il test che li tiene lontani. Quando trovi un difetto nuovo, aggiungilo qui.

## 1. I livelli di prova

| Livello | Dove | Cosa prova | Quanti |
| --- | --- | --- | --- |
| Motore di calcolo | `packages/calc/src/*.test.ts` | ogni regola del foglio; **esattezza**: fino a 60.000 righe casuali e 100.000 arrotondamenti confrontati con un calcolo esatto in `BigInt`; **calendario**: ogni giorno dal 2000 al 2100 (giorno della settimana, trimestre, scadenza IVA, lettura di ogni notazione di data) contro l'oggetto `Date` | 170 |
| API con database vero | `apps/api/src/**/*.test.ts` | percorsi, regole, **ruoli**, accesso, storico, limiti dell'input, **richieste in parallelo**, attacchi (iniezione SQL, token falsi, CSRF), intestazioni, limite di richieste, permessi del database, **accesso dietro il proxy** (header `X-Email`), aliquote fisse e fornitore degli sponsor di merce. Tutta la suite gira con l'utente limitato dell'API | 281 |
| Sito | `apps/web/src/**/*.test.ts` | formattazione, permessi, parole degli errori di accesso, messaggi di errore, **download** (valori veri da testo, unioni di celle, nomi dei fogli e dei file), **ordinamento** (vuoti in fondo, numeri nel testo, tre stati del clic, comparazione della griglia) | 54 |
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
| 23 | Un test della **CI** falliva ("duplicate key value violates unique constraint supplier_name_uq") e in locale no | `app-role.test.ts` aggiornava e cancellava **tutte** le righe di `supplier` senza un `where`: funzionava solo con la tabella vuota. I file di test girano nello stesso database e **l'ordine cambia da un computer all'altro**: in CI un file prima lasciava dei fornitori | il test tocca solo le righe che ha creato (`where id = …`) | riprodotto in locale con l'ordine casuale dei file (`vitest run --sequence.shuffle.files --sequence.seed=2` e `=3` fallivano, ora passano) |
| 24 | La **ricerca** nella cella CASH FROM della griglia non applicava la scelta | Invio veniva preso dalla griglia (chiude l'editor) prima che arrivasse alla lista; e l'editor si chiudeva prima che la griglia leggesse il valore | `suppressKeyboardEvent` per Invio e frecce mentre si cerca; l'editor si chiude un istante dopo aver impostato il valore | giro nel browser (scrivere "crow", Invio: la riga passa al fondo giusto) |
| 25 | Aprire l'editor di una cella con **più fondi** e uscire senza scegliere avrebbe tolto i fondi | la griglia restituisce il testo mostrato ("A (100,00 €)"), che non è il nome di un fondo | nessun salvataggio se il valore non è cambiato (`oldValue`); nella casella ALSO FROM solo "vuoto" toglie i fondi in più | giro nel browser (nessuna richiesta di salvataggio con Escape o con "Nothing found") |

### Durante il download in PDF ed Excel (23 ottobre 2026)

| # | Difetto | Come si vedeva | Correzione | Prova |
| --- | --- | --- | --- | --- |
| 26 | Le griglie del budget (27 colonne) si **spezzavano su due pagine** del PDF e la barra del gruppo EXPECTED usciva dal foglio | PDF dell'area MT + DMT guardato pagina per pagina | foglio **A3** quando una tabella ha più di 14 colonne, niente spezzatura (`WIDE_FROM` in `pdf.ts`) | PDF riaperto con `pdftoppm`: ogni tabella intera su una pagina |
| 27 | Il PDF con un grafico pesava **1,4 MB** | la dimensione era sempre quella delle dimensioni dell'immagine, non del contenuto: jsPDF non comprimeva | `compress: true` | 41 KB per la stessa pagina |
| 28 | Un grafico scaricato **poco dopo averlo aperto** usciva senza barre | le barre di Recharts hanno un'animazione e l'immagine veniva presa a metà | `isAnimationActive={false}` sulle barre (le linee l'avevano già) | PDF di TOTAL appena caricata: barre complete |
| 29 | La **legenda** dei grafici stretti usciva tagliata (una voce fuori dall'immagine) | PDF di TOTAL con la finestra stretta | la legenda va a capo (`chartPicture`) | stesso PDF: legenda su due righe |
| 30 | I grafici avevano il **fondo scuro** del sito (segnalato dall'utente) | PDF e Excel con il tema scuro | fondo bianco, testi e griglia scuri/chiari «da carta», sempre (`PAPER`, `INK`, `GRID`, `AXIS` in `chart.ts`) | PDF di TOTAL riaperto: fondo bianco |
| 31 | Il titolo del grafico compariva **due volte** nel PDF (intestazione e immagine) | PDF di TOTAL | nel PDF un grafico non ha intestazione sua: il titolo è nell'immagine | stesso PDF |
| 32 | In una colonna stretta il simbolo **€ andava a capo** dal numero ("7,23" / "€") | subtotali del PDF di un'area | spazio non separabile fra numero ed € (`pdfText`) | stesso PDF |

### Durante la fine degli sponsor in cassa e della casella «paga IVA» (26 ottobre 2026)

| # | Difetto | Come si vedeva | Correzione | Prova |
| --- | --- | --- | --- | --- |
| 33 | Dopo aver tolto la casella «paga IVA» i test dei fondi usati insieme **non avevano più i numeri giusti** (il fondo ora consuma netto + IVA) | 8 test del motore e 5 dell'API rossi | numeri ricalcolati **a mano da zero** (per esempio 100,00 € coprono 81,96 € netti a 22%) prima di guardare cosa dava il codice: coincidevano | `settle.test.ts`, `analysis.test.ts`, `budget.routes.test.ts` |
| 34 | Con l'IVA coperta dal fondo, **cinque fondi da 100,00 € non bastano più** per una riga da 450,00 € netti (servono 549,00 € lordi): il test «finché la riga è coperta» si fermava un fondo prima | test API rosso al quinto fondo | il test usa sei fondi | `budget.routes.test.ts` |
| 35 | I tre test che usavano il flag «paga IVA» come **scrittura di esempio** (ruoli, input assurdi) non scrivevano più niente: il campo era ignorato | nessun errore, ma la prova era vuota | usano un campo che esiste (`group`) | `roles.test.ts`, `robustness.test.ts` |

Controllo di migrazione: la `0009` è stata provata su una **copia dei dati reali** che aveva ancora lo sponsor in cassa (10.000,00 € Expected senza data): è diventato un inflow identico, le colonne `mode` e `pays_vat` sono sparite e il database di prova (ricreato da zero a ogni esecuzione) la applica senza errori.

### Riordino dell'interfaccia nei modelli (26 ottobre 2026)

Le pagine sono state riscritte con i modelli di `components/ui/` ([stile-interfaccia.md](stile-interfaccia.md), «I modelli dell'interfaccia»). Controllo: prima di toccarle è stata salvata la **struttura** di 23 pagine, e dei moduli aperti dal pulsante giallo (ogni elemento con le sue classi, attributi e testo; esclusi l'interno della griglia AG Grid e dei grafici). Dopo il riordino lo stesso, e il confronto:

- **identiche**: le sei aree del budget (anche col modulo New project aperto), CASH FROM, History;
- **differenze volute o invisibili**: Download ora sta sempre nel gruppo dei comandi (`.actions`) anche dove era da solo; l'intestazione vuota della colonna dei pulsanti ha la classe `num`; testi che prima erano due pezzi («40» «pcs») ora sono uno («40 pcs»), uguali a schermo; il modulo New sponsor ha gli stessi pulsanti di tutti gli altri moduli (piccoli, col «+»); la descrizione di CASH FROM ANALYSES non diceva più il vero («il VAT di un fondo che non lo paga…») ed è stata corretta;
- nessun elemento sparito o aggiunto oltre a questi.

Il controllo si può ripetere dopo ogni modifica grande all'interfaccia.

### Controllo di bug e prestazioni (26 ottobre 2026)

Un controllo a fondo senza toccare il codice, poi le correzioni approvate: tutto, con le misure prima e dopo, in [controllo-bug-e-prestazioni.md](controllo-bug-e-prestazioni.md). Corretti:

| # | Difetto | Come si vedeva | Correzione | Prova |
| --- | --- | --- | --- | --- |
| 36 | **Modulo aperto che scrive nell'area sbagliata** | «New project» aperto in un'area e un nome scritto: cambiando area dal menù il modulo restava e creava il progetto **nella nuova area** | la pagina ha come chiave il suo indirizzo (`Shell.tsx`): cambiando indirizzo si ricrea | giro nel browser (§4, punto 13) |
| 37 | **«Oggi» in UTC** nell'API | fra mezzanotte e l'una (le due d'estate), ora italiana, i giorni di attesa di PENDING e i prezzi «di oggi» erano di ieri | `today()` usa `Europe/Rome` dentro la funzione, hardcode del [registro](hardcoded-registry.md) | `core/today.test.ts` |
| 38 | **Inventario quadratico** | con 2.000 articoli e 40.000 movimenti l'elenco impiegava 243 ms (823 ms con un'altra forma dei dati): articoli × movimenti | `byItem` raggruppa i movimenti una volta sola: 12 ms | `inventory.test.ts` (`byItem`, prezzi) e i test dell'inventario di prima |
| 39 | **Il browser si bloccava dopo ogni modifica** nelle pagine del budget | circa 0,6 s a ogni cella salvata in MT + DMT | oggetti stabili per le griglie (`DEFAULT_COL_DEF`, subtotale con `useMemo`): nessun blocco | giro nel browser (§4, punto 13) |
| 40 | **Nove chiavi esterne senza indice** | nessun effetto con pochi dati; con tanti, i controlli «è usato?» e le cancellazioni a cascata leggono tutta la tabella | migrazione `0011_indexes_on_foreign_keys.sql` | la suite dell'API (database da zero) e la query del §4 di quel documento: zero righe |
| 41 | **8 avvisi di sicurezza** su `fast-uri` (dentro Fastify) | `pnpm audit --prod`: 4 moderati e 4 bassi | due `overrides` in `pnpm-workspace.yaml` | `pnpm audit --prod` pulito |
| 42 | Due import inutilizzati | `SortAccessors` (`GanttPage.tsx`), `AREA_SHEETS` (`reconcile.ts`) | tolti | controllo dei tipi |
| 43 | **Le liste a tendina della griglia si aprivano sopra la cella** (segnalato il 28 ottobre) | in una pagina scorsa, la lista di CASH FROM o BOUGHT FROM compariva sopra la riga, coprendo l'intestazione, e in una griglia bassa sopra tutta la tabella; anche spostata a destra della finestra faceva scorrere la pagina | il contenitore dei popup è `main.main` (alto quanto la pagina) invece del `<body>` (alto quanto la finestra) o della griglia; la lista si apre sotto la cella con lo stesso bordo sinistro, si accorcia se sotto c'è poco posto e si sposta a sinistra se sporgerebbe | giro nel browser (liste di CASH FROM, CATEGORY, PRIORITY, BOUGHT FROM con la pagina scorsa e in alto) |

Ancora aperti, da decidere: il sito che si scarica tutto al primo accesso (P6), le molte piccole query di Settings (P8), CASH FLOW che calcola le righe quattro volte (P9), il linter, e la rinomina di una categoria mentre si salva una riga (P3, da lasciare così).

Controlli che **non** hanno trovato difetti: la riconciliazione col foglio dopo il nuovo modello dei fondi (1.995 controlli, sul foglio e su un database caricato da zero), il tetto dei fondi e la divisione per `1 + aliquota` (tolti uno alla volta, i test falliscono), il giro nel browser degli sponsor (creazione, ALSO FROM con la tendina dei soli fondi compatibili, avviso e cella rossa che spariscono aggiungendo il fondo, ingresso e IVA di uno sponsor in cassa), il motore di calcolo contro il calcolo esatto (255.000 righe, 400.000 arrotondamenti, ogni giorno 2000–2100), la riconciliazione col foglio (anche sul database), l'iniezione SQL (8 payload in tutti i campi di testo, 17 richieste ostili), il campo extra nelle modifiche, la scadenza della sessione a metà lavoro, il conflitto di versione tra due schede, il ripristino del BANK, l'ordine delle pagine di storico.

## 3. Cosa non è coperto

- **Problemi noti e non ancora corretti**: l'elenco, con la soluzione proposta, è in [controllo-bug-e-prestazioni.md](controllo-bug-e-prestazioni.md).

- **Tre guasti isolati, non riprodotti** (22 ottobre 2026): provando la suite API con l'ordine dei file mescolato (14 semi), tre esecuzioni hanno avuto un test fallito (`auth.routes`, `components.routes` due volte, ogni volta un test diverso). Con lo stesso seme e con altre 20 ripetizioni (anche con il computer sotto carico) tutto è passato: non è un problema d'ordine come quello della riga 23. Se in CI ricompare un fallimento che sembra casuale, serve il **messaggio** del test (per leggerlo, `pnpm --filter @erp/api exec vitest run` e salvare l'uscita) prima di cercare la causa.
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
4. CASH FROM: nuovo sponsor con soldi e data, cambio di aliquota, cancellazione. CASH FLOW: BANK (poi **rimettilo com'era**) e un inflow (controlla che la IVA dell'11% compaia nel "Left value" e nella riga VAT del Gantt, il primo giorno del trimestre dopo). BOUGHT FROM: aggiungi, duplicato (avviso), elimina.
5. Esci dalla console (`/api/auth/logout`) e fai un'azione: deve comparire la pagina di accesso.
6. History: filtro per tipo e "Load older changes".
7. Un valore fuori misura (contratto da 5 miliardi): l'avviso dice il campo e il limite.
8. Come `pm` e come `viewer` (vedi "Provare i ruoli" in [avvio.md](avvio.md)): comandi nascosti, scrittura rifiutata.
9. Modo chiaro e modo scuro: le barre di scorrimento delle griglie e delle tabelle devono essere uguali.
   Il menù laterale si nasconde e si riapre, e resta nascosto cambiando pagina o ricaricando.
10. **Download**: in ogni pagina con il pulsante, scarica un PDF e un Excel con tutto selezionato e uno con una sola parte; riapri i file (numeri e date vere nell'Excel, tabelle intere nel PDF, grafici su fondo bianco con legenda). Vedi [download.md](download.md).
11. **Settings** (come admin): cambia un interruttore del calcolo (per esempio l'IVA sugli inflow) e controlla che CASH FLOW cambi; aggiungi e togli una categoria, un'aliquota, un'unità, un posto; il cestino di ciò che è usato è spento. Come `pm` la voce Settings non c'è e `/api/settings` risponde 403. **Rimetti com'era** ciò che hai cambiato.
12. **Intestazioni e ordinamento**: in ogni pagina i comandi stanno sotto la descrizione; i moduli (nuovo progetto, fornitore, componente, incasso, sponsor, merce) compaiono solo dopo il clic sul pulsante giallo. Su una tabella clicca un'intestazione tre volte (crescente, decrescente, ordine originale); nella griglia del budget ordina per una quantità e per un importo: l'intestazione ha la stessa freccina delle tabelle, i numeri vanno in ordine di valore, i vuoti restano in fondo (anche in decrescente) e i subtotali in fondo alla griglia. Scarica il file: segue l'ordine a schermo.
13. **Una pagina per indirizzo, e griglie che non si bloccano**: apri «New project» in un'area, scrivi un nome e passa a un'altra area dal menù: il modulo deve essere chiuso. In MT + DMT cambia una quantità e rimettila com'era: la pagina risponde subito (con un `PerformanceObserver` sui `longtask` non deve comparire nessun blocco sopra i 50 ms).
14. **Le liste a tendina**: in una griglia del budget, con la pagina in cima e dopo averla fatta scorrere, apri la lista di CASH FROM, di BOUGHT FROM, di CATEGORY e di PRIORITY (e VAT %): ognuna si apre **sotto** la sua cella, con lo stesso bordo sinistro, senza far scorrere la pagina di lato; chiudila con **Esc** (con Invio sceglieresti la prima voce, quella vuota).
15. **Ripulisci**: cancella quello che hai creato e, se serve, le righe di storico dei tuoi giri.
