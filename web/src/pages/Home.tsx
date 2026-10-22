import maiAvatar from '../assets/mai-placeholder.png'

export function Home() {
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
    </main>
  )
}
