import { useState, type FormEvent } from 'react'
import { backendConfigured } from '../lib/backend'
import { requestSync, signIn, signOut, useSyncStatus } from '../lib/sync'

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

// Settings' account section: sign in to save the journal, words and settings to your account and get
// them on every device (lib/sync.ts). There's no sign-up: accounts are made in the Supabase dashboard.
export function AccountCard() {
  const status = useSyncStatus()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email.trim(), password)
      setPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't sign in.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>Your account</h2>
      </div>
      {!backendConfigured ? (
        <p className="muted">Accounts need the backend, which isn't set up here.</p>
      ) : status.state === 'signed-out' ? (
        <>
          <p className="muted">
            Sign in to save your journal, words and settings to your account, so they're on every device you use.
            What's already on this device is added when you sign in.
          </p>
          <form className="account-form" onSubmit={submit}>
            <div className="form-row">
              <input
                type="email"
                autoComplete="username"
                placeholder="Email"
                aria-label="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <input
                type="password"
                autoComplete="current-password"
                placeholder="Password"
                aria-label="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button type="submit" className="primary" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </div>
            {error && <p className="error">{error}</p>}
          </form>
        </>
      ) : (
        <>
          <p>
            Signed in as <strong>{status.email}</strong>.
          </p>
          <p className="muted" aria-live="polite">
            {status.state === 'syncing'
              ? 'Saving to your account…'
              : status.state === 'failed'
                ? `Couldn't sync${status.lastSynced ? ` (last synced at ${clock(status.lastSynced)})` : ''}. Your changes are safe on this device.`
                : `Everything is saved to your account${status.lastSynced ? ` (synced at ${clock(status.lastSynced)})` : ''}.`}
          </p>
          {status.state === 'failed' && status.error && <p className="error">{status.error}</p>}
          <div className="account-actions">
            {status.state === 'failed' && (
              <button type="button" className="link" onClick={() => requestSync()}>
                Try again
              </button>
            )}
            <button type="button" className="link" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
          <p className="muted settings-note">Signing out keeps this device's copy; it just stops syncing.</p>
        </>
      )}
    </section>
  )
}
