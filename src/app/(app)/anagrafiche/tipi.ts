// Forma dei dati letti dal database per la scheda Anagrafiche (vedi docs/SCHEMA-DATABASE.md).

export type TipoSoggetto = "cliente" | "fornitore" | "entrambi";
export type TipoArticolo = "articolo" | "lavorazione" | "servizio";

export type Soggetto = {
  id: string;
  tipo: TipoSoggetto;
  ragione_sociale: string;
  partita_iva: string | null;
  codice_fiscale: string | null;
  codice_sdi: string | null;
  pec: string | null;
  indirizzo: string | null;
  cap: string | null;
  citta: string | null;
  provincia: string | null;
  email: string | null;
  telefono: string | null;
  referente: string | null;
  condizione_pagamento_id: string | null;
  listino_id: string | null;
  note: string | null;
  attivo: boolean;
  aggiornato_il: string;
};

export type CondizionePagamento = { id: string; descrizione: string; giorni: number; attivo: boolean };
export type Listino = { id: string; nome: string; note: string | null; attivo: boolean };

export type Articolo = {
  id: string;
  codice: string | null;
  descrizione: string;
  tipo: TipoArticolo;
  unita_misura: string;
  prezzo_base: number;
  aliquota_iva: number;
  note: string | null;
  attivo: boolean;
  aggiornato_il: string;
};

export type PrezzoListino = { listino_id: string; prezzo: number };

export const ETICHETTE_TIPO_SOGGETTO: Record<TipoSoggetto, string> = {
  cliente: "Cliente",
  fornitore: "Fornitore",
  entrambi: "Cliente e fornitore",
};

export const ETICHETTE_TIPO_ARTICOLO: Record<TipoArticolo, string> = {
  articolo: "Articolo",
  lavorazione: "Lavorazione",
  servizio: "Servizio",
};

export const ALIQUOTE_IVA = [22, 10, 5, 4, 0];
