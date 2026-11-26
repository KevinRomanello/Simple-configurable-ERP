# Le cinque domande sui moduli, spiegate

**26 novembre 2026.** Sono le domande aperte dell'architettura a moduli ([moduli-architettura.md](moduli-architettura.md), §14): scelte che spettano all'utente prima di cominciare la fase G. Per ognuna:
- che cosa vuol dire, con un esempio;
- le strade possibili, con i pro e i contro;
- cosa cambia per chi usa il sito;
- la proposta.

Gli esempi usano dati inventati.

**In breve:**

**Decise dall'utente lo stesso giorno**: le decisioni sono nell'ultima colonna e scritte nell'ADR-2 ([moduli-architettura.md](moduli-architettura.md), §14). Qui sotto resta la spiegazione, per chi vuole capire perché.

| # | Domanda | Proposta | Si vede nel sito? | **Decisione** |
| --- | --- | --- | --- | --- |
| 1 | I cinque legami fra moduli: tabelle dei ponti o colonne lasciate dove sono? | tabelle dei ponti | no | **A, tabelle dei ponti** |
| 2 | Le spunte Treasury e Sponsors: tabella generica o due colonne? | tabella generica | solo in Users, e solo se si aggiunge una spunta nuova | **A, tabella generica** |
| 3 | Stagione nuova con il budget spento: si copia lo stesso? | sì | sì, quando si riaccende il budget | **A, sì** |
| 4 | Gli indirizzi dell'API: restano o cambiano? | restano, salvo che nessun servizio esterno li usi | no (solo per chi chiama l'API da fuori) | **B, ogni modulo sotto il suo nome** |
| 5 | La pagina iniziale: automatica o scelta? | automatica | sì, appena si entra | **A, automatica** |

---

## 1. I cinque legami fra moduli: dove li tengo?

### Che cosa vuol dire

Un **legame** è un dato che collega una cosa di un modulo a una cosa di un altro. Oggi ce ne sono cinque, e ognuno è una **colonna dentro la tabella di uno dei due moduli**:

| Legame | Esempio | Dove sta oggi |
| --- | --- | --- |
| un arrivo dell'inventario viene da una riga del budget | «i 4 Brake pads arrivati il 3 marzo sono quelli comprati nella riga 412 del budget» | nella tabella dei **movimenti dell'inventario**, colonna `budget_line_id` |
| un movimento dell'inventario è per un progetto | «2 viti usate per il progetto Telaio» | nei movimenti dell'inventario, colonna `project_id` |
| un pezzo fatto dal team si produce per un progetto | «la staffa si fa per il progetto Sospensioni» | nella tabella dei **pezzi**, colonna `make_project_id` |
| un inflow atteso è arrivato con un movimento del registro | «lo Sponsor Alfa atteso a marzo è il bonifico del 5 marzo nel registro» | nella tabella degli **inflow** (budget), colonna `cash_entry_id` |
| una categoria del budget ha una Voce del registro di partenza | «Components si paga di solito con la Voce 5.2 Acquisti» | nella tabella delle **categorie** (nucleo), colonna `default_voce_id` |

Il problema: **la tabella dell'inventario «sa» del budget**, quella degli inflow «sa» del registro, e quella delle categorie, che è del nucleo, «sa» della tesoreria. Il nucleo deve sapere soltanto di sé.

### Strada A, la proposta: le tabelle dei ponti

Ogni legame esce dalla tabella del modulo e va in una **piccola tabella a sé**, che appartiene al ponte fra i due moduli. Per esempio:

```
receipt_line (del ponte inventario×budget)
  movimento 88  →  riga 412
  movimento 91  →  riga 415
```

La tabella dei movimenti dell'inventario non ha più nessuna colonna del budget.

