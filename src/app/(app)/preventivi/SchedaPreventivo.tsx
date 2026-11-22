// Pagina del singolo preventivo (?id=… oppure ?id=nuovo): legge i dati e li passa al modulo.
import Link from "next/link";
import { creaClientServer } from "@/lib/supabase/server";
import { riquadro } from "../anagrafiche/stile";
import ModuloPreventivo from "./ModuloPreventivo";
import { indirizzo } from "./comuni";
import type { ArticoloScelto, Cliente, CodiceIvaScelto, FaseSalvata, PreventivoSalvato, TariffaScelta } from "./tipi";

type Props = { id: string; modificabile: boolean; ok?: string; errore?: string };

/** Oggi in Italia, come "2026-11-22" (il server potrebbe stare in un altro fuso orario). */
function oggi(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
}

export default async function SchedaPreventivo({ id, modificabile, ok, errore }: Props) {
  const nuovo = id === "nuovo";
  if (nuovo && !modificabile) return <Avviso testo="Non hai i permessi per creare preventivi." />;

  const supabase = await creaClientServer();
  const [risPreventivo, risFasi, risClienti, risTariffe, risArticoli, risIva] = await Promise.all([
    nuovo
      ? Promise.resolve({ data: null })
      : supabase
          .from("preventivi")
          .select(
            "id, numero, soggetto_id, oggetto, modello_id, data, valido_fino, stato, ricarico_percentuale, prezzo_cliente, codice_iva_id, cig, cup, note, attivo, aggiornato_il"
          )
          .eq("id", id)
          .maybeSingle(),
    nuovo
      ? Promise.resolve({ data: [] })
      : supabase
          .from("fasi_preventivo")
          .select(
            "id, titolo, descrizione_cliente, ordine, ore_fase(id, fase_id, tariffa_id, ore, persone, costo_orario, attivo, ordine), materiali_fase(id, fase_id, articolo_id, descrizione, unita_misura, larghezza_m, metri_lineari, quantita, costo_unitario, addebito_lastra, lastra_larghezza_cm, lastra_altezza_cm, costo_lastra, pezzo_larghezza_cm, pezzo_altezza_cm, pezzi, margine_taglio_cm, scarto_percentuale, attivo, ordine)"
          )
          .eq("preventivo_id", id)
          .eq("attivo", true)
          .order("ordine")
          .order("ordine", { referencedTable: "ore_fase" })
          .order("ordine", { referencedTable: "materiali_fase" }),
    supabase
      .from("soggetti")
      .select("id, denominazione, nome_breve, comune, forma, codice_iva_abituale_id, attivo")
      .in("tipo", ["cliente", "entrambi"])
      .order("denominazione")
      .limit(5000),
    supabase.from("tariffe_orarie").select("id, nome, costo_orario, attivo").order("tipo").order("nome"),
    supabase
      .from("articoli")
      .select("id, codice, descrizione, unita_misura, costo_unitario, larghezza_bobina_m, lastra_larghezza_cm, lastra_altezza_cm")
      .eq("attivo", true)
      .order("descrizione")
      .limit(5000),
    supabase
      .from("codici_iva")
      .select("id, codice, descrizione, aliquota, attivo")
      .order("aliquota", { ascending: false })
      .order("codice"),
  ]);

  // Se una lettura non va, NON si mostra un preventivo incompleto: salvandolo,
  // le fasi che non si vedono verrebbero archiviate.
  const letturaFallita = [risPreventivo, risFasi, risClienti, risTariffe, risArticoli, risIva].find(
    (r) => "error" in r && r.error
  ) as { error: { message: string } } | undefined;
  if (letturaFallita) {
    console.error("Lettura del preventivo non riuscita:", letturaFallita.error.message);
    return (
      <Avviso testo="Non riesco a leggere tutti i dati del preventivo dal database, quindi non lo mostro per evitare di salvarlo incompleto. Se è appena stata aggiunta una migrazione, controlla che sia applicata; altrimenti riprova tra poco." />
    );
  }

  const preventivo = (risPreventivo.data ?? null) as PreventivoSalvato | null;
  if (!nuovo && !preventivo) return <Avviso testo="Preventivo non trovato." />;

  // solo le righe attive (quelle tolte restano nel database come storico)
  const fasi = ((risFasi.data ?? []) as FaseSalvata[]).map((f) => ({
    ...f,
    ore_fase: f.ore_fase.filter((r) => r.attivo),
    materiali_fase: f.materiali_fase.filter((r) => r.attivo),
  }));

  // clienti: gli attivi, più quello del preventivo anche se archiviato
  const clienti = ((risClienti.data ?? []) as Cliente[]).filter((c) => c.attivo || c.id === preventivo?.soggetto_id);

  return (
    <ModuloPreventivo
      key={preventivo ? `${preventivo.id}-${preventivo.aggiornato_il}` : "nuovo"}
      preventivo={preventivo}
      fasi={fasi}
      clienti={clienti}
      tariffe={(risTariffe.data ?? []) as TariffaScelta[]}
      articoli={(risArticoli.data ?? []) as ArticoloScelto[]}
      codiciIva={(risIva.data ?? []) as CodiceIvaScelto[]}
      oggi={oggi()}
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
      <Link href={indirizzo({})} className="text-blue-700 hover:underline">← Torna all&apos;elenco</Link>
    </div>
  );
}
