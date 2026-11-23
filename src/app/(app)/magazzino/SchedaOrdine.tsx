// Pagina del singolo ordine d'acquisto (?scheda=ordini&id=… oppure id=nuovo[&articolo=…]):
// legge i dati e li passa al modulo.
import Link from "next/link";
import { creaClientServer } from "@/lib/supabase/server";
import { riquadro } from "../anagrafiche/stile";
import ModuloOrdine, { type ArticoloScelta, type Fornitore, type OrdineSalvato, type RigaSalvata } from "./ModuloOrdine";
import { indirizzo, oggiItalia } from "./comuni";

type Props = { id: string; articolo?: string; modificabile: boolean; ok?: string; errore?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SchedaOrdine({ id, articolo, modificabile, ok, errore }: Props) {
  const nuovo = id === "nuovo";
  if (nuovo && !modificabile) return <Avviso testo="Non hai i permessi per creare ordini d'acquisto." />;
  if (!nuovo && !UUID.test(id)) return <Avviso testo="Ordine non trovato." />;

  const supabase = await creaClientServer();
  const [risOrdine, risRighe, risArrivi, risFornitori, risArticoli, risGiacenze] = await Promise.all([
    nuovo
      ? Promise.resolve({ data: null, error: null })
      : supabase
          .from("ordini_acquisto")
          .select("id, numero, soggetto_id, data, consegna_prevista, stato, riferimento_fornitore, note_fornitore, note, attivo, aggiornato_il")
          .eq("id", id)
          .maybeSingle(),
    nuovo
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from("righe_ordine_acquisto")
          .select("id, articolo_id, descrizione, unita_misura, quantita, costo_unitario")
          .eq("ordine_id", id)
          .eq("attivo", true)
          .order("ordine"),
    nuovo
      ? Promise.resolve({ data: [], error: null })
      : supabase.from("righe_ordine_riepilogo").select("riga_id, arrivato").eq("ordine_id", id),
    supabase
      .from("soggetti")
      .select("id, denominazione, nome_breve, attivo")
      .in("tipo", ["fornitore", "entrambi"])
      .order("denominazione")
      .limit(5000),
    supabase
      .from("articoli")
      .select("id, codice, descrizione, unita_misura, costo_unitario, larghezza_bobina_m, bobina_lunghezza_m, lastra_larghezza_cm, fornitore_id, scorta_minima, attivo")
      .order("descrizione")
      .limit(5000),
    supabase.from("magazzino").select("articolo_id, giacenza, sotto_scorta").limit(5000),
  ]);

  // Se una lettura non va, NON si mostra un ordine incompleto: salvandolo,
  // le righe che non si vedono verrebbero archiviate.
  const errori = [risOrdine, risRighe, risArrivi, risFornitori, risArticoli, risGiacenze].map((r) => r.error).filter(Boolean);
  if (errori.length) {
    console.error("Lettura dell'ordine non riuscita:", errori[0]?.message);
    return <Avviso testo="Non riesco a leggere tutti i dati dell'ordine dal database. Riprova tra poco." />;
  }

  const ordine = (risOrdine.data ?? null) as OrdineSalvato | null;
  if (!nuovo && !ordine) return <Avviso testo="Ordine non trovato." />;

  const arrivi = new Map((risArrivi.data ?? []).map((a) => [a.riga_id as string, Number(a.arrivato)]));
  const righe = ((risRighe.data ?? []) as Omit<RigaSalvata, "arrivato">[]).map((r) => ({ ...r, arrivato: arrivi.get(r.id) ?? 0 }));

  const giacenze = new Map(
    ((risGiacenze.data ?? []) as { articolo_id: string; giacenza: number; sotto_scorta: boolean }[]).map((g) => [g.articolo_id, g])
  );
  const usati = new Set(righe.map((r) => r.articolo_id));
  // articoli: gli attivi, più quelli già nell'ordine anche se archiviati
  const articoli: ArticoloScelta[] = (
    (risArticoli.data ?? []) as Omit<ArticoloScelta, "giacenza" | "sotto_scorta">[]
  )
    .filter((a) => a.attivo || usati.has(a.id))
    .map((a) => ({ ...a, giacenza: Number(giacenze.get(a.id)?.giacenza ?? 0), sotto_scorta: Boolean(giacenze.get(a.id)?.sotto_scorta) }));
  const fornitori = ((risFornitori.data ?? []) as Fornitore[]).filter((f) => f.attivo || f.id === ordine?.soggetto_id);

  // «Ordina» da un articolo: nuovo ordine al suo fornitore abituale, con quell'articolo dentro
  const daArticolo = nuovo && articolo ? articoli.find((a) => a.id === articolo) : undefined;

  return (
    <ModuloOrdine
      key={ordine ? `${ordine.id}-${ordine.aggiornato_il}` : `nuovo-${articolo ?? ""}`}
      ordine={ordine}
      righe={righe}
      fornitori={fornitori}
      articoli={articoli}
      daArticolo={daArticolo}
      oggi={oggiItalia()}
      modificabile={modificabile}
      ok={ok}
      errore={errore}
    />
  );
}

function Avviso({ testo }: { testo: string }) {
  return (
    <div className={`${riquadro} flex flex-col gap-2 p-6 text-sm text-slate-600`}>
      <p>{testo}</p>
      <Link href={indirizzo({ scheda: "ordini" })} className="text-blue-700 hover:underline">← Torna agli ordini</Link>
    </div>
  );
}
