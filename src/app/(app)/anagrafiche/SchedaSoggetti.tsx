// Scheda Clienti o Fornitori.
// Senza ?id: elenco con ricerca. Con ?id=…: la scheda completa (con ?storico=1 anche lo storico modifiche).
import Link from "next/link";
import { creaClientServer } from "@/lib/supabase/server";
import ModuloSoggetto from "./ModuloSoggetto";
import StoricoModifiche from "./StoricoModifiche";
import { dataOra, leggiTabelle } from "./dati";
import { indirizzo, pulisciRicerca } from "./indirizzo";
import { riquadro } from "./stile";
import { ETICHETTE_FORMA, type Contatto, type Dichiarazione, type Sede, type Soggetto } from "./tipi";

type Props = {
  scheda: "clienti" | "fornitori";
  q?: string;
  id?: string;
  archiviati: boolean;
  storico: boolean;
  modificabile: boolean;
  vedeStorico: boolean; // il registro modifiche lo legge solo il titolare
};

export default async function SchedaSoggetti(props: Props) {
  return props.id ? <Dettaglio {...props} id={props.id} /> : <Elenco {...props} />;
}


// ---------------------------------------------------------------------
// Elenco
// ---------------------------------------------------------------------
type RigaElenco = Pick<
  Soggetto,
  "id" | "tipo" | "forma" | "denominazione" | "nome_breve" | "paese_iva" | "partita_iva" | "comune" | "provincia" | "attivo"
> & { contatti: { email: string | null; telefono: string | null; cellulare: string | null; attivo: boolean }[] };

