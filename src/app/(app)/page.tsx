import { richiediSezione } from "@/lib/utente";
import { ETICHETTE_RUOLO } from "@/lib/ruoli";

function saluto(): string {
  const ora = Number(
    new Intl.DateTimeFormat("it-IT", { hour: "numeric", hour12: false, timeZone: "Europe/Rome" }).format(new Date())
  );
  if (ora < 13) return "Buongiorno";
  if (ora < 18) return "Buon pomeriggio";
  return "Buonasera";
}

export default async function Dashboard() {
  const utente = await richiediSezione("/");

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">
          {saluto()}, {utente.nome}
        </h1>
        <p className="mt-1 text-sm text-slate-500">Accesso come {ETICHETTE_RUOLO[utente.ruolo]}</p>
      </header>
      <div className="max-w-md rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
        Gli indicatori (preventivi aperti, commesse, presenze, task urgenti) arriveranno insieme alle altre sezioni.
      </div>
    </div>
  );
}
