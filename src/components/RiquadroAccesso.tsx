// Riquadro centrato delle pagine di accesso (login, password dimenticata, nuova password).
export default function RiquadroAccesso({
  titolo,
  sottotitolo,
  children,
}: {
  titolo: string;
  sottotitolo?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-2xl font-bold text-slate-900">
          Gestionale<span className="text-blue-400">.</span>
        </div>
        <h1 className="mb-1 text-lg font-semibold">{titolo}</h1>
        {sottotitolo && <p className="mb-6 text-sm text-slate-500">{sottotitolo}</p>}
        {children}
      </div>
    </div>
  );
}
