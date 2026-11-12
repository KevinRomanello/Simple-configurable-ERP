# Tesoreria: «To pay», rendiconto e spese fuori budget

> **FILE DI LAVORO: si elimina a lavoro finito** (insieme alla sua riga in `docs/README.md`). Tiene il design, le decisioni e lo stato delle fasi, per riprendere il lavoro da qui in qualsiasi momento. Le cose che restano vanno nei documenti permanenti: [registro-di-cassa.md](registro-di-cassa.md), [stile-interfaccia.md](stile-interfaccia.md), [architettura.md](architettura.md), [schema-database.md](schema-database.md).

Nasce dal feedback della tesoreria (11 novembre 2026): tre richieste, che chiudono D9 e D10 di [da-decidere.md](da-decidere.md). Si fa in **più fasi** (§5), ognuna con il suo piano breve e il suo via.

## Stato e decisioni (aggiornato a ogni passo)

| Fase | Stato |
| --- | --- |
| 1. Treasury + TO PAY | **fatta e provata** (11 novembre 2026); documenti permanenti aggiornati |
| 2. FINANCIAL STATEMENT | **fatta e provata** (12 novembre 2026); documenti permanenti aggiornati |
| 3. Fuori budget (ambito per Voce, area derivata) | **fatta e provata** (12 novembre 2026); documenti permanenti: [spese-fuori-budget.md](spese-fuori-budget.md) |
| 4. Preventivo per Voce dell'area derivata | **rimandata** (12 novembre 2026: «ci pensiamo dopo»); le domande sono in [da-decidere.md](da-decidere.md), D13 |

**Decisioni prese:**
- **I nomi delle pagine nel menù sono in inglese** (12 novembre): **CASH REGISTER**, **TO PAY** e **FINANCIAL STATEMENT** (fase 2, fatta). Le parole *dentro* il registro restano quelle del foglio (Data, Descrizione, Voce…), come deciso il 10 novembre.
- **Il collegamento uscita ↔ riga copre netto + IVA** (a carico del team), non più solo il netto: «sì, assolutamente» (11 novembre). Un pagamento copre **prima il netto, poi l'IVA** (§2.4).
- Si parte dalla fase 1 con «più righe in un pagamento» incluso (§2.3).
- Il file di lavoro è questo; i documenti permanenti si aggiornano alla fine di ogni fase.

**Ancora aperte**: nessuna per le fasi fatte; restano le domande D11 e D12 di [da-decidere.md](da-decidere.md) e la fase 4 (il preventivo per Voce). Le decisioni 3, 4 e 5 le ha chiuse il «sì» del 12 novembre: ambito per Voce come in §4.1, area **ADMINISTRATION**, solo ACTUAL.

### Fase 3: fatta (12 novembre 2026)
- [x] Dati: `cash_category.scope` e `area.derived` (migrazione `0024`, con i valori di partenza sulle Voci che ci sono), la riga dell'area in `seedBase`.
- [x] Calcolo: `outsideBudget` (righe per Voce e mese, progetti per sezione del rendiconto, entrate come «money in»), `sectionsOfVoci`, la riga «register» in `moneyIn`; 11 prove.
- [x] API: `loadOutsideBudget` nello snapshot (tutte le viste la vedono), l'ambito nell'elenco delle Voci, il filtro di «Payments to tie to a line», `createProject` rifiutato sull'area derivata; 16 prove con le mutazioni.
- [x] Sito: la colonna COUNTS in Settings, la riga «outside the budget» in Money in, l'area tolta da menù, Users e tipi di articolo. **La pagina dell'area** (griglia di sola lettura) la prima versione ce l'aveva: **tolta su richiesta** (c'è il registro); l'area resta una riga dei totali.
- [x] Giro nel browser sui dati di sviluppo (sola lettura): l'area, YEAR TOTAL con le entrate, Settings.
- **Differenze dal design:** il progetto per sezione usa il rendiconto (e un progetto «Voci not in the statement» per le Voci che il rendiconto non ha); un mese con più entrate che uscite su una Voce è «money in», non una riga negativa; il «money in» di una stagione conta solo ciò che viene dopo il giorno del BANK (il resto è già nel BANK).

