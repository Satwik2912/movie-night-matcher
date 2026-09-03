import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Clapperboard, LogIn, Mail, UserPlus } from 'lucide-react'
import type { User } from 'firebase/auth'
import { completeGoogleRedirect, observeAuth, registerWithEmail, signInWithEmail, signInWithGoogle } from '../services/auth'

type AuthGateProps = {
  children: (user: User, signOut: () => Promise<void>) => ReactNode
  signOut: () => Promise<void>
}

type AuthMode = 'sign-in' | 'register'

const firebaseConfigured = Boolean(
  import.meta.env.VITE_FIREBASE_API_KEY &&
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN &&
    import.meta.env.VITE_FIREBASE_PROJECT_ID &&
    import.meta.env.VITE_FIREBASE_APP_ID,
)

function readableError(error: unknown) {
  if (!(error instanceof Error)) return 'Unable to complete authentication. Please try again.'
  const messages: Record<string, string> = {
    'auth/invalid-credential': 'That email or password is not correct.',
    'auth/email-already-in-use': 'An account already exists for this email address.',
    'auth/weak-password': 'Choose a password with at least 6 characters.',
    'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
    'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Allow pop-ups and try again.',
    'auth/unauthorized-domain': 'This domain has not been authorized in Firebase Authentication.',
  }
  return messages[error.message.match(/auth\/[\w-]+/)?.[0] ?? ''] ?? error.message
}

function withTimeout<T>(operation: Promise<T>, message: string) {
  return Promise.race([
    operation,
    new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error(message)), 20_000)),
  ])
}

export function AuthGate({ children, signOut }: AuthGateProps) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<AuthMode>('sign-in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!firebaseConfigured) {
      setLoading(false)
      return
    }
    void completeGoogleRedirect()
      .then((redirectUser) => {
        if (redirectUser) {
          setUser(redirectUser)
          setLoading(false)
        }
      })
      .catch((redirectError) => {
        setError(readableError(redirectError))
        setLoading(false)
      })
    return observeAuth((nextUser) => {
      setUser(nextUser)
      setLoading(false)
    })
  }, [])

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    try {
      if (mode === 'register') await withTimeout(registerWithEmail(name.trim(), email.trim(), password), 'Sign-up timed out. Check your Firebase Authentication providers and connection, then try again.')
      else await withTimeout(signInWithEmail(email.trim(), password), 'Sign-in timed out. Check your Firebase Authentication providers and connection, then try again.')
    } catch (authError) {
      setError(readableError(authError))
    } finally {
      setPending(false)
    }
  }

  async function handleGoogleSignIn() {
    setPending(true)
    setError('')
    try {
      await withTimeout(signInWithGoogle(), 'Google sign-in could not begin. Check Firebase authorized domains and try again.')
    } catch (authError) {
      setError(readableError(authError))
    } finally {
      setPending(false)
    }
  }

  if (loading) return <div className="auth-loading">Loading Night Watcher...</div>
  if (user) return <>{children(user, signOut)}</>

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="auth-heading">
        <div className="auth-brand"><span><Clapperboard size={22} /></span> night<span>watcher</span></div>
        <p className="kicker">MOVIES ARE BETTER TOGETHER</p>
        <h1 id="auth-heading">Your next great<br /><em>movie night.</em></h1>
        {!firebaseConfigured ? (
          <div className="auth-notice"><strong>Firebase configuration is missing.</strong><span>Add the `VITE_FIREBASE_*` values to `.env.local`, restart Vite, then return here.</span></div>
        ) : (
          <>
            <button className="google-button" onClick={handleGoogleSignIn} disabled={pending}><span className="google-g">G</span> {pending ? 'Opening Google...' : 'Continue with Google'}</button>
            <div className="auth-divider"><span>or continue with email</span></div>
            <form className="auth-form" onSubmit={handleEmailSubmit}>
              {mode === 'register' && <label>Name<input value={name} onChange={(event) => setName(event.target.value)} minLength={2} required autoComplete="name" placeholder="Your name" /></label>}
              <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required autoComplete="email" placeholder="you@example.com" /></label>
              <label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required minLength={6} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} placeholder="At least 6 characters" /></label>
              {error && <p className="auth-error" role="alert">{error}</p>}
              <button className="auth-submit" disabled={pending} type="submit">{mode === 'register' ? <UserPlus size={16} /> : <LogIn size={16} />}{pending ? 'Working...' : mode === 'register' ? 'Create account' : 'Sign in'}</button>
            </form>
            <button className="auth-switch" onClick={() => { setMode(mode === 'sign-in' ? 'register' : 'sign-in'); setError('') }}>{mode === 'sign-in' ? 'New here? Create an account' : 'Already have an account? Sign in'}</button>
          </>
        )}
        <p className="auth-footnote"><Mail size={13} /> Private rooms. Shared decisions.</p>
      </section>
    </main>
  )
}
