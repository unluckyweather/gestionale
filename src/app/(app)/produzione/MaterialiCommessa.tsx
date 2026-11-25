// Sezione «Materiali» della commessa: materiale previsto dal preventivo (nell'unità
// di magazzino), già usato (scarichi della commessa), in magazzino; titolare e ufficio
// confermano il materiale usato e lo scaricano (0011). La contabilità la vede soltanto.
import Link from "next/link";
import { creaClientServer } from "@/lib/supabase/server";
import { quantitaConUnita, unitaMagazzino } from "@/lib/magazzino";
import { riquadro } from "../anagrafiche/stile";
import { bozzaFasi } from "../preventivi/bozze";
import { disponibilita } from "../preventivi/disponibilita";
import { leggiFasi, leggiTariffeArticoli } from "../preventivi/letture";
import ModuloMateriali, { type RigaMateriale } from "./ModuloMateriali";
import { oggiIt } from "@/lib/produzione";

export default async function MaterialiCommessa({
  commessaId, preventivoId, modificabile, attiva,
}: { commessaId: string; preventivoId: string | null; modificabile: boolean; attiva: boolean }) {
  const supabase = await creaClientServer();
  const [scelte, fasi, risUsati] = await Promise.all([
    leggiTariffeArticoli(supabase),
    preventivoId ? leggiFasi(supabase, { preventivo: preventivoId }) : Promise.resolve([]),
    supabase.from("materiali_commessa").select("articolo_id, usato").eq("commessa_id", commessaId),
  ]);
  if (!scelte || fasi === null || risUsati.error) {
    return <p className={`${riquadro} p-4 text-sm text-slate-600`}>Non riesco a leggere i materiali della commessa. Riprova tra poco.</p>;
  }

  const bozze = bozzaFasi(fasi);
  const previsti = disponibilita(bozze, scelte.articoli);
  const aMano = bozze.flatMap((f) => f.materiali).filter((m) => !m.articolo_id).map((m) => m.descrizione).filter(Boolean);
  const usati = new Map(((risUsati.data ?? []) as { articolo_id: string; usato: number }[]).map((u) => [u.articolo_id, Number(u.usato)]));
  const perId = new Map(scelte.articoli.map((a) => [a.id, a]));

  // una riga per ogni articolo previsto o già usato
  const ids = [...new Set([...previsti.map((p) => p.articolo.id), ...usati.keys()])];
  const righe: RigaMateriale[] = ids
    .map((id) => {
      const p = previsti.find((x) => x.articolo.id === id);
      const a = p?.articolo ?? perId.get(id);
      if (!a) return null; // articolo archiviato: si vede nel Magazzino
      const unita = p?.unita ?? unitaMagazzino({ ...a, bobina_lunghezza_m: a.bobina_lunghezza_m ?? null });
      const usato = usati.get(id) ?? 0;
      const previsto = p ? p.servono : null;
      // proposta: quello che manca (lastre e bobine intere), mai negativa
      let proposta = previsto === null ? 0 : Math.max(previsto - usato, 0);
      if (unita === "lastra" || unita === "bobina") proposta = Math.ceil(proposta);
      return {
        articolo_id: id,
        nome: [a.codice, a.descrizione].filter(Boolean).join(" · "),
        unita,
        previsto,
        dalPreventivo: Boolean(p),
        usato,
        giacenza: Number(a.giacenza ?? 0),
        proposta: Math.round(proposta * 1000) / 1000,
      };
    })
    .filter((r): r is RigaMateriale => r !== null);

  return (
    <section aria-label="Materiali" className={riquadro}>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
        <div className="min-w-60 flex-1">
          <h2 className="font-semibold">Materiali</h2>
          <p className="mt-1 text-sm text-slate-500">
            {preventivoId
              ? "Previsti dal preventivo (in lastre, bobine o pezzi interi). Il magazzino scende quando confermi il materiale usato davvero."
              : "Commessa senza preventivo: aggiungi gli articoli usati. Il magazzino scende quando confermi."}
          </p>
        </div>
        <Link href={`/magazzino`} className="text-sm font-semibold text-blue-700 hover:underline">Magazzino →</Link>
      </div>
      {aMano.length > 0 && (
        <p className="border-b border-slate-200 px-4 py-2 text-xs text-slate-500">
          Materiali scritti a mano nel preventivo, non in magazzino: {aMano.join(", ")}.
        </p>
      )}
      {modificabile && attiva ? (
        <ModuloMateriali key={righe.map((r) => `${r.articolo_id}:${r.usato}:${r.giacenza}`).join()} commessaId={commessaId} righe={righe} articoli={scelte.articoli.map((a) => ({
          articolo_id: a.id,
          nome: [a.codice, a.descrizione].filter(Boolean).join(" · "),
          unita: unitaMagazzino({ ...a, bobina_lunghezza_m: a.bobina_lunghezza_m ?? null }),
          giacenza: Number(a.giacenza ?? 0),
        }))} oggi={oggiIt()} />
      ) : righe.length === 0 ? (
        <p className="p-4 text-sm text-slate-500">Nessun materiale.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-500">
                <th className="px-4 py-2">Articolo</th>
                <th className="px-4 py-2 text-right">Previsto</th>
                <th className="px-4 py-2 text-right">Usato</th>
                <th className="px-4 py-2 text-right">In magazzino</th>
              </tr>
            </thead>
            <tbody>
              {righe.map((r) => (
                <tr key={r.articolo_id} className="border-b border-slate-100">
                  <td className="px-4 py-2">{r.nome}</td>
                  <td className="px-4 py-2 text-right">{r.previsto === null ? "—" : quantitaConUnita(r.previsto, r.unita)}</td>
                  <td className="px-4 py-2 text-right">{quantitaConUnita(r.usato, r.unita)}</td>
                  <td className="px-4 py-2 text-right">{quantitaConUnita(r.giacenza, r.unita)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
