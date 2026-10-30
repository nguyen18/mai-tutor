// Where which-dialect's data lives in this project's Storage: the public bucket `which-dialect`, one folder
// per language and data package version (`en@0.1.1`, `vi@0.1.4`), filled by web/scripts/mirror-data.ts
// (its DATA_SETS must list the same versions). From the jsDelivr CDN a word took ~20 s, since files nobody
// had asked for recently take ~1 s each; next to the functions every file is fast.
//
// Every function imports which-dialect 0.5.9 (see each deno.json) and reads these. To upgrade: bump the
// imports, the data versions here and in DATA_SETS, run `npm run mirror-data`, and bump `translate`'s
// VERSION (its cached rows are per version).

const STORAGE = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/which-dialect`
export const DATA_VERSIONS: Record<string, string> = { en: '0.2.1', vi: '0.2.0', es: '0.2.1' }

export const dataUrl = (lang: string) => {
  const version = DATA_VERSIONS[lang]
  if (!version) throw new Error(`No which-dialect data for "${lang}" (see _shared/data.ts)`)
  return `${STORAGE}/${lang}@${version}`
}
