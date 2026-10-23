# Stile dell'interfaccia

Regola 6 di `CLAUDE.md`: le interfacce seguono gli stili definiti su Figma. Non si inventano colori, font, spaziature o componenti.

## Fonti

| File Figma | Chiave | Cosa contiene | Uso |
| --- | --- | --- | --- |
| **Telemetry App – Redesign ITA**, pagina "💎 Design System" (nodo `177:100`) | `cyhJAmbnzUe3Nq87ZLL4SQ` | Foundations (palette primitiva e a token, tipografia, spaziature, icone, immagini), componenti di prova in chiaro e in scuro, "Inspiration" | **Riferimento principale** dell'app |
| **New Website**, "Website: mobile" (nodo `636:3284`) | `TxAF4lxtv0HiHCxDZEqP9P` | Schermate mobile del sito del team (marketing) | Solo marchio: stesso giallo e nero, nessun componente per dati |

Le cartelle indicate dall'utente sono [354010286](https://www.figma.com/files/team/1170826409918235978/folder/354010286) e [70751470](https://www.figma.com/files/team/1170826409918235978/folder/70751470). Gli strumenti Figma lavorano su un file e su un nodo, non su una cartella: per leggere altro serve il link a quel file.

Lettura fatta il 20 ottobre 2026 con `get_design_context` e `get_screenshot` (`get_variable_defs` richiede una selezione nell'app Figma e non è stato usato).

## Token

Tutto vive in `apps/web/src/theme/tokens.css` come variabili CSS con i nomi Figma (`color/background/bg-weak` → `--bg-weak`). Nessun altro file scrive colori o misure. Modalità scura quando il sistema è in scuro; chiara altrimenti.

| Gruppo | Chiaro | Scuro |
| --- | --- | --- |
| primary strong / default / soft | `#c1cc00` / `#f3ff17` / `#fbffb2` | `#fbffb2` / `#f3ff17` / `#919900` |
| secondary strong / default / soft | `#002699` / `#0039e5` / `#99b2ff` | `#99b2ff` / `#3366ff` / `#0033cc` |
| background full / strong / sub / soft / weak / null | `#1a1a1a` / `#4d4d4d` / `#ccc` / `#e6e6e6` / `#f7f7f7` / `#fff` | `#e6e6e6` / `#b3b3b3` / `#4d4d4d` / `#333` / `#1a1a1a` / `#0d0d0d` |
| text strong / sub / soft / disabled / null | `#1a1a1a` / `#4d4d4d` / `#999` / `#ccc` / `#fff` | `#fff` / `#ccc` / `#999` / `#4d4d4d` / `#1a1a1a` |
| stroke full / strong / sub / soft / null | `#1a1a1a` / `#b3b3b3` / `#ccc` / `#f7f7f7` / `#fff` | `#fff` / `#808080` / `#4d4d4d` / `#333` / `#1a1a1a` |
| error strong / default / soft | `#b20000` / `#fa0000` / `#fcc` | `#fcc` / `#ff4d4d` / `#900` |
| warning strong / default / soft | `#b27400` / `#faa200` / `#ffe4b2` | `#ffe4b2` / `#ffae17` / `#996300` |
| success strong / default / soft | `#11883d` / `#16b651` / `#d2f9e0` | `#bbf7d1` / `#1bde63` / `#0e7133` |
| info strong / default / soft | `#075bab` / `#0a7ff0` / `#cee6fd` | `#b6d9fc` / `#238ef6` / `#064e93` |
| utility 1–6 (serie dei grafici) | `#00aeed` `#dc33ba` `#23bf00` `#f38200` `#e1ca00` `#d00000` | `#00f5f1` `#ff40d9` `#2fff00` `#ff8800` `#ffe500` `#fc0d0d` |

- **Spaziature** (`spaces/spacing`): 3xs 2 · 2xs 4 · xs 8 · s 12 · m 16 · l 24 · xl 32 · 2xl 40 · 3xl 56 · 4xl 80 · 5xl 112 px. **Raggi**: 3xs 2 px, full 999 px. **Dimensione** m: 16 px.
- **Tipografia**: Fira Code ovunque (Poppins compare solo nelle pagine di documentazione del file). Pesi Light 300, Retina 450, Bold 700; spaziatura −1%; Body: XL 17, Large 15, Medium 13, Small 11, XS 9 px, interlinea 140%; Label: 15, 13, 11, 9 px, maiuscolo, interlinea 128%; Button: Large 15, Small 13 px; Heading 2 = 19 px, Heading 3 = 15 px. Nell'app il testo base è Body Medium (13 px).
- **Icone**: Font Awesome Free "solid" (stessi nomi del file: `circle-info`, `trash`, `pen`, `plus`, `chevron-*`, …), a 12/16/24 px.
- **Componenti** del file: Button (pillola, `8px 16px`, nero con testo giallo in chiaro, giallo con testo scuro in scuro), Text Input (etichetta, bordo 1 px raggio 2 px, `4px 8px`, testo di aiuto con stato), Checkbox (20 px con quadrato di 16 px), Tooltip.

### Dove il file si contraddice

I colori della pagina "Color Palette [Token]" non coincidono del tutto con le variabili che usano i componenti. Seguo le variabili dei componenti:

| Token | Palette documentata | Variabile nei componenti (usata) |
| --- | --- | --- |
| `stroke.sub` chiaro | `#e6e6e6` | `#ccc` |
| `success.default` chiaro | `#19ce5c` | `#16b651` |

## Cosa non c'è su Figma

Nel file non esiste nessuna schermata dell'app: niente navigazione laterale, tabelle o griglie di dati, pagine di bilancio. La sezione "Inspiration" contiene solo riferimenti esterni. Quindi:

| Parte dell'interfaccia | Come l'ho fatta | Stato |
| --- | --- | --- |
| Pulsanti, campi, etichette, checkbox | come i componenti del file | da Figma |
| Colori, font, spaziature, icone | token e stili del file | da Figma |
| Navigazione laterale (voce attiva in giallo) | composta con i token | **da confermare**: non disegnata |
| Tabelle, griglia delle aree (AG Grid), riquadri dei totali, "chip" dei blocchi | composte con i token | **da confermare**: non disegnate |
| Grafici | colonne con i colori "Utility" | **da confermare**: non disegnati |
| Tutte le schermate dell'**inventario** (elenco con miniature, pagina dell'articolo, PENDING, componenti, statistiche), la colonna e l'icona di arrivo nel budget | composte con i token, i campi, i pulsanti e i grafici esistenti | **da confermare**: non disegnate; da rivedere con un disegno |
| Pagina CASH FROM (bottone giallo **New sponsor** che apre il form, tabella SPONSORS con soldi e data nella riga), colonne CASH FROM / ALSO FROM e icona di avviso "fondi insufficienti" nel budget | composti con i token, i campi, le tendine e le icone esistenti | **da confermare**: non disegnati; da rivedere con un disegno |
| Pagina di accesso, pagine **Users** e **History**, blocco utente in fondo al menu (nome, ruolo, uscita) | composte con i token, il pulsante e i campi del design system | **da confermare**: non disegnate; fatte per non bloccare il lavoro sull'accesso, vanno riviste con un disegno |
| Logo E-Agle | non ancora usato (file Figma: *Foundations → Images → E-Agle Logo*, nodo `509:5495`) | da fare |

