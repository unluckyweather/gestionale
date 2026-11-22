"use client";
// Dati dell'azienda per l'intestazione dei documenti (preventivi, poi fatture). Solo titolare.
// Il logo si sceglie dal computer e viene salvato come immagine "incorporata" (massimo 300 KB).
import { useActionState, useState } from "react";
import { salvaAzienda, type StatoAzienda } from "./azioni";

export type Azienda = {
  id: string;
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
  aggiornato_il: string;
};

const campo =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20";
const etichetta = "flex flex-col gap-1 text-xs font-medium text-slate-500";
const MAX_LOGO = 300 * 1024;

export default function ModuloAzienda({ azienda }: { azienda: Azienda | null }) {
  const [stato, azione, inCorso] = useActionState<StatoAzienda, FormData>(salvaAzienda, {});
  const v = (nome: keyof Azienda) => (stato.valori ? (stato.valori[nome] ?? "") : String(azienda?.[nome] ?? ""));
  const [logo, setLogo] = useState(() => v("logo"));
  const [erroreLogo, setErroreLogo] = useState<string | null>(null);

  function scegliLogo(file: File | undefined) {
    setErroreLogo(null);
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(file.type))
      return setErroreLogo("Scegli un'immagine PNG, JPG, WebP o SVG.");
    if (file.size > MAX_LOGO) return setErroreLogo(`Il file è di ${Math.round(file.size / 1024)} KB: il massimo è 300 KB.`);
    const lettore = new FileReader();
    lettore.onload = () => setLogo(String(lettore.result));
    lettore.readAsDataURL(file);
  }

  const testo = (nome: keyof Azienda, titolo: string, extra: { placeholder?: string; classe?: string; tipo?: string } = {}) => (
    <label className={`${etichetta} ${extra.classe ?? ""}`}>
      {titolo}
      <input name={nome} type={extra.tipo ?? "text"} defaultValue={v(nome)} placeholder={extra.placeholder} className={campo} />
    </label>
  );

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-4">
        <h2 className="font-semibold">Dati dell&apos;azienda</h2>
        <p className="mt-1 text-sm text-slate-500">
          Vanno nell&apos;intestazione dei preventivi stampati (e poi delle fatture). Li vedono tutti gli uffici, li modifica
          solo il titolare.
        </p>
      </div>
      <form action={azione} className="flex flex-col gap-4 p-4">
        <input type="hidden" name="id" value={azienda?.id ?? ""} />
        <input type="hidden" name="logo" value={logo} />
        {stato.errore && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{stato.errore}</p>}
        {!azienda && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Non ci sono ancora i dati dell&apos;azienda: i preventivi stampati avranno l&apos;intestazione vuota finché non li salvi.
          </p>
        )}

        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
          {testo("ragione_sociale", "Ragione sociale *", { classe: "col-span-full sm:col-span-2" })}
          {testo("partita_iva", "Partita IVA")}
          {testo("codice_fiscale", "Codice fiscale")}
          {testo("indirizzo", "Indirizzo (sede legale)", { classe: "sm:col-span-2" })}
          {testo("civico", "Civico")}
          {testo("cap", "CAP")}
          {testo("comune", "Comune")}
          {testo("provincia", "Provincia", { placeholder: "es. PD" })}
          {testo("nazione", "Nazione", { placeholder: "IT" })}
          {testo("telefono", "Telefono")}
          {testo("email", "Email", { tipo: "email" })}
          {testo("pec", "PEC", { tipo: "email" })}
          {testo("sito_web", "Sito web")}
          {testo("iban", "IBAN (per i pagamenti)", { classe: "sm:col-span-2" })}
          {testo("banca", "Banca")}
          {testo("rea", "Numero REA", { placeholder: "es. PD-123456" })}
          {testo("capitale_sociale", "Capitale sociale", { placeholder: "es. € 10.000,00 i.v." })}
          <label className={`${etichetta} col-span-full`}>
            Testo in fondo ai documenti (facoltativo)
            <textarea name="piede_documenti" rows={2} defaultValue={v("piede_documenti")} className={campo} />
          </label>
        </div>

        <fieldset className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 p-3">
          <legend className="px-1 text-xs font-medium text-slate-500">Logo</legend>
          <div className="flex h-20 w-48 items-center justify-center rounded border border-dashed border-slate-300 bg-slate-50">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="Logo dell'azienda" className="max-h-16 max-w-44 object-contain" />
            ) : (
              <span className="text-xs text-slate-400">nessun logo</span>
            )}
          </div>
          <div className="flex flex-col gap-2 text-sm">
            <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-4 font-semibold text-slate-700 hover:bg-slate-50">
              {logo ? "Cambia logo…" : "Scegli il logo…"}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e) => scegliLogo(e.target.files?.[0])} className="sr-only" />
            </label>
            {logo && (
              <button type="button" onClick={() => setLogo("")} className="self-start text-xs text-slate-500 hover:text-red-700 hover:underline">
                Togli il logo
              </button>
            )}
            <span className="text-xs text-slate-500">PNG, JPG, WebP o SVG, massimo 300 KB. Meglio con sfondo trasparente.</span>
            {erroreLogo && <span role="alert" className="text-xs text-red-700">{erroreLogo}</span>}
          </div>
        </fieldset>

        <button disabled={inCorso} className="self-start rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
          {inCorso ? "Salvataggio…" : "Salva i dati dell'azienda"}
        </button>
      </form>
    </section>
  );
}
