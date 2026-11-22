// Preventivo per il CLIENTE, da stampare o salvare in PDF (foglio A4, senza menu dell'app).
// Contiene solo: dati dell'azienda, destinatario, fasi con la descrizione per il cliente,
// totali, note per il cliente, condizioni di pagamento, validità e firma per accettazione.
// MAI: ore, costi, ricarico, margine, note interne.
import type { Metadata } from "next";
import Link from "next/link";
import { richiediSezione } from "@/lib/utente";
import { creaClientServer } from "@/lib/supabase/server";
import { euro } from "@/lib/validazioni";
import { ripartisciPrezzo } from "../../../(app)/preventivi/calcoli";
import { dataItaliana, indirizzo } from "../../../(app)/preventivi/comuni";
import BarraStampa from "./BarraStampa";

type Props = { params: Promise<{ id: string }> };

type Cliente = {
  denominazione: string;
  forma: "azienda" | "persona_fisica" | "pubblica_amministrazione";
  indirizzo: string | null;
  civico: string | null;
  cap: string | null;
  comune: string | null;
  provincia: string | null;
  nazione: string;
  paese_iva: string;
  partita_iva: string | null;
  codice_fiscale: string | null;
  codice_ufficio_pa: string | null;
  split_payment: boolean;
  condizione: { descrizione: string } | null;
  contatti: { persona: string | null; riceve_preventivi: boolean; attivo: boolean }[];
};

type Preventivo = {
  id: string;
  numero: string;
  oggetto: string;
  data: string;
  valido_fino: string | null;
  cig: string | null;
  cup: string | null;
  note_cliente: string | null;
  prezzi_fasi_nel_pdf: boolean;
  attivo: boolean;
  cliente: Cliente | null;
  iva: { codice: string; descrizione: string; aliquota: number; natura: string | null } | null;
};

type Azienda = {
  ragione_sociale: string;
  indirizzo: string | null;
  civico: string | null;
  cap: string | null;
  comune: string | null;
  provincia: string | null;
  nazione: string;
  partita_iva: string | null;
  codice_fiscale: string | null;
  telefono: string | null;
  email: string | null;
  pec: string | null;
  sito_web: string | null;
  iban: string | null;
  banca: string | null;
  rea: string | null;
  capitale_sociale: string | null;
  piede_documenti: string | null;
  logo: string | null;
};

async function leggi(id: string) {
  const supabase = await creaClientServer();
  const [risP, risFasi, risCosti, risTot, risAzienda] = await Promise.all([
    supabase
      .from("preventivi")
      .select(
        "id, numero, oggetto, data, valido_fino, cig, cup, note_cliente, prezzi_fasi_nel_pdf, attivo, " +
          "cliente:soggetti(denominazione, forma, indirizzo, civico, cap, comune, provincia, nazione, paese_iva, partita_iva, " +
          "codice_fiscale, codice_ufficio_pa, split_payment, condizione:condizioni_pagamento(descrizione), " +
          "contatti:contatti_soggetto(persona, riceve_preventivi, attivo)), " +
          "iva:codici_iva(codice, descrizione, aliquota, natura)"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("fasi_preventivo").select("id, titolo, descrizione_cliente").eq("preventivo_id", id).eq("attivo", true).order("ordine"),
    supabase.from("fasi_riepilogo").select("fase_id, costo").eq("preventivo_id", id),
    supabase.from("preventivi_riepilogo").select("prezzo, aliquota_iva, iva, totale").eq("preventivo_id", id).maybeSingle(),
    supabase.from("azienda").select("*").maybeSingle(),
  ]);
  const errore = [risP, risFasi, risCosti, risTot, risAzienda].find((r) => r.error)?.error;
  if (errore) console.error("Stampa del preventivo: lettura non riuscita:", errore.message);
  return {
    errore: Boolean(errore),
    p: (risP.data ?? null) as unknown as Preventivo | null,
    fasi: (risFasi.data ?? []) as { id: string; titolo: string; descrizione_cliente: string | null }[],
    costi: new Map((risCosti.data ?? []).map((c) => [c.fase_id as string, Math.round(Number(c.costo) * 100)])),
    tot: risTot.data as { prezzo: number; aliquota_iva: number; iva: number; totale: number } | null,
    azienda: (risAzienda.data ?? null) as Azienda | null,
  };
}

// Il titolo della pagina diventa il nome proposto per il file PDF (es. "Preventivo 23-26 Delta Shop").
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = await creaClientServer();
  const { data } = await supabase.from("preventivi").select("numero, cliente:soggetti(denominazione)").eq("id", id).maybeSingle();
  const d = data as unknown as { numero: string; cliente: { denominazione: string } | null } | null;
  return { title: d ? `Preventivo ${d.numero.replace("/", "-")} ${d.cliente?.denominazione ?? ""}`.trim() : "Preventivo" };
}

