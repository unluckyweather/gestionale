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
