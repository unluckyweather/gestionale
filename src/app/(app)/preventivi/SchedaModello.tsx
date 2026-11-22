// Pagina di un modello di lavorazione (?scheda=modelli&id=… oppure id=nuovo).
import { creaClientServer } from "@/lib/supabase/server";
import ModuloModello from "./ModuloModello";
import { Avviso } from "./SchedaPreventivo";
import { indirizzo } from "./comuni";
import { leggiFasi, leggiTariffeArticoli } from "./letture";
import type { ModelloSalvato } from "./tipi";

type Props = { id: string; modificabile: boolean; ok?: string; errore?: string };

export default async function SchedaModello({ id, modificabile, ok, errore }: Props) {
  const nuovo = id === "nuovo";
  const ritorno = indirizzo({ scheda: "modelli" });
  if (nuovo && !modificabile) return <Avviso testo="Non hai i permessi per creare modelli." ritorno={ritorno} />;

  const supabase = await creaClientServer();
  const [risModello, fasi, scelte] = await Promise.all([
    nuovo
      ? Promise.resolve({ data: null, error: null })
      : supabase
          .from("modelli_lavorazione")
          .select("id, nome, descrizione, ricarico_percentuale, note, attivo, aggiornato_il")
          .eq("id", id)
          .maybeSingle(),
    nuovo ? Promise.resolve([]) : leggiFasi(supabase, { modelli: [id] }),
    leggiTariffeArticoli(supabase),
  ]);

  // come per i preventivi: se manca un dato non si mostra un modello incompleto
  if (risModello.error || fasi === null || scelte === null) {
    return <Avviso testo="Non riesco a leggere tutti i dati del modello, quindi non lo mostro. Riprova tra poco." ritorno={ritorno} />;
  }
  const modello = (risModello.data ?? null) as ModelloSalvato | null;
  if (!nuovo && !modello) return <Avviso testo="Modello non trovato." ritorno={ritorno} />;

  return (
    <ModuloModello
      key={modello ? `${modello.id}-${modello.aggiornato_il}` : "nuovo"}
      modello={modello}
      fasi={fasi}
      tariffe={scelte.tariffe}
      articoli={scelte.articoli}
      modificabile={modificabile}
      ok={ok}
      errore={errore}
    />
  );
}