| Pro | Contro |
| --- | --- |
| Ogni modulo ha **solo cose sue**: l'inventario si capisce, si prova e si cambia senza sapere che il budget esiste | **Cinque migrazioni**: ognuna crea la tabella, ci copia i dati e toglie la colonna. Sono piccole, ma vanno provate su una copia dei dati veri |
| Tutto ciò che riguarda il legame è in un posto solo (il ponte), compreso lo storico: «chi ha legato questo arrivo a questa riga» | Le letture che usavano la colonna fanno un passaggio in più (unire con la tabella del ponte). Le prestazioni non cambiano: sono tabelle piccole con l'indice giusto |
| La prova automatica è semplice e forte: «le tabelle di un modulo puntano solo al nucleo» | Un po' più di lavoro nei passi G4 e G5 |
| Se un giorno l'inventario servisse senza budget (un altro reparto, un altro team), è già pronto | — |

### Strada B: lascio le colonne dove sono

Le colonne restano. Si stabilisce che **le legge e le scrive solo il codice del ponte**, e una prova lo controlla cercando i loro nomi nel codice.

| Pro | Contro |
| --- | --- |
| Nessuna migrazione dei dati | La tabella dell'inventario continua a contenere un dato del budget: **la separazione c'è nel codice ma non nei dati** |
| Meno lavoro | La prova è più debole: cerca un nome nel testo, e un modo diverso di scriverlo può sfuggirle |
| — | Con il budget spento, quelle colonne restano lì nelle tabelle degli altri (innocue, ma «sporche») |

### Cosa cambia per chi usa il sito

**Niente.** Le due strade funzionano uguale: PENDING, gli arrivi, il progetto dei movimenti, gli inflow ricevuti, la Voce di partenza. La differenza è tutta nell'ordine del codice e dei dati, cioè nella facilità di cambiarli dopo.

### La proposta

**A.** Hai chiesto di rendere l'app «super modulare»: con B la separazione sarebbe a metà, perché i dati resterebbero mescolati. Il costo in più è contenuto: cinque migrazioni piccole, nei passi in cui si sposta già quel codice.

---

## 2. Le spunte Treasury e Sponsors: come le tengo?

### Che cosa vuol dire

Un **User** (`pm`) può avere due spunte, in **Users**:
- **Treasury** gli fa tenere il registro di cassa;
- **Sponsors** gli fa tenere gli sponsor (CASH FROM).

Oggi sono **due colonne fisse nella tabella degli utenti** (`treasury`, `sponsors`), e il nucleo sa che cosa vogliono dire.

Con i moduli:
- Treasury è della **tesoreria**: a tesoreria spenta, in Users non deve comparire;
- Sponsors è del **budget**.

### Strada A, la proposta: una tabella generica delle spunte

- **Una tabella del nucleo**, `user_flag`, dice «l'utente 7 ha la spunta treasury». Il nucleo non sa che cosa voglia dire.
- **Ogni modulo dichiara le sue spunte**: il nome («Treasury»), la spiegazione, chi può averle (solo gli User), e i permessi che danno.
- **La pagina Users mostra le spunte dei moduli accesi.** La migrazione copia le due colonne nella tabella nuova.

| Pro | Contro |
| --- | --- |
| **Una spunta nuova** (per esempio, un giorno, «Inventory: approves disposals» per chi approva gli smaltimenti) è **una dichiarazione nel suo modulo**, senza colonne nuove né cambi al nucleo | Una migrazione (piccola: copia due colonne) |
| Il nucleo resta ignaro dei moduli, che è la regola di tutta l'architettura | Il codice dei permessi legge un elenco di spunte invece di due colonne |
| Spento un modulo, le sue spunte spariscono da Users senza codice apposta; riaccendendolo tornano com'erano | — |

### Strada B: restano le due colonne

| Pro | Contro |
| --- | --- |
| Niente migrazione | Il nucleo deve sapere che «treasury» è della tesoreria e «sponsors» del budget, per nasconderle a modulo spento: **il nucleo conosce i moduli**, contro la regola |
| — | Ogni spunta nuova richiede una colonna nuova e un cambio nel nucleo |

### Cosa cambia per chi usa il sito

