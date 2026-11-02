// The which-dialect data package each language reads, in the functions (./data.ts) and in the web app's
// offline download (web/src/lib/offline). No Deno globals here, so the web app can import it too.
// web/scripts/mirror-data.ts's DATA_SETS must list the same versions.
export const DATA_VERSIONS: Record<string, string> = { en: '0.2.1', vi: '0.2.0', es: '0.2.3' }