### Fase 2: fatta (12 novembre 2026)
- [x] Calcolo: `financialStatement` e `statementIssues` (`packages/calc/src/statement.ts`, 11 prove).
- [x] La struttura del foglio nella funzione-API `getStatementLayout` (hardcode, riga 9 del registro); `GET /api/cash/statement?year=`; 10 prove sull'API (anche i permessi e ogni difetto).
- [x] Prova di uguaglianza con il foglio vero (`tools/import-xlsx/src/statement.test.ts`): tutte le righe, etichetta e due colonne, al centesimo. Si salta se `fonti/` manca.
- [x] Sito: pagina **FINANCIAL STATEMENT** nel gruppo Treasury, anno solare, il pulsante **Things to check (n)** con i difetti spiegati e gli importi dell'anno, il triangolo sulle righe interessate, Download (Excel/PDF della tabella).
- [x] Giro nel browser sui dati di sviluppo (sola lettura).
- [x] Documenti permanenti: registro-di-cassa (§5.5, §6, §7, §9), hardcoded-registry (riga 9), stile-interfaccia, architettura, collaudo, avvio, da-decidere (D11).
- **Decisioni prese dal lavoro** (da confermare con la tesoreria, D11): il rendiconto è **uguale al foglio, difetti compresi** (la proposta del §3.2 di contare il Paypal ovunque non è stata fatta: i difetti si dichiarano, non si correggono); la regola del foglio vale per nome di Voce; l'**Excel è quello della tabella** (valori), non il file identico al foglio con le formule; i testi del riquadro sono in inglese, come il sito; colore e bordi del foglio non si copiano (una cella è colorata di blu a caso).
- **Trovato in più** (rispetto al §3.2): il quinto difetto, «4.4 da università» non è nella somma della sezione 4 (che somma 4.1+4.2+4.3); e la colonna senza segno nasconde i segni inattesi. Con i dati veri del 2026 il riquadro trova: 1 movimento senza Voce, 40 movimenti sulla Voce 9.5 e 2 sulla 9.4 (non contati), una sezione 9 dentro l'8 e una riga di costo con il segno positivo.
- **Non fatto** (rispetto al design): il riquadro «Non nel rendiconto» è diventato il pulsante «Things to check»; la freccia di ogni riga verso il registro filtrato per Voce e anno non c'è.

### Fase 1: fatta (11 novembre 2026)
- [x] Calcolo: il pagamento copre il netto e poi l'IVA; l'IVA già pagata non si conta di nuovo; `toPayLines`; prove (`payments.test.ts`, `toPay.test.ts`).
- [x] API: il collegamento con netto + IVA, `GET /cash/to-pay`, `POST /cash/to-pay/pay` (anche più righe), `GET /cash/to-link`, le Voci di default; prove.
- [x] «Voce di default» per categoria (`category.default_voce_id`, migrazione `0023`).
- [x] Sito: gruppo **Treasury**, pagina **TO PAY** (tabella, modulo Pay sopra la tabella, più righe, «Payments to tie to a line»), il pannello «Link to budget lines» con netto + IVA, la Voce di default in Settings.
- [x] Giro nel browser con dati inventati (tolti per id, storico compreso).
- [x] Documenti permanenti: registro-di-cassa (§5.3, §5.4, §7, §8), stile-interfaccia, architettura, schema-database, collaudo, avvio, prezzo-lordo.
- Rinviato alla fase 3: filtrare «Payments to tie to a line» per ambito della Voce (oggi sono tutte le uscite della stagione non collegate; sono 68 sui dati veri).

## 0. In breve

