import type { CashScope } from "@erp/calc";

// The lists a new register starts with: the Voci and the payment methods of the sheet of the treasury.
// The same values are inserted by the migration 0018; the tests put them back between one test and the next.

/**
 * A Voce, whether money in on it is sponsorship by default (a starting value for the movement) and where its money counts
 * (see `cash_category.scope`): everything is outside the budget except what is spent on a project (1.1, 1.4) and what the
 * budget already counts (the sponsorship and the VAT).
 */
export const CASH_CATEGORIES: { name: string; sponsorship: boolean; scope: CashScope }[] = [
  { name: "1. QUOTE ASSOCIATIVE", sponsorship: false, scope: "outside" },
  { name: "2.1 da soci e tesserati", sponsorship: false, scope: "outside" },
  { name: "2.2 da altre associazioni", sponsorship: false, scope: "outside" },
  { name: "2.3 da altri (ad es. Federazioni)", sponsorship: false, scope: "outside" },
  { name: "3.1 da soci", sponsorship: false, scope: "outside" },
  { name: "3.2 da non soci", sponsorship: false, scope: "outside" },
  { name: "4.1 da comune, provincia, regione, stato", sponsorship: false, scope: "outside" },
  { name: "4.2 da Comunità Europea e da altri organismi internazionali", sponsorship: false, scope: "outside" },
  { name: "4.3 da 5 per mille", sponsorship: false, scope: "outside" },
  { name: "4.4 da università", sponsorship: false, scope: "outside" },
  { name: "5. ENTRATE DA ATTIVITA’ COMMERCIALI", sponsorship: false, scope: "outside" },
  { name: "6.1 Da pubblicità e sponsorizzazioni", sponsorship: true, scope: "ignore" },
  { name: "6.2 per attività svolte nei confronti di non associati", sponsorship: false, scope: "outside" },
  { name: "6.3 Entrate commerciali di altro tipo (rimborsi)", sponsorship: false, scope: "outside" },
  { name: "7.1 Da rendite patrimoniali", sponsorship: false, scope: "outside" },
  { name: "7.2 rendite finanziarie", sponsorship: false, scope: "outside" },
  { name: "7.3 altro: CAMBI ATTIVI", sponsorship: false, scope: "outside" },
  { name: "1.1 Attrezzature", sponsorship: false, scope: "project" },
  { name: "1.2 Cancelleria e materiali da ufficio", sponsorship: false, scope: "outside" },
  { name: "1.3 Materiale sportivo (per le ASD)", sponsorship: false, scope: "outside" },
  { name: "1.4 Altro", sponsorship: false, scope: "project" },
  { name: "2.1 Assicurazioni", sponsorship: false, scope: "outside" },
  { name: "2.2 Servizi informatici", sponsorship: false, scope: "outside" },
  { name: "2.3 Spese postali", sponsorship: false, scope: "outside" },
  { name: "2.4 Consulenze/ servizi contabili", sponsorship: false, scope: "outside" },
  { name: "2.5 Altri", sponsorship: false, scope: "outside" },
  { name: "3.1 Luce", sponsorship: false, scope: "outside" },
  { name: "3.2 Acqua", sponsorship: false, scope: "outside" },
  { name: "3.3 Gas", sponsorship: false, scope: "outside" },
  { name: "3.4 Altre", sponsorship: false, scope: "outside" },
  { name: "4.1 Affitti", sponsorship: false, scope: "outside" },
  { name: "4.2 Noleggi", sponsorship: false, scope: "outside" },
  { name: "4.3 Altri", sponsorship: false, scope: "outside" },
  { name: "5.1 Affiliazioni a federazioni", sponsorship: false, scope: "outside" },
  { name: "5.2 Altri", sponsorship: false, scope: "outside" },
  { name: "6.1 Costi per collaboratori (occasionali, forfettari e dipendenti)", sponsorship: false, scope: "outside" },
  { name: "6.2 Rimborsi spese analitici", sponsorship: false, scope: "outside" },
  { name: "6.3 Altri costi", sponsorship: false, scope: "outside" },
  { name: "7.1 Commissioni e spese tenuta conto", sponsorship: false, scope: "outside" },
  { name: "7.2 Altri", sponsorship: false, scope: "outside" },
  { name: "8.1 IRES/IRAP", sponsorship: false, scope: "outside" },
  { name: "8.2 Imposta di bollo", sponsorship: false, scope: "outside" },
  { name: "8.3 Dazi doganali", sponsorship: false, scope: "outside" },
  { name: "9.1 IVA a credito", sponsorship: false, scope: "ignore" },
  { name: "9.2 IVA a debito", sponsorship: false, scope: "ignore" },
  { name: "9.3 Liquidazione IVA", sponsorship: false, scope: "ignore" },
  { name: "9.4 Pec aruba", sponsorship: false, scope: "outside" },
  { name: "9.5 saldo fattura", sponsorship: false, scope: "outside" },
];

export const CASH_METHODS: string[] = ["Completato bonifico", "Completato visa", "Cassa", "Paypal", "Automatico"];
