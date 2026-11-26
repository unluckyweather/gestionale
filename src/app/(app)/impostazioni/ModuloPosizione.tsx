"use client";
// Impostazioni → Dati dell'azienda → «Timbratura vicino alla ditta» (0013). Solo titolare.
// Posizione della ditta (anche con «Usa la mia posizione», stando in ditta), raggio e
// interruttore del controllo. Una timbratura fuori zona si accetta e si segnala.
import { useActionState, useState } from "react";
import { salvaPosizione, type StatoPosizione } from "./azioni";
import type { Azienda } from "./ModuloAzienda";

const campo =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20";
const etichetta = "flex flex-col gap-1 text-xs font-medium text-slate-500";

export default function ModuloPosizione({ azienda }: { azienda: Azienda }) {
  const [stato, azione, inCorso] = useActionState<StatoPosizione, FormData>(salvaPosizione, {});
  const iniziale = (nome: string, valore: unknown) => (stato.valori ? stato.valori[nome] ?? "" : valore == null ? "" : String(valore));
  const [lat, setLat] = useState(() => iniziale("posizione_lat", azienda.posizione_lat));
  const [lon, setLon] = useState(() => iniziale("posizione_lon", azienda.posizione_lon));
  const [cerco, setCerco] = useState(false);
  const [nota, setNota] = useState<string | null>(null);
  const acceso = stato.valori ? stato.valori.posizione_controllo === "on" : azienda.posizione_controllo;

  function usaPosizione() {
    setNota(null);
    if (!("geolocation" in navigator)) return setNota("Questo dispositivo non dà la posizione.");
    setCerco(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setCerco(false);
        setLat(p.coords.latitude.toFixed(6));
        setLon(p.coords.longitude.toFixed(6));
        setNota(
          `Posizione trovata (precisione circa ${Math.round(p.coords.accuracy)} m).` +
            (p.coords.accuracy > 100 ? " È poco precisa: riprova all'aperto o dal telefono." : "") +
            " Controllala sulla mappa, poi salva."
        );
      },
      (e) => {
        setCerco(false);
        setNota(e.code === e.PERMISSION_DENIED ? "Non hai dato il permesso per la posizione al browser." : "La posizione non è arrivata: riprova.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  const numeri = /^-?\d+([.,]\d+)?$/;
  const mappa =
    numeri.test(lat) && numeri.test(lon)
      ? `https://www.openstreetmap.org/?mlat=${lat.replace(",", ".")}&mlon=${lon.replace(",", ".")}#map=17/${lat.replace(",", ".")}/${lon.replace(",", ".")}`
      : null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-4">
        <h2 className="font-semibold">Timbratura vicino alla ditta</h2>
        <p className="mt-1 text-sm text-slate-500">
          Quando una persona timbra dal telefono, si controlla se è vicino alla ditta. Fuori zona la timbratura{" "}
          <strong>vale lo stesso</strong> ma viene segnalata (non se quel giorno ha una posa nel programma). Si salvano solo
          «in zona / fuori zona» e la distanza, mai dove si trova la persona.
        </p>
      </div>
      <form action={azione} className="flex flex-col gap-4 p-4">
        <input type="hidden" name="id" value={azienda.id} />
        {stato.errore && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{stato.errore}</p>}

        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Prima di accenderlo con i dipendenti veri: parere del consulente del lavoro e informativa scritta ai dipendenti
          (Statuto dei lavoratori, art. 4).
        </p>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
          <label className={etichetta}>
            Latitudine
            <input name="posizione_lat" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="es. 45.406435" className={campo} />
          </label>
          <label className={etichetta}>
            Longitudine
            <input name="posizione_lon" inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} placeholder="es. 11.876761" className={campo} />
          </label>
          <label className={etichetta}>
            Raggio della zona (metri)
            <input name="posizione_raggio_m" inputMode="numeric" defaultValue={iniziale("posizione_raggio_m", azienda.posizione_raggio_m)} className={campo} />
          </label>
        </div>
        <p className="-mt-2 text-xs text-slate-500">
          Consigliati 200 m: dentro i capannoni il GPS sbaglia anche di 50–100 m. Si può scrivere a mano, copiandola da una
          mappa, oppure usare la posizione di questo dispositivo stando in ditta.
        </p>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <button
            type="button"
            onClick={usaPosizione}
            disabled={cerco}
            className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {cerco ? "Cerco la posizione…" : "Usa la mia posizione attuale"}
          </button>
          {mappa && (
            <a href={mappa} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-700 hover:underline">
              Vedi sulla mappa ↗
            </a>
          )}
        </div>
        {nota && <p role="status" className="text-sm text-slate-700">{nota}</p>}

        <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm">
          <input type="checkbox" name="posizione_controllo" defaultChecked={acceso} className="mt-0.5 size-5" />
          <span>
            <span className="font-semibold">Controllo acceso</span>
            <span className="block text-slate-500">Spento: nessuno deve dare la posizione per timbrare.</span>
          </span>
        </label>

        <button disabled={inCorso} className="self-start rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
          {inCorso ? "Salvataggio…" : "Salva la posizione"}
        </button>
      </form>
    </section>
  );
}
