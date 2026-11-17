import { richiediSezione } from "@/lib/utente";

export default async function Produzione() {
  await richiediSezione("/produzione");

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">Produzione</h1>
      <p className="text-slate-600">Sezione in costruzione.</p>
    </div>
  );
}
