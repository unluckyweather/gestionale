// Costruisce gli indirizzi della scheda Anagrafiche, es. /anagrafiche?scheda=clienti&id=…
// (la scheda aperta, la ricerca e la riga scelta stanno nell'indirizzo: così "Indietro" del browser funziona).
export function indirizzo(parametri: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [chiave, valore] of Object.entries(parametri)) if (valore) p.set(chiave, valore);
  const testo = p.toString();
  return testo ? `/anagrafiche?${testo}` : "/anagrafiche";
}

/** Toglie dalla ricerca i caratteri che hanno un significato speciale per il database. */
export function pulisciRicerca(q: string | undefined): string {
  return (q ?? "").replace(/[,()*%\\:"'.]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

/** Valore di ?categoria= per "Senza categoria" (gli altri valori sono l'id di una categoria). */
export const SENZA_CATEGORIA = "nessuna";

/** Tiene ?categoria= solo se è "nessuna" o un id valido (uuid); altrimenti nessun filtro. */
export function leggiCategoria(valore: string | undefined): string | undefined {
  if (valore === SENZA_CATEGORIA) return valore;
  return valore && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valore) ? valore : undefined;
}