**Oggi niente**: Users mostra le stesse due spunte, al loro posto. Con un modulo spento la sua spunta sparisce (con tutte e due le strade). La differenza si vede **il giorno in cui serve una spunta nuova**: con A è una riga, con B un piccolo lavoro che tocca il nucleo.

### La proposta

**A.** È lo stesso principio delle «API come funzioni»: ogni modulo porta le sue cose, il nucleo le raccoglie senza conoscerle.

---

## 3. Stagione nuova con il budget spento: si copia lo stesso?

### Che cosa vuol dire

Quando si crea una stagione nuova (Settings, «New season»), oggi il sito la prepara partendo dalla precedente:
- **gli stessi progetti**, vuoti;
- **gli stessi sponsor**, senza i soldi;
- **il «Team's fund»**, il fondo del team ([stagioni-anni-fiscali-e-macchine.md](stagioni-anni-fiscali-e-macchine.md)).

Con i moduli:
- la **stagione** è del nucleo, perché la usano tutti: l'inventario per le statistiche per macchina, il menù per il selettore;
- **progetti e sponsor** sono del budget.

Quindi il nucleo crea la stagione e **avvisa** («è nata la stagione 2027-28, dalla 2026-27»), e il budget prepara le sue cose.

La domanda è: **se in quel momento il budget è spento, l'avviso gli arriva lo stesso?**

### Esempio

1. A luglio il budget è spento (si sta lavorando solo su inventario e registro).
2. Si crea la stagione 2027-28.
3. A settembre si riaccende il budget.

| | Strada A: il budget prepara lo stesso (proposta) | Strada B: il budget spento non fa niente |
| --- | --- | --- |
| Cosa si trova a settembre | la stagione 2027-28 con i suoi progetti, gli sponsor e il Team's fund, **come se il budget fosse sempre stato acceso** | la stagione 2027-28 **senza progetti, senza sponsor e senza Team's fund** |
| Cosa bisogna fare | niente | ricreare progetti e sponsor a mano, e il Team's fund. Senza il Team's fund le righe pagate dal team non hanno un fondo. Servirebbe un pulsante «prepara adesso» apposta |

### La regola generale dietro la domanda

Ci sono due tipi di avvisi:
- **Funzionalità**: mostrare, calcolare, mandare un webhook. Vanno **solo ai moduli accesi**.
- **Manutenzione dei dati**: tenere coerenti i dati anche di un modulo che dorme. Vanno **a tutti**. Sono due:
  - **la rinomina** di una categoria: il testo nelle righe del budget va aggiornato anche a budget spento, altrimenti riaccendendolo le righe avrebbero una categoria che non esiste più;
  - **la stagione nuova**: è quello che chiede questa domanda.

### La proposta

**A.** Spento vuol dire «nascosto e fermo», non «dimenticato». Riaccendendo, un modulo deve trovare i suoi dati in ordine, come se non fosse mai stato spento.

---

## 4. Gli indirizzi dell'API: restano o cambiano?

### Che cosa vuol dire

Il sito chiede i dati al server con degli indirizzi. Oggi sono nati un po' alla volta e non dicono di che modulo sono:

| Indirizzo di oggi | Di chi è con i moduli |
| --- | --- |
| `/api/lines`, `/api/projects`, `/api/funds`, `/api/bank` | budget |
| `/api/cash/entries`, `/api/cash/register` | tesoreria |
| `/api/cash/to-pay` | ponte tesoreria×budget (anche se comincia con `cash`) |
| `/api/inflows` | budget; ma `/api/inflows/:id/receive` è del ponte tesoreria×budget |
| `/api/inventory/items` | inventario; ma `/api/inventory/pending` è del ponte inventario×budget |
| `/api/registry/…` | anagrafiche (questi sono già ordinati) |

Spento un modulo, il server deve rispondere «non c'è» (404) ai suoi indirizzi. Per farlo, ogni modulo deve dire quali sono i suoi.

### Strada A, la proposta: restano quelli di oggi

