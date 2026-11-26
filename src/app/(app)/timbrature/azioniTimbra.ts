"use server";
// Timbratura dal telefono (0013): chiama la funzione timbra() del database, che
// decide l'ora, controlla la sequenza e, se il titolare l'ha acceso, la distanza
// dalla ditta. La posizione del telefono serve solo al calcolo: non si salva.
import { revalidatePath } from "next/cache";
import { richiediUtente } from "@/lib/utente";
import { creaClientServer } from "@/lib/supabase/server";
import { TIPI_TIMBRATURA, type TipoTimbratura } from "@/lib/timbrature";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Posizione = { lat: number; lon: number; precisione: number | null };
export type EsitoTimbra = { ok?: string; errore?: string; esito?: string | null; distanza?: number | null };

const FATTO: Record<TipoTimbratura, string> = {
  entrata: "Entrata timbrata",
  inizio_pausa: "Pausa iniziata",
  fine_pausa: "Pausa finita",
  uscita: "Uscita timbrata",
};

function numero(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

export async function timbra(tipo: TipoTimbratura, idLocale: string, posizione: Posizione | null): Promise<EsitoTimbra> {
  await richiediUtente();
  if (!TIPI_TIMBRATURA.includes(tipo)) return { errore: "Timbratura non valida." };
  if (!UUID.test(idLocale)) return { errore: "Timbratura non valida: ricarica la pagina." };

  const lat = numero(posizione?.lat);
  const lon = numero(posizione?.lon);
  const supabase = await creaClientServer();
  const { data: id, error } = await supabase.rpc("timbra", {
    p_tipo: tipo,
    p_lat: lat !== null && lat >= -90 && lat <= 90 ? lat : null,
    p_lon: lon !== null && lon >= -180 && lon <= 180 ? lon : null,
    p_precisione: numero(posizione?.precisione),
    p_id_locale: idLocale,
  });
  if (error) {
    if (error.code === "P0001") return { errore: error.message };
    return { errore: "Timbratura non riuscita. Riprova tra poco." };
  }

  // esito della posizione, per dirlo subito alla persona
  const { data: riga } = await supabase.from("timbrature").select("orario, posizione, distanza_m").eq("id", id).maybeSingle();
  revalidatePath("/timbrature");
  const ora = riga ? new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" }).format(new Date(riga.orario)) : "";
  return { ok: `${FATTO[tipo]}${ora ? ` alle ${ora}` : ""}.`, esito: riga?.posizione ?? null, distanza: riga?.distanza_m ?? null };
}
