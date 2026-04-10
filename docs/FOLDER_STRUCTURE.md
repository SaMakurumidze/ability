# Ability System — folder layout

```
ability-system/
├── ability-api/          # Express + Neon + @clerk/express (CORE API)
│   ├── src/index.ts
│   ├── legacy/           # Old Prisma code (not in active build)
│   └── package.json
│
├── ability-mobile/       # Expo Router — investors (Clerk Expo)
│   ├── app/
│   ├── components/
│   ├── contexts/
│   ├── lib/
│   ├── app.json
│   └── package.json
│
├── ability-web/          # Next.js App Router — businesses + government
│   ├── app/
│   └── package.json
│
├── docs/
├── package.json          # npm workspaces root
└── README.md
```

## Workspace scripts (root)

- `npm run dev:api` — API
- `npm run dev:mobile` — Expo
- `npm run dev:web` — Next.js (port **3001**)

## Path aliases

- **Mobile:** `@/*` → `ability-mobile/*`
- **Web:** `@/*` → `ability-web/*`