const righe = (...parti: (string | null | undefined | false)[]) => parti.filter(Boolean).join(" ");

export default async function StampaPreventivo({ params }: Props) {
  await richiediSezione("/preventivi");
  const { id } = await params;
  const ritorno = indirizzo({ id });
  const { errore, p, fasi, costi, tot, azienda } = await leggi(id);

  if (errore || !p || !tot) {
    return (
      <main className="mx-auto max-w-xl p-8 text-sm text-slate-700">
        <p>{errore ? "Non riesco a leggere il preventivo dal database. Riprova tra poco." : "Preventivo non trovato."}</p>
        <Link href={indirizzo({})} className="text-blue-700 hover:underline">← Torna ai preventivi</Link>
      </main>
    );
  }

  const c = p.cliente;
  const prezzo = Math.round(Number(tot.prezzo) * 100);
  const prezziFasi = p.prezzi_fasi_nel_pdf ? ripartisciPrezzo(prezzo, fasi.map((f) => costi.get(f.id) ?? 0)) : null;
  const aliquota = Number(tot.aliquota_iva);
  const pa = c?.forma === "pubblica_amministrazione";
  const splitPayment = Boolean(pa && c?.split_payment && aliquota > 0);
  const attenzione = c?.contatti.find((x) => x.attivo && x.riceve_preventivi && x.persona)?.persona;
  const sedeCliente = c ? [righe(c.indirizzo, c.civico), righe(c.cap, c.comune, c.provincia && `(${c.provincia})`), c.nazione !== "IT" && c.nazione] : [];
  const fiscaleCliente = c
    ? [
        c.partita_iva && `P.IVA ${c.paese_iva !== "IT" ? c.paese_iva : ""}${c.partita_iva}`,
        c.codice_fiscale && c.codice_fiscale !== c.partita_iva && `C.F. ${c.codice_fiscale}`,
      ]
    : [];

  return (
    <div className="min-h-screen bg-slate-200 py-6 print:min-h-0 print:bg-white print:py-0">
      {/* A4 con margini di 15 mm; i colori di sfondo si stampano anche senza "grafica di sfondo" */}
      <style>{`@page { size: A4; margin: 15mm; } @media print { body { background: white; } * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>
      <BarraStampa ritorno={ritorno} />
      {!p.attivo && (
        <p className="mx-auto mb-3 max-w-[210mm] rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-900 print:hidden">
          Attenzione: questo preventivo è archiviato.
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
              <p>{righe(azienda.indirizzo, azienda.civico)}</p>
              <p>{righe(azienda.cap, azienda.comune, azienda.provincia && `(${azienda.provincia})`)}</p>
              {azienda.partita_iva && <p>P.IVA {azienda.partita_iva}</p>}
              {azienda.codice_fiscale && azienda.codice_fiscale !== azienda.partita_iva && <p>C.F. {azienda.codice_fiscale}</p>}
              {azienda.telefono && <p>Tel. {azienda.telefono}</p>}
              {azienda.email && <p>{azienda.email}</p>}
              {azienda.pec && <p>PEC {azienda.pec}</p>}
              {azienda.sito_web && <p>{azienda.sito_web}</p>}
            </div>
          )}
        </header>

        {/* ---------------- Titolo e destinatario ---------------- */}
        <section className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <h1 className="text-[16pt] font-bold">Preventivo n. {p.numero}</h1>
            <p className="text-slate-700">del {dataItaliana(p.data)}</p>
            <p className="mt-3">
              <span className="text-slate-600">Oggetto: </span>
              <strong>{p.oggetto}</strong>
            </p>
            {(p.cig || p.cup) && (
              <p className="mt-1 text-[9.5pt] text-slate-700">{righe(p.cig && `CIG ${p.cig}`, p.cup && `· CUP ${p.cup}`)}</p>
            )}
          </div>
          <div className="min-w-[70mm] rounded border border-slate-300 p-3">
            <p className="text-[8.5pt] tracking-wide text-slate-500 uppercase">Spett.le</p>
            <p className="font-semibold">{c?.denominazione ?? "—"}</p>
            {sedeCliente.filter(Boolean).map((r, i) => (
              <p key={i}>{r}</p>
            ))}
            {fiscaleCliente.filter(Boolean).map((r, i) => (
              <p key={i} className="text-[9pt] text-slate-700">{r}</p>
            ))}
            {pa && c?.codice_ufficio_pa && <p className="text-[9pt] text-slate-700">Codice ufficio {c.codice_ufficio_pa}</p>}
            {attenzione && <p className="mt-1 text-[9.5pt]">Alla c.a. di {attenzione}</p>}
          </div>
        </section>

        {/* ---------------- Fasi ---------------- */}
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-slate-800 text-left text-[9pt] tracking-wide text-slate-600 uppercase">
              <th className="w-8 py-1.5 pr-2">N.</th>
              <th className="py-1.5 pr-2">Descrizione</th>
              {prezziFasi && <th className="w-32 py-1.5 text-right">Importo</th>}
            </tr>
          </thead>
          <tbody>
            {fasi.map((f, i) => (
              <tr key={f.id} className="break-inside-avoid border-b border-slate-200 align-top">
                <td className="py-2 pr-2 text-slate-600">{i + 1}</td>
                <td className="py-2 pr-2">
                  <p className="font-semibold">{f.titolo}</p>
                  {f.descrizione_cliente && <p className="whitespace-pre-line text-slate-700">{f.descrizione_cliente}</p>}
                </td>
                {prezziFasi && <td className="py-2 text-right whitespace-nowrap tabular-nums">{euro(prezziFasi[i] / 100)}</td>}
              </tr>
            ))}
          </tbody>
        </table>

        {/* ---------------- Totali ---------------- */}
        <section className="ml-auto w-[85mm] break-inside-avoid">
          <Riga testo="Imponibile" valore={euro(tot.prezzo)} />
          {aliquota > 0 ? (
            <Riga testo={`IVA ${String(aliquota).replace(".", ",")}%`} valore={euro(tot.iva)} />
          ) : (
            <Riga testo={`IVA: ${p.iva ? `${p.iva.natura ?? p.iva.codice} – ${p.iva.descrizione}` : "non applicata"}`} valore={euro(0)} />
          )}
          <div className="mt-1 flex justify-between gap-4 border-t-2 border-slate-800 pt-1.5 text-[12pt] font-bold">
            <span>Totale</span>
            <span className="tabular-nums">{euro(tot.totale)}</span>
          </div>
          {splitPayment && (
            <>
              <Riga testo="Netto a pagare" valore={euro(tot.prezzo)} />
              <p className="mt-1 text-[8.5pt] text-slate-600">
                Scissione dei pagamenti (art. 17-ter DPR 633/72): l&apos;IVA è versata dall&apos;ente committente.
              </p>
            </>
          )}
        </section>

        {/* ---------------- Note e condizioni ---------------- */}
        <section className="flex flex-col gap-3 break-inside-avoid text-[10pt]">
          {p.note_cliente && (
            <div>
              <h2 className="font-semibold">Note</h2>
              <p className="whitespace-pre-line text-slate-800">{p.note_cliente}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            {c?.condizione && (
              <p>
                <span className="text-slate-600">Pagamento: </span>
                {c.condizione.descrizione}
              </p>
            )}
            {p.valido_fino && (
              <p>
                <span className="text-slate-600">Offerta valida fino al </span>
                {dataItaliana(p.valido_fino)}
              </p>
            )}
            {azienda?.iban && (
              <p className="col-span-2">
                <span className="text-slate-600">Coordinate bancarie: </span>
                {righe(azienda.banca && `${azienda.banca} –`, `IBAN ${azienda.iban.replace(/(.{4})/g, "$1 ").trim()}`)}
              </p>
            )}
          </div>
        </section>

        {/* ---------------- Firma per accettazione ---------------- */}
        <section className="mt-2 flex justify-end break-inside-avoid">
          <div className="w-[85mm]">
            <p className="text-[9.5pt] text-slate-700">Per accettazione — data, timbro e firma del cliente</p>
            <div className="mt-10 border-b border-slate-500" />
          </div>
        </section>

        {/* ---------------- Piede ---------------- */}
        {azienda && (azienda.rea || azienda.capitale_sociale || azienda.piede_documenti) && (
          <footer className="mt-auto border-t border-slate-300 pt-2 text-center text-[8pt] text-slate-500">
            {azienda.piede_documenti && <p className="whitespace-pre-line">{azienda.piede_documenti}</p>}
            <p>{righe(azienda.ragione_sociale, azienda.rea && `· REA ${azienda.rea}`, azienda.capitale_sociale && `· Capitale sociale ${azienda.capitale_sociale}`)}</p>
          </footer>
        )}
      </article>
    </div>
  );
}

function Riga({ testo, valore }: { testo: string; valore: string }) {
  return (
    <div className="flex justify-between gap-4 py-0.5">
      <span className="text-slate-700">{testo}</span>
      <span className="tabular-nums">{valore}</span>
    </div>
  );
}