async function Elenco({ scheda, q, archiviati }: Props) {
  const supabase = await creaClientServer();
  const tipi = scheda === "clienti" ? ["cliente", "entrambi"] : ["fornitore", "entrambi"];
  const ricerca = pulisciRicerca(q);

  let query = supabase
    .from("soggetti")
    .select(
      "id, tipo, forma, denominazione, nome_breve, paese_iva, partita_iva, comune, provincia, attivo, contatti:contatti_soggetto(email, telefono, cellulare, attivo)"
    )
    .in("tipo", tipi)
    .order("denominazione")
    .limit(500);
  if (!archiviati) query = query.eq("attivo", true);
  if (ricerca) {
    const r = `%${ricerca}%`;
    // la ricerca guarda anche le email dei contatti
    const { data: daContatti } = await supabase
      .from("contatti_soggetto")
      .select("soggetto_id")
      .eq("attivo", true)
      .ilike("email", r)
      .limit(200);
    const ids = [...new Set((daContatti ?? []).map((c) => c.soggetto_id as string))];
    const condizioni = [
      `denominazione.ilike.${r}`,
      `nome_breve.ilike.${r}`,
      `partita_iva.ilike.${r}`,
      `codice_fiscale.ilike.${r}`,
      `comune.ilike.${r}`,
      `pec.ilike.${r}`,
    ];
    if (ids.length) condizioni.push(`id.in.(${ids.join(",")})`);
    query = query.or(condizioni.join(","));
  }

  const { data } = await query;
  const elenco = (data ?? []) as RigaElenco[];
  const parola = scheda === "clienti" ? "cliente" : "fornitore";

  return (
    <section aria-label={`Elenco ${scheda}`} className={`${riquadro} min-w-0 overflow-x-auto`}>
      {elenco.length === 0 ? (
        <p className="p-6 text-sm text-slate-500">
          {ricerca ? `Nessun ${parola} trovato per «${ricerca}».` : `Nessun ${parola} inserito.`}
        </p>
      ) : (
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">P.IVA</th>
              <th className="px-4 py-3">Comune</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Telefono</th>
            </tr>
          </thead>
          <tbody>
            {elenco.map((s) => {
              const contatto = s.contatti.find((c) => c.attivo && (c.email || c.telefono || c.cellulare));
              return (
                <tr key={s.id} className={`border-b border-slate-100 hover:bg-slate-50 ${s.attivo ? "" : "text-slate-400"}`}>
                  <td className="px-4 py-3">
                    <Link
                      href={indirizzo({ scheda, id: s.id })}
                      className="font-medium text-slate-900 hover:text-blue-700 hover:underline"
                    >
                      {s.denominazione}
                    </Link>
                    {s.nome_breve && <span className="ml-2 text-xs text-slate-500">{s.nome_breve}</span>}
                    {s.forma !== "azienda" && (
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                        {s.forma === "pubblica_amministrazione" ? "PA" : ETICHETTE_FORMA[s.forma]}
                      </span>
                    )}
                    {s.tipo === "entrambi" && (
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                        {scheda === "clienti" ? "anche fornitore" : "anche cliente"}
                      </span>
                    )}
                    {!s.attivo && <span className="ml-2 text-xs">(archiviato)</span>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {s.partita_iva && (s.paese_iva === "IT" ? s.partita_iva : `${s.paese_iva} ${s.partita_iva}`)}
                  </td>
                  <td className="px-4 py-3">{s.comune}{s.provincia ? ` (${s.provincia})` : ""}</td>
                  <td className="px-4 py-3">{contatto?.email}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{contatto?.telefono || contatto?.cellulare}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {elenco.length === 500 && (
        <p className="p-4 text-xs text-slate-500">Mostrati i primi 500: usa la ricerca per restringere.</p>
      )}
    </section>
  );
}


// ---------------------------------------------------------------------
// Scheda completa
// ---------------------------------------------------------------------
async function Dettaglio({ scheda, id, storico, modificabile, vedeStorico }: Props & { id: string }) {
  const nuovo = id === "nuovo";
  const parola = scheda === "clienti" ? "cliente" : "fornitore";
  if (nuovo && !modificabile) return <Avviso testo="Non hai i permessi per aggiungere schede." scheda={scheda} />;

  const supabase = await creaClientServer();
  const [tabelle, risSoggetto, risContatti, risSedi, risDichiarazioni] = await Promise.all([
    leggiTabelle(supabase),
    nuovo
      ? Promise.resolve({ data: null })
      : supabase
          .from("soggetti")
          .select("*, autore:profili!soggetti_aggiornato_da_fkey(nome_visualizzato)")
          .eq("id", id)
          .maybeSingle(),
    nuovo
      ? Promise.resolve({ data: [] })
      : supabase
          .from("contatti_soggetto")
          .select("id, riferimento, persona, email, telefono, cellulare, riceve_preventivi, riceve_fatture")
          .eq("soggetto_id", id)
          .eq("attivo", true)
          .order("creato_il"),
    nuovo
      ? Promise.resolve({ data: [] })
      : supabase
          .from("sedi_soggetto")
          .select("id, tipo, nome, indirizzo, civico, cap, comune, provincia, nazione, telefono, annotazioni, consegna")
          .eq("soggetto_id", id)
          .eq("attivo", true)
          .order("creato_il"),
    nuovo
      ? Promise.resolve({ data: [] })
      : supabase
          .from("dichiarazioni_intento")
          .select("id, protocollo, data, anno, importo")
          .eq("soggetto_id", id)
          .eq("attivo", true)
          .order("data", { ascending: false }),
  ]);

  const soggetto = (risSoggetto.data ?? null) as Soggetto | null;
  if (!nuovo && !soggetto) return <Avviso testo={`${parola[0].toUpperCase()}${parola.slice(1)} non trovato.`} scheda={scheda} />;

  const ultimaModifica = soggetto
    ? `${dataOra(soggetto.aggiornato_il)}${soggetto.autore?.nome_visualizzato ? ` di ${soggetto.autore.nome_visualizzato}` : ""}`
    : null;

  return (
    <div className="flex flex-col gap-6">
      <ModuloSoggetto
        key={soggetto ? `${soggetto.id}-${soggetto.aggiornato_il}` : "nuovo"}
        soggetto={soggetto}
        contatti={(risContatti.data ?? []) as Contatto[]}
        sedi={(risSedi.data ?? []) as Sede[]}
        dichiarazioni={(risDichiarazioni.data ?? []) as Dichiarazione[]}
        tabelle={tabelle}
        scheda={scheda}
        modificabile={modificabile}
        ultimaModifica={ultimaModifica}
        linkStorico={
          soggetto && vedeStorico ? indirizzo({ scheda, id: soggetto.id, storico: storico ? undefined : "1" }) : null
        }
      />
      {soggetto && vedeStorico && storico && <StoricoModifiche soggettoId={soggetto.id} />}
    </div>
  );
}

function Avviso({ testo, scheda }: { testo: string; scheda: "clienti" | "fornitori" }) {
  return (
    <div className={`${riquadro} flex flex-col gap-2 p-6 text-sm text-slate-600`}>
      <p>{testo}</p>
      <Link href={indirizzo({ scheda })} className="text-blue-700 hover:underline">← Torna all&apos;elenco</Link>
    </div>
  );
}
