// Forma dei dati letti dal database per la scheda Anagrafiche (vedi docs/SCHEMA-DATABASE.md, sezione 2).

export type TipoSoggetto = "cliente" | "fornitore" | "entrambi";
export type FormaSoggetto = "azienda" | "persona_fisica" | "pubblica_amministrazione";
export type TipoArticolo = "articolo" | "lavorazione" | "servizio";

export type Soggetto = {
  id: string;
  tipo: TipoSoggetto;
  forma: FormaSoggetto;
  ragione_sociale: string | null;
  cognome: string | null;
  nome: string | null;
  denominazione: string;
  nome_breve: string | null;
  categoria_id: string | null;
  sito_web: string | null;
  paese_iva: string;
  partita_iva: string | null;
  codice_fiscale: string | null;
  codice_sdi: string | null;
  codice_ufficio_pa: string | null;
  split_payment: boolean;
  pec: string | null;
  codice_iva_abituale_id: string | null;
  indirizzo: string | null;
  civico: string | null;
  cap: string | null;
  comune: string | null;
  provincia: string | null;
  nazione: string;
  iban: string | null;
  abi: string | null;
  cab: string | null;
  banca_agenzia: string | null;
  banca_aziendale_id: string | null;
  note_riba: string | null;
  condizione_pagamento_id: string | null;
  mese_escluso_1: number | null;
  mese_escluso_2: number | null;
  giorno_fisso: number | null;
  reverse_charge: boolean;
  rc_tipo_documento: string | null;
  rc_natura: string | null;
  rc_codice_iva_id: string | null;
  note_interne: string | null;
  note_documenti: string | null;
  privacy_inviata_il: string | null;
  privacy_firmata_il: string | null;
  attivo: boolean;
  aggiornato_il: string;
  autore?: { nome_visualizzato: string } | null; // chi ha fatto l'ultima modifica
};

export type Contatto = {
  id: string;
  riferimento: string | null;
  persona: string | null;
  email: string | null;
  telefono: string | null;
  cellulare: string | null;
  riceve_preventivi: boolean;
  riceve_fatture: boolean;
};

export type Sede = {
  id: string;
  tipo: "operativa" | "altra";
  nome: string | null;
  indirizzo: string | null;
  civico: string | null;
  cap: string | null;
  comune: string | null;
  provincia: string | null;
  nazione: string;
  telefono: string | null;
  annotazioni: string | null;
  consegna: boolean;
};

export type Dichiarazione = {
  id: string;
  protocollo: string;
  data: string;
  anno: number;
  importo: number;
};

export type CodiceIva = {
  id: string;
  codice: string;
  descrizione: string;
  aliquota: number;
  natura: string | null;
  attivo: boolean;
};
export type CondizionePagamento = { id: string; descrizione: string; giorni: number; attivo: boolean };
export type BancaAziendale = {
  id: string;
  nome: string;
  iban: string | null;
  abi: string | null;
  cab: string | null;
  note: string | null;
  attivo: boolean;
};
export type Categoria = { id: string; descrizione: string; attivo: boolean };

/** Le tabelle di servizio che servono alla scheda cliente/fornitore. */
export type Tabelle = {
  codiciIva: CodiceIva[];
  condizioni: CondizionePagamento[];
  banche: BancaAziendale[];
  categorie: Categoria[];
};

export type Articolo = {
  id: string;
  codice: string | null;
  descrizione: string;
  tipo: TipoArticolo;
  unita_misura: string;
  costo_unitario: number;
  larghezza_bobina_m: number | null;
  lastra_larghezza_cm: number | null; // solo materiali a lastra (cm); costo_unitario = prezzo della lastra
  lastra_altezza_cm: number | null;
  codice_iva_id: string | null;
  fornitore_id: string | null;
  note: string | null;
  attivo: boolean;
  aggiornato_il: string;
};

export const ETICHETTE_TIPO_SOGGETTO: Record<TipoSoggetto, string> = {
  cliente: "Cliente",
  fornitore: "Fornitore",
  entrambi: "Entrambi",
};

export const ETICHETTE_FORMA: Record<FormaSoggetto, string> = {
  azienda: "Azienda",
  persona_fisica: "Persona fisica",
  pubblica_amministrazione: "Pubblica amministrazione",
};

export const ETICHETTE_TIPO_ARTICOLO: Record<TipoArticolo, string> = {
  articolo: "Materiale",
  lavorazione: "Lavorazione",
  servizio: "Servizio",
};

export const UNITA_MISURA = ["pz", "m2", "ml", "foglio", "lastra", "kg", "h"];

export const MESI = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

export const RIFERIMENTI_CONTATTO = [
  "Commerciale", "Amministrazione", "Acquisti", "Produzione", "Logistica", "Titolare",
];

export const DOCUMENTI_REVERSE_CHARGE: { codice: string; descrizione: string }[] = [
  { codice: "TD16", descrizione: "TD16 – Integrazione reverse charge interno" },
  { codice: "TD17", descrizione: "TD17 – Autofattura servizi dall'estero" },
  { codice: "TD18", descrizione: "TD18 – Integrazione beni intra UE" },
  { codice: "TD19", descrizione: "TD19 – Autofattura beni art. 17 c.2" },
];

/** Nazioni proposte nelle tendine (sigla ISO usata nella fattura elettronica). */
export const NAZIONI: { sigla: string; nome: string }[] = [
  { sigla: "IT", nome: "Italia" },
  { sigla: "SM", nome: "San Marino" },
  { sigla: "VA", nome: "Città del Vaticano" },
  { sigla: "AT", nome: "Austria" },
  { sigla: "BE", nome: "Belgio" },
  { sigla: "HR", nome: "Croazia" },
  { sigla: "DK", nome: "Danimarca" },
  { sigla: "FR", nome: "Francia" },
  { sigla: "DE", nome: "Germania" },
  { sigla: "GR", nome: "Grecia" },
  { sigla: "IE", nome: "Irlanda" },
  { sigla: "LU", nome: "Lussemburgo" },
  { sigla: "NL", nome: "Paesi Bassi" },
  { sigla: "PL", nome: "Polonia" },
  { sigla: "PT", nome: "Portogallo" },
  { sigla: "CZ", nome: "Repubblica Ceca" },
  { sigla: "RO", nome: "Romania" },
  { sigla: "SK", nome: "Slovacchia" },
  { sigla: "SI", nome: "Slovenia" },
  { sigla: "ES", nome: "Spagna" },
  { sigla: "SE", nome: "Svezia" },
  { sigla: "HU", nome: "Ungheria" },
  { sigla: "CH", nome: "Svizzera" },
  { sigla: "GB", nome: "Regno Unito" },
  { sigla: "US", nome: "Stati Uniti" },
];

export function nomeNazione(sigla: string | null | undefined): string {
  return NAZIONI.find((n) => n.sigla === sigla)?.nome ?? sigla ?? "";
}