Ogni modulo e ogni ponte dichiara **l'elenco dei suoi indirizzi di oggi**. Gli unici indirizzi da cambiare sono i pochi «misti»: per esempio il ricevere da una riga del budget, che oggi passa da `/api/inventory/receive` insieme agli arrivi fuori budget, si stacca in un indirizzo del ponte.

| Pro | Contro |
| --- | --- |
| **Non si rompe niente** fuori dal sito: i flussi di n8n, gli script, i token dei servizi | Gli indirizzi non dicono di che modulo sono: per saperlo bisogna guardare il suo elenco |
| Pochi cambi | Gli elenchi vanno tenuti con cura. Una prova automatica controlla che ogni indirizzo abbia un solo proprietario |

### Strada B: ogni modulo sotto il suo nome

Tutti gli indirizzi cambiano così: `/api/budget/lines`, `/api/treasury/entries`, `/api/inventory/items`, `/api/treasury-budget/to-pay`…

| Pro | Contro |
| --- | --- |
| Ordinato: dall'indirizzo si capisce il modulo, e «spento» vale per tutto ciò che comincia con quel nome | **Chi chiama l'API da fuori va cambiato**: un flusso di n8n o uno script che scrive nel budget smette di funzionare finché non si aggiorna |
| Gli elenchi non servono più | Tutte le chiamate del sito cambiano. Sono in un posto solo, quindi è lavoro meccanico, insieme ai test e ai documenti che citano gli indirizzi |

### Cosa cambia per chi usa il sito

**Niente**, con tutte e due: il sito si aggiorna insieme al server. Cambia solo per **chi usa l'API da fuori**. Le anagrafiche (`/api/registry/…`, `/ext/…`, i moduli pubblici `/forms/…`), che sono quelle che usa n8n, **restano come sono in tutte e due le strade**.

### La proposta

**A**, a meno che nessuno usi da fuori gli indirizzi di budget, tesoreria e inventario. **Se oggi n8n o altri script toccano solo le anagrafiche, B costa poco** e si può fare nello stesso passo in cui si divide il sito (G7). Per scegliere, la domanda vera è: **qualcosa fuori dall'ERP chiama oggi gli indirizzi di budget, tesoreria o inventario?**

---

## 5. La pagina iniziale

### Che cosa vuol dire

Entrando nel sito (indirizzo `/`), oggi si finisce **sempre** sul budget dell'area **MT-DMT**: è scritto nel codice (`App.tsx`: `/budget/mt-dmt`).
- Con il budget spento, quella pagina non esiste più: serve un'altra regola.
- Già oggi non è il massimo: un User dell'area HW, o chi fa la tesoreria, atterra sempre su MT-DMT.

### Le strade

| | Cosa succede entrando | Pro | Contro |
| --- | --- | --- | --- |
| **A. Automatica (proposta)** | la prima pagina del primo modulo acceso, nell'ordine budget → inventario → tesoreria → anagrafiche; spento tutto, Settings | nessuna scelta da fare; funziona da sola con qualsiasi combinazione | tutti atterrano sullo stesso posto (come oggi) |
| **B. Scelta dall'admin** in Settings › App | la pagina scelta dall'admin, per tutti | l'admin decide | un'impostazione in più; se la pagina scelta è di un modulo spento, si torna alla regola A |
| **C. Scelta da ognuno** (o «l'ultima pagina in cui ero») | la propria pagina | ognuno atterra dove lavora: chi fa la tesoreria sul registro, il pm di HW sul budget di HW | un'impostazione per persona; anche qui serve la regola A di riserva |

Con A, la **prima pagina del budget** resta l'area MT-DMT? Proposta: la prima area dell'elenco (la stessa che il menù mostra in cima), non più un'area scritta nel codice. Oggi la prima è proprio MT-DMT, quindi non cambia niente.

### La proposta

**A adesso**, perché è necessaria comunque come riserva e non chiede niente a nessuno. **C più avanti**, se serve: è un'aggiunta sopra A, non la sostituisce.
