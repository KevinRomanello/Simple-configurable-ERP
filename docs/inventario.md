# Inventario

**Stato: fasi I1–I4 fatte** (21 ottobre 2026): arrivi dal budget e fuori budget, articoli con immagine e campi per categoria, movimenti, componenti con distinta dei materiali e costo nel tempo, statistiche. **Fuori, per dopo**: pezzi singoli con matricola e QR, produzione reale col costo FIFO, caricamento di un inventario esistente, scorta minima (§12).

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

- **Dal budget.** La pagina **PENDING** elenca ciò che è stato comprato e non è arrivato, dal più vecchio, con giorni d'attesa e arrivo previsto. "Receive" apre un modulo già compilato (nome, categoria, quantità ancora da arrivare): scegli dove metterlo e quanti pezzi sono arrivati. **L'arrivo può essere parziale**: la voce resta in PENDING con la quantità che manca. Il modulo propone l'articolo già creato con gli arrivi precedenti della stessa voce, o uno con lo stesso nome. I prezzi (netto, con IVA, costo per il team) e il progetto vengono dal budget. Non si può ricevere più di quanto comprato (409); due arrivi simultanei non possono prendersi gli stessi pezzi.
- **Fuori budget.** "Add goods" nella pagina INVENTORY: un acquisto fatto a parte, un regalo, qualcosa che c'era già. Prezzo netto e IVA a mano (o "a gift": il valore è registrato, il costo per il team è zero), progetto facoltativo.
- Se la voce del budget viene cancellata dopo l'arrivo, il carico resta (il legame con la voce si perde, il resto no).

## 3. Decisione: la data di arrivo del consuntivo resta digitata a mano

Nella griglia del budget, la colonna **ARRIVAL DATE** del consuntivo continua a essere una data **scritta a mano**, come nel foglio. **Non** viene ricavata dagli arrivi registrati e **non** influisce sullo stato (`pending`/`partial`/`arrived`), che dipende solo dalle quantità arrivate. È una scelta consapevole (21 ottobre 2026, su richiesta):

