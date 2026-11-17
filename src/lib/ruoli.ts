// Ruoli e sezioni dell'app: UNICO posto dove si decide chi vede quale scheda.
// (I permessi veri sui dati stanno nel database, con la Row Level Security:
//  questo elenco serve a mostrare/nascondere le voci di menu e a bloccare le pagine.)

export type Ruolo = "titolare" | "ufficio" | "contabilita" | "operaio";

export const RUOLI: Ruolo[] = ["titolare", "ufficio", "contabilita", "operaio"];

export const ETICHETTE_RUOLO: Record<Ruolo, string> = {
  titolare: "Titolare",
  ufficio: "Ufficio",
  contabilita: "Contabilità",
  operaio: "Operaio",
};

export type Sezione = {
  href: string;
  etichetta: string;
  ruoli: Ruolo[];
};

const TUTTI: Ruolo[] = RUOLI;
const UFFICI: Ruolo[] = ["titolare", "ufficio", "contabilita"];

export const SEZIONI: Sezione[] = [
  { href: "/", etichetta: "Dashboard", ruoli: TUTTI },
  { href: "/preventivi", etichetta: "Preventivi", ruoli: UFFICI },
  { href: "/produzione", etichetta: "Produzione", ruoli: TUTTI },
  { href: "/timbrature", etichetta: "Timbrature", ruoli: TUTTI },
  { href: "/anagrafiche", etichetta: "Anagrafiche", ruoli: UFFICI },
  { href: "/impostazioni", etichetta: "Impostazioni", ruoli: ["titolare"] },
];

export function sezioniPerRuolo(ruolo: Ruolo): Sezione[] {
  return SEZIONI.filter((s) => s.ruoli.includes(ruolo));
}

export function eRuolo(valore: unknown): valore is Ruolo {
  return typeof valore === "string" && (RUOLI as string[]).includes(valore);
}
