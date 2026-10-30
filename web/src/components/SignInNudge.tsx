import { useState } from 'react'
import { ROUTE_HREF } from '../lib/useRoute'
import { useSignedOut } from '../lib/sync'

// A reminder above the ☰ menu while no one is signed in (owner's request 2026-10-30): "Don't forget to sign
// in to save your progress!", linking to the sign-in on Settings. ✕ hides it until the app is next opened
// or reloaded (it isn't remembered). Not on Settings itself, where the sign-in form is.
export function SignInNudge({ raised, hidden }: { raised: boolean; hidden: boolean }) {
  const signedOut = useSignedOut()
  const [dismissed, setDismissed] = useState(false)
  if (!signedOut || dismissed || hidden) return null
  return (
    <div className={raised ? 'sign-in-nudge raised' : 'sign-in-nudge'} role="status">
      <p>
        Don't forget to <a href={ROUTE_HREF.settings}>sign in</a> to save your progress!
      </p>
      <button type="button" className="sign-in-nudge-close" aria-label="Dismiss" onClick={() => setDismissed(true)}>
        ✕
      </button>
    </div>
  )
}