- si può trovare una voce "arrived" senza data di arrivo, o con una data diversa dal giorno in cui è stata registrata sullo scaffale: sono due informazioni diverse (quando il pacco è arrivato, secondo chi compila il budget; quando è stato messo in inventario);
- la pagina PENDING mostra come "previsto" la data di arrivo del consuntivo se c'è, altrimenti quella del preventivo;
- se un giorno si vorrà collegarle (data di arrivo = data dell'ultimo carico che completa la voce) si cambia `computeLines` in `packages/calc/src/lines.ts` e la colonna diventa di sola lettura; i dati attuali non cambierebbero (oggi nessuna voce ha una data di arrivo nel consuntivo).

## 4. Modello dati

| Tabella | Contenuto | Note |
| --- | --- | --- |
| `inventory_item` | articolo: nome (unico, senza maiuscole), codice (unico se c'è), categoria, unità, origine (`bought`/`made`), a cosa serve, codici di sicurezza, smaltimento, stoccaggio, manutenzione | l'origine non si cambia dopo; mai due articoli con lo stesso nome (l'errore dice quale) |
| `item_image` | immagine grande e miniatura, tipo | binaria: **non** nello storico |
| `stock_movement` | un movimento: articolo, tipo, giorno, quantità, luogo (codice + testo libero), destinazione (spostamenti), tre prezzi (solo carichi), progetto, voce di budget d'origine, nota | i vincoli sono nel database: quantità positiva (tranne un conteggio), prezzi solo sui carichi, destinazione solo sugli spostamenti |
| `component_part` | distinta: il componente, la parte, la quantità in un pezzo, una nota | una parte una volta sola; mai un componente dentro se stesso |

I movimenti: **receipt** (arrivo, +), **use** (uso, −, con progetto facoltativo), **transfer** (spostamento da un luogo a un altro), **adjustment** (conteggio: "ne ho contati 7", si registra la differenza), **disposal** (smaltimento, −). Nulla può uscire da un luogo che non ne contiene abbastanza (409); le richieste simultanee sullo stesso articolo si mettono in fila.

**Prezzi congelati.** Ogni arrivo salva tre prezzi **per unità**, in decimillesimi di euro: *netto* (prima dell'IVA), *lordo* (con IVA) e *costo per il team* (lordo meno lo sponsor, cioè l'`outflow` della voce; per uno sponsor totale resta l'IVA, come nel foglio, domanda Q1; zero per un regalo). Se il budget cambia dopo, i carichi già fatti non cambiano.

## 5. Le informazioni di un articolo

| Richiesto | Dove sta |
| --- | --- |
| prodotto con immagine | nome + `item_image` (§7) |
| a cosa serve | `purpose` |
| quantità | somma dei movimenti, per luogo |
| quantità comprate | somma degli arrivi (`boughtMilli`) |
| costo | prezzo di ogni arrivo; prezzo oggi, medio, in un giorno; valore sullo scaffale |
| dove si trova | luogo (sede / stanza, dall'elenco) + "dove esattamente" in testo libero ("scaffale 2, scatola rossa") |
| come smaltirlo | `disposal` |
| codici di sicurezza | `safetyCodes`: frasi H/P e numero UN dei materiali pericolosi, come sulla scheda di sicurezza |
| stoccaggio / mantenimento | `storageNotes`, `maintenanceNotes` |

**Facoltativi per categoria.** Nessun campo è obbligatorio, e il modulo mostra solo quelli utili alla categoria (la funzione `getCategoryFields`, hardcoded: [registro](hardcoded-registry.md)):

| Categoria | Campi mostrati oltre a nome, codice, categoria e unità |
| --- | --- |
| Manufacturing, Consumable | a cosa serve, **codici di sicurezza**, **smaltimento**, stoccaggio |
| Asset | a cosa serve, **manutenzione**, stoccaggio |
| Components, Logistic | a cosa serve, stoccaggio |
| Administration, Software, nessuna categoria | a cosa serve (e stoccaggio se senza categoria) |

Cambiando categoria i campi nascosti **non si cancellano**: restano nel database e ricompaiono tornando alla categoria. Il modulo manda solo i campi che mostra. Nella pagina dell'articolo i codici di sicurezza sono evidenziati.

## 6. Sedi e stanze (hardcoded per ora)

`listLocations()` ([lookups.service.ts](../apps/api/src/modules/lookups/lookups.service.ts)) restituisce due sedi con cinque stanze ciascuna ("Site 1 / Room 1"…), solo per avere qualcosa da scegliere. Nel database si salva il codice (`s1-r2`) e, a parte, un testo libero per il punto preciso. Diventerà la tabella `location`. Anche le unità (`pcs`, `set`, `box`, `m`, `kg`, `g`, `l`, `ml`) sono hardcoded (`listUnits()`).

## 7. Immagini

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

- **Costo di un pezzo** = somma di quantità × prezzo di ogni parte, nel giorno scelto; il prezzo di una parte che è a sua volta fatta da noi è il suo costo (ricorsione). L'arrotondamento è alla fine (decimillesimi), e la riga "totale" mostrata è la somma delle righe come appaiono, così quello che si vede torna.
- **Incompleto**: se una parte non è mai stata comprata, il costo somma il resto e il sito lo segnala (`!`, "some parts have never been bought"). Se nessuna parte ha un prezzo, non c'è costo.
- **Nel tempo**: il grafico dà il costo a fine di ogni mese dal primo acquisto di uno qualunque dei materiali (fino a 60 mesi). Esempio dei dati dimostrativi: la pedaliera costava 20,30 € a giugno e 22,48 € a settembre per i rincari di piastre e viti.
- **Nessun anello**: un componente non può contenere se stesso, nemmeno attraverso le parti delle parti (409 con il nome del colpevole). Le modifiche alle distinte si mettono in fila con un blocco unico (sono rare): senza, "A dentro B" e "B dentro A" fatti insieme passavano entrambi (la prova c'è nei test).
- Cancellando un componente se ne va la distinta, non le parti; un articolo usato in una distinta non si cancella.

## 10. Statistiche

`GET /api/inventory/stats?by=project|area|category|location&basis=…`:

| Colonna | Significato |
| --- | --- |
| Bought | merce **arrivata**, al prezzo di ogni arrivo |
| On its way | comprata dal budget e non ancora arrivata, al prezzo del budget |
| Used | uscita dallo scaffale **per un progetto**, al prezzo medio pagato fino ad allora |
| On the shelf | quanto c'è ora, al prezzo medio pagato |

Per progetto e area (dal progetto della voce di budget, o scelto a mano) non c'è la giacenza: lo scaffale non appartiene a un progetto. Per luogo c'è solo la giacenza. Il totale di "Bought" è lo stesso comunque si tagli (c'è un test).

## 11. Permessi, API, schermate

**Chi.** Guardare: tutti. Cambiare (articoli, arrivi, movimenti, immagini, distinte): **admin e pm** (`canManageInventory`), qualunque area; il viewer riceve 403 e non vede i comandi. Tutto finisce nello [storico](accesso-e-storico.md) (articoli, movimenti, distinte; non le immagini).

| Endpoint (prefisso `/api`) | Cosa fa |
| --- | --- |
| `GET/POST /inventory/items`, `GET/PATCH/DELETE /inventory/items/:id` | elenco con giacenza e prezzo (filtri: `search`, `category`, `origin`, `location`), dettaglio, creazione, modifica, eliminazione (solo se senza movimenti e non in una distinta) |
| `PUT/DELETE/GET /inventory/items/:id/image` | immagine (JSON base64; `?size=thumb|full`) |
| `GET /inventory/pending`, `POST /inventory/receive` | gli acquisti da ricevere; l'arrivo (dal budget con `lineId`, o fuori budget con `unitNet`) |
| `POST /inventory/movements` | uso, spostamento, conteggio (`counted`), smaltimento |
| `GET /inventory/components`, `GET /inventory/components/:id`, `POST/PATCH/DELETE …/parts` | componenti, distinta, costo e serie nel tempo |
| `GET /inventory/stats`, `GET /inventory/projects` | statistiche; i progetti della stagione (per i moduli) |
| `GET /lookups/locations`, `/units`, `/category-fields` | gli elenchi hardcoded |

Schermate (menu **Inventory**): **INVENTORY** (elenco con miniature, filtri, selettore prezzo, "Add goods"), pagina dell'articolo (immagine, informazioni, giacenze per luogo con "Use, move, count…", prezzi nel tempo, movimenti, "More arrived"), **PENDING**, **COMPONENTS** (+ pagina del componente con distinta, costo e grafico), **INVENTORY STATS**. Nel budget, la colonna di stato a sinistra mostra clessidra o spunta e in ACTUAL c'è la colonna **ARRIVED** con "pending 0/8", "partial 3/8", "arrived 8/8".

## 12. Cosa non c'è ancora

- **Pezzi singoli** con matricola e QR (Lidar, IMU…): per ora solo quantità.
- **Produzione reale** ("ne ho fatti 10": i materiali escono dallo scaffale e il costo si calcola col metodo FIFO, i più vecchi per primi): per ora la distinta serve a **stimare** il costo; un componente può avere giacenza solo con un conteggio.
- **Caricamento dell'inventario esistente**: non c'è un file da cui partire; gli articoli si aggiungono dal sito.
- **Scorta minima** e avviso di riordino: da fare.
- Un disegno Figma per queste schermate; sedi e stanze vere.

## 13. Dati dimostrativi

`pnpm db:seed-demo` aggiunge 14 articoli comprati e 3 fatti da noi (viti, resina e indurente con codici di sicurezza e smaltimento, alcool, batteria LiPo, utensili, cavo, una pedaliera fatta di una staffa fatta di piastre e viti…), con immagini generate, prezzi in date diverse, usi per progetto, uno spostamento, un conteggio e uno smaltimento. **Sono inventati**: nomi, prezzi e luoghi. Si riconoscono dal codice `DEMO-…`; `pnpm db:seed-demo -- --remove` li toglie; rilanciarlo non duplica. Non scrive nello storico (disattiva i trigger per la sua sessione) perché nessuno ha fatto davvero quelle modifiche. In Docker: `docker compose exec api pnpm db:seed-demo`.

## 14. Test

| Dove | Cosa prova |
| --- | --- |
| `packages/calc/src/inventory.test.ts` | giacenze (arrivi, usi, spostamenti, conteggi), prezzi (ultimo, medio pesato, per giorno, i tre tipi, valori enormi esatti), costo di componenti e sottoassiemi, costo nel tempo, parti mai comprate, anelli, stati dell'arrivo, PENDING, statistiche |
| `apps/api/src/modules/inventory/inventory.routes.test.ts` | articoli, arrivi dal budget (parziali, simultanei, oltre il comprato, voce cancellata dopo), arrivi fuori budget, movimenti (anche dodici richieste insieme sullo stesso articolo), prezzi nel tempo, immagini (formato vero, dimensioni, ETag), permessi, storico |
| `apps/api/src/modules/inventory/components.routes.test.ts` | costo, nel tempo, i tre prezzi, incompleto, anelli (anche con due richieste insieme), permessi, statistiche |
| `apps/web/src/lib/*.test.ts` | formattazione di prezzi e quantità, riduzione delle immagini, campi per categoria |
