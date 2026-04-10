export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
        Ability Web
      </p>
      <h1 className="mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">
        Business &amp; Government wallets
      </h1>
      <p className="mt-4 text-lg text-slate-600">
        Next.js portal for organizational accounts. Connect this app to{' '}
        <code className="rounded bg-slate-200 px-1.5 py-0.5 text-sm">ability-api</code>{' '}
        (Express + Neon + JWT auth) when you are ready to add sign-in and treasury flows.
      </p>
      <ul className="mt-8 list-inside list-disc space-y-2 text-slate-700">
        <li>Runs on port <strong>3001</strong> by default (mobile API often uses 3000).</li>
        <li>Investor app lives in <code className="text-sm">ability-mobile</code> (Expo).</li>
      </ul>
    </main>
  );
}
