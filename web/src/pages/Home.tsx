import { STUDY_PLAN } from '../lib/studyPlan'
import { useStored } from '../lib/localStore'
import { ROUTE_HREF } from '../lib/useRoute'
import maiAvatar from '../assets/mai-placeholder.png'

const NONE_DONE: string[] = []

export function Home() {
  const [done, setDone] = useStored<string[]>('mai-tutor:study-plan', NONE_DONE)

  const toggle = (id: string) =>
    setDone((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]))

  const doneCount = STUDY_PLAN.filter((t) => done.includes(t.id)).length

  return (
    <main className="app">
      <p className="wordmark">
        <span className="wordmark-name">MAI</span>
        <span className="wordmark-tagline">your language tutor</span>
      </p>
      <header className="header mai-greeting">
        <img className="mai-avatar large" src={maiAvatar} alt="" />
        <div className="bubble mai">
          <h1>Hi, I'm Mai!</h1>
          <p className="muted">
            I'll help you learn a new language by starting with the way you already talk.
          </p>
        </div>
      </header>

      <section className="card">
        <div className="card-head">
          <h2>Your study plan from Mai</h2>
          <span className="muted">
            {doneCount} of {STUDY_PLAN.length} done
          </span>
        </div>
        <ul className="todo-list">
          {STUDY_PLAN.map((task) => {
            const checked = done.includes(task.id)
            return (
              <li key={task.id} className={checked ? 'done' : undefined}>
                <input
                  type="checkbox"
                  id={`task-${task.id}`}
                  checked={checked}
                  onChange={() => toggle(task.id)}
                />
                <div>
                  <label htmlFor={`task-${task.id}`} className="todo-text">
                    {task.text}
                  </label>
                  <p className="muted">{task.detail}</p>
                  {task.link && (
                    <a className="todo-link" href={ROUTE_HREF[task.link.route]}>
                      {task.link.label} →
                    </a>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="card feature">
        <p className="eyebrow">Available now</p>
        <h2>Personal Word List Discoverer</h2>
        <p className="muted">Chat with Mai and discover your top 100 most-used words.</p>
        <a className="button primary" href={ROUTE_HREF.discover}>
          Open
        </a>
      </section>

      <section className="card">
        <h2>Cheatsheet</h2>
        <p className="muted">Handy word lists to keep nearby, starting with the 100 most common words.</p>
        <a className="button primary" href={ROUTE_HREF.cheatsheet}>
          Open
        </a>
      </section>

      <section className="card">
        <h2>Journal</h2>
        <p className="muted">
          Write (or say) a little about your day in the language you're learning, with photos and stickers. Mai
          corrects it underneath.
        </p>
        <a className="button primary" href={ROUTE_HREF.journal}>
          Open
        </a>
      </section>
    </main>
  )
}
