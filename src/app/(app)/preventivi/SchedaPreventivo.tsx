// Pagina del singolo preventivo (?id=… oppure ?id=nuovo): legge i dati e li passa al modulo.
import Link from "next/link";
import { creaClientServer } from "@/lib/supabase/server";
import { riquadro } from "../anagrafiche/stile";
import ModuloPreventivo from "./ModuloPreventivo";
import { indirizzo, oggiItalia } from "./comuni";
import { leggiFasi, leggiTariffeArticoli } from "./letture";
import type { Cliente, CodiceIvaScelto, PreventivoSalvato } from "./tipi";

type Props = { id: string; modificabile: boolean; ok?: string; errore?: string };

export default async function SchedaPreventivo({ id, modificabile, ok, errore }: Props) {
  const nuovo = id === "nuovo";
  if (nuovo && !modificabile) return <Avviso testo="Non hai i permessi per creare preventivi." />;

  const supabase = await creaClientServer();
  const [risPreventivo, fasi, scelte, risClienti, risIva, risModelli] = await Promise.all([
    nuovo
      ? Promise.resolve({ data: null, error: null })
      : supabase
          .from("preventivi")
          .select(
            "id, numero, soggetto_id, oggetto, modello_id, data, valido_fino, stato, ricarico_percentuale, prezzo_cliente, codice_iva_id, cig, cup, note, attivo, aggiornato_il"
          )
          .eq("id", id)
          .maybeSingle(),
    nuovo ? Promise.resolve([]) : leggiFasi(supabase, { preventivo: id }),
    leggiTariffeArticoli(supabase),
    supabase
      .from("soggetti")
      .select("id, denominazione, nome_breve, comune, forma, codice_iva_abituale_id, attivo")
      .in("tipo", ["cliente", "entrambi"])
      .order("denominazione")
      .limit(5000),
    supabase
      .from("codici_iva")
      .select("id, codice, descrizione, aliquota, attivo")
      .order("aliquota", { ascending: false })
      .order("codice"),
    supabase.from("modelli_lavorazione").select("id, nome").eq("attivo", true).order("nome"),
  ]);

  // Se una lettura non va, NON si mostra un preventivo incompleto: salvandolo,
  // le fasi che non si vedono verrebbero archiviate.
  const errori = [risPreventivo.error, risClienti.error, risIva.error, risModelli.error].filter(Boolean);
  if (errori.length || fasi === null || scelte === null) {
    if (errori.length) console.error("Lettura del preventivo non riuscita:", errori[0]?.message);
    return (
      <Avviso testo="Non riesco a leggere tutti i dati del preventivo dal database, quindi non lo mostro per evitare di salvarlo incompleto. Se è appena stata aggiunta una migrazione, controlla che sia applicata; altrimenti riprova tra poco." />
    );
  }

  const preventivo = (risPreventivo.data ?? null) as PreventivoSalvato | null;
  if (!nuovo && !preventivo) return <Avviso testo="Preventivo non trovato." />;

  // clienti: gli attivi, più quello del preventivo anche se archiviato
  const clienti = ((risClienti.data ?? []) as Cliente[]).filter((c) => c.attivo || c.id === preventivo?.soggetto_id);

  return (
    <ModuloPreventivo
      key={preventivo ? `${preventivo.id}-${preventivo.aggiornato_il}` : "nuovo"}
      preventivo={preventivo}
      fasi={fasi}
      clienti={clienti}
      tariffe={scelte.tariffe}
      articoli={scelte.articoli}
      codiciIva={(risIva.data ?? []) as CodiceIvaScelto[]}
      modelli={(risModelli.data ?? []) as { id: string; nome: string }[]}
      oggi={oggiItalia()}
      modificabile={modificabile}
      ok={ok}
      errore={errore}
    />
  );
}

export function Avviso({ testo, ritorno = indirizzo({}) }: { testo: string; ritorno?: string }) {
  return (
    <div className={`${riquadro} flex flex-col gap-2 p-6 text-sm text-slate-600`}>
      <p>{testo}</p>
      <Link href={ritorno} className="text-blue-700 hover:underline">← Torna all&apos;elenco</Link>
    </div>
  );
}
