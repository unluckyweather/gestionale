"use client";
// I pulsanti grandi della timbratura, con l'orologio e il tempo in servizio.
// Se il titolare ha acceso il controllo «vicino alla ditta», prima di timbrare
// chiede la posizione al telefono (solo in quel momento; non si salva).
import { useEffect, useState, useTransition } from "react";
import {
  contaMinuti,
  distanzaTesto,
  durataTesto,
  oraRoma,
  statoDopo,
  type Timbratura,
  type TipoTimbratura,
} from "@/lib/timbrature";
import { timbra, type EsitoTimbra, type Posizione } from "./azioniTimbra";

const GIORNO = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Rome" });

/** Chiede la posizione al telefono; null se non la dà (permesso negato, GPS spento, troppo tempo). */
function chiediPosizione(): Promise<{ posizione: Posizione | null; problema?: string }> {
  return new Promise((risolvi) => {
    if (!("geolocation" in navigator)) return risolvi({ posizione: null, problema: "questo telefono non dà la posizione" });
    navigator.geolocation.getCurrentPosition(
      (p) => risolvi({ posizione: { lat: p.coords.latitude, lon: p.coords.longitude, precisione: p.coords.accuracy } }),
      (e) =>
        risolvi({
          posizione: null,
          problema: e.code === e.PERMISSION_DENIED ? "non hai dato il permesso per la posizione" : "la posizione non è arrivata",
        }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  });
}

export default function PulsantiTimbra({ timbrature, controllo }: { timbrature: Timbratura[]; controllo: boolean }) {
  const [adesso, setAdesso] = useState(() => new Date());
  const [inCorso, avvia] = useTransition();
  const [fase, setFase] = useState<string | null>(null);
  const [esito, setEsito] = useState<EsitoTimbra & { problema?: string }>({});
  const [confermaUscita, setConfermaUscita] = useState(false);

  // l'orologio si aggiorna ogni 15 secondi e subito dopo ogni timbratura
  useEffect(() => {
    setAdesso(new Date());
    const t = setInterval(() => setAdesso(new Date()), 15000);
    return () => clearInterval(t);
  }, [timbrature.length]);

  const ultima = timbrature.at(-1);
  const stato = statoDopo(ultima?.tipo);
  const { lavoro, pausa } = contaMinuti(timbrature, adesso);

  function premi(tipo: TipoTimbratura) {
    setConfermaUscita(false);
    setEsito({});
    avvia(async () => {
      let posizione: Posizione | null = null;
      let problema: string | undefined;
      if (controllo) {
        setFase("Cerco la posizione…");
        ({ posizione, problema } = await chiediPosizione());
      }
      setFase("Timbro…");
      try {
        const r = await timbra(tipo, crypto.randomUUID(), posizione);
        setEsito({ ...r, problema: r.ok ? problema : undefined });
      } catch {
        setEsito({ errore: "Nessuna connessione: la timbratura NON è stata registrata. Riprova quando c'è rete." });
      }
      setFase(null);
    });
  }

  const grande = "min-h-24 w-full rounded-2xl px-4 text-lg font-bold disabled:opacity-60";

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col items-center gap-1 rounded-2xl bg-slate-900 p-6 text-center text-white">
        <div className="text-sm text-slate-300 first-letter:uppercase">{GIORNO.format(adesso)}</div>
        <div className="text-5xl font-bold tabular-nums tracking-tight">{oraRoma(adesso)}</div>
        <div className="text-sm text-slate-300">
          {stato === "dentro" && `In servizio · ${durataTesto(lavoro)} lavorate oggi`}
          {stato === "pausa" && `In pausa dalle ${oraRoma(ultima!.orario)} · ${durataTesto(lavoro)} lavorate oggi`}
          {stato === "fuori" && (ultima ? `Fuori servizio dalle ${oraRoma(ultima.orario)} · ${durataTesto(lavoro)} lavorate oggi` : "Non hai ancora timbrato")}
        </div>
      </section>

      {esito.ok && (
        <div role="status" className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-900">
          <p className="font-semibold">{esito.ok}</p>
          {esito.esito === "fuori_zona" && (
            <p className="mt-1">Sei a {distanzaTesto(esito.distanza)} dalla ditta: la timbratura vale, ma il titolare la vedrà segnata «fuori zona».</p>
          )}
          {esito.esito === "non_disponibile" && (
            <p className="mt-1">Timbratura registrata senza posizione ({esito.problema ?? "posizione non arrivata"}): il titolare la vedrà segnata.</p>
          )}
        </div>
      )}
      {esito.errore && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{esito.errore}</p>}

      {stato === "fuori" && (
        <button type="button" disabled={inCorso} onClick={() => premi("entrata")} className={`${grande} bg-green-700 text-white hover:bg-green-800`}>
          {inCorso ? fase : "Timbra entrata"}
        </button>
      )}

      {stato !== "fuori" && !confermaUscita && (
        <div className="grid grid-cols-2 gap-3">
          {stato === "dentro" ? (
            <button type="button" disabled={inCorso} onClick={() => premi("inizio_pausa")} className={`${grande} bg-amber-400 text-slate-900 hover:bg-amber-500`}>
              {inCorso ? fase : "Inizia pausa"}
            </button>
          ) : (
            <button type="button" disabled={inCorso} onClick={() => premi("fine_pausa")} className={`${grande} bg-blue-600 text-white hover:bg-blue-700`}>
              {inCorso ? fase : "Fine pausa"}
            </button>
          )}
          <button type="button" disabled={inCorso} onClick={() => setConfermaUscita(true)} className={`${grande} bg-red-700 text-white hover:bg-red-800`}>
            Timbra uscita
          </button>
        </div>
      )}

      {confermaUscita && (
        <div className="flex flex-col gap-3 rounded-2xl border-2 border-red-300 bg-red-50 p-4">
          <p className="text-center font-semibold text-red-900">Confermi l&apos;uscita? Dopo la può correggere solo l&apos;ufficio.</p>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setConfermaUscita(false)} className="min-h-14 rounded-xl border border-slate-300 bg-white font-semibold text-slate-700">
              Annulla
            </button>
            <button type="button" disabled={inCorso} onClick={() => premi("uscita")} className="min-h-14 rounded-xl bg-red-700 font-bold text-white hover:bg-red-800 disabled:opacity-60">
              {inCorso ? fase : "Sì, esco"}
            </button>
          </div>
        </div>
      )}

      {pausa > 0 && <p className="text-center text-xs text-slate-500">Pausa di oggi: {durataTesto(pausa)}</p>}
      {controllo && (
        <p className="text-center text-xs text-slate-500">
          Quando timbri, il telefono controlla se sei vicino alla ditta. Si salva solo se eri in zona e a che distanza, mai
          dove ti trovi.
        </p>
      )}
    </div>
  );
}
