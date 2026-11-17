import { redirect } from "next/navigation";
import { leggiUtente } from "@/lib/utente";
import { esci } from "@/lib/azioni-accesso";

export const dynamic = "force-dynamic";

export default async function AccountNonAttivo() {
  const utente = await leggiUtente();
  if (!utente) redirect("/login");
  if (utente.attivo) redirect("/");

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-2 text-lg font-semibold">Account non ancora attivo</h1>
        <p className="mb-6 text-sm text-slate-600">
          Hai effettuato l&apos;accesso come <strong>{utente.email}</strong>, ma il tuo account non è
          ancora stato attivato (o è stato disattivato). Chiedi al titolare di attivarlo.
        </p>
        <form action={esci}>
          <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50">
            Esci
          </button>
        </form>
      </div>
    </div>
  );
}
