# Documentazione

| Documento | A cosa serve |
| --- | --- |
| [piano-azione-v0.md](piano-azione-v0.md) | Cosa facciamo per arrivare a "stesse funzionalità dello script, ma su database": perimetro, blocchi di lavoro, difficoltà, rischi |
| [architettura.md](architettura.md) | Stack, struttura del repository, livelli, modello dati, API, Docker, come si estende |
| [regole-script-attuale.md](regole-script-attuale.md) | Le regole di calcolo estratte dallo script e verificate sul foglio reale (la specifica di parità), con i casi di prova |
| [hardcoded-registry.md](hardcoded-registry.md) | Tutto ciò che è hardcoded per ora, in quale funzione-API vive e cosa diventerà |
| [stile-interfaccia.md](stile-interfaccia.md) | Da dove vengono gli stili dell'interfaccia (Figma) e come si applicano |
| [avvio.md](avvio.md) | **Tutorial**: dal computer vuoto all'app funzionante, comandi di ogni giorno, problemi comuni |
| [tecnologie.md](tecnologie.md) | Cosa fa ogni tecnologia usata (Docker, PostgreSQL, Drizzle, Fastify, Zod, React, AG Grid…), spiegata dal problema che risolve |
| [come-funziona.md](come-funziona.md) | Il funzionamento passo per passo: aprire una pagina, modificare una cella, la vita di un importo, dove mettere le mani |
| [produzione.md](produzione.md) | Cosa manca, cosa è solo per lo sviluppo, come ospitarlo su un server (opzioni, procedura, backup, sicurezza) |
| [accesso-e-storico.md](accesso-e-storico.md) | Login con Google, JWT di 24 ore, ruoli `admin`/`pm`/`viewer`, storico delle modifiche: come funziona, configurazione, come si revoca un accesso, test |
| [collaudo.md](collaudo.md) | Come si controlla che non ci siano difetti: i livelli di prova, i difetti trovati e corretti, cosa non è coperto, il giro nel browser da ripetere |
| [inventario.md](inventario.md) | **L'inventario**: dal budget allo scaffale (pending/arrivato), articoli con immagine e campi per categoria, movimenti, componenti con distinta e costo nel tempo, statistiche, prezzi (selettore), dati dimostrativi, cosa manca |
| [sponsor-e-fondi.md](sponsor-e-fondi.md) | **Sponsor e fondi**: come si definisce uno sponsor (tipo A/B/C, aliquota, gruppo), come il sito ne deduce IVA e copertura, più fondi sulla stessa riga con avviso se non bastano, i soldi che entrano nel conto come inflow di CASH FLOW (IVA all'11% il primo giorno del trimestre dopo), le risposte del tesoriere |
| [stagioni-anni-fiscali-e-macchine.md](stagioni-anni-fiscali-e-macchine.md) | **Piano (non ancora fatto)**: dividere gli acquisti per stagione (settembre–agosto), anno fiscale e macchina; cosa dicono i dati, le fasi di lavoro, le decisioni da prendere |
| [download.md](download.md) | **Scaricare tabelle e grafici**: il pulsante Download nell'intestazione di ogni pagina, la scelta di cosa includere, PDF ed Excel fatti dal browser, grafici su fondo bianco, come aggiungere un blocco o un formato |
| [impostazioni.md](impostazioni.md) | **Impostazioni** (pagina Settings, solo admin): categorie con i loro campi e il loro ordine, aliquote IVA, unità, sedi e stanze, interruttori del calcolo con la loro spiegazione; prima erano scritti nel codice |
| [controllo-bug-e-prestazioni.md](controllo-bug-e-prestazioni.md) | **Controllo di bug e prestazioni** (26/10/2026): cosa è stato provato e misurato, i problemi trovati (P1–P11) con gravità, causa e soluzione proposta, e il loro stato |
| [ci.md](ci.md) | La CI su GitHub: cosa controlla, come leggerla, come provarla in locale |
| [rilascio.md](rilascio.md) | **Rilascio**: il workflow che costruisce le immagini Docker di produzione su GitHub, come fare un rilascio (tag), come metterle su un server e aggiornarle, il file `.env` del server, cosa è stato provato e cosa no |

Materiale di partenza, in `fonti/` (locale, ignorata da git): `script attuale`, `Budget 26-27.xlsx`, `Piano d'azione — Budget e Inventario custom.md` (visione completa in 8 fasi e sette domande per il tesoriere).
