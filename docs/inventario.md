# Inventario

**Stato: fasi I1–I6 fatte** (I1–I4 il 21 ottobre 2026, I5 il 29, I6 il 4 novembre): arrivi dal budget e fuori budget, articoli con immagine e campi per categoria, movimenti, componenti con distinta dei materiali e costo nel tempo, statistiche; poi **schede dati in PDF, infiammabile/tossico/cancerogeno, produzione e annullamento dei movimenti** (§15–§18); poi **area dell'articolo e tipi con i loro parametri** (Resistor con resistenza, potenza, package…: §19). **Fuori, per dopo**: pezzi singoli con matricola e QR, costo FIFO a lotti, caricamento di un inventario esistente, scorta minima, duplicare un articolo (§12).

Le schermate non sono disegnate su Figma: usano solo token e componenti del design system ([stile-interfaccia.md](stile-interfaccia.md)).

## 1. L'idea in breve

Quanto c'è sullo scaffale **non è un numero salvato**: è la somma di un registro di movimenti (arrivi, usi, spostamenti, conteggi, smaltimenti), come i conti del budget sono calcolati e non salvati. Da qui vengono gratis la storia di ogni pezzo, i prezzi nel tempo e le statistiche. Tutta la logica è in funzioni pure in `packages/calc/src/inventory.ts` e `arrival.ts`; l'API le alimenta con i dati del database.

## 2. Dal budget allo scaffale: il ciclo di vita di un acquisto

Il budget dice cosa è stato **comprato** (le colonne ACTUAL di una voce); l'inventario dice cosa è **arrivato**. Lo stato di una voce si calcola dai due numeri e non si salva:

| Stato | Quando | Nel sito |
| --- | --- | --- |
| `planned` | niente nel consuntivo (solo EXPECTED) | nessun segno |
| `ordered` ("pending") | comprata, nulla è arrivato | clessidra arancione; pagina PENDING |
| `partial` | arrivata una parte | clessidra; pagina PENDING |
| `received` ("arrived") | arrivato tutto | segno di spunta verde |
| `over` ("too many") | arrivato più del comprato (il budget è stato abbassato dopo) | triangolo rosso |

"Comprata" vuol dire **quantità nel consuntivo**. Una voce comprata senza data d'acquisto compare lo stesso in PENDING (con "no date").

- **Dal budget.** La pagina **PENDING** elenca ciò che è stato comprato e non è arrivato, dal più vecchio, con giorni d'attesa e arrivo previsto. "Receive" apre in un **pannello** (sotto la riga) un modulo già compilato (nome, categoria, quantità ancora da arrivare): scegli dove metterlo e quanti pezzi sono arrivati. **L'arrivo può essere parziale**: la voce resta in PENDING con la quantità che manca. Il modulo propone l'articolo già creato con gli arrivi precedenti della stessa voce, o uno con lo stesso nome. I prezzi (netto, con IVA, costo per il team) e il progetto vengono dal budget. Non si può ricevere più di quanto comprato (409); due arrivi simultanei non possono prendersi gli stessi pezzi.
- **Fuori budget.** "Add goods" nella pagina INVENTORY: un acquisto fatto a parte, un regalo, qualcosa che c'era già. Prezzo netto e IVA a mano (o "a gift": il valore è registrato, il costo per il team è zero), progetto facoltativo, **macchina** (di base quella della stagione della data d'arrivo; se ne può scegliere un'altra).
- Se la voce del budget viene cancellata dopo l'arrivo, il carico resta (il legame con la voce si perde, il resto no).

## 3. La data di arrivo del consuntivo viene dagli arrivi (20 novembre 2026)

Nella griglia del budget, la colonna **ARRIVAL DATE** del consuntivo (ACTUAL) **non si scrive più**: è un valore **calcolato**, il **giorno dell'ultimo carico** («Arrived on» del modulo di Receive), e compare **solo quando è arrivato tutto** quello che era stato comprato (stato `received`, o `over`). Finché ne è arrivata solo una parte la cella è vuota; se si annulla un carico e la voce torna in PENDING, la data sparisce da sola, perché non è salvata da nessuna parte. Cambia una scelta del 21 ottobre 2026 (data digitata a mano, scollegata dagli arrivi), su richiesta dell'utente.

- **Dove nasce.** `computeLines` (`packages/calc/src/lines.ts`, `arrivedOn`): la voce riceve dallo snapshot, per ogni riga, la quantità arrivata e il giorno dell'ultimo carico (`ReceiptInput.lastOn`, il massimo di `stock_movement.occurred_on` dei carichi con quella riga). Lo stato (`pending`/`partial`/`arrived`) continua a dipendere solo dalle quantità.
- **Le righe già arrivate** prima di questa modifica hanno ora la data, perché la si calcola dai loro carichi: non c'è niente da rimettere a posto. Le righe della spesa fuori budget (ADMINISTRATION) arrivano il giorno dell'ultimo movimento del registro, come prima.
- **EXPECTED non cambia**: l'arrivo previsto si scrive ancora a mano (griglia e modulo). La pagina PENDING mostra come «previsto» **solo quella data** (prima, se c'era, la data di arrivo del consuntivo).
- **ACTUAL non si digita**: la cella è grigia come le colonne calcolate, il modulo «Add item» e la modifica non hanno la casella nella fase ACTUAL e l'API rifiuta `figures.actual.arrivalDate` (400). Nel database `line_figures.arrival_date` resta una sola colonna per tutte e due le fasi: quella di ACTUAL non si legge più (i dati di sviluppo non ne avevano nessuna, e il foglio vero non ne ha nel consuntivo).
- **Se i carichi hanno date diverse** (uno registrato con una data più vecchia dopo uno più nuovo) vale la **più recente**, non quella dell'ultimo inserito.

## 4. Modello dati

