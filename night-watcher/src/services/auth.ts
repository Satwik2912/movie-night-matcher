import {
  GoogleAuthProvider,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithRedirect,
  signOut,
  setPersistence,
  updateProfile,
  type User,
} from 'firebase/auth'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, db } from './firebase'

const googleProvider = new GoogleAuthProvider()

type ProfileDetails = {
  displayName?: string | null
  email?: string | null
  photoURL?: string | null
}

async function saveProfile(user: User, details: ProfileDetails = {}) {
  await setDoc(
    doc(db, 'users', user.uid),
    {
      name: details.displayName ?? user.displayName ?? 'Night Watcher',
      email: details.email ?? user.email ?? null,
      photoURL: details.photoURL ?? user.photoURL ?? null,
      joinedAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export function observeAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        await saveProfile(user)
      } catch (error) {
        console.error('Unable to save the user profile.', error)
      }
    }
    callback(user)
  })
}

export async function signInWithGoogle() {
  await setPersistence(auth, browserLocalPersistence)
  await signInWithRedirect(auth, googleProvider)
}

export async function completeGoogleRedirect() {
  const result = await getRedirectResult(auth)
  if (result?.user) await saveProfile(result.user)
  return result?.user ?? null
}

export async function signInWithEmail(email: string, password: string) {
  const result = await signInWithEmailAndPassword(auth, email, password)
  await saveProfile(result.user)
}

export async function registerWithEmail(name: string, email: string, password: string) {
  const result = await createUserWithEmailAndPassword(auth, email, password)
  await updateProfile(result.user, { displayName: name })
  await saveProfile(result.user, { displayName: name, email })
}

export function signOutUser() {
  return signOut(auth)
}
