// Letture dal database condivise da preventivi, modelli e "Duplica" (solo lato server).
import type { creaClientServer } from "@/lib/supabase/server";
import type { ArticoloScelto, FaseSalvata, TariffaScelta } from "./tipi";

type Client = Awaited<ReturnType<typeof creaClientServer>>;

const CAMPI_FASI =
  "id, titolo, descrizione_cliente, ordine, " +
  "ore_fase(id, fase_id, tariffa_id, ore, persone, costo_orario, attivo, ordine), " +
  "materiali_fase(id, fase_id, articolo_id, descrizione, unita_misura, larghezza_m, metri_lineari, quantita, costo_unitario, " +
  "addebito_lastra, lastra_larghezza_cm, lastra_altezza_cm, costo_lastra, pezzo_larghezza_cm, pezzo_altezza_cm, pezzi, " +
  "margine_taglio_cm, scarto_percentuale, attivo, ordine)";

/**
 * Fasi attive (con le righe attive, in ordine) di un preventivo o di un modello, o di più modelli insieme.
 * Restituisce null se la lettura non riesce: chi la usa NON deve proseguire come se non ci fossero fasi.
 */
export async function leggiFasi(
  supabase: Client,
  di: { preventivo: string } | { modelli: string[] }
): Promise<(FaseSalvata & { modello_id: string | null })[] | null> {
  let query = supabase
    .from("fasi_preventivo")
    .select(`modello_id, ${CAMPI_FASI}`)
    .eq("attivo", true)
    .order("ordine")
    .order("ordine", { referencedTable: "ore_fase" })
    .order("ordine", { referencedTable: "materiali_fase" });
  query = "preventivo" in di ? query.eq("preventivo_id", di.preventivo) : query.in("modello_id", di.modelli);
  const { data, error } = await query;
  if (error) {
    console.error("Lettura delle fasi non riuscita:", error.message);
    return null;
  }
  return ((data ?? []) as unknown as (FaseSalvata & { modello_id: string | null })[]).map((f) => ({
    ...f,
    ore_fase: f.ore_fase.filter((r) => r.attivo),
    materiali_fase: f.materiali_fase.filter((r) => r.attivo),
  }));
}

/** Tariffe (tutte, anche archiviate) e catalogo materiali attivo, per scegliere e per i costi di oggi. */
export async function leggiTariffeArticoli(supabase: Client) {
  const [tariffe, articoli] = await Promise.all([
    supabase.from("tariffe_orarie").select("id, nome, costo_orario, attivo").order("tipo").order("nome"),
    supabase
      .from("articoli")
      .select("id, codice, descrizione, unita_misura, costo_unitario, larghezza_bobina_m, lastra_larghezza_cm, lastra_altezza_cm")
      .eq("attivo", true)
      .order("descrizione")
      .limit(5000),
  ]);
  if (tariffe.error || articoli.error) {
    console.error("Lettura di tariffe o articoli non riuscita:", (tariffe.error ?? articoli.error)?.message);
    return null;
  }
  return { tariffe: (tariffe.data ?? []) as TariffaScelta[], articoli: (articoli.data ?? []) as ArticoloScelto[] };
}
