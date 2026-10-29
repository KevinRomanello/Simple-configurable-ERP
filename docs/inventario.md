# Inventario

**Stato: fasi I1–I5 fatte** (I1–I4 il 21 ottobre 2026, I5 il 29): arrivi dal budget e fuori budget, articoli con immagine e campi per categoria, movimenti, componenti con distinta dei materiali e costo nel tempo, statistiche; poi **schede dati in PDF, infiammabile/tossico/cancerogeno, produzione e annullamento dei movimenti** (§15–§18). **Fuori, per dopo**: pezzi singoli con matricola e QR, costo FIFO a lotti, caricamento di un inventario esistente, scorta minima (§12).

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
| `inventory_item` | articolo: nome (unico, senza maiuscole), codice (unico se c'è), categoria, unità, origine (`bought`/`made`), a cosa serve, codici di sicurezza, smaltimento, stoccaggio, manutenzione, tre segni `flammable` / `toxic` / `carcinogenic` | l'origine non si cambia dopo; mai due articoli con lo stesso nome (l'errore dice quale) |
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
| a cosa serve | `purpose` |
| quantità | somma dei movimenti, per luogo |
| quantità comprate | somma degli arrivi (`boughtMilli`) |
| costo | prezzo di ogni arrivo; prezzo oggi, medio, in un giorno; valore sullo scaffale |
| dove si trova | luogo (sede / stanza, dall'elenco) + "dove esattamente" in testo libero ("scaffale 2, scatola rossa") |
| come smaltirlo | `disposal` |
| codici di sicurezza | `safetyCodes`: frasi H/P e numero UN dei materiali pericolosi, come sulla scheda di sicurezza |
| infiammabile, tossico, cancerogeno | tre caselle sull'articolo, **sempre** visibili (non dipendono dalla categoria) e filtrabili (§15) |
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

## 6. Sedi e stanze

`listLocations()` ([lookups.service.ts](../apps/api/src/modules/lookups/lookups.service.ts)) legge la tabella `location`: all'inizio due sedi con cinque stanze ciascuna ("Site 1 / Room 1"…), solo per avere qualcosa da scegliere; l'admin le aggiunge, rinomina, ordina e cancella dalla pagina **Settings** ([impostazioni.md](impostazioni.md)). Nel database del magazzino si salva il **codice** del posto (`s1-r2`), che non cambia mai, e a parte un testo libero per il punto preciso. Un posto usato da un movimento non si può cancellare.

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

- **Costo per farne uno adesso** = somma di quantità × prezzo di ogni parte, nel giorno scelto (è un calcolo **vivo**: cambia appena cambia il prezzo di una parte; i pezzi già fatti hanno un costo congelato, §16); il prezzo di una parte che è a sua volta fatta da noi è il suo costo (ricorsione). L'arrotondamento è alla fine (decimillesimi), e la riga "totale" mostrata è la somma delle righe come appaiono, così quello che si vede torna.
- **Incompleto**: se una parte non è mai stata comprata, il costo somma il resto e il sito lo segnala (`!`, "some parts have never been bought"). Se nessuna parte ha un prezzo, non c'è costo.
- **Nel tempo**: il grafico dà il costo a fine di ogni mese dal primo acquisto di uno qualunque dei materiali (fino a 60 mesi). **Passando il mouse su un mese** compare il costo e il **prezzo di ogni parte** in quel mese (con la quantità che entra in un pezzo); le parti che sono cambiate rispetto al mese prima sono segnate in rosso (▲ "was 0,70 €") o in verde (▼): si vede subito quale parte ha fatto salire il costo. Un sottoassieme vale il suo costo di quel mese. Esempio dei dati dimostrativi: la pedaliera costava 20,30 € a giugno e 22,48 € a settembre per i rincari di piastre e viti.
- **Nessun anello**: un componente non può contenere se stesso, nemmeno attraverso le parti delle parti (409 con il nome del colpevole). Le modifiche alle distinte si mettono in fila con un blocco unico (sono rare): senza, "A dentro B" e "B dentro A" fatti insieme passavano entrambi (la prova c'è nei test).
- Cancellando un componente se ne va la distinta, non le parti; un articolo usato in una distinta non si cancella.

## 10. Statistiche

`GET /api/inventory/stats?by=project|area|category|location&basis=…`:

| Colonna | Significato |
| --- | --- |
| Bought | merce **arrivata**, al prezzo di ogni arrivo (i pezzi **fatti da noi** non contano: non sono stati comprati) |
| On its way | comprata dal budget e non ancora arrivata, al prezzo del budget |
| Used | uscita dallo scaffale **per un progetto**, al prezzo medio pagato fino ad allora. Le **parti consumate da una produzione** contano come usate per il progetto della produzione; l'uso di un **pezzo fatto da noi non conta** (il suo costo è già nelle parti: niente doppio conteggio) |
| On the shelf | quanto c'è ora, al prezzo medio pagato |

Per progetto e area (dal progetto della voce di budget, o scelto a mano) non c'è la giacenza: lo scaffale non appartiene a un progetto. Per luogo c'è solo la giacenza. Il totale di "Bought" è lo stesso comunque si tagli (c'è un test).

## 11. Permessi, API, schermate

**Chi.** Guardare: tutti. Cambiare (articoli, arrivi, movimenti, immagini, distinte): **admin e pm** (`canManageInventory`), qualunque area; il viewer riceve 403 e non vede i comandi. Tutto finisce nello [storico](accesso-e-storico.md) (articoli, movimenti, distinte; non le immagini).

| Endpoint (prefisso `/api`) | Cosa fa |
| --- | --- |
| `GET/POST /inventory/items`, `GET/PATCH/DELETE /inventory/items/:id` | elenco con giacenza e prezzo (filtri: `search`, `category`, `origin`, `location`, `flammable`, `toxic`, `carcinogenic`), dettaglio, creazione, modifica, eliminazione (solo se senza movimenti e non in una distinta) |
| `PUT/DELETE/GET /inventory/items/:id/image` | immagine (JSON base64; `?size=thumb|full`) |
| `POST /inventory/items/:id/datasheets?name=…`, `GET/DELETE /inventory/datasheets/:id` | scheda dati: si invia il PDF **così com'è** (`Content-Type: application/pdf`, massimo 10 MB, deve iniziare con `%PDF-`); si legge un file alla volta |
| `POST /inventory/builds` | produzione: toglie le parti dallo scaffale (per il progetto scelto, obbligatorio) e aggiunge i pezzi fatti (§16) |
| `DELETE /inventory/movements/:id` | annulla un movimento (§18) |
| `GET /inventory/pending`, `POST /inventory/receive` | gli acquisti da ricevere; l'arrivo (dal budget con `lineId`, o fuori budget con `unitNet`) |
| `POST /inventory/movements` | uso, spostamento, conteggio (`counted`), smaltimento |
| `GET /inventory/components`, `GET /inventory/components/:id`, `POST/PATCH/DELETE …/parts` | componenti, distinta, costo e serie nel tempo |
| `GET /inventory/stats`, `GET /inventory/projects` | statistiche; i progetti della stagione (per i moduli) |
| `GET /lookups/locations`, `/units`, `/category-fields` | gli elenchi, che l'admin tiene dalla pagina Settings |

Schermate (menu **Inventory**): **INVENTORY** (elenco con miniature, filtri, selettore prezzo, "Add goods"), pagina dell'articolo (immagine, informazioni, giacenze per luogo con "Use, move, count…", prezzi nel tempo, movimenti con il pulsante **Undo**, "More arrived"), **PENDING**, **COMPONENTS** (+ pagina del componente con distinta, costo e grafico), **INVENTORY STATS**. Nel budget, la colonna di stato a sinistra mostra clessidra o spunta e in ACTUAL c'è la colonna **ARRIVED** con "pending 0/8", "partial 3/8", "arrived 8/8".

## 12. Cosa non c'è ancora

- **Pezzi singoli** con matricola e QR (Lidar, IMU…): per ora solo quantità.
- **Costo FIFO a lotti**: la produzione c'è (§16) ma prezza le parti col prezzo medio o l'ultimo (a scelta), non lotto per lotto "i più vecchi per primi".
- **Caricamento dell'inventario esistente**: non c'è un file da cui partire; gli articoli si aggiungono dal sito.
- **Modificare un movimento**: un movimento non si cambia, si **annulla** (§18) e si registra giusto (un prezzo sbagliato, una quantità, un luogo).
- **Scorta minima** e avviso di riordino: da fare.
- Un disegno Figma per queste schermate; sedi e stanze vere.

## 13. Dati dimostrativi

`pnpm db:seed-demo` aggiunge 14 articoli comprati e 3 fatti da noi (viti, resina e indurente con codici di sicurezza e smaltimento, alcool, batteria LiPo, utensili, cavo, una pedaliera fatta di una staffa fatta di piastre e viti…), con immagini generate, prezzi in date diverse, usi per progetto, uno spostamento, un conteggio e uno smaltimento. **Sono inventati**: nomi, prezzi e luoghi. Si riconoscono dal codice `DEMO-…`; `pnpm db:seed-demo -- --remove` li toglie; rilanciarlo non duplica. Non scrive nello storico (disattiva i trigger per la sua sessione) perché nessuno ha fatto davvero quelle modifiche. In Docker: `docker compose exec api pnpm db:seed-demo`.

## 14. Test

| Dove | Cosa prova |
| --- | --- |
| `packages/calc/src/inventory.test.ts` | raggruppamento per articolo (`byItem`), giacenze (arrivi, usi, spostamenti, conteggi), prezzi (ultimo, medio pesato, per giorno, i tre tipi, valori enormi esatti), costo di componenti e sottoassiemi, costo nel tempo **con il prezzo di ogni parte**, parti mai comprate, anelli, stati dell'arrivo, PENDING, statistiche |
| `apps/api/src/modules/inventory/inventory.routes.test.ts` | articoli, arrivi dal budget (parziali, simultanei, oltre il comprato, voce cancellata dopo), arrivi fuori budget, movimenti (anche dodici richieste insieme sullo stesso articolo), prezzi nel tempo, immagini (formato vero, dimensioni, ETag), permessi, storico |
| `apps/api/src/modules/inventory/components.routes.test.ts` | costo, nel tempo, i tre prezzi, incompleto, anelli (anche con due richieste insieme), permessi, statistiche |
| `apps/api/src/modules/inventory/datasheets.routes.test.ts` | PDF vero (primi byte), vuoto, troppo grande, nome obbligatorio; l'elenco non contiene i byte; lettura, cancellazione, a cascata con l'articolo; permessi; storico senza byte |
| `apps/api/src/modules/inventory/builds.routes.test.ts` | produzione: parti tolte, pezzi aggiunti col costo congelato, prezzi nuovi solo per le produzioni dopo, scorte insufficienti (nulla registrato), parte mai comprata, sottoassiemi, progetto obbligatorio e legame con le parti, nessun doppio conteggio, richieste simultanee, permessi |
| `apps/api/src/modules/inventory/undo.routes.test.ts` | annullare uso, arrivo (anche dal budget: la voce torna in PENDING), spostamento, conteggio, smaltimento; rifiuto se ciò che portava è già stato usato; produzione (parti indietro, pezzi via, una parte da sola no); storico; permessi; due richieste insieme (provato togliendo il blocco: il test fallisce) |
| `apps/api/src/modules/inventory/inventory.routes.test.ts` | (oltre a quanto sopra) filtri infiammabile/tossico/cancerogeno, anche insieme |
| `apps/web/src/lib/*.test.ts` | formattazione di prezzi, quantità e dimensioni dei file, riduzione delle immagini, campi per categoria, le tre caselle nel corpo inviato |

## 15. Schede dati (PDF) e pericolosità

**Schede dati.** Ogni articolo ha un elenco di PDF (la scheda tecnica, quella di sicurezza…): nome, dimensione, data e chi l'ha caricata. Dalla pagina dell'articolo, pannello **Data sheets**: il pulsante giallo "Add data sheet" apre il modulo (file + nome, proposto dal nome del file); il cestino toglie la scheda (admin e pm).

- **Si carica solo se ci clicchi.** L'elenco dell'articolo (`GET /inventory/items/:id`) porta solo i dati *sulla* scheda; i byte stanno in una tabella a parte (`item_datasheet_file`) e il nome è un semplice link (`<a href="/api/inventory/datasheets/7" target="_blank">`): il PDF viene scaricato **solo quando qualcuno lo apre**, in una scheda del browser. Nemmeno l'elenco degli articoli li tocca. Così 200 PDF da 5 MB non rallentano nessuna pagina.
- **Limiti e controlli.** Massimo 10 MB (`DATASHEET_LIMITS` in `inventory.schema.ts`; il browser lo controlla prima di inviare, il server lo ripete), file non vuoto, e **i primi byte devono essere `%PDF-`** (un file che si dichiara PDF e non lo è viene rifiutato). Il PDF viaggia come corpo grezzo `application/pdf`, con il nome nell'indirizzo: nessuna libreria in più, nessun base64 (+33%). Si serve con `Content-Disposition: inline`, `Content-Security-Policy: frame-ancestors 'none'` e `Cache-Control: private, max-age=3600`.
- Nello storico compare la riga della scheda (nome, dimensione, chi) e **mai i byte**.

**Infiammabile / tossico / cancerogeno.** Tre caselle nel modulo dell'articolo, sempre visibili e **non** legate alla categoria (un adesivo, un solvente e una vernice possono esserlo senza essere della stessa categoria). Si vedono come etichette rosse nella pagina dell'articolo e del componente, e come colonna **HAZARDS** nell'elenco. Nell'elenco tre caselle filtrano: **più caselle spuntate = tutte insieme** (infiammabile **e** tossico), non l'una o l'altra. I filtri sono anche nell'API (`?flammable=true&toxic=true`).

## 16. Produzione: «We made some»

Un componente (§9) ha una distinta, ma finché non si registra di averlo **fatto** è solo un calcolo. Dalla pagina del componente il pulsante giallo **We made some** apre il modulo:

| Campo | Significato |
| --- | --- |
| How many | quanti pezzi (anche decimali, per le unità che lo permettono) |
| Made on | il giorno (oggi se non si cambia) |
| For project | **obbligatorio**: il progetto per cui si fanno i pezzi; le parti prese dallo scaffale escono per lui |
| Take the parts from | **il luogo** da cui prendere le parti: dentro il luogo si prende da qualunque punto preciso, un punto dopo l'altro |
| Put the pieces in / Exactly | dove si mettono i pezzi fatti |
| Price of the parts | `average` (media pesata degli acquisti fino a quel giorno, predefinito) oppure `last` (ultimo acquisto) |

**Cosa succede, tutto in una volta o niente:**

1. per ogni parte della distinta si calcola `quantità in un pezzo × pezzi` (arrotondata al millesimo) e si toglie dallo scaffale **del luogo scelto** con un movimento `use` (nota: *Used to build 3 × nome*) **per il progetto scelto** e **legato alla produzione** (`built_by`): per questo non si annulla da solo (§18) e nelle statistiche per progetto e area conta come usato dal progetto;
2. si calcola il costo di un pezzo: per ogni parte il prezzo "da scaffale" a quel giorno, nei tre tipi (netto, lordo, costo per il team);
3. si aggiunge un movimento `build` sull'articolo fatto (con lo stesso progetto), con quei tre prezzi **congelati** nel movimento. Il pezzo finito, quando poi lo si usa, **non si conta una seconda volta** nelle statistiche: il suo costo è già nelle parti.

**Rifiuti (409, nulla viene registrato):** nel luogo scelto non ce n'è abbastanza di una parte (il messaggio dice quanto serve e quanto c'è: *22 pcs … (20 there)*); una parte non ha mai avuto un prezzo (*buy or receive it with a price before building*); l'articolo non è "fatto da noi" o non ha parti; il progetto manca o non esiste. Un **sottoassieme** si tratta come una parte qualunque: deve essere già stato fatto (e stare sullo scaffale) prima di fare ciò che lo contiene. Più produzioni insieme sugli stessi pezzi si mettono in fila (le righe si bloccano sempre nello stesso ordine, quindi non si incastrano).

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
