// Ordine d'acquisto per il FORNITORE, da stampare o salvare in PDF (foglio A4, senza menu dell'app).
// Contiene: dati dell'azienda, fornitore, articoli con quantità e prezzi (IVA esclusa),
// consegna prevista, luogo di consegna, note per il fornitore. MAI le note interne.
import type { Metadata } from "next";
import Link from "next/link";
import { richiediRuolo } from "@/lib/utente";
import { creaClientServer } from "@/lib/supabase/server";
import { euro } from "@/lib/validazioni";
import { importoRiga, quantita, unita } from "@/lib/magazzino";
import { dataItaliana, indirizzo } from "../../../(app)/magazzino/comuni";
import BarraStampa from "../../preventivi/[id]/BarraStampa";

type Props = { params: Promise<{ id: string }> };

type Fornitore = {
  denominazione: string;
  indirizzo: string | null;
  civico: string | null;
  cap: string | null;
  comune: string | null;
  provincia: string | null;
  nazione: string;
  paese_iva: string;
  partita_iva: string | null;
  codice_fiscale: string | null;
  condizione: { descrizione: string } | null;
};

type Ordine = {
  id: string;
  numero: string;
  data: string;
  consegna_prevista: string | null;
  stato: string;
  riferimento_fornitore: string | null;
  note_fornitore: string | null;
  attivo: boolean;
  fornitore: Fornitore | null;
};

type Riga = {
  id: string;
  descrizione: string;
  unita_misura: string;
  quantita: number;
  costo_unitario: number;
  articolo: { codice: string | null } | null;
};