| # | Richiesta | Cosa diventa | Si appoggia a |
| --- | --- | --- | --- |
| 1 | «Una schermata simile a PENDING con tutti gli ACTUAL non ancora pagati e il tasto per farli diventare una riga del registro» | la pagina **TO PAY** (§2): un'uscita del registro già compilata e già collegata alla riga | il collegamento uscita ↔ riga che c'è già ([registro-di-cassa.md](registro-di-cassa.md), §5.3) |
| 2 | «Una pagina per le "voci di ricavocosto", uguale per motivi legali» | la pagina **FINANCIAL STATEMENT** (§3), con la stessa struttura del foglio e una prova che i numeri coincidono | il registro, non tocca il budget |
| 3 | «Le entrate e le uscite che non sono nel budget (imposta di bollo, quote associative) contate come una voce a parte, come un progetto, anche nei totali» | un'area **derivata** (§4, nome da decidere: ASD / Aziendale / Amministrativo) calcolata dal registro, che compare in budget, TOTAL, Gantt e analisi | un **ambito** per ogni Voce, e il collegamento di §2 |
| — | «Un gruppo a parte nel menù, chiamato Treasury» | **Treasury** con le tre pagine: CASH REGISTER, TO PAY, FINANCIAL STATEMENT (§1) | — |

## 1. Il gruppo «Treasury» del menù

Un gruppo a tendina come gli altri, visibile a chi gestisce i soldi del team (`canManageCash`: admin e pm con la spunta Treasury). Contiene **CASH REGISTER** (che lascia il gruppo Cash), **TO PAY** e **FINANCIAL STATEMENT**. L'ordine del menù diventa: Budget, Views, Cash, **Treasury**, Total, Inventory, Admin.

## 2. TO PAY (richiesta 1)

### 2.1 Cosa mostra
Le righe del budget in fase **ACTUAL** per cui il team deve ancora far uscire dei soldi: la quota pagata dal **fondo del team** (netto) più l'**IVA a carico del team**, meno quello che i pagamenti già collegati hanno coperto. Non ci sono: la fase EXPECTED; le righe pagate solo da uno sponsor (non escono soldi dal conto); quelle già pagate per intero; le righe dell'area derivata di §4.

### 2.2 La pagina (copia di PENDING)
Stessa forma di [PENDING](inventario.md): tabella ordinabile, riga che si apre sotto con il modulo, etichette di stato, vuoto = «Tutto quello che si è comprato è stato pagato».

| Colonna | Cosa dice |
| --- | --- |
| LINE | la voce, con la categoria sotto |
| PROJECT | il progetto, con l'area sotto |
| BOUGHT FROM | il fornitore |
| BOUGHT ON / DUE | la data d'acquisto (o «no date») e, per l'IVA, la sua scadenza |
| TO PAY | quanto manca, diviso in netto e IVA |
| PAID | quanto è già stato pagato |
| STATE | **Overdue** (la data è passata), **Due**, **Planned** (data futura), **Part paid** |
| | il pulsante **Pay** |

Filtri: la stagione scelta nel menù (con «All seasons», perché un pagamento in ritardo può riguardare una stagione passata), il fornitore, il progetto, la ricerca. Sul telefono a schede, come PENDING. Solo `canManageCash`.

### 2.3 Il pulsante Pay
Apre sotto la riga un modulo già compilato (come «Receive»):

- **Data**: oggi · **Conto**: Banca · **Metodo**: l'ultimo usato per quel fornitore · **Voce**: quella di default della categoria della riga (§2.5) · **Descrizione**: «fornitore — voce del budget» · **Importo**: quanto manca. Si può **scrivere meno** (pagamento a rate: la riga resta con il resto).
- **Salva** fa, in una sola transazione: crea l'uscita nel registro e la collega alla riga (con `insertEntry` e `setEntryLines`, già in uso). La riga esce dalla lista, o resta con il resto.
- **Più righe insieme**: caselle di selezione e «Pay selected» fanno **una** uscita (un solo bonifico per più voci dello stesso fornitore), con un collegamento per riga e l'importo della somma. Stessa tabella, stesso modulo.
- Per annullare si cancella il movimento nel registro: i collegamenti spariscono e la riga torna in lista.

