import { AccountCard } from '../components/AccountCard'
import { useJournalExtraChecks } from '../lib/journal'
import { TARGET_LANGUAGES, useTargetLanguage, type TargetLanguage } from '../lib/languages'

// Dialects grouped under their language ("Vietnamese": Southern, Central, Northern).
const BY_LANGUAGE = TARGET_LANGUAGES.reduce<Map<string, TargetLanguage[]>>(
  (groups, t) => groups.set(t.language, [...(groups.get(t.language) ?? []), t]),
  new Map(),
)

export function Settings() {
  const [target, setTarget] = useTargetLanguage()
  const [extraChecks, setExtraChecks] = useJournalExtraChecks()

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
        {[...BY_LANGUAGE].map(([language, dialects]) => (
          <fieldset key={language} className="language-group">
            <legend>{language}</legend>
            {dialects.map((t) => (
              <label key={t.id} className={t.id === target.id ? 'language-option picked' : 'language-option'}>
                <input
                  type="radio"
                  name="target-language"
                  value={t.id}
                  checked={t.id === target.id}
                  onChange={() => setTarget(t.id)}
                />
                {t.dialect ?? t.label}
              </label>
            ))}
          </fieldset>
        ))}
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