| Tabella | Contenuto | Note |
| --- | --- | --- |
| `inventory_item` | articolo: nome, **marca** e **modello** (insieme sono unici, senza maiuscole: §22), codice (unico se c'è), categoria, **area** (`area_id`, vuota = di tutte), **tipo** (`type_id`), unità, origine (`bought`/`made`), a cosa serve, codici di sicurezza, smaltimento, stoccaggio, manutenzione, tre segni `flammable` / `toxic` / `carcinogenic`, e solo per gli articoli fatti da noi da cosa parte «Make new»: `make_project_id`, `make_to`, `make_to_spot` (§21) | l'origine non si cambia dopo; mai due articoli con lo stesso nome (l'errore dice quale) |
| `item_type` | un tipo: nome (unico, senza maiuscole), area (vuota = di tutte), `hazards` (se chiede infiammabile, tossico, cancerogeno) | §19 |
| `item_type_param` | un parametro del tipo: nome (unico nel tipo), genere (`number`, `list`, `text`, `yesno`), unità e prefissi (solo i numeri), scelte (solo le liste), ordine | i vincoli sono nel database: unità e prefissi solo sui numeri, scelte solo sulle liste |
| `item_param_value` | ciò che è scritto in un parametro per un articolo: **una sola** delle colonne `number` (numerico esatto, nell'unità del parametro), `text`, `flag` | un valore per articolo e parametro; va via con l'articolo o con il parametro |
| `item_datasheet` | una scheda dati: articolo, nome, dimensione, chi l'ha caricata e quando | solo i dati **sulla** scheda: è questa tabella che si legge per fare l'elenco (§15) |
| `item_datasheet_file` | i byte del PDF, uno per scheda | letta **solo** quando qualcuno apre la scheda; **non** nello storico (come le immagini) |
| `item_image` | immagine grande e miniatura, tipo | binaria: **non** nello storico |
| `stock_movement` | un movimento: articolo, tipo, giorno, quantità, luogo (codice + testo libero), destinazione (spostamenti), tre prezzi (solo carichi e produzioni), progetto, voce di budget d'origine, la produzione che ha preso questa parte (`built_by`, solo per gli usi), nota | i vincoli sono nel database: quantità positiva (tranne un conteggio), prezzi solo sui carichi, destinazione solo sugli spostamenti |
| `component_part` | distinta: il componente, la parte, la quantità in un pezzo, una nota | una parte una volta sola; mai un componente dentro se stesso |

**Velocità.** Il calcolo non rilegge tutti i movimenti per ogni articolo: li raggruppa per articolo una volta sola (`byItem`, in `packages/calc/src/inventory.ts`) e poi legge da lì (prezzi in `costContext`, giacenze e arrivi in `listItems`, statistiche). Con 2.000 articoli e 40.000 movimenti l'elenco si calcola in circa 12 ms invece di 243 ([controllo-bug-e-prestazioni.md](controllo-bug-e-prestazioni.md), P4). Chi aggiunge un calcolo per articolo deve partire da `byItem`, non da `movements.filter(...)` dentro un ciclo.

I movimenti: **receipt** (arrivo, +), **use** (uso, −, con progetto facoltativo), **transfer** (spostamento da un luogo a un altro), **adjustment** (conteggio: "ne ho contati 7", si registra la differenza), **disposal** (smaltimento, −), **build** (produzione: "ne abbiamo fatti 3", +, con i prezzi congelati come un arrivo; §16). Nulla può uscire da un luogo che non ne contiene abbastanza (409); le richieste simultanee sullo stesso articolo si mettono in fila.

**Prezzi congelati.** Ogni arrivo salva tre prezzi **per unità**, in decimillesimi di euro: *netto* (prima dell'IVA), *lordo* (con IVA) e *costo per il team* (lordo meno lo sponsor, cioè l'`outflow` della voce; per uno sponsor totale resta l'IVA, come nel foglio: domanda Q1, confermata il 21/10/2026; zero per un regalo). Se il budget cambia dopo, i carichi già fatti non cambiano.

## 5. Le informazioni di un articolo

| Richiesto | Dove sta |
| --- | --- |
| prodotto con immagine | nome + `item_image` (§7) |
| area (MT + DMT, SW, HW…) | `area_id`: le aree del budget; vuota = di tutte (§19) |
| che cosa è e i suoi dati (resistenza, tensione, package…) | il **tipo** (che può stare sotto un altro) e i suoi parametri, con quelli dei padri (§19, §20) |
| categoria del budget | quella del **suo tipo**: non si chiede, non si vede nel modulo (§20); `category` resta sull'articolo, allineata |
| a cosa serve | `purpose` |
| quantità | somma dei movimenti, per luogo |
| quantità comprate | somma degli arrivi (`boughtMilli`) |
| costo | prezzo di ogni arrivo; prezzo oggi, medio, in un giorno; valore sullo scaffale |
| dove si trova | luogo (stanza / scaffale / ripiano, dall'elenco) + "dove esattamente" in testo libero ("scatola rossa") |
| come smaltirlo | `disposal` |
| codici di sicurezza | `safetyCodes`: frasi H/P e numero UN dei materiali pericolosi, come sulla scheda di sicurezza |
| infiammabile, tossico, cancerogeno | tre caselle sull'articolo, visibili qualunque sia la categoria (tranne per i tipi che non le chiedono, §19) e filtrabili (§15) |
| schede dati | elenco di PDF per articolo, caricati solo se si clicca (§15) |
| stoccaggio / mantenimento | `storageNotes`, `maintenanceNotes` |

**Facoltativi per categoria.** Nessun campo è obbligatorio, e il modulo mostra solo quelli utili alla categoria (la funzione `getCategoryFields`, dal database; l'admin li sceglie dalla pagina Settings, [impostazioni.md](impostazioni.md): [registro](hardcoded-registry.md)):

| Categoria | Campi mostrati oltre a nome, codice, categoria e unità |
| --- | --- |
| Manufacturing, Consumable | a cosa serve, **codici di sicurezza**, **smaltimento**, stoccaggio |
| Asset | a cosa serve, **manutenzione**, stoccaggio |
| Components, Logistic | a cosa serve, stoccaggio |
| Administration, Software, nessuna categoria | a cosa serve (e stoccaggio se senza categoria) |

Cambiando categoria i campi nascosti **non si cancellano**: restano nel database e ricompaiono tornando alla categoria. Il modulo manda solo i campi che mostra. Nella pagina dell'articolo i codici di sicurezza sono evidenziati.

## 6. Posti: stanza, scaffale, ripiano

`listLocations()` ([lookups.service.ts](../apps/api/src/platform/lookups/lookups.service.ts)) legge la tabella `location`. Un posto è una **stanza** e, se serve, uno **scaffale** e un **ripiano** (13 novembre 2026: prima era «sede e stanza»; la sede non c'è più): tre testi liberi, senza gerarchia, di cui scaffale e ripiano facoltativi (un ripiano vuole uno scaffale). Si può restare alla stanza («è nella stanza») o allo scaffale. L'etichetta che si vede ovunque è «Stanza / Scaffale / Ripiano», con le parti che ci sono. All'inizio ci sono dieci stanze («Site 1 - Room 1»…), solo per avere qualcosa da scegliere; si aggiungono, rinominano, ordinano e cancellano dalla pagina **Settings** ([impostazioni.md](impostazioni.md)): chi tiene le liste dell'inventario, come per le categorie, **non** al volo mentre si riceve la merce. Più ripiani si aggiungono insieme scrivendoli con la virgola (`1, 2, 3, 4`). Nel database del magazzino si salva il **codice** del posto (`s1-r2`, o `lab--a--2` per i nuovi: dai nomi), che non cambia mai, e a parte un testo libero per il punto preciso («scatola rossa»). Un posto usato da un movimento non si può cancellare. Due posti non possono avere la stessa stanza, lo stesso scaffale e lo stesso ripiano (senza badare alle maiuscole); «Scaffale A» e «Scaff. A» sono invece due posti diversi, perciò i posti li crea solo chi tiene Settings. Le statistiche «per posto» e il filtro `location` contano ogni posto per sé (quindi per ripiano).

## 7. Immagini

**Si ingrandiscono con un clic** (23 novembre 2026, [stile-interfaccia.md](stile-interfaccia.md), punto 25): la miniatura dell'elenco, l'immagine della testata dell'articolo e del componente e quella delle schede sul telefono aprono l'immagine grande sopra la pagina.

Il browser riduce la foto prima di inviarla (1200 px e una miniatura da 240 px, JPEG), quindi sul server non serve nessuna libreria. L'API accetta JPEG, PNG e WebP, **controlla i primi byte** (un file che dice di essere un'immagine ma non lo è viene rifiutato), limita le dimensioni (600 KB la grande, 80 KB la piccola) e le salva **nel database**: un solo backup copre tutto. Le serve con `Cache-Control: private, max-age=0, must-revalidate` e `ETag`: il browser le tiene ma chiede ogni volta se sono ancora quelle (304). Le immagini non vanno nello storico (sono binarie): cambia `image_updated_at` dell'articolo, e quello compare.

## 8. I prezzi: il selettore

Ovunque ci sia un prezzo (elenco, articolo, componenti, statistiche) un selettore dice **quale prezzo**, **come leggerlo** e **in che giorno**; sta nell'indirizzo della pagina (`?basis=gross&method=average&on=2026-09-30`), quindi si può condividere:

| Scelta | Valori |
| --- | --- |
| Prezzo (`basis`) | `net` prima dell'IVA · `gross` con IVA · `team` costo per il team |
| Preso da (`method`) | `last` ultimo acquisto · `average` media di tutti gli acquisti fino a quel giorno, **pesata per quantità** |
| Giorno (`on`) | il prezzo di quel giorno, dagli acquisti fatti fino ad allora (predefinito: oggi) |

Esempio: 100 viti a 0,0850 € il 1/9 e 50 a 0,1000 € il 1/10 → ultimo prezzo il 31/12: 0,1000 €; il 15/9: 0,0850 €; media il 31/12: (100 × 0,085 + 50 × 0,10) / 150 = 0,0900 €. Prima del primo acquisto non c'è prezzo ("never bought").

## 9. Componenti: quello che facciamo noi

Un componente è un articolo con origine `made` e una **distinta**: l'elenco delle parti (articoli, anche altri componenti: **sottoassiemi**) con la quantità che entra in un pezzo.

- **Costo per farne uno adesso** = somma di quantità × prezzo di ogni parte, nel giorno scelto (è un calcolo **vivo**: cambia appena cambia il prezzo di una parte; i pezzi già fatti hanno un costo congelato, §16); il prezzo di una parte che è a sua volta fatta da noi è il suo costo (ricorsione). L'arrotondamento è alla fine (decimillesimi), e la riga "totale" mostrata è la somma delle righe come appaiono, così quello che si vede torna.
- **Incompleto**: se una parte non è mai stata comprata, il costo somma il resto e il sito lo segnala (`!`, "some parts have never been bought"). Se nessuna parte ha un prezzo, non c'è costo.
- **Nel tempo**: il grafico dà il costo a fine di ogni mese dal primo acquisto di uno qualunque dei materiali (fino a 60 mesi). **Passando il mouse su un mese** compare il costo e il **prezzo di ogni parte** in quel mese (con la quantità che entra in un pezzo); le parti che sono cambiate rispetto al mese prima sono segnate in rosso (▲ "was 0,70 €") o in verde (▼): si vede subito quale parte ha fatto salire il costo. Un sottoassieme vale il suo costo di quel mese. Esempio dei dati dimostrativi: la pedaliera costava 20,30 € a giugno e 22,48 € a settembre per i rincari di piastre e viti.
- **Nessun anello**: un componente non può contenere se stesso, nemmeno attraverso le parti delle parti (409 con il nome del colpevole). Le modifiche alle distinte si mettono in fila con un blocco unico (sono rare): senza, "A dentro B" e "B dentro A" fatti insieme passavano entrambi (la prova c'è nei test).
- Cancellando un componente se ne va la distinta, non le parti; un articolo usato in una distinta non si cancella.
- **Quanti se ne possono fare** (§21): nella pagina del componente la tabella «Made of» ha la colonna **AVAILABLE (ALL PLACES)** (quanto c'è sullo scaffale di ogni parte, in tutti i luoghi; in rosso se non basta nemmeno per un pezzo) e un riquadro **CAN MAKE** accanto a ON THE SHELF; l'elenco COMPONENTS ha le colonne **CAN MAKE** e **LIMITED BY** e i filtri di ricerca (§21).

## 10. Statistiche

`GET /api/inventory/stats?by=project|area|category|location|car&basis=…`. Contano gli arrivi e i prelievi **della stagione scelta nel menù** (con data tra il suo 1° settembre e il suo 31 agosto); lo scaffale, invece, è sempre quello di oggi. La risposta dice quale stagione (`season`: nome e date) e la pagina lo scrive in cima ([stagioni-anni-fiscali-e-macchine.md](stagioni-anni-fiscali-e-macchine.md)).

| Colonna | Significato |
| --- | --- |
| Bought | merce **arrivata**, al prezzo di ogni arrivo (i pezzi **fatti da noi** non contano: non sono stati comprati) |
| On its way | comprata dal budget e non ancora arrivata, al prezzo del budget |
| Used | uscita dallo scaffale **per un progetto**, al prezzo medio pagato fino ad allora. Le **parti consumate da una produzione** contano come usate per il progetto della produzione; l'uso di un **pezzo fatto da noi non conta** (il suo costo è già nelle parti: niente doppio conteggio) |
| On the shelf | quanto c'è ora, al prezzo medio pagato |

Per progetto e area (dal progetto della voce di budget, o scelto a mano) non c'è la giacenza: lo scaffale non appartiene a un progetto. Per luogo c'è solo la giacenza. **Per macchina** (*By car*) ci sono solo Bought e On its way, per la macchina a cui è destinato ogni acquisto: quella della riga del budget, o quella scelta su un arrivo fuori budget, altrimenti quella della stagione della data. I prelievi non dicono su che macchina vanno. Il totale di "Bought" è lo stesso comunque si tagli (c'è un test).

## 11. Permessi, API, schermate

**Chi.** Guardare: tutti. Cambiare (articoli, arrivi, movimenti, immagini, distinte): **admin e pm** (`canManageInventory`), qualunque area; il viewer riceve 403 e non vede i comandi. Tutto finisce nello [storico](accesso-e-storico.md) (articoli, movimenti, distinte; non le immagini).

| Endpoint (prefisso `/api`) | Cosa fa |
| --- | --- |
| `GET/POST /inventory/items`, `GET/PATCH/DELETE /inventory/items/:id` | elenco con giacenza e prezzo (filtri: `search`, `category`, `origin`, `location`, `area` (codice), `type`, `flammable`, `toxic`, `carcinogenic` e quelli dei parametri, §19), dettaglio, creazione, modifica (anche area, tipo e `params`), eliminazione (solo se senza movimenti e non in una distinta) |
| `GET/POST /inventory/types`, `PATCH/DELETE /inventory/types/:id`, `POST /inventory/types/:id/params`, `PUT /inventory/types/:id/params/order`, `PATCH/DELETE /inventory/params/:id` | i tipi e i loro parametri (§19): leggerli tutti, cambiarli admin e pm |
| `PUT/DELETE/GET /inventory/items/:id/image` | immagine (JSON base64; `?size=thumb|full`) |
| `POST /inventory/items/:id/datasheets?name=…`, `GET/DELETE /inventory/datasheets/:id` | scheda dati: si invia il PDF **così com'è** (`Content-Type: application/pdf`, massimo 10 MB, deve iniziare con `%PDF-`); si legge un file alla volta |
| `POST /inventory/builds` | produzione: toglie le parti dallo scaffale (da tutti i luoghi, quello che ne ha di più per primo; `takeFrom`: id della parte → luogo, per le parti da prendere da un luogo solo), per il progetto scelto (obbligatorio), e aggiunge i pezzi fatti (§16) |
| `DELETE /inventory/movements/:id` | annulla un movimento (§18) |
| `GET /inventory/pending`, `POST /inventory-budget/pending/:lineId/receive`, `POST /inventory/receive` | gli acquisti da ricevere e l'arrivo per una riga del budget (del ponte inventario×budget, `bridges/inventory-budget/pending.service.ts`: prezzi, progetto e macchina dalla riga; dal passo G5 ha un indirizzo suo, prima era `POST /inventory/receive` con `lineId`); l'arrivo fuori budget, con `unitNet` (`lineId` qui è rifiutato) |
| `POST /inventory/movements` | uso, spostamento, conteggio (`counted`), smaltimento |
| `GET /inventory/components`, `GET /inventory/components/:id`, `POST/PATCH/DELETE …/parts` | componenti (filtri: `search`, `area` (codice), `type` (con i sotto-tipi), `project` (id); con `canMakeMilli` e `limitedBy`, calcolati su tutti i luoghi), distinta (con `available`: lo scaffale di ogni parte, e `canMakeMilli`/`limitedBy` del componente), costo e serie nel tempo |
| `GET /inventory/components/:id/plan?quantity=…&from=12:s1-r3` | quello che serve per farne `quantity` (§21): per parte il necessario, il disponibile, ciò che resta, ciò che manca, **da dove si prende** (`takes`) e i luoghi che ne hanno (`places`); `from` (ripetibile: id della parte, poi il luogo) prende quella parte da quel luogo soltanto; quanti se ne possono fare al massimo |
| `GET /inventory/stats`, `GET /inventory/projects` | statistiche (comprato, in arrivo, progetti e aree vengono dal budget attraverso il ponte); i progetti del budget (del ponte) (per i moduli; **non** quelli dell'area derivata ADMINISTRATION, che non sono righe del database: [spese-fuori-budget.md](spese-fuori-budget.md)) |
| `GET /inventory/locations`, `/units`, `/category-fields` | gli elenchi per i moduli (prima `/lookups/…`); li tengono admin e pm dalla pagina Settings (`GET /inventory/lists` e le scritture in [impostazioni.md](impostazioni.md), §3; dal passo G5 sono liste dell'inventario, `lists.service.ts`) |

Schermate (menu **Inventory**): **INVENTORY** (elenco con miniature, filtri per area, tipo e parametri, selettore prezzo, "Add goods"), pagina dell'articolo (immagine, informazioni, giacenze per luogo con "Use, move, count…" (si apre in un pannello sotto la riga), prezzi nel tempo, movimenti con il pulsante **Undo**, "More arrived"), **PENDING**, **COMPONENTS** (+ pagina del componente con distinta, costo e grafico), **INVENTORY STATS**. Nel budget, la colonna di stato a sinistra mostra clessidra o spunta e in ACTUAL c'è la colonna **ARRIVED** con "pending 0/8", "partial 3/8", "arrived 8/8".

## 12. Cosa non c'è ancora

- **Pezzi singoli** con matricola e QR (Lidar, IMU…): per ora solo quantità.
- **Costo FIFO a lotti**: la produzione c'è (§16) ma prezza le parti col prezzo medio o l'ultimo (a scelta), non lotto per lotto "i più vecchi per primi".
- **Caricamento dell'inventario esistente**: non c'è un file da cui partire; gli articoli si aggiungono dal sito.
- **Duplicare un articolo** (per inserire in fretta trenta resistenze diverse) e il **nome proposto dai parametri** ("R 4,7 kΩ 0603"): utili con i tipi (§19), da fare dopo.
- **Parametri obbligatori**: per ora nessun parametro lo è, come gli altri campi.
- **Modificare un movimento**: un movimento non si cambia, si **annulla** (§18) e si registra giusto (un prezzo sbagliato, una quantità, un luogo).
- **Scorta minima** e avviso di riordino: da fare.
- Un disegno Figma per queste schermate; i posti veri (stanze, scaffali e ripiani).

## 13. Dati dimostrativi

`pnpm db:seed-demo` aggiunge 19 articoli comprati e 3 fatti da noi (viti, resina e indurente con codici di sicurezza e smaltimento, alcool, batteria LiPo, utensili, cavo, tre resistenze e due condensatori SMD, una pedaliera fatta di una staffa fatta di piastre e viti…), con immagini generate, prezzi in date diverse, usi per progetto, uno spostamento, un conteggio e uno smaltimento. **Sono inventati**: nomi, prezzi e luoghi. Si riconoscono dal codice `DEMO-…`; `pnpm db:seed-demo -- --remove` li toglie tutti; **rilanciarlo aggiunge solo ciò che manca** (un articolo si riconosce dal codice) e **non cambia né cancella** quelli che ci sono già, anche se li hai modificati (dal 13 novembre 2026: prima li cancellava e li rifaceva). Non scrive nello storico (disattiva i trigger per la sua sessione) perché nessuno ha fatto davvero quelle modifiche. In Docker: `docker compose exec api pnpm db:seed-demo`.

**Aree e tipi** (§19, dal 4 novembre 2026). Ogni articolo dimostrativo ha la sua area:

| Area | Articoli |
| --- | --- |
| MT + DMT | vite M3, dado M5, piastra in alluminio, resina, indurente, chiave dinamometrica, staffa, pedaliera |
| HW | batteria LiPo, cavo in rame, multimetro, connettore a 2 pin, cablaggio del cruscotto, resistenze e condensatori |
| di tutte | alcool (segnato infiammabile), colla, fascette, occhiali |

e sei tipi con i loro parametri: **Fastener** (MT + DMT: Kind, Thread, Length in m con prefissi, così la vite è lunga "10 mm"), **Cable** (Section in mm², Colour), **Connector** (Pins, Sealed sì/no), **Battery** (Voltage, Capacity in Ah, Cells; chiede i pericoli), **Resistor** (Resistance, Power, Tolerance, Package) e **Capacitor** (Capacitance, Voltage, Dielectric, Package), questi quattro di HW e senza la domanda sui pericoli. I tipi si creano solo se mancano (un tipo o un parametro con lo stesso nome viene riusato; uno con lo stesso nome ma di un altro genere ferma tutto con un messaggio) e **restano** dopo `--remove`: servono come base, e così un tipo fatto a mano non viene mai cancellato.

**Gli IC e l'albero dei tipi** (13 novembre 2026, §20): dieci articoli `DEMO-100`…`DEMO-109` per provare i tipi sotto altri tipi. **IC** (HW, categoria Components; Package, Pins, Max supply) con sotto **Op-amp** (+ Gain bandwidth, Channels, Rail-to-rail), **Microcontroller** (+ Core, Flash, RAM, Max clock) con sotto **ARM Cortex-M** (+ Series) e **AVR**, e **Voltage regulator** (+ Output voltage, Max current, Topology). Un IC generico (74HC595, sul tipo IC), tre op-amp (LM358, TL072, MCP6002), due STM32 e un ATmega, tre regolatori (LM7805, AMS1117, LM2596): senza immagine, con un arrivo ciascuno. Ora **ogni tipo dimostrativo ha la categoria del budget** (i fatti prima, solo se nuovi) e gli articoli la prendono dal tipo.

**Con i trigger spenti il database non fa nemmeno le cascate** (`session_replication_role = replica` ferma anche le chiavi esterne): per questo `--remove` cancella da sé, prima degli articoli DEMO, le loro immagini, schede dati, valori dei parametri, movimenti e distinte. Fino al 4 novembre le immagini non venivano cancellate e ogni nuovo caricamento lasciava le miniature di quello prima senza articolo (30 righe nel database locale, tolte quel giorno).

## 14. Test

| Dove | Cosa prova |
| --- | --- |
| `packages/calc/src/inventory.test.ts` | raggruppamento per articolo (`byItem`), giacenze (arrivi, usi, spostamenti, conteggi), prezzi (ultimo, medio pesato, per giorno, i tre tipi, valori enormi esatti), costo di componenti e sottoassiemi, costo nel tempo **con il prezzo di ogni parte**, parti mai comprate, anelli, stati dell'arrivo, PENDING, statistiche |
| `apps/api/src/modules/inventory/inventory.routes.test.ts` | articoli, arrivi dal budget (parziali, simultanei, oltre il comprato, voce cancellata dopo), arrivi fuori budget, movimenti (anche dodici richieste insieme sullo stesso articolo), prezzi nel tempo, immagini (formato vero, dimensioni, ETag), permessi, storico |
| `apps/api/src/modules/inventory/components.routes.test.ts` | **come si trova un componente** (nome, codice, a cosa serve; area; tipo con i sotto-tipi; progetto; tutti insieme; filtri senza senso), costo, nel tempo, i tre prezzi, incompleto, anelli (anche con due richieste insieme), permessi, statistiche; **quanti se ne possono fare** (necessario, disponibile, resta, manca; il millesimo: 2,2 serve 2,2 e 2,199 non basta; tutti i luoghi insieme e da dove si prende; una parte da un luogo solo; sottoassiemi da fare prima; colonne dell'elenco e riquadro; nessuna parte; rifiuti e permessi); **da cosa parte «Make new»** (progetto e luogo dei pezzi su un articolo fatto da noi, rifiutati su uno comprato o con un progetto o un luogo che non esiste, il progetto cancellato li svuota) |
| `packages/calc/src/makePlan.test.ts` | il piano di produzione e il massimo producibile, a millesimi; **da dove si prendono le parti** (il luogo con di più per primo, spot dopo spot, un luogo solo se scelto) |
| `apps/api/src/modules/inventory/datasheets.routes.test.ts` | PDF vero (primi byte), vuoto, troppo grande, nome obbligatorio; l'elenco non contiene i byte; lettura, cancellazione, a cascata con l'articolo; permessi; storico senza byte |
| `apps/api/src/modules/inventory/builds.routes.test.ts` | produzione: parti tolte (da più luoghi, il più fornito per primo; da un luogo solo se scelto; annullata, tornano ai luoghi da cui sono uscite), pezzi aggiunti col costo congelato, prezzi nuovi solo per le produzioni dopo, scorte insufficienti (nulla registrato), parte mai comprata, sottoassiemi, progetto obbligatorio e legame con le parti, nessun doppio conteggio, richieste simultanee, permessi |
| `apps/api/src/modules/inventory/undo.routes.test.ts` | annullare uso, arrivo (anche dal budget: la voce torna in PENDING), spostamento, conteggio, smaltimento; rifiuto se ciò che portava è già stato usato; produzione (parti indietro, pezzi via, una parte da sola no); storico; permessi; due richieste insieme (provato togliendo il blocco: il test fallisce) |
| `apps/api/src/modules/inventory/inventory.routes.test.ts` | (oltre a quanto sopra) filtri infiammabile/tossico/cancerogeno, anche insieme |
| `apps/api/src/modules/inventory/types.routes.test.ts` | tipi e parametri (ordine, nomi doppi, forma giusta per il genere, permessi); valori di un articolo (numero esatto e scritto in un modo solo, scelta fuori lista, parola al posto di un numero, parametro di un altro tipo, articolo senza tipo, area o tipo inesistenti: niente viene salvato); solo ciò che si manda cambia, `null` cancella, nessuna riga di storico se nulla cambia; i valori di un tipo lasciato restano nascosti e tornano; filtri per area, tipo, numero da/a (estremi inclusi, anche 100n), scelta, testo (con `_` come carattere), sì/no, più filtri insieme, filtri senza senso rifiutati; genere che non cambia se c'è qualcosa scritto, scelte rinominate (anche due scambiate) e non tolte se usate, parametro cancellato con i valori (nello storico), tipo cancellabile solo senza articoli, ordine |
| `apps/web/src/lib/params.test.ts` | lettura dei numeri (`10k`, `4k7`, `4,7 k`, `2M2`, `100nF`, `4.7µ`, `1.5p`, `12mm`, `-40`), rifiuti (parole, prefisso dove non va, troppo grande), visualizzazione (`4,7 kΩ`, `100 nF`, `1.500 mm²`), e ciò che il modulo mostra si rilegge uguale |
| `apps/web/src/lib/*.test.ts` | formattazione di prezzi, quantità e dimensioni dei file, riduzione delle immagini, campi per categoria, le tre caselle nel corpo inviato |

## 15. Schede dati (PDF) e pericolosità

**Schede dati.** Ogni articolo ha un elenco di PDF (la scheda tecnica, quella di sicurezza…): nome, dimensione, data e chi l'ha caricata. Dalla pagina dell'articolo, pannello **Data sheets**: il pulsante giallo "Add data sheet" apre il modulo (file + nome, proposto dal nome del file); il cestino toglie la scheda (admin e pm).

- **Si carica solo se ci clicchi.** L'elenco dell'articolo (`GET /inventory/items/:id`) porta solo i dati *sulla* scheda; i byte stanno in una tabella a parte (`item_datasheet_file`) e il nome è un semplice link (`<a href="/api/inventory/datasheets/7" target="_blank">`): il PDF viene scaricato **solo quando qualcuno lo apre**, in una scheda del browser. Nemmeno l'elenco degli articoli li tocca. Così 200 PDF da 5 MB non rallentano nessuna pagina.
- **Limiti e controlli.** Massimo 10 MB (`DATASHEET_LIMITS` in `inventory.schema.ts`; il browser lo controlla prima di inviare, il server lo ripete), file non vuoto, e **i primi byte devono essere `%PDF-`** (un file che si dichiara PDF e non lo è viene rifiutato). Il PDF viaggia come corpo grezzo `application/pdf`, con il nome nell'indirizzo: nessuna libreria in più, nessun base64 (+33%). Si serve con `Content-Disposition: inline`, `Content-Security-Policy: frame-ancestors 'none'` e `Cache-Control: private, max-age=3600`.
- Nello storico compare la riga della scheda (nome, dimensione, chi) e **mai i byte**.

**Infiammabile / tossico / cancerogeno.** Tre caselle nel modulo dell'articolo, **non** legate alla categoria (si possono nascondere per un tipo intero, per esempio le resistenze: §19) (un adesivo, un solvente e una vernice possono esserlo senza essere della stessa categoria). Si vedono come etichette rosse nella pagina dell'articolo e del componente, e come colonna **HAZARDS** nell'elenco. Nell'elenco tre caselle filtrano: **più caselle spuntate = tutte insieme** (infiammabile **e** tossico), non l'una o l'altra. I filtri sono anche nell'API (`?flammable=true&toxic=true`).

## 16. Produzione: «Make new»

Un componente (§9) ha una distinta, ma finché non si registra di averlo **fatto** è solo un calcolo. Dalla pagina del componente il pulsante giallo **Make new** (prima si chiamava «We made some») apre il modulo, che dal 16 novembre 2026 è un **pianificatore** (§21): si digita quanti e si vede subito se ci sono le parti. I campi:

| Campo | Significato |
| --- | --- |
| How many | quanti pezzi (anche decimali, per le unità che lo permettono) |
| Made on | il giorno (oggi se non si cambia) |
| For project | **obbligatorio**: il progetto per cui si fanno i pezzi; le parti prese dallo scaffale escono per lui. Parte da quello scelto alla creazione del componente (§21) |
| Take from (una scelta per riga del piano) | **da dove** si prende ogni parte: di default **da tutti i luoghi, quello che ne ha di più per primo** (si toccano meno luoghi possibile), punto preciso dopo punto preciso; la tendina della riga la prende da **un luogo solo** (§21) |
| Put the pieces in / Exactly | dove si mettono i pezzi fatti |
| Price of the parts | `average` (media pesata degli acquisti fino a quel giorno, predefinito) oppure `last` (ultimo acquisto) |

**Cosa succede, tutto in una volta o niente:**

1. per ogni parte della distinta si calcola `quantità in un pezzo × pezzi` (arrotondata al millesimo) e si toglie dallo scaffale (**da tutti i luoghi**, o dal luogo scelto per quella parte) con un movimento `use` **per ogni punto toccato** (nota: *Used to build 3 × nome*) **per il progetto scelto** e **legato alla produzione** (`built_by`): per questo non si annulla da solo (§18) e nelle statistiche per progetto e area conta come usato dal progetto;
2. si calcola il costo di un pezzo: per ogni parte il prezzo "da scaffale" a quel giorno, nei tre tipi (netto, lordo, costo per il team);
3. si aggiunge un movimento `build` sull'articolo fatto (con lo stesso progetto), con quei tre prezzi **congelati** nel movimento. Il pezzo finito, quando poi lo si usa, **non si conta una seconda volta** nelle statistiche: il suo costo è già nelle parti.

**Rifiuti (409, nulla viene registrato):** sullo scaffale non ce n'è abbastanza di una parte (il messaggio dice quanto serve e quanto c'è, e il luogo se era scelto: *22 pcs … (20 there)*); una parte non ha mai avuto un prezzo (*buy or receive it with a price before building*); l'articolo non è "fatto da noi" o non ha parti; il progetto manca o non esiste. Un **sottoassieme** si tratta come una parte qualunque: deve essere già stato fatto (e stare sullo scaffale) prima di fare ciò che lo contiene. Più produzioni insieme sugli stessi pezzi si mettono in fila (le righe si bloccano sempre nello stesso ordine, quindi non si incastrano).

**Il prezzo "da scaffale".** Di un pezzo con arrivi (comprati o `build`) è il prezzo di quegli arrivi con il metodo scelto; di un articolo fatto che non è mai stato prodotto è il costo vivo della sua distinta. Nell'elenco e nella pagina dell'articolo, il prezzo di un pezzo **fatto da noi** è quindi quello delle sue produzioni (media o ultima), e il grafico diventa **Cost of each build**. Nella pagina del componente la scheda **Cost to make one now** resta il costo vivo.

## 17. Se compro un pezzo che abbiamo già a un prezzo diverso

Un esempio con numeri (verificato sul sito il 29/10/2026, dati di prova poi cancellati): una **vite** comprata 100 a 0,50 € (1/9) e 100 a 0,70 € (10/10), e un **supporto** fatto di 4 viti e 1 piastra da 8,00 €.

| Situazione | Prezzo vite "ultimo" | Prezzo vite "media" | Supporto: costo per farne uno adesso ("ultimo" / "media") | Supporti già fatti |
| --- | --- | --- | --- | --- |
| prima | 0,70 € | 0,60 € | 10,80 € / 10,40 € | 3 a **10,40 €** (fatti con la media) |
| compro 100 viti a **0,90 €** | **0,90 €** | **0,70 €** | **11,60 €** / **10,80 €** | 3 a 10,40 € (**invariati**) |
| ne faccio 1 con la media | 0,90 € | 0,70 € | 11,60 € / 10,80 € | 3 a 10,40 € + 1 a **10,80 €**; prezzo del supporto: ultimo 10,80 €, media 10,50 € |

Cosa si modifica e cosa no:

- **Lo stesso articolo, un arrivo in più.** Non nasce un articolo nuovo e nessun vecchio arrivo cambia: ogni acquisto ha i suoi tre prezzi congelati. Si aggiunge un **punto** al grafico dei prezzi pagati e la giacenza sale (188 → 288 viti).
- **Il prezzo dell'articolo** dipende dal selettore ([§8](#8-i-prezzi-il-selettore)): con *ultimo acquisto* salta subito a 0,90 €; con *media* si sposta di poco (pesata sulle quantità: più viti compro a quel prezzo, più pesa) e il giorno scelto (`on`) permette di rivedere il prezzo di prima.
- **Il valore sullo scaffale** ricalcola tutta la giacenza al prezzo scelto: con *ultimo* tutte le viti valgono 0,90 €, anche quelle comprate a 0,50 € (non ci sono lotti: §12). Con *media* il valore cambia meno.
- **I componenti che contengono la vite.** Il *costo per farne uno adesso* cambia **subito** (è vivo); il grafico "Cost of one, at the end of each month" mostra l'aumento dal mese dell'acquisto in poi e il passato resta com'era (il costo di ogni fine mese usa i prezzi di allora).
- **I pezzi già fatti non cambiano.** Il loro costo è stato congelato al momento della produzione (§16): se la vite rincara, i 3 supporti già fatti costano ancora 10,40 €. **Le produzioni successive** usano il prezzo nuovo (col metodo scelto in quel momento) e il costo dei pezzi fatti da noi diventa la media, o l'ultimo, tra le produzioni.
- **Le statistiche.** "Bought" aggiunge le 100 viti al prezzo pagato; "Used" valuta ciò che esce dallo scaffale al **prezzo medio** pagato fino al giorno dell'uscita, quindi un uso fatto prima dell'acquisto non cambia. Le viti di una produzione contano per il suo progetto, i supporti finiti no.
- **Il budget non cambia.** Un arrivo fuori budget non tocca nessuna voce; un arrivo dal budget usa i prezzi della voce (se la voce cambia dopo, i carichi già fatti non cambiano).
- **Un prezzo sbagliato** non si modifica: si **annulla** l'arrivo (§18) e lo si registra giusto. Se le viti sono già state usate, prima si annulla chi le ha usate.

## 18. Annullare un movimento

Un movimento non si modifica: si **annulla** e, se serve, si registra giusto. Nella pagina dell'articolo, tabella "What happened", ogni riga ha il pulsante **Undo** (admin e pm); chiede conferma e toglie la riga dal registro come se non fosse mai successa (`DELETE /api/inventory/movements/:id`). Lo [storico](accesso-e-storico.md) conserva **sia l'inserimento sia l'annullamento**, con chi li ha fatti: nulla sparisce davvero.

| Si annulla | Cosa succede |
| --- | --- |
| un **uso**, uno **smaltimento** | i pezzi tornano sullo scaffale |
| un **arrivo** | i pezzi escono; se completava un acquisto del budget, la voce torna "pending" e ricompare in PENDING |
| uno **spostamento** | tornano dove erano |
| un **conteggio** | la giacenza torna a quella di prima del conteggio |
| una **produzione** | i pezzi fatti escono dallo scaffale e le parti **tornano** (le righe d'uso della produzione si tolgono con lei) |

**Quando viene rifiutato (409, nulla cambia):**

- **ciò che il movimento aveva portato è già stato usato o spostato**: la giacenza di un posto scenderebbe sotto zero (esempio: un arrivo di 10 viti dopo averne usate 8). Si annulla prima chi le ha usate; per una produzione, prima l'uso dei pezzi fatti;
- è **una parte presa da una produzione** (`built_by`): va indietro solo insieme alla produzione, quindi per quella riga non c'è il pulsante e l'API risponde 409 *undo the build*.

**Cosa non cambia dopo un annullamento.** Il prezzo dei pezzi di altre produzioni resta quello congelato; i prezzi "ultimo" e "media" degli articoli si ricalcolano senza il movimento tolto (se si toglie un arrivo a 0,90 €, l'ultimo prezzo torna al precedente). Un articolo senza più movimenti si può cancellare di nuovo.

**Concorrenza.** L'annullamento prende lo stesso blocco sull'articolo di ogni altra modifica della sua giacenza: un annullamento e un uso contemporanei non possono passare entrambi (uno dei due riceve 409 con il motivo); due annullamenti insieme dello stesso movimento: uno riesce (204), l'altro riceve 404.

**Produzioni vecchie.** La colonna `built_by` esiste dalla migrazione `0015`; le produzioni registrate prima non hanno il legame (nessuna nei dati reali: la funzione è nuova) e le loro righe d'uso si annullerebbero una per una.

## 19. Aree, tipi e parametri

Richiesta del 4 novembre 2026: poter dividere gli articoli per **area** (HW, SW, MT…) e, per esempio in HW, cercare i componenti per **che cosa sono** (resistenze, condensatori…) e per i loro **valori** (resistenza, capacità, corrente, tensione). Il design è stato mostrato e approvato in chat lo stesso giorno; non c'è un disegno Figma (vedi [stile-interfaccia.md](stile-interfaccia.md)).

**Area.** Ogni articolo ha **una sola** area, scelta tra le aree del budget (MT + DMT, SW, HW, CM, MGT, RT), oppure nessuna: vuol dire "di tutte" (nastro, viti comuni). Un arrivo dal budget propone l'area del progetto della voce. L'area dell'articolo **non** cambia le statistiche: lì l'area viene ancora dal progetto della voce o dell'uso (§10).

**Tipo e parametri.** Un tipo ("Resistor") appartiene a un'area (o a tutte) e ha i suoi **parametri**, in un ordine. Ogni parametro è di un genere:

| Genere | Esempio | Come si scrive | Come si filtra |
| --- | --- | --- | --- |
| **Number** | Resistance (Ω), Voltage (V), Section (mm²) | un numero; se il parametro ha i **prefissi** (casella "k, M, m, µ…") si scrive come sugli schemi: `10k`, `4.7k`, `4,7k`, `4k7`, `2M2`, `100n`, `4.7u` o `4.7µ`, anche con l'unità dopo (`100nF`). Sotto la casella si legge come è stato capito ("= 4,7 kΩ"); un numero che non si legge è segnato in rosso e il modulo non si può salvare | **da – a**, estremi inclusi; si può scrivere solo uno dei due |
| **List** | Package: 0402, 0603, 0805 | una delle scelte (con la ricerca se sono più di 8) | una scelta |
| **Text** | Series | testo libero (fino a 200 caratteri) | contiene (senza maiuscole) |
| **Yes / no** | RoHS | una casella | sì / no ("no" comprende gli articoli dove non è scritto niente) |

**I numeri sono esatti.** Si salvano in `numeric` nell'unità del parametro: 10 kΩ è `10000`, 100 nF è `0.0000001`, mai in virgola mobile. Il sito sposta la virgola come testo (`apps/web/src/lib/params.ts`, con i suoi test) e manda il numero già convertito; l'API accetta solo numeri scritti per intero (`10k` le viene rifiutato) e li scrive in un modo solo (`4700.00` diventa `4700`), così un valore salvato di nuovo è uguale e lo storico non si riempie di finte modifiche. I filtri si fanno nel database, dove "almeno 100n" tiene 100 nF.

**Infiammabile, tossico, cancerogeno.** Ogni tipo ha la casella **"asks flammable, toxic, carcinogenic"**: tolta, il modulo dei suoi articoli non mostra le tre caselle (per una resistenza non servono) e non le manda, quindi ciò che c'era resta com'era; anche il filtro dell'elenco sparisce quando si sceglie quel tipo. Gli articoli **senza tipo** le mostrano sempre. Per altri segni di questo genere (RoHS, ESD) si aggiunge un parametro **Yes / no**.

**Dove si fanno.** Nella pagina **Settings**, riquadro **Item types** ([impostazioni.md](impostazioni.md)): li cambiano **admin e pm** (di qualunque area, come il resto dell'inventario), mentre tutti li vedono nell'inventario. Un pm vede in Settings solo questo riquadro.

| Si fa | Cosa succede |
| --- | --- |
| rinominare un tipo, un parametro, una scelta | sempre; rinominando una scelta gli articoli che l'avevano la seguono (anche due scelte scambiate tra loro) |
| cambiare il genere di un parametro | solo finché **nessun** articolo ha qualcosa scritto lì (`409`); un numero che diventa testo perde unità e prefissi |
| cambiare l'unità | possibile, ma **non converte** ciò che è scritto: 10 resta 10 |
| togliere una scelta | solo se nessun articolo l'ha (`409` con quanti l'hanno); prima si cambia loro la scelta o la si rinomina |
| cancellare un parametro | chiede conferma dicendo per quanti articoli è scritto; ciò che c'era va via con lui (nello storico resta) |
| cancellare un tipo | solo se nessun articolo è di quel tipo |

**Cambiare il tipo di un articolo** non cancella ciò che era scritto per il tipo di prima: resta nascosto (non si vede, non si filtra) e ricompare se l'articolo torna a quel tipo, come i campi nascosti dalla categoria (§5). Il modulo manda **solo** i parametri del tipo scelto: un parametro vuoto si cancella, uno non mandato resta com'era.

**Nell'interfaccia.**

- **Modulo dell'articolo** (Add goods, Receive da PENDING, Edit): Area e Type accanto a Category e Unit; il Type elenca i tipi dell'area scelta e quelli di tutte, e scegliendo un tipo di un'area con l'area ancora vuota questa si compila da sola. Sotto, i parametri del tipo con il suo nome come titolo.
- **INVENTORY**: nel gruppo "Find" una fila di pulsanti **Area** (All, MT + DMT, SW, HW…) e la tendina **Type**; scelto un tipo compare un gruppo di filtri col suo nome, uno per parametro (i numeri "da – a"), e la tabella mette **le colonne dei parametri** al posto di area, tipo e categoria (ordinabili: i numeri per valore, 4,7 kΩ prima di 10 kΩ). Senza un tipo ci sono le colonne AREA e TYPE. Il Download segue le colonne che si vedono.
- **Pagina dell'articolo**: area e tipo nella riga sotto il nome, e un riquadro per ogni parametro scritto ("Resistance 4,7 kΩ").

**API.** `GET /api/inventory/types` dà i tipi con i parametri, quanti articoli sono di ogni tipo e per quanti è scritto ogni parametro. Un articolo si crea o si cambia con `areaId`, `typeId` e `params: [{ paramId, value }]` (`value`: il numero come testo esatto, la scelta, il testo, `true`/`false`; `null` cancella). Elenco e dettaglio danno `values` (per parametro, solo quelli del tipo attuale). I filtri dell'elenco: `area=hw`, `type=7`, `p12=0603` (scelta, testo che contiene, `yes`/`no`), `p12min=1000`, `p12max=10000`; un filtro che non ha senso (da/a su una lista, un numero scritto male, un parametro che non esiste) è un `400`.

**Codice.** Database: `item_type`, `item_type_param`, `item_param_value` e le colonne `area_id`, `type_id` (migrazione `0016_item_types.sql`, con i trigger dello storico). API: `apps/api/src/modules/inventory/types.service.ts` (tipi, parametri, scrittura e lettura dei valori, filtri). Sito: `lib/params.ts` (numeri), `lib/inventory.ts` (cosa manda il modulo), `components/ItemEditor.tsx`, `pages/InventoryPage.tsx`, `pages/ItemTypesPanel.tsx` (Settings).

## 20. Categoria del tipo e tipi che stanno sotto altri tipi (13 novembre 2026)

Richiesta della squadra: una famiglia come «IC» contiene cose molto diverse (amplificatori, microcontrollori…) con attributi diversi, e non si possono fare mille tipi con due articoli ciascuno. Soluzione: i **tipi** diventano un albero con gli attributi ereditati, e ogni tipo dice a quale **categoria del budget** appartiene. Si è fatto in due passi, che si mettono sul server insieme (migrazioni `0026` e `0027`).

**La categoria sta sul tipo** (`item_type.category_id`, obbligatoria alla creazione).

- Ogni tipo è collegato a una categoria del budget (Components, Consumable…). **L'articolo non la chiede più**: la prende dal suo tipo. Non si vede nel modulo, nella pagina dell'articolo e nell'elenco di INVENTORY (colonna e filtro: con l'albero si filtra per tipo). Restano **dietro le quinte**: l'articolo ha ancora la sua `category`, **allineata al tipo**, così le statistiche «By category», la ricerca e i campi opzionali di Settings › Categories (a cosa serve, smaltimento…) funzionano senza cambiare.
- **Gli allineamenti**: un articolo nuovo, o che cambia tipo, prende la categoria del tipo (quella inviata dal client si ignora se il tipo ne ha una); **cambiando la categoria di un tipo cambia quella di tutti i suoi articoli** (lo storico mostra ogni modifica); una categoria usata da un tipo **non si cancella** (la colonna USED BY di Settings ora conta anche i tipi), e rinominandola i tipi la seguono (puntano all'id).
- **I tipi fatti prima non hanno la categoria** (la migrazione non la indovina): Settings li segnala con «Choose…» e dice quanti sono. Finché non si sceglie, i loro articoli tengono la categoria che hanno. Un articolo **senza tipo** (anche quelli di COMPONENTS, «Make new») tiene la sua categoria e non cambia.
- **Il tipo è facoltativo** anche quando si crea un articolo nuovo (Add goods, Receive; 20 novembre 2026, su richiesta: un pezzo può non averlo): il modulo chiede solo il nome (e parametri validi, se il tipo c'è) e il campo Type ha «(none)». Con un tipo la categoria è quella del tipo; **senza**, il nuovo articolo tiene la categoria della riga del budget da cui arriva (il modulo la precompila), o nessuna se arriva da fuori budget, come ogni articolo senza tipo. Quando l'arrivo è da una riga del budget, i tipi della **categoria di quella riga** vengono per primi. L'API accettava già un articolo senza tipo: cambia solo il modulo.

**Un tipo può stare sotto un altro** (`item_type.parent_id`, profondità libera).

- **Esempio:** `IC` (Package, Pins) con `Op-amp` (+ Gain bandwidth) e `Microcontroller` (+ Flash) sotto. Un tipo ha **i parametri di tutti i suoi padri, prima, e i suoi dopo**. Un articolo si assegna a **qualunque nodo**, anche a «IC» generico.
- **Filtri.** Scegliendo «IC» nell'elenco si vedono **anche** gli articoli dei suoi sotto-tipi; i filtri e le colonne sono quelli di IC (i comuni). Scegliendo «Op-amp» si aggiungono i suoi. Un parametro di un padre filtra anche i sotto-tipi; uno di un sotto-tipo vale per i suoi articoli soltanto. Il tipo si vede col suo **percorso**: «IC › Op-amp».
- **Cambiare il tipo di un articolo** fra due fratelli tiene i valori dei padri in comune (il package di un op-amp resta se diventa microcontrollore) e nasconde quelli del vecchio tipo, che ricompaiono tornando (come già per i tipi piatti, §19).
- **Regole** (l'API le fa rispettare): i nomi sono unici (senza badare alle maiuscole) **fra i tipi sotto lo stesso padre**, quindi «Other» sta sotto IC e sotto Passives; **un parametro si scrive una volta sola lungo una linea** (Op-amp non può avere un secondo «Package» se IC ce l'ha, e IC non può aggiungere un parametro che un suo sotto-tipo ha già), ma due rami diversi possono avere lo stesso nome; **non si spostano** i tipi in un anello (IC sotto Op-amp, o sotto se stesso) né in modo da scrivere un parametro due volte; un tipo **si cancella** solo se non ha sotto-tipi e nessun articolo. Se un tipo cambia padre i valori dei vecchi padri restano scritti ma nascosti.
- **In Settings, «Item types»:** l'elenco va per albero, con il nome rientrato di un livello per ogni padre; la colonna **UNDER** sposta un tipo sotto un altro (o lo rende un tipo a sé); **Add sub-type** apre il modulo con area, categoria e domanda sui pericoli già presi dal padre; il riquadro dei parametri mostra **quelli dei padri in sola lettura** («Package (from IC)») e si cambiano sul padre: i sotto-tipi seguono.
- **API.** `GET /api/inventory/types` dà i tipi **in ordine d'albero**, ognuno con `parentId`, `depth`, `path`, `categoryId`, `category` e i parametri completi (`inherited`, e `typeId` dice dove sta). `POST /api/inventory/types` prende `parentId` e, se manca `categoryId`, quella del padre (senza padre e senza categoria: `400`); `PATCH` prende `parentId` (`null` = a sé) e `categoryId`. Il filtro `type=` dell'elenco degli articoli comprende i sotto-tipi.
- **Codice.** Database: `item_type.category_id`, `item_type.parent_id` (migrazioni `0026_type_budget_category.sql`, `0027_type_tree.sql`; il nome è unico per padre con `coalesce(parent_id, 0)`). API: `types.service.ts` (`chainOf`, `subtreeOf`, `refuseTwinParamsAlong`, `categoryOfType`), `items.service.ts` (la categoria segue il tipo, il filtro per tipo). Sito: `ItemTypesPanel.tsx`, `ItemEditor.tsx` (la categoria non c'è, il tipo col percorso), `lib/inventory.ts` (`categoryOf`).
- **Vista ad albero** (Settings › Item types, pulsante **Show as a tree**; 13 novembre 2026): i tipi disegnati da sinistra a destra, ogni tipo con i suoi sotto-tipi a destra e i raccordi (`TypeTree.tsx`, `.type-tree` in `components.css`). Ogni casella ha il nome, quanti articoli ha e la categoria; un clic apre i suoi parametri; **+** aggiunge un sotto-tipo; **le frecce** prendono il tipo in mano. **Si sposta trascinando** una casella su un'altra (la mette sotto) o sulla striscia in alto («Here: X becomes a type of its own»); durante il trascinamento le caselle dove può andare hanno il bordo tratteggiato e quella sotto il mouse si colora. **Senza trascinare** (telefono, tastiera): il pulsante delle frecce prende il tipo, il clic successivo lo mette giù, Escape annulla. Non si può mettere un tipo sotto sé stesso o un suo sotto-tipo (lo dice il calcolo, `canMove`); i nomi doppi e i parametri scritti due volte li rifiuta il server e Settings dice perché. Lo spostamento è lo stesso della colonna **UNDER**.
- **La ricerca a cascata** (INVENTORY, 13 novembre 2026): il filtro per tipo è **un menù per ogni livello**. Il primo ha i tipi senza padre; scelto uno, compare un secondo menù («Kind of IC») con **solo i tipi sotto quello**, e così via fin dove arriva l'albero; non c'è un menù in più se il tipo scelto non ha sotto-tipi. Svuotare un menù torna al tipo del menù prima. Si cerca sull'ultimo tipo scelto (con i suoi sotto-tipi), e i filtri e le colonne sono i suoi parametri, ereditati compresi (`typeLevels` in `lib/typeTree.ts`). Il modulo dell'articolo ha ancora un solo elenco, con il percorso («IC › Op-amp»).
- **Non fatto:** una categoria del budget **per albero** (ogni nodo ha la sua, copiata dal padre alla creazione); un modo di **nascondere** da un sotto-tipo un parametro del padre; contare gli articoli di tutto il sotto-albero nella colonna ITEMS.

## 21. Make new: quanti ne posso fare (16 novembre 2026)

Richiesta della squadra: dalla lista dei componenti si vedevano solo quanti **ce ne sono**, non quanti se ne **possono fare** con i pezzi sullo scaffale, né cosa resterebbe dopo averne fatti *n*, né cosa manca. Una prima versione leggeva lo scaffale di **un luogo solo** e non andava: le parti stanno in stanze diverse e AVAILABLE (tutti i luoghi) e il piano (un luogo) dicevano numeri diversi. Dal 16 novembre le parti si prendono **da tutti i luoghi**.

**1. Da dove si prendono le parti.**

- **Di default da tutti i luoghi insieme**, e il piano somma lo scaffale di tutti: AVAILABLE, CAN MAKE e il piano dicono lo stesso numero.
- **Si toglie prima dal luogo che ne ha di più** (a parità, per codice), poi dal successivo, così si toccano meno luoghi possibile; dentro un luogo, punto dopo punto come prima. È una sola funzione (`takeFromShelf`, `packages/calc/src/makePlan.ts`) per il piano e per la produzione: l'anteprima è esattamente ciò che poi esce dallo scaffale.
- **Da un luogo solo, se si vuole**: nella tabella del piano ogni riga ha una colonna **TAKE FROM** con una tendina: «Automatic» (di default; sotto dice da dove: «Site 1 - Room 3 100 m · Site 1 - Room 2 31,5 m») e un'opzione per ogni luogo che ne ha, con la quantità. Scegliendone uno, quella parte si prende **solo da lì**: se lì non basta, la riga dice «missing» anche se altrove ce n'è, e **Make them** resta spento.
- La produzione (`POST /api/inventory/builds`) prende `takeFrom` (id della parte → luogo) per le parti scelte; le altre vanno in automatico. Un luogo che non esiste, o una chiave che non è un id: `400`. Ogni punto toccato ha il suo movimento `use` (con il suo luogo), tutti legati alla produzione: **annullandola le parti tornano ai luoghi da cui sono uscite**.
- Non c'è più «Take the parts from» (né un luogo predefinito): le parti vanno prese dove sono.

**2. L'elenco COMPONENTS.** Si **filtra e si cerca** come in INVENTORY: **Search** (nome, codice o a cosa serve), **Project** (il progetto salvato sul componente, «For project» di «When the team makes it»: per i pezzi **prodotti** per un progetto c'è l'inventario), **Area** (le caselle) e **Type** (un menù per livello, con i sotto-tipi). I filtri si sommano e lavorano sul server (`GET /api/inventory/components?search=…&area=…&type=…&project=…`); i numeri di ogni riga sono sempre quelli dello scaffale intero. L'area e il tipo sono gli stessi componenti dell'elenco INVENTORY (`AreaTypeFilter.tsx`). Le colonne sono **CAN MAKE** (quanti se ne possono fare ora, **al millesimo**, anche 12,666: i pezzi non sono solo interi; rosso se è zero, «no parts yet» se la distinta è vuota) e **LIMITED BY** (le parti che bloccano il pezzo successivo, quella che manca di più per prima). Non c'è la casella «quanti di ognuno»: si entra nel componente e lì c'è il numero.

**3. La pagina del componente.** Accanto a ON THE SHELF c'è il riquadro **CAN MAKE** col numero di pezzi che si possono fare, e sotto «Limited by …» con la parte che si esaurisce per prima (rosso se è zero). La tabella «Made of» ha **AVAILABLE (ALL PLACES)** (in rosso se non basta nemmeno per un pezzo).

**4. Il modulo «Make new».** Si digita **How many** e sotto compare la tabella di cosa serve, parte per parte: **NEEDED**, **ON THE SHELF** (tutti i luoghi, o il luogo scelto), **LEFT AFTER**, **TAKE FROM** e un'etichetta: *enough*, *missing 0,001 kg* o *make 2 first*. Sopra la tabella una frase dice se si può: «Everything is there for 3 pcs», oppure «Not enough for 25 pcs: Plate 5 short. You can make 20 pcs now, then Plate runs out».

- **Il millesimo conta.** Il bisogno è `quantità in un pezzo × pezzi`, arrotondato al millesimo (la stessa regola della produzione vera): servono 2,2 m² e sullo scaffale ce ne sono 2,199 → mancano 0,001. Serve **almeno** quanto serve.
- **Sottoassiemi.** Se una parte è a sua volta fatta da noi e sullo scaffale ce n'è meno del necessario, il piano la dà come **da fare prima** («make 2 first») e **somma le sue parti** alle righe (una parte usata in due punti è contata una volta sola, quindi lo scaffale non si spende due volte). Per «si può fare» e per CAN MAKE un sottoassieme che manca **conta come producibile dalle sue parti**. Ma la produzione vera vuole il sottoassieme già sullo scaffale (§16): **Make them** resta spento finché c'è qualcosa «da fare prima», e la frase dice cosa; si apre il sottoassieme (la parte è un link), lo si fa, e si torna.
- **Make them** si accende quando tutto c'è, il progetto è scelto e il piano è quello di ciò che è scritto ora. Non sposta nulla finché non si preme: il piano è solo un calcolo.

**5. Progetto e luogo dei pezzi si scelgono alla creazione.** Il modulo **New component** è quello di un articolo qualunque (**Name, Code, Area, Type** con i suoi parametri, **Counted in**…, stesso `ItemEditor` di INVENTORY: alla fine «è un articolo dell'inventario esattamente come gli altri») più la sezione **When the team makes it**: **For project**, **Put the pieces in**, **Exactly**. Tutti facoltativi lì («choose each time»). Si cambiano poi dalla pagina dell'articolo (**Edit**, stessa sezione, solo per gli articoli fatti da noi).

- Il modulo «Make new» parte da quei valori: se ci sono (progetto e luogo dei pezzi) mostra una riga «For *progetto* · pieces to *luogo (punto)*» con il pulsante **Change**; se ne manca uno mostra i campi aperti. **Price of the parts** (media o ultimo) sta nei campi aperti.
- Dove sta il dato: `item_make_project` (tabella del ponte inventario×budget dal 27 novembre 2026, prima la colonna `inventory_item.make_project_id`: la riga sparisce se si cancella il progetto), `make_to`, `make_to_spot` (migrazioni `0028_make_defaults.sql`, che aveva anche `make_from`, e `0029_drop_make_from.sql`, che lo toglie). L'API li accetta solo su articoli fatti da noi (`400` sugli altri e per un progetto o un luogo che non esistono). **Non sono un hardcode**: sono dati dell'articolo.
- **I progetti sono per stagione.** L'elenco dei progetti è quello del budget che si sta guardando; se il progetto salvato non è fra quelli, il campo resta vuoto, i campi si aprono e se ne sceglie un altro. I progetti dell'area derivata ADMINISTRATION non si offrono (non sono righe del database).

**Codice.** Calcolo puro: `packages/calc/src/makePlan.ts` (`makePlan`, `maxMakeable`, `takeFromShelf`, `placesOf`: lo scaffale entra come righe, nessun I/O). API: `components.service.ts` (`availableFor`, `getPlan`, `listComponents`, `getComponent`), `movements.service.ts` (`build`), `items.service.ts` (`checkMakeDefaults`). Sito: `components/BuildForm.tsx`, `components/MakeDefaultsFields.tsx`, `components/AreaTypeFilter.tsx` (area e tipo a cascata, ora anche in INVENTORY), `pages/ComponentsPage.tsx`, `pages/ComponentPage.tsx`, `lib/inventory.ts` (`MakeDefaults`, `missingText`, `takesText`).

**Da sapere.**

- Le quantità sono **sempre al millesimo**, anche i pezzi: CAN MAKE può dare 12,666 pcs. Se per le unità «contate» (pcs, set, box) si preferisse il numero intero per difetto (12), è una modifica di sola visualizzazione.
- CAN MAKE di un componente non tiene conto degli altri: se due componenti usano la stessa parte, ognuno la vede **tutta** (non si prenotano a vicenda).
- Il massimo è cercato per tentativi su `makePlan` (si raddoppia e poi si restringe), quindi vale anche con sottoassiemi a più livelli; se un componente si può fare senza limite pratico (un milione di pezzi) il numero si ferma lì.
- I luoghi non si spostano da soli: se serve una parte in un luogo preciso, la si sposta prima (movimento di tipo spostamento).

## 22. Item, marca e modello: cos'è un articolo (23 novembre 2026)

Nel budget una voce ha **ITEM**, **BRAND** e **MODEL** ([come-funziona.md](come-funziona.md), «Marca e modello»). L'inventario ora ha le stesse tre cose come **campi standard dell'articolo** (`inventory_item.brand` e `model`, testo libero fino a 200 caratteri, spazi tolti, vuoto = niente; non sono parametri di un tipo). Servono a distinguere «Cuscinetto SKF 6204» da «Cuscinetto NSK 6204», che per il team sono due cose diverse.

- **Cos'è un articolo.** Uno è il trio **nome + marca + modello**, senza badare alle maiuscole, e **una marca o un modello mancanti contano come vuoti**: «Bearing» senza altro è un articolo, «Bearing · SKF · 6204» un altro. Prima era il solo nome. L'indice unico è `inventory_item_identity_uq` (`lower(name)`, `lower(coalesce(brand,''))`, `lower(coalesce(model,''))`). Il **codice** resta unico per conto suo. Chi crea o cambia un articolo uguale a un altro nei tre campi riceve **409** e il nome completo di quello con cui si scontra; cambiando un articolo si controlla il trio che ne verrebbe, non i campi mandati.
- **Dove si vedono.** L'elenco INVENTORY ha le colonne **ITEM, BRAND, MODEL** (ordinabili, nel Download), la ricerca li trova, il modulo dell'articolo ha le tre caselle (la prima si chiama «Item»), e la testata dell'articolo e del componente li mostra sotto il titolo. Dove si **sceglie** un articolo (Receive, parte di un componente) la voce è «nome · marca · modello». Dove l'articolo è solo **letto** dal motore di calcolo (le righe della distinta, cosa manca a una produzione) il suo nome è lo stesso «nome · marca · modello»: `itemInput` in `inventory.data.ts` dà al motore l'etichetta intera (`itemLabel`), e il motore, che non fa che mostrarla, non cambia. Gli articoli sono ordinati per l'etichetta.
- **Da PENDING allo scaffale.** Le righe di PENDING hanno le colonne BRAND e MODEL (`PendingLine.brand` e `model`, dalla riga del budget). Il modulo **Receive** parte dalla riga:
  - per **un articolo nuovo** (A new item) Item, Brand e Model sono già scritti con quelli della riga, e si possono correggere;
  - per **un articolo che c'è già** (An item already in the inventory) il suggerimento è quello con lo **stesso trio**, e se non c'è, **l'unico che ha lo stesso nome**; se i candidati sono due o più e nessuno è quello esatto, non suggerisce niente (`listPending`);
  - quando si riceve su un articolo esistente che **non ha marca o modello**, li prende dalla riga (`takeMakeFromLine`): **mai al posto di quello che c'è già scritto**, e solo se l'articolo non diventerebbe uguale a un altro (allora resta com'è). Un arrivo fuori dal budget non ha una riga da cui prenderli.
- **Gli articoli che c'erano.** La migrazione `0038_inventory_item_brand_model.sql` mette a tutti **`TBD`** come marca e modello, perché li si cambi a mano (decisione del team, 23 novembre 2026). Un `TBD` non è «vuoto»: non lo riempie un arrivo, va cambiato dal modulo dell'articolo. Nel database di sviluppo erano 35 articoli; la modifica è nello storico come ogni altra.
- **Fuori da questo lavoro:** il budget non cambia; i parametri dei tipi restano com'erano; l'import e le schede di riga non lo toccano.
- **Prove:** 11 nell'API (`inventory.routes.test.ts`: il trio nel creare e nel cambiare, la distinta con l'etichetta intera, PENDING e Receive) e 1 nel motore (`pendingLines`), 2 nel sito (`inventory.test.ts`).