### 2.4 Il cambio importante: il collegamento copre netto + IVA
Oggi un'uscita si collega alla **quota netta** del fondo del team; l'IVA resta a parte con la sua scadenza. Ma un fornitore si paga con **un bonifico lordo**, e col prezzo scritto con IVA ([prezzo-lordo.md](prezzo-lordo.md)) il lordo è proprio il numero della riga. Proposta: il collegamento copre **il totale a carico del team (netto + IVA)**.

- **Come si ripartisce:** un pagamento copre **prima il netto, poi l'IVA**. Esempio: riga 100,00 + 22,00 di IVA; pagati 122,00 → niente più da pagare; pagati 100,00 → il netto è a posto e restano 22,00 di IVA, che la riga continua a mostrare in TO PAY; pagati 60,00 → restano 40,00 di netto e 22,00 di IVA.
- **Nella previsione** (CASH FLOW, Gantt): una riga conta quello che manca di netto (alla data d'acquisto) e quello che manca di IVA (alla sua scadenza); l'IVA già pagata non si conta una seconda volta (oggi, pagando il lordo, la previsione la conterebbe due volte). Se la scadenza dell'IVA è passata e l'IVA non è stata pagata del tutto, conta dal giorno dopo il BANK, come il netto in ritardo.
- **I pagamenti si leggono sempre**, ma cambiano la previsione solo quando il BANK viene dal registro (come per il netto).
- **Funziona in tutti e due i modi di pagare:** lordo subito, o netto subito e IVA dopo (la seconda uscita è un altro collegamento della stessa riga).
- Il collegamento non è ancora in nessuna versione rilasciata: nessun dato da convertire.

### 2.5 Voce di default
La Voce del registro per un pagamento (serve al rendiconto, §3) si propone dalla **categoria** della riga: una colonna nuova in Settings, «Voce di default» per ogni categoria (per esempio Asset → «1.1 Attrezzature»). Senza, la Voce resta vuota e la tesoriera la sceglie.

### 2.6 La lista gemella: «Movimenti da collegare»
In fondo alla stessa pagina: le **uscite del registro che non pagano nessuna riga** e la cui Voce è «di progetto» (§4.1). Servono per i pagamenti già fatti a mano o importati dal foglio: da ognuna, **Link** apre il pannello delle righe che già c'è. Chiude il cerchio: budget → da pagare → registro → collegato.

### 2.7 API
`GET /api/cash/to-pay` (con `?allSeasons=1`) · `POST /api/cash/to-pay/pay` con `{ lines: [{ lineId, amount }], on, account, methodId, categoryId, description }` · `GET /api/cash/to-link`. Il calcolo `payableLines` in `packages/calc` come `pendingLines`; la scrittura in `cash-links.service`. Stagione in sola lettura: `409`.

### 2.8 Casi limite
Riga senza data d'acquisto (compare con «no date», senza stato); riga senza fondo (niente da pagare); prezzo cambiato dopo un pagamento: se i pagamenti superano il dovuto la riga è **«overpaid»** in rosso, senza bloccare; riga cancellata: i collegamenti spariscono con lei.

## 3. FINANCIAL STATEMENT (richiesta 2)

### 3.1 Cosa c'è nel foglio
Il foglio «voci di ricavocosto» è un rendiconto per cassa con due parti, **RICAVI** e **COSTI**, e in fondo l'**avanzo o disavanzo di gestione**. Le righe sono fisse (la struttura è in appendice, §A); le colonne sono la **descrizione**, un importo con il segno e, accanto, lo stesso **in valore assoluto** («importi parziali»), con l'anno scritto in testa. Per ogni riga che è una Voce, la formula è sempre la stessa:

> importo = (entrate di Cassa + Banca + Paypal) − (uscite di Cassa + Banca + Paypal), dei movimenti con quella Voce

Le righe di sezione sommano le loro righe; **TOTALE RICAVI** = attività istituzionale (1+2+3+4+5) + attività commerciale (6) + altre entrate (7); **TOTALE COSTI** = le sezioni 1–8; **AVANZO** = totale ricavi − totale costi, sui valori assoluti.

### 3.2 Cosa ho trovato nel foglio (da decidere)
Leggendo le formule ci sono **quattro incongruenze**. Oggi non cambiano i numeri (controllato sui dati veri: nessun movimento Paypal sulle Voci interessate), ma potrebbero:

1. Tre righe (**1. QUOTE ASSOCIATIVE**, **1.2 Cancelleria**, **1.3 Materiale sportivo**) **non contano il Paypal**; tutte le altre sì.
2. La riga **«PRODUTTIVE MARGINALI (Eventi di raccolta fondi)»** ha una formula ma **non entra in nessun totale**, e non è fra le 48 Voci del registro: sembra il resto della descrizione della riga 5, andata a capo.
3. **«8. IMPOSTE E TASSE»** somma anche la riga **«9. IVA»**, che ha il numero di una sezione a sé: l'IVA finisce nei costi tramite l'8.
4. Le Voci **9.4 Pec aruba** e **9.5 saldo fattura** (già in D7) usate nel registro **non sono nel rendiconto**: i loro importi non compaiono da nessuna parte.

**Proposta**: la pagina conta il Paypal in tutte le righe e mostra la struttura del foglio così com'è; i punti 2–4 si riproducono (stesse righe, stessi totali) e li dichiara un riquadro **«Non nel rendiconto»** con gli importi che non ci stanno (Voci fuori elenco, movimenti senza Voce). Così **Σ rendiconto + Σ non nel rendiconto = Σ registro**, sempre. La scelta fra «uguale al foglio, difetti compresi» e «corretto» è della tesoreria e del commercialista: va chiesta (§6).

### 3.3 Come lo rendo uguale
- **La struttura è scritta una volta sola**, nella funzione-API `getRendicontoLayout` (un hardcode della regola 4, con la sua riga in [hardcoded-registry.md](hardcoded-registry.md)): righe, ordine, quali sommano quali. Pagina e Excel la leggono entrambe. Le Voci si abbinano **per nome**, senza badare a maiuscole e spazi, come fa il foglio.
- **Una prova di uguaglianza con il foglio vero**: un test (si salta se `fonti/` manca, come gli altri) legge il foglio «voci di ricavocosto» con i valori salvati, calcola il rendiconto dal registro importato e confronta **cella per cella** (colonna dell'importo con segno e colonna dei parziali). È lo stesso metodo di `pnpm reconcile` per il budget. Se un giorno il foglio e il sito divergono, il test dice in quale riga.
- Nessun dato reale nei file del repository: il test legge `fonti/`, la struttura sta nel codice.

### 3.4 La pagina
**FINANCIAL STATEMENT**, in Treasury: l'**anno solare** a scelta (di base il corrente), la tabella con le stesse righe del foglio (sezioni e totali in grassetto, i totali evidenziati), le due colonne di importi, la riga «avanzo o disavanzo» in fondo e il riquadro «Non nel rendiconto». Da ogni riga una freccia apre il **registro filtrato per quella Voce e per quell'anno**. **Download** Excel e PDF come ogni pagina; per l'Excel, se serve un file **identico al foglio** (stesse celle, formule comprese), è una domanda in §6.
API: `GET /api/cash/rendiconto?year=`. Solo `canManageCash`.

## 4. Le spese e le entrate fuori budget (richiesta 3)

### 4.1 La regola
Ogni **Voce** del registro ha un **ambito**, che si sceglie in Settings accanto a «Sponsorship by default»:

| Ambito | Significa | Esempi |
| --- | --- | --- |
| **Progetto** | una spesa di un progetto: deve essere collegata a una riga del budget | 1.1 Attrezzature, 1.4 Altro |
| **Fuori budget** | non è di un progetto: conta nell'area derivata | imposta di bollo, quote associative, assicurazioni, spese di conto |
| **Ignora** | non conta mai nel budget | l'IVA (il budget la tratta già), le sponsorizzazioni (sono già inflow) |

Un movimento conta come **fuori budget** quando la sua Voce è «fuori budget» **e non è collegato a nessuna riga**. Se è collegato, conta la riga (così non si somma due volte). Un movimento di una Voce «di progetto» non collegato **non conta** da nessuna parte e finisce nella lista «Movimenti da collegare» di §2.6: l'avviso c'è, ma i totali non si gonfiano. Un valore di partenza per le 48 Voci si propone per sezione e lo cambia la tesoreria.

### 4.2 Dove compare
Un'**area derivata**, con il nome che scegli (§6), nel gruppo Budget del menù, in sola lettura: *«Calcolata dal registro: per cambiare un importo si cambia il movimento»*. Dentro:

- un **progetto per sezione del rendiconto** (per esempio «8. IMPOSTE E TASSE», «1. QUOTE ASSOCIATIVE»);
- una **riga per Voce e per mese**, solo in fase **ACTUAL**, categoria **«Administration»**, pagata dal fondo del team, quantità 1, importo = somma dei movimenti, senza IVA (qui non si modella);
- le **entrate** fuori budget (le quote associative) come soldi in entrata della stessa area.

Le righe **non si salvano**: si calcolano a ogni lettura da registro, stagione (settembre–agosto, dalle date dei movimenti) e collegamenti, nello stesso punto in cui si carica lo snapshot ([tecnologie / architettura](architettura.md)). Il motore di calcolo non cambia: vede un'area, dei progetti e delle righe in più.

### 4.3 Cosa succede nelle viste

| Vista | Cosa si vede |
| --- | --- |
| Pagina dell'area derivata | la griglia di sola lettura, con un rimando al registro per ogni riga |
| SEASON / YEAR / CAR TOTAL | un blocco in più per l'area, con i suoi progetti; entra nei totali. Niente allarme di scostamento (non c'è un previsto) |
| Soldi in entrata dei TOTAL | le righe dell'area derivata, per Voce |
| Gantt | l'area e i progetti nei costi per mese; la categoria «Administration» nei blocchi per categoria |
| Analisi (per categoria, per fornitore) | la categoria «Administration»; nessun fornitore |
| CASH FLOW e tabella del Team's fund | **invariati**: le righe derivate hanno data passata rispetto al BANK, che è già nel BANK |
| PENDING (inventario) e TO PAY | **escluse** (non c'è niente da ricevere né da pagare) |

### 4.4 I dati
Una colonna `cash_category.scope` (progetto / fuori budget / ignora) e una colonna `area.derived` con la riga dell'area derivata (migrazione); nessuna tabella nuova per le righe, che non si salvano. L'area derivata non compare dove si assegnano le aree (Users, tipi dell'inventario) e non ha «Add item».

### 4.5 Rischi e come li tengo
- **Doppio conteggio**: una spesa di progetto pagata e non collegata potrebbe contare nell'area derivata *e* nella riga del budget. L'ambito per Voce e il collegamento lo evitano; la lista «da collegare» lo mostra.
- **Il primo giorno** il registro importato ha centinaia di movimenti, tutti non collegati. Quelli di Voci «fuori budget» entrano nell'area derivata; quelli di Voci «di progetto» restano da collegare e **non cambiano il budget**.
- **Un solo lato**: l'area derivata ha solo ACTUAL. Un **preventivo per Voce** (previsto di un anno, per esempio per le assicurazioni) è una fase successiva (§5).

## 5. L'ordine di lavoro, a più riprese

1. **Fase 1 – Treasury e TO PAY**: il gruppo del menù, la pagina, il modulo (anche più righe), il collegamento con l'IVA (§2.4), la Voce di default per categoria, «Movimenti da collegare» (la parte dell'ambito per Voce si accende nella fase 3).
2. **Fase 2 – FINANCIAL STATEMENT**: la funzione con la struttura, la pagina, il riquadro «Non nel rendiconto», l'Excel e la prova di uguaglianza col foglio. Non dipende dalle altre.
3. **Fase 3 – Fuori budget**: l'ambito per Voce, l'area derivata, le viste e le entrate. Dipende dalla fase 1 (i collegamenti).
4. **Fase 4 (dopo)**: il preventivo per Voce dell'area derivata, e così il confronto previsto/reale.

Per ogni fase: un piano breve, il via, i test, il giro nel browser con dati inventati, i documenti.

## 6. Decisioni che servono

1. **Rendiconto**: uguale al foglio **difetti compresi** o corretto (Paypal in tutte le righe)? E per l'Excel: basta lo stesso schema di righe e colonne, o deve essere **identico cella per cella** (formule comprese)?
2. **Collegamento con l'IVA** (§2.4): la tesoriera paga i fornitori con **un bonifico lordo** o netto subito e IVA a parte?
3. **Ambito per Voce** (§4.1): va bene la regola «fuori budget e non collegato conta; progetto non collegato è da collegare; ignora mai»? Il valore di partenza lo propongo io.
4. **Nome dell'area derivata**: ASD, Aziendale o Amministrativo?
5. **Solo ACTUAL** per l'area derivata nella prima versione (il preventivo dopo)?
6. **Più righe in un pagamento** (§2.3) già nella fase 1?

## 7. Fuori

Lo stato patrimoniale («voci di stato patrimoniale»), i pagamenti dell'IVA collegati alle scadenze (F24), le fatture allegate, il preventivo per Voce (fase 4).

## A. Appendice: la struttura del foglio (generica, senza dati)

**RICAVI** · 1. QUOTE ASSOCIATIVE · 2. CONTRIBUTI DEGLI ASSOCIATI E DEI TESSERATI (2.1 da soci e tesserati, 2.2 da altre associazioni, 2.3 da altri) · 3. EROGAZIONI LIBERALI RICEVUTE (3.1 da soci, 3.2 da non soci) · 4. CONTRIBUTI DA ENTI PUBBLICI (4.1 comune, provincia, regione, stato; 4.2 Comunità europea; 4.3 5 per mille; 4.4 università) · 5. ENTRATE DA ATTIVITÀ COMMERCIALI e «PRODUTTIVE MARGINALI (Eventi di raccolta fondi)» · **TOTALE RICAVI DA ATTIVITÀ ISTITUZIONALE** (1+2+3+4+5) · 6. ENTRATE COMMERCIALI da attività accessoria (6.1 pubblicità e sponsorizzazioni, 6.2 attività verso non associati, 6.3 altro/rimborsi) · **TOTALE RICAVI DA ATTIVITÀ COMMERCIALE** · 7. ALTRE ENTRATE (7.1 rendite patrimoniali, 7.2 rendite finanziarie, 7.3 cambi attivi) · **TOTALE RICAVI**.

**COSTI** · 1. ACQUISTO DI BENI E DI MERCI (1.1 attrezzature, 1.2 cancelleria, 1.3 materiale sportivo, 1.4 altro) · 2. ACQUISTO DI SERVIZI (2.1 assicurazioni, 2.2 servizi informatici, 2.3 spese postali, 2.4 consulenze e servizi contabili, 2.5 altri) · 3. UTENZE (3.1 luce, 3.2 acqua, 3.3 gas, 3.4 altre) · 4. GODIMENTO BENI DI TERZI (4.1 affitti, 4.2 noleggi, 4.3 altri) · 5. AFFILIAZIONI E TESSERAMENTI (5.1, 5.2) · 6. COSTI PER COLLABORATORI (6.1, 6.2, 6.3) · 7. COSTI BANCARI (7.1 commissioni e spese di conto, 7.2 altri) · 8. IMPOSTE E TASSE (8.1 IRES/IRAP, 8.2 imposta di bollo, 8.3 dazi doganali, e «9. IVA» con 9.1 IVA a credito, 9.2 IVA a debito, 9.3 liquidazione IVA) · **TOTALE COSTI** (1+2+3+4+5+6+7+8) · **AVANZO O DISAVANZO DI GESTIONE**.
