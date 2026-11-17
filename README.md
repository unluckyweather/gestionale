# Gestionale aziendale

App web multiutente: Dashboard, Preventivi, Produzione, Timbrature, Anagrafiche.
Tecnologie: Next.js + TypeScript, database Supabase, hosting Vercel.

## Avvio sul proprio computer

1. Installa le dipendenze (solo la prima volta o quando cambiano):
   ```
   npm install
   ```
2. Inserisci le chiavi di Supabase nel file `.env.local` (modello: `.env.local.example`).
3. Avvia l'app:
   ```
   npm run dev
   ```
4. Apri http://localhost:3000 nel browser.

Per fermare l'app: nel Terminale premi `Ctrl + C`.

## Regole
- `.env.local` contiene le chiavi: non va mai su GitHub (è già escluso in `.gitignore`).
- Si sviluppa su `gestionale-dev`; i dati reali staranno solo su `gestionale-prod`.