type Azienda = {
  ragione_sociale: string;
  indirizzo: string | null;
  civico: string | null;
  cap: string | null;
  comune: string | null;
  provincia: string | null;
  partita_iva: string | null;
  codice_fiscale: string | null;
  telefono: string | null;
  email: string | null;
  pec: string | null;
  sito_web: string | null;
  rea: string | null;
  capitale_sociale: string | null;
  piede_documenti: string | null;
  logo: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function leggi(id: string) {
  const supabase = await creaClientServer();
  const [risO, risRighe, risAzienda] = await Promise.all([
    supabase
      .from("ordini_acquisto")
      .select(
        "id, numero, data, consegna_prevista, stato, riferimento_fornitore, note_fornitore, attivo, " +
          "fornitore:soggetti(denominazione, indirizzo, civico, cap, comune, provincia, nazione, paese_iva, partita_iva, " +
          "codice_fiscale, condizione:condizioni_pagamento(descrizione))"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("righe_ordine_acquisto")
      .select("id, descrizione, unita_misura, quantita, costo_unitario, articolo:articoli(codice)")
      .eq("ordine_id", id)
      .eq("attivo", true)
      .order("ordine"),
    supabase.from("azienda").select("*").maybeSingle(),
  ]);
  const errore = [risO, risRighe, risAzienda].find((r) => r.error)?.error;
  if (errore) console.error("Stampa dell'ordine: lettura non riuscita:", errore.message);
  return {
    errore: Boolean(errore),
    o: (risO.data ?? null) as unknown as Ordine | null,
    righe: (risRighe.data ?? []) as unknown as Riga[],
    azienda: (risAzienda.data ?? null) as Azienda | null,
  };
}

// Il titolo della pagina diventa il nome proposto per il file PDF (es. "Ordine 3-26 Plastiche Srl").
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return { title: "Ordine d'acquisto" };
  const supabase = await creaClientServer();
  const { data } = await supabase.from("ordini_acquisto").select("numero, fornitore:soggetti(denominazione)").eq("id", id).maybeSingle();
  const d = data as unknown as { numero: string; fornitore: { denominazione: string } | null } | null;
  return { title: d ? `Ordine ${d.numero.replace("/", "-")} ${d.fornitore?.denominazione ?? ""}`.trim() : "Ordine d'acquisto" };
}

const righeTesto = (...parti: (string | null | undefined | false)[]) => parti.filter(Boolean).join(" ");

export default async function StampaOrdine({ params }: Props) {
  await richiediRuolo("titolare", "ufficio", "contabilita");
  const { id } = await params;
  const ritorno = indirizzo({ scheda: "ordini", id });
  const { errore, o, righe, azienda } = UUID.test(id) ? await leggi(id) : { errore: false, o: null, righe: [], azienda: null };

  if (errore || !o) {
    return (
      <main className="mx-auto max-w-xl p-8 text-sm text-slate-700">
        <p>{errore ? "Non riesco a leggere l'ordine dal database. Riprova tra poco." : "Ordine non trovato."}</p>
        <Link href={indirizzo({ scheda: "ordini" })} className="text-blue-700 hover:underline">← Torna agli ordini</Link>
      </main>
    );
  }

  const f = o.fornitore;
  const imponibile = righe.reduce((s, r) => s + importoRiga(Number(r.quantita), Number(r.costo_unitario)), 0);
  const sedeFornitore = f ? [righeTesto(f.indirizzo, f.civico), righeTesto(f.cap, f.comune, f.provincia && `(${f.provincia})`), f.nazione !== "IT" && f.nazione] : [];
  const fiscaleFornitore = f
    ? [
        f.partita_iva && `P.IVA ${f.paese_iva !== "IT" ? f.paese_iva : ""}${f.partita_iva}`,
        f.codice_fiscale && f.codice_fiscale !== f.partita_iva && `C.F. ${f.codice_fiscale}`,
      ]
    : [];
  const sedeNostra = azienda
    ? righeTesto(righeTesto(azienda.indirizzo, azienda.civico) + ",", azienda.cap, azienda.comune, azienda.provincia && `(${azienda.provincia})`)
    : null;

  return (
    <div className="min-h-screen bg-slate-200 py-6 print:min-h-0 print:bg-white print:py-0">
      <style>{`@page { size: A4; margin: 15mm; } @media print { body { background: white; } * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>
      <BarraStampa ritorno={ritorno} etichetta="← Torna all'ordine" />
      {(!o.attivo || o.stato === "annullato" || o.stato === "bozza") && (
        <p className="mx-auto mb-3 max-w-[210mm] rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-900 print:hidden">
          {!o.attivo
            ? "Attenzione: questo ordine è archiviato."
            : o.stato === "annullato"
              ? "Attenzione: questo ordine è annullato."
              : "Ordine ancora in bozza: dopo averlo mandato al fornitore, segnalo come «inviato»."}
        </p>
      )}

      <article className="mx-auto flex max-w-[210mm] flex-col gap-6 bg-white p-[15mm] text-[10.5pt] leading-snug text-slate-900 shadow-lg print:max-w-none print:p-0 print:shadow-none">
        {/* ---------------- Intestazione: noi ---------------- */}
        <header className="flex items-start justify-between gap-6 border-b border-slate-300 pb-4">
          <div className="min-w-0">
            {azienda?.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={azienda.logo} alt={azienda.ragione_sociale} className="mb-2 max-h-[22mm] max-w-[70mm] object-contain" />
            )}
            <p className="text-[13pt] font-bold">{azienda?.ragione_sociale ?? "— dati dell'azienda da inserire in Impostazioni —"}</p>
          </div>
          {azienda && (
            <div className="text-right text-[9pt] text-slate-700">
              <p>{righeTesto(azienda.indirizzo, azienda.civico)}</p>
              <p>{righeTesto(azienda.cap, azienda.comune, azienda.provincia && `(${azienda.provincia})`)}</p>
              {azienda.partita_iva && <p>P.IVA {azienda.partita_iva}</p>}
              {azienda.codice_fiscale && azienda.codice_fiscale !== azienda.partita_iva && <p>C.F. {azienda.codice_fiscale}</p>}
              {azienda.telefono && <p>Tel. {azienda.telefono}</p>}
              {azienda.email && <p>{azienda.email}</p>}
              {azienda.pec && <p>PEC {azienda.pec}</p>}
              {azienda.sito_web && <p>{azienda.sito_web}</p>}
            </div>
          )}
        </header>

        {/* ---------------- Titolo e fornitore ---------------- */}
        <section className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <h1 className="text-[16pt] font-bold">Ordine d&apos;acquisto n. {o.numero}</h1>
            <p className="text-slate-700">del {dataItaliana(o.data)}</p>
            {o.riferimento_fornitore && (
              <p className="mt-3">
                <span className="text-slate-600">Vostro riferimento: </span>
                {o.riferimento_fornitore}
              </p>
            )}
            {o.consegna_prevista && (
              <p className={o.riferimento_fornitore ? "" : "mt-3"}>
                <span className="text-slate-600">Consegna richiesta entro il </span>
                <strong>{dataItaliana(o.consegna_prevista)}</strong>
              </p>
            )}
          </div>
          <div className="min-w-[70mm] rounded border border-slate-300 p-3">
            <p className="text-[8.5pt] tracking-wide text-slate-500 uppercase">Spett.le</p>
            <p className="font-semibold">{f?.denominazione ?? "—"}</p>
            {sedeFornitore.filter(Boolean).map((r, i) => (
              <p key={i}>{r}</p>
            ))}
            {fiscaleFornitore.filter(Boolean).map((r, i) => (
              <p key={i} className="text-[9pt] text-slate-700">{r}</p>
            ))}
          </div>
        </section>

        {/* ---------------- Articoli ---------------- */}
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-slate-800 text-left text-[9pt] tracking-wide text-slate-600 uppercase">
              <th className="w-8 py-1.5 pr-2">N.</th>
              <th className="py-1.5 pr-2">Descrizione</th>
              <th className="w-28 py-1.5 pr-2 text-right">Quantità</th>
              <th className="w-28 py-1.5 pr-2 text-right">Prezzo unit.</th>
              <th className="w-28 py-1.5 text-right">Importo</th>
            </tr>
          </thead>
          <tbody>
            {righe.map((r, i) => (
              <tr key={r.id} className="break-inside-avoid border-b border-slate-200 align-top">
                <td className="py-2 pr-2 text-slate-600">{i + 1}</td>
                <td className="py-2 pr-2">
                  <p className="font-semibold">{r.descrizione}</p>
                  {r.articolo?.codice && <p className="text-[9pt] text-slate-600">Cod. {r.articolo.codice}</p>}
                </td>
                <td className="py-2 pr-2 text-right whitespace-nowrap tabular-nums">
                  {quantita(r.quantita)} {unita(r.unita_misura, r.quantita)}
                </td>
                <td className="py-2 pr-2 text-right whitespace-nowrap tabular-nums">{euro(r.costo_unitario)}</td>
                <td className="py-2 text-right whitespace-nowrap tabular-nums">{euro(importoRiga(Number(r.quantita), Number(r.costo_unitario)))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ---------------- Totale ---------------- */}
        <section className="ml-auto w-[85mm] break-inside-avoid">
          <div className="flex justify-between gap-4 border-t-2 border-slate-800 pt-1.5 text-[12pt] font-bold">
            <span>Totale imponibile</span>
            <span className="tabular-nums">{euro(imponibile)}</span>
          </div>
          <p className="mt-1 text-right text-[8.5pt] text-slate-600">Importi IVA esclusa</p>
        </section>

        {/* ---------------- Note e condizioni ---------------- */}
        <section className="flex flex-col gap-3 break-inside-avoid text-[10pt]">
          {o.note_fornitore && (
            <div>
              <h2 className="font-semibold">Note</h2>
              <p className="whitespace-pre-line text-slate-800">{o.note_fornitore}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            {sedeNostra && (
              <p className="col-span-2">
                <span className="text-slate-600">Luogo di consegna: </span>
                {azienda?.ragione_sociale}, {sedeNostra}
              </p>
            )}
            {f?.condizione && (
              <p className="col-span-2">
                <span className="text-slate-600">Pagamento: </span>
                {f.condizione.descrizione}
              </p>
            )}
          </div>
          <p className="text-[9.5pt] text-slate-700">
            Vi preghiamo di confermare l&apos;ordine e di indicarne il numero sul documento di trasporto e sulla fattura.
          </p>
        </section>

        {/* ---------------- Firma ---------------- */}
        <section className="mt-2 flex justify-end break-inside-avoid">
          <div className="w-[85mm]">
            <p className="text-[9.5pt] text-slate-700">Timbro e firma</p>
            <div className="mt-10 border-b border-slate-500" />
          </div>
        </section>

        {/* ---------------- Piede ---------------- */}
        {azienda && (azienda.rea || azienda.capitale_sociale || azienda.piede_documenti) && (
          <footer className="mt-auto border-t border-slate-300 pt-2 text-center text-[8pt] text-slate-500">
            {azienda.piede_documenti && <p className="whitespace-pre-line">{azienda.piede_documenti}</p>}
            <p>{righeTesto(azienda.ragione_sociale, azienda.rea && `· REA ${azienda.rea}`, azienda.capitale_sociale && `· Capitale sociale ${azienda.capitale_sociale}`)}</p>
          </footer>
        )}
      </article>
    </div>
  );
}
