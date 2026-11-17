import { verificaSupabase } from "@/lib/supabase/verifica";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const stato = await verificaSupabase();

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Dashboard</h1>

      <div className="rounded-lg bg-white p-5 shadow-sm max-w-md">
        <div className="text-sm text-slate-500 mb-1">Collegamento al database</div>
        {stato.ok ? (
          <div className="text-green-700 font-medium">✓ Collegato a Supabase</div>
        ) : (
          <div>
            <div className="text-red-700 font-medium">✗ Non collegato</div>
            <div className="text-sm text-slate-600 mt-1">{stato.motivo}</div>
          </div>
        )}
      </div>
    </div>
  );
}