Quando esistono frame per queste parti, si passano i link e si allinea il codice.

## Come si applica

1. I valori stanno solo in `theme/tokens.css`; i componenti usano `var(--…)`.
2. La griglia (AG Grid) prende il tema dagli stessi token (`theme/grid.ts`), così chiaro e scuro cambiano insieme; con `browserColorScheme: "inherit"` anche le sue barre di scorrimento seguono lo schema dell'app e sono uguali a quelle delle tabelle (AG Grid altrimenti le disegna chiare anche in modo scuro); sul Mac la barra orizzontale ha una fascia riservata in fondo, sotto i subtotali, e le icone della griglia hanno un suggerimento immediato nei colori del tema.
3. Le colonne della griglia del budget **si adattano al contenuto** (`autoSizeStrategy` e `suppressColumnVirtualisation` in `AreaPage.tsx`, larghezza minima dalla parola più lunga dell'intestazione in `areaColumns.tsx`; le intestazioni vanno a capo; imbottitura laterale delle celle ridotta in `theme/grid.ts`). Nelle tabelle semplici gli stessi principi: intestazioni che vanno a capo e campi larghi quanto serve (`.data-table` in `components.css`).
4. Se per ciò che si costruisce non c'è un riferimento su Figma, si chiede prima di improvvisare (regola 6).
5. **Ogni blocco di una pagina è un riquadro** (`.panel` in `theme/components.css`: bordo, riempimento, fondo `--bg-weak`; le tabelle al suo interno stanno sul fondo `--bg-null`), con uno spazio largo tra un riquadro e l'altro (`.main` e `.two-columns` usano `--space-xl`). Titolo, selettori (blocchi, prezzo, filtri), tabelle e grafici che parlano della stessa cosa stanno nello stesso riquadro; le schede riassuntive (`.cards`) e il titolo della pagina restano fuori. Un modulo per aggiungere qualcosa si apre da un bottone in alto, in un riquadro suo (esempio: **New sponsor**, **Add goods**).
6. **Il menù laterale si nasconde**: il pulsante con le due frecce in alto nel menù lo chiude e la pagina prende tutta la larghezza; un pulsante con le tre righe nell'angolo in alto a sinistra lo riapre (`Shell.tsx`, `.shell.collapsed` in `components.css`). La scelta resta nel browser di chi la fa (`localStorage`, chiave `erp.sidebar-hidden`); se il browser non la può salvare, il menù si vede sempre.
7. **Tabelle**: le celle si distinguono per una **linea verticale sottile** (`.data-table`, e le colonne della griglia con `columnBorder` in `theme/grid.ts`). Una colonna che **riassume la riga** (SUM PROJECT, FINAL ALL, LEFT VALUE, VALUE, OUTFLOW VARIANCE; nella griglia GRAND TOTAL e OUTFLOW) ha una **barra spessa** a sinistra e un fondo più scuro (classe `sum`). Nel Gantt la colonna del nome sta fissa a sinistra e quella di riepilogo fissa a destra (`frozen`, `sum-last`), così restano visibili scorrendo. Le due aree della griglia, EXPECTED e ACTUAL, sono divise da una **barra verticale** (`phase-start`), come i gruppi della tabella degli sponsor (`group-start`).
8. **Ordinare e cercare**: **l'ordinamento ha un'interfaccia sola, quella della tabella degli sponsor, in ogni tabella e nella griglia del budget**: si ordina cliccando sull'intestazione, che mostra il titolo e una **freccina** (grigia se la colonna non è quella ordinata, su o giù se lo è). Un clic in ordine crescente, il secondo in ordine decrescente, il terzo torna all'ordine originale; le celle vuote vanno sempre in fondo (in entrambe le direzioni), i numeri si ordinano come numeri, i testi senza badare alle maiuscole (e «Item 2» prima di «Item 10»). L'intestazione si disegna in un punto solo, `SortButton` in `components/SortTh.tsx`: `SortTh` la usa nelle tabelle HTML (la pagina dichiara per ogni colonna come leggere il valore, `SortAccessors`, e sostituisce `<th>` con `<SortTh sort={…} by="colonna">`; logica in `lib/sort.ts`) e `GridSortHeader` nella griglia (AG Grid ordina, ma non disegna la sua intestazione; la comparazione è la stessa, `gridCompare`). **Non ci sono altri modi di ordinare**: niente menù «Sort» né opzioni di ordine dentro un filtro (CATEGORY ANALYSES parte ordinata per data d'acquisto prevista, poi si clicca). Le righe di totale e i sottototali restano dove sono; nelle tabelle a gruppi (il Gantt per area) si ordina dentro ogni gruppo; le colonne calcolate della griglia si ordinano per importo, non per testo. Il file scaricato segue l'ordine che si vede. Le tendine con tante voci hanno la **ricerca** (`SearchSelect` nei moduli, `SearchSelectEditor` nelle celle della griglia: CASH FROM, ALSO FROM, BOUGHT FROM, CATEGORY); quelle con poche voci (aliquote, priorità, modo) restano tendine semplici. Con la ricerca aperta, Invio e le frecce sono della lista (`keysForSearch` in `areaColumns.tsx`) e chiudere senza scegliere non cambia niente.
9. **Intestazione di ogni pagina**: titolo, una riga che dice a cosa serve la pagina e, **sotto**, i comandi, a sinistra (`.page-header` in `components.css`). Se nella pagina si può aggiungere qualcosa, il primo è il **pulsante giallo con il «+»** (New sponsor, New project, New supplier, New component, New inflow, Add goods): **i campi non si vedono finché non lo si preme**; si apre un riquadro con il modulo (con Annulla) sotto l'intestazione, e il pulsante diventa «Close». Poi, con il bordo solo, i comandi secondari (Set BANK) e **Download**. Una pagina senza niente da aggiungere ha solo Download. I filtri della pagina (History: «Show») stanno nella stessa riga.
10. **Download**: ogni pagina con tabelle o grafici ha un pulsante **Download** (solo bordo, icona della freccia in giù) nello stesso gruppo degli altri comandi (`.page-header .actions`; nelle pagine articolo e componente a destra del titolo). Si apre un riquadro (`.download-panel`: stesso bordo e stessi token dei campi) con una casella per ogni tabella e grafico della pagina, la scelta PDF/Excel e il pulsante che scarica. Non c'è un riferimento su Figma: sono i componenti esistenti con i token. I grafici scaricati sono **sempre su fondo bianco**, qualunque sia il tema del sito (vedi [download.md](download.md)).
