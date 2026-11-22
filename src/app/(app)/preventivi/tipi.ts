// Tipi della pagina del preventivo, condivisi tra pagina (server), modulo (browser) e salvataggio.
import type { Stato } from "./comuni";

// ----- Dati letti dal database -----
export type Cliente = {
  id: string;
  denominazione: string;
  nome_breve: string | null;
  comune: string | null;
  forma: "azienda" | "persona_fisica" | "pubblica_amministrazione";
  codice_iva_abituale_id: string | null;
  attivo: boolean;
};

export type TariffaScelta = { id: string; nome: string; costo_orario: number; attivo: boolean };

export type ArticoloScelto = {
  id: string;
  codice: string | null;
  descrizione: string;
  unita_misura: string;
  costo_unitario: number;
  larghezza_bobina_m: number | null;
  lastra_larghezza_cm: number | null; // articolo a lastra: misure in cm, costo_unitario = prezzo della lastra
  lastra_altezza_cm: number | null;
};

export type CodiceIvaScelto = { id: string; codice: string; descrizione: string; aliquota: number; attivo: boolean };

export type PreventivoSalvato = {
  id: string;
  numero: string;
  soggetto_id: string;
  oggetto: string;
  modello_id: string | null;
  data: string;
  valido_fino: string | null;
  stato: Stato;
  ricarico_percentuale: number;
  prezzo_cliente: number | null;
  codice_iva_id: string | null;
  cig: string | null;
  cup: string | null;
  note: string | null;
  attivo: boolean;
  aggiornato_il: string;
};

export type OreSalvate = {
  id: string;
  fase_id: string;
  tariffa_id: string;
  ore: number;
  persone: number | null;
  costo_orario: number;
  attivo: boolean;
};

export type MaterialeSalvato = {
  id: string;
  fase_id: string;
  articolo_id: string | null;
  descrizione: string;
  unita_misura: string;
  larghezza_m: number | null;
  metri_lineari: number | null;
  quantita: number;
  costo_unitario: number;
  addebito_lastra: AddebitoLastra | null;
  lastra_larghezza_cm: number | null;
  lastra_altezza_cm: number | null;
  costo_lastra: number | null;
  pezzo_larghezza_cm: number | null;
  pezzo_altezza_cm: number | null;
  pezzi: number | null;
  margine_taglio_cm: number;
  scarto_percentuale: number;
  attivo: boolean;
};

/** Lastra: si pagano le lastre intere necessarie, oppure solo i m² dei pezzi + scarto. */
export type AddebitoLastra = "lastre_intere" | "m2_usati";

/** Come si calcola la quantità di un materiale. */
export type Formato = "normale" | "bobina" | "lastra";

export type FaseSalvata = {
  id: string;
  titolo: string;
  descrizione_cliente: string | null;
  ore_fase: OreSalvate[];
  materiali_fase: MaterialeSalvato[];
};

// ----- Bozza nel browser: tutti i numeri come testo, come li scrive la persona -----
export type BozzaOre = {
  chiave: string;
  id?: string;
  tariffa_id: string;
  ore: string;
  persone: string;
  costo_orario: string;
};

export type BozzaMateriale = {
  chiave: string;
  id?: string;
  articolo_id: string | null;
  descrizione: string;
  unita_misura: string;
  formato: Formato;
  // bobina
  larghezza_m: string;
  metri_lineari: string;
  // normale
  quantita: string;
  costo_unitario: string;
  // lastra (misure in cm)
  addebito_lastra: AddebitoLastra;
  lastra_larghezza_cm: string;
  lastra_altezza_cm: string;
  costo_lastra: string;
  pezzo_larghezza_cm: string;
  pezzo_altezza_cm: string;
  pezzi: string;
  margine_taglio_cm: string;
  scarto_percentuale: string;
};

export type BozzaFase = {
  chiave: string;
  id?: string;
  titolo: string;
  descrizione_cliente: string;
  ore: BozzaOre[];
  materiali: BozzaMateriale[];
};

export type BozzaTestata = {
  soggetto_id: string;
  oggetto: string;
  modello_id: string | null;
  data: string;
  valido_fino: string;
  ricarico_percentuale: string;
  prezzo_cliente: string;
  codice_iva_id: string;
  cig: string;
  cup: string;
  note: string;
};

/** Quello che il modulo manda al salvataggio (in un campo nascosto, come JSON). */
export type DatiModulo = { id: string | null; testata: BozzaTestata; fasi: BozzaFase[] };

/** Risposta del salvataggio: se va bene si cambia pagina, se no torna l'errore (la bozza resta nel modulo). */
export type EsitoSalvataggio = { errore?: string };
