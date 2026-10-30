# Mai: the web app

The front end of [Mai](https://mai-tutor.com): React 19, Vite and TypeScript, deployed on Vercel. See the
[README](../README.md) for what the app does, and [`ARCHITECTURE.md`](../ARCHITECTURE.md) for how it's built.

```sh
npm install
npm run dev     # the app, at http://localhost:5173
npm run build   # type-check and bundle
npm run lint    # oxlint
```

The backend features (translations, journal corrections, accounts) need the local Supabase: run
`scripts/local.sh` from the repo root, or put a project's URL and publishable key in `.env.local` (see
`.env.example`).
