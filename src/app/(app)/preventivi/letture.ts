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

/**
 * Tariffe (tutte, anche archiviate) e catalogo materiali attivo, per scegliere e per i costi di oggi.
 * Ogni articolo ha anche giacenza e quantità in arrivo (vista "magazzino", 0007).
 */
export async function leggiTariffeArticoli(supabase: Client) {
  const [tariffe, articoli, magazzino] = await Promise.all([
    supabase.from("tariffe_orarie").select("id, nome, costo_orario, attivo").order("tipo").order("nome"),
    supabase
      .from("articoli")
      .select("id, codice, descrizione, unita_misura, costo_unitario, larghezza_bobina_m, bobina_lunghezza_m, lastra_larghezza_cm, lastra_altezza_cm")
      .eq("attivo", true)
      .order("descrizione")
      .limit(5000),
    supabase.from("magazzino").select("articolo_id, giacenza, in_arrivo").eq("attivo", true).limit(5000),
  ]);
  if (tariffe.error || articoli.error) {
    console.error("Lettura di tariffe o articoli non riuscita:", (tariffe.error ?? articoli.error)?.message);
    return null;
  }
  // le giacenze sono solo un aiuto: se non si leggono, il preventivo funziona lo stesso (senza avvisi)
  if (magazzino.error) console.error("Lettura delle giacenze non riuscita:", magazzino.error.message);
  const giacenze = new Map(
    ((magazzino.data ?? []) as { articolo_id: string; giacenza: number; in_arrivo: number }[]).map((g) => [g.articolo_id, g])
  );
  return {
    tariffe: (tariffe.data ?? []) as TariffaScelta[],
    articoli: ((articoli.data ?? []) as ArticoloScelto[]).map((a) => {
      const g = giacenze.get(a.id);
      return g ? { ...a, giacenza: Number(g.giacenza), in_arrivo: Number(g.in_arrivo) } : a;
    }),
  };
}
