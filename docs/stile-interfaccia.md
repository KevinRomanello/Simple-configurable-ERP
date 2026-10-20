# Stile dell'interfaccia

Regola 6 di `CLAUDE.md`: le interfacce seguono gli stili definiti su Figma. Non si inventano colori, font, spaziature o componenti.

## Fonti

| Cartella Figma | Link |
| --- | --- |
| Cartella 1 | https://www.figma.com/files/team/1170826409918235978/folder/354010286 |
| Cartella 2 | https://www.figma.com/files/team/1170826409918235978/folder/70751470 |

**Stato (20 ott 2026): da leggere.** Gli strumenti Figma lavorano sul link a un singolo file (o su un frame), non su una cartella, e il browser integrato non è collegato a Figma. Serve il link ai file giusti (design system e, se esistono, le schermate).

## Come si applica

1. Dal file Figma si leggono variabili e stili (colori, tipografia, raggi, spaziature) e i componenti usati (pulsanti, campi, tabelle).
2. I valori diventano **token in un unico punto**: `apps/web/src/theme/` (variabili CSS + oggetto TypeScript). Nessun colore o misura scritti a mano nei componenti.
3. AG Grid riceve il tema dai token (altezza riga, font, colori di intestazione, selezione, bordi).
4. Ogni pagina ha un riferimento al frame Figma da cui nasce (tabella sotto). Se non c'è un riferimento per ciò che si sta costruendo, si chiede prima di improvvisare.
5. Finché i file non sono letti, il web app usa token neutri nello stesso punto (`theme/`): applicare Figma significa sostituire quei valori, non toccare i componenti.

## Token estratti

Da compilare dopo la lettura dei file Figma (colori, tipografia, spaziature, raggi, ombre, stati).

## Pagine → riferimenti Figma

| Pagina (foglio di origine) | Frame Figma |
| --- | --- |
| Aree: MT + DMT, SW, HW, CM, MGT, RT | da assegnare |
| CASH FROM | da assegnare |
| BOUGHT FROM | da assegnare |
| CASH FLOW | da assegnare |
| EXPECTED GANTT, ACTUAL GANTT | da assegnare |
| TOTAL | da assegnare |
| CASH FROM ANALYSES, BOUGHT FROM ANALYSES, CATEGORY ANALYSES | da assegnare |
