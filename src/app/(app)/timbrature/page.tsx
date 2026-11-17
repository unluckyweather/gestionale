import { richiediSezione } from "@/lib/utente";

export default async function Timbrature() {
  await richiediSezione("/timbrature");

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">Timbrature</h1>
      <p className="text-slate-600">Sezione in costruzione.</p>
    </div>
  );
}
