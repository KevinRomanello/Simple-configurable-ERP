# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Una squadra universitaria di Formula Student, **E-Agle TRT**, oggi l'unica che lo usa. Tre gruppi lo usano davvero, ognuno per un lavoro suo:

- **I capi area e di progetto** (ruolo `pm`, nel sito «User») dal portatile: mettono nel budget le righe del loro progetto (cosa comprare, da chi, con quali fondi, quando) e le correggono man mano che gli acquisti avvengono, come facevano sul foglio Google.
- **La tesoreria** (un `pm` con la spunta «Treasury», o un admin) dal computer: tiene il registro di cassa (Cassa, Banca, Paypal), paga le righe di TO PAY, collega i movimenti alle righe del budget, fa il rendiconto. Lavoro preciso e lungo.
- **I membri in officina** dal telefono: usano l'inventario (prelevare, spostare, contare i pezzi) e guardano cosa è arrivato.

Gli admin gestiscono utenti, impostazioni e moduli; i `viewer` guardano senza cambiare. Il direttivo che guarda totali e analisi per decidere non è, per ora, un utente principale.

## Product Purpose

Sostituisce il foglio Google del budget e lo script di Google Apps Script che lo calcola con un'app web su database, con gli stessi numeri del foglio. Sopra il budget ci sono la tesoreria, l'inventario e le anagrafiche (un piccolo NocoDB interno, al posto di NocoDB e dei Google Form).

Riesce quando, in quest'ordine di importanza:

1. **I numeri sono affidabili**: gli stessi del foglio, al centesimo, così che tesoriere e capi area non debbano ricontrollarli.
2. **Si inserisce in fretta**: scrivere e correggere righe veloce come in un foglio di calcolo.
3. **Si capisce dove vanno i soldi**: chi apre una pagina vede subito quanto si è speso, quanto resta e cosa manca.

## Positioning

Il motore è **generico e configurabile**: regole, liste, ruoli, moduli e anagrafiche non sono scritti per una squadra sola (il repository si chiama «Simple-configurable-ERP»). **L'interfaccia invece può essere specifica** per E-Agle TRT: parla la lingua del suo foglio e dei suoi flussi. Per ora c'è un solo cliente; altri sono un'idea, non un impegno.

## Operating Context

- Il foglio di partenza (`Budget 26-27`) e lo script attuale sono il comportamento da replicare; stanno in `fonti/`, che è locale e contiene dati reali.
- La tesoreria lavorava su un suo Excel, che si importa nel registro di cassa.
- Il team usa NocoDB, n8n, Keycloak e i Google Form per le anagrafiche; l'ERP li sostituisce o ci parla (webhook e token per n8n).
- L'accesso passa dal proxy dell'organizzazione (header `X-Email`) o da Google; sessioni di 24 ore.
- La **stagione** va da settembre ad agosto, con una macchina per stagione; si sceglie nel menù e cambia tutto il sito.
- Tabelle e grafici si scaricano in PDF ed Excel per condividerli fuori dall'app.

## Capabilities and Constraints

- Moduli che un admin può spegnere: budget, tesoreria, inventario, anagrafiche; un nucleo sempre acceso e ponti fra i moduli ([docs/moduli.md](docs/moduli.md)).
- Ruoli `admin`, `pm` («User», con le spunte «Treasury» e «Sponsors») e `viewer`; storico di ogni modifica ([docs/accesso-e-storico.md](docs/accesso-e-storico.md)).
- Soldi in centesimi interi nel codice e `numeric` nel database, mai virgola mobile; date come stringhe ISO.
- La parità col foglio è provata da test di riconciliazione sul foglio reale.
- Si usa su computer, tablet e telefono; un admin può spegnere le modifiche dal telefono. Le stagioni passate possono essere in sola lettura.
- **Terminologia**: l'interfaccia è in inglese e tiene i termini del foglio (CASH FROM, BOUGHT FROM, outflow, EXPECTED, ACTUAL…); i nomi delle pagine nel menù sono in inglese. Codice in inglese, documenti in italiano.
- Le decisioni ancora aperte sono in [docs/da-decidere.md](docs/da-decidere.md); lo stato del rilascio in [docs/produzione.md](docs/produzione.md) e [docs/rilascio.md](docs/rilascio.md).

## Brand Commitments

- Il nome della squadra, **E-Agle TRT**, in cima al menù.
- L'identità visiva viene dai file Figma della squadra (regola 6 di `CLAUDE.md`; i dettagli e le fonti in [docs/stile-interfaccia.md](docs/stile-interfaccia.md)). Il restyling del 28 novembre 2026 l'ha mantenuta: l'utente chiede di migliorare l'interfaccia **senza perdere l'identità**.
- Il logo E-Agle è su Figma ma non è ancora usato nell'app.

## Evidence on Hand

- La documentazione completa del prodotto è in [docs/](docs/README.md).
- Dati di sviluppo e dimostrativi **sintetici** (seed, demo dell'inventario e delle anagrafiche).
- I dati reali (nomi di persone e sponsor, importi) stanno solo in `fonti/`, che non è nel repository: **non vanno mai copiati** in file tracciati, né in disegni, esempi o schermate di prova.
- Non esistono testimonianze, clienti esterni, prezzi o numeri d'uso da citare: non vanno inventati.

## Product Principles

1. **Il numero prima di tutto, ed esatto.** Ogni cifra segue le regole del foglio al centesimo, e si deve poter capire da dove viene.
2. **Si lavora dove stanno i dati.** Il lavoro frequente (una cella, una riga, un pagamento) si fa sul posto e veloce, come in un foglio di calcolo; i moduli lenti restano per ciò che è raro.
3. **Prima dove vanno i soldi, poi il dettaglio.** Totali, quanto resta e cosa manca si vedono prima delle righe.
4. **Ognuno trova il suo lavoro.** Capo area, tesoreria e officina hanno ciascuno la sua strada, senza passare per quella degli altri.
5. **Motore generico, interfaccia della squadra.** Ciò che una squadra diversa cambierebbe sta in configurazione o dietro le funzioni-API; l'interfaccia può restare nella lingua di E-Agle TRT.

## Accessibility & Inclusion

- Contrasto dei testi almeno **WCAG AA** (4,5:1), in chiaro e in scuro: richiesto dall'utente il 28 novembre 2026.
- Tema chiaro, scuro o quello del dispositivo, a scelta di ognuno.
- Sui dispositivi touch, caselle e pulsanti alti almeno 40 px e testo delle caselle a 16 px; tutto si usa anche da tastiera.
