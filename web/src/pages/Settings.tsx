import { AccountCard } from '../components/AccountCard'
import { useJournalExtraChecks } from '../lib/journal'
import { TARGET_LANGUAGES, useTargetLanguage, type TargetLanguage } from '../lib/languages'

// Dialects grouped under their language ("Vietnamese": Southern, Central, Northern), languages in
// alphabetical order, so the language list stays easy to scan as more are added.
const BY_LANGUAGE = new Map(
  [
    ...TARGET_LANGUAGES.reduce<Map<string, TargetLanguage[]>>(
      (groups, t) => groups.set(t.language, [...(groups.get(t.language) ?? []), t]),
      new Map(),
    ),
  ].sort(([a], [b]) => a.localeCompare(b)),
)

export function Settings() {
  const [target, setTarget] = useTargetLanguage()
  const [extraChecks, setExtraChecks] = useJournalExtraChecks()
  const dialects = BY_LANGUAGE.get(target.language) ?? [target]

  return (
    <main className="app">
      <header className="header">
        <h1>Settings</h1>
      </header>

      <AccountCard />

      <section className="card">
        <div className="card-head">
          <h2>Language you're learning</h2>
        </div>
        <p className="muted">
          Words across the site are translated into this language. Each dialect or country has its own everyday
          words.
        </p>
        {/* Two dropdowns, the language then its dialect or country (owner's request 2026-10-30: one radio
            button per dialect wouldn't scale to many languages). A new language starts on its first one. */}
        <div className="language-pickers">
          <label className="language-picker">
            <span>Language</span>
            <select
              value={target.language}
              onChange={(e) => setTarget(BY_LANGUAGE.get(e.target.value)![0].id)}
            >
              {[...BY_LANGUAGE.keys()].map((language) => (
                <option key={language} value={language}>
                  {language}
                </option>
              ))}
            </select>
          </label>
          {dialects.length > 1 && (
            <label className="language-picker">
              <span>Dialect or country</span>
              <select value={target.id} onChange={(e) => setTarget(e.target.value)}>
                {dialects.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.dialect ?? t.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <p className="muted settings-note">
          More languages are coming as{' '}
          <a href="https://github.com/nguyen18/which-dialect" target="_blank" rel="noreferrer">
            which-dialect
          </a>{' '}
          adds them. Your custom word lists keep the language they were made in.
        </p>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Journal corrections</h2>
        </div>
        <p className="muted">
          Mai always adds missing accents and swaps English words for {target.label} ones. She can also check:
        </p>
        <label className="setting-toggle">
          <input type="checkbox" checked={extraChecks} onChange={(e) => setExtraChecks(e.target.checked)} />
          <span>
            <strong>{target.pronouns ? 'Regional words and pronouns' : 'Regional words'}</strong>
            <span className="muted">
              Words from another {target.code === 'vi' ? 'dialect' : 'region'} (e.g. {target.regionalExample})
              {target.pronouns ? <>, and keeping one word for “I” (“tôi” earlier, “tui” later)</> : null}.
            </span>
          </span>
        </label>
      </section>
    </main>
  )
}
