# Documentazione

| Documento | A cosa serve |
| --- | --- |
| [piano-azione-v0.md](piano-azione-v0.md) | Cosa facciamo per arrivare a "stesse funzionalità dello script, ma su database": perimetro, blocchi di lavoro, difficoltà, rischi |
| [architettura.md](architettura.md) | Stack, struttura del repository, livelli, modello dati, API, Docker, come si estende |
| [schema-database.md](schema-database.md) | **Com'è organizzato il database**: la mappa dei sei gruppi di tabelle e i ponti fra loro, un diagramma ER per area (budget, fondi e CASH FLOW, registro di cassa, inventario, accesso e impostazioni), i collegamenti per nome, cosa fa rispettare il database e cosa finisce nello storico |
| [regole-script-attuale.md](regole-script-attuale.md) | Le regole di calcolo estratte dallo script e verificate sul foglio reale (la specifica di parità), con i casi di prova |
| [hardcoded-registry.md](hardcoded-registry.md) | Tutto ciò che è hardcoded per ora, in quale funzione-API vive e cosa diventerà |
| [stile-interfaccia.md](stile-interfaccia.md) | Da dove vengono gli stili dell'interfaccia (Figma) e come si applicano |
| [avvio.md](avvio.md) | **Tutorial**: dal computer vuoto all'app funzionante, comandi di ogni giorno, problemi comuni |
| [tecnologie.md](tecnologie.md) | Cosa fa ogni tecnologia usata (Docker, PostgreSQL, Drizzle, Fastify, Zod, React, AG Grid…), spiegata dal problema che risolve |
| [come-funziona.md](come-funziona.md) | Il funzionamento passo per passo: aprire una pagina, modificare una cella, la vita di un importo, dove mettere le mani |
| [produzione.md](produzione.md) | Cosa manca, cosa è solo per lo sviluppo, come ospitarlo su un server (opzioni, procedura, backup, sicurezza) |
| [accesso-e-storico.md](accesso-e-storico.md) | Login dietro il proxy dell'organizzazione (header `X-Email`, il modo in uso) o con Google, JWT di 24 ore, ruoli `admin`/`pm`/`viewer`, storico delle modifiche: come funziona, configurazione, come si revoca un accesso, test |
| [collaudo.md](collaudo.md) | Come si controlla che non ci siano difetti: i livelli di prova, i difetti trovati e corretti, cosa non è coperto, il giro nel browser da ripetere |
| [inventario.md](inventario.md) | **L'inventario**: dal budget allo scaffale (pending/arrivato), articoli con immagine e campi per categoria, **schede dati in PDF, infiammabile/tossico/cancerogeno**, movimenti, componenti con distinta e costo nel tempo, **produzione ("We made some") e cosa succede se un prezzo cambia**, statistiche, prezzi (selettore), dati dimostrativi, cosa manca |
| [sponsor-e-fondi.md](sponsor-e-fondi.md) | **Sponsor e fondi**: come si definisce uno sponsor (tipo A/B/C, aliquota, gruppo), come il sito ne deduce IVA e copertura, più fondi sulla stessa riga con avviso se non bastano, i soldi che entrano nel conto come inflow di CASH FLOW (IVA all'11% il primo giorno del trimestre dopo), le risposte del tesoriere |
| [stagioni-anni-fiscali-e-macchine.md](stagioni-anni-fiscali-e-macchine.md) | **Stagioni e macchine**: il selettore della stagione nel menù che cambia tutto il sito, la striscia gialla, la macchina di ogni stagione e quella scelta su una riga (colonna CAR), le stagioni in sola lettura, la nuova stagione che parte dalla precedente, le tre pagine **SEASON / YEAR / CAR TOTAL** (scelta propria, righe per area o progetto, entrate contro uscite, confronto fra due), le statistiche dell'inventario per stagione e per macchina, il caricatore con `--season` |
| [registro-di-cassa.md](registro-di-cassa.md) | **Registro di cassa** (fatto): il fondo del team (Cassa, Banca, Paypal) come nel foglio della tesoreria, le spunte «Treasury» e «Sponsors» dei pm, la spunta Sponsorship, l'import dell'Excel in due modi (aggiungi / sostituisci) con il controllo, il BANK di CASH FLOW dal registro, gli inflow attesi segnati «ricevuti» e le uscite collegate alle righe del budget |
| [download.md](download.md) | **Scaricare tabelle e grafici**: il pulsante Download nell'intestazione di ogni pagina, la scelta di cosa includere, PDF ed Excel fatti dal browser, grafici su fondo bianco, come aggiungere un blocco o un formato |
| [impostazioni.md](impostazioni.md) | **Impostazioni** (pagina Settings, solo admin): categorie con i loro campi e il loro ordine, aliquote IVA, unità, sedi e stanze, interruttori del calcolo con la loro spiegazione; prima erano scritti nel codice |
| [controllo-bug-e-prestazioni.md](controllo-bug-e-prestazioni.md) | **Controllo di bug e prestazioni** (26/10/2026): cosa è stato provato e misurato, i problemi trovati (P1–P11) con gravità, causa e soluzione proposta, e il loro stato |
| [da-decidere.md](da-decidere.md) | **Da decidere**: l'elenco unico delle decisioni aperte (a partire da quella **urgente** sul GRAND TOTAL con l'IVA coperta da un fondo), chi deve rispondere e cosa cambia |
| [ci.md](ci.md) | La CI su GitHub: cosa controlla, come leggerla, come provarla in locale |
| [rilascio.md](rilascio.md) | **Rilascio**: il workflow che costruisce le immagini Docker di produzione su GitHub, come fare un rilascio (tag), come metterle su un server e aggiornarle, il file `.env` del server, cosa è stato provato e cosa no |

Materiale di partenza, in `fonti/` (locale, ignorata da git): `script attuale`, `Budget 26-27.xlsx`, `Piano d'azione — Budget e Inventario custom.md` (visione completa in 8 fasi e sette domande per il tesoriere).
