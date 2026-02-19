import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  onIdTokenChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';

function parseFirebaseConfig() {
  const raw = (import.meta.env.VITE_FIREBASE_CONFIG || '').trim();
  if (!raw) {
    throw new Error('VITE_FIREBASE_CONFIG is not set.');
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('VITE_FIREBASE_CONFIG must be valid JSON.');
  }
}

function getFriendlyFirebaseMessage(code) {
  if (code === 'auth/invalid-email') return 'Please enter a valid email address.';
  if (code === 'auth/invalid-credential') return 'Incorrect email or password.';
  if (code === 'auth/wrong-password') return 'Incorrect password.';
  if (code === 'auth/user-not-found') return 'No account found with this email.';
  if (code === 'auth/email-already-in-use') return 'Account already exists. Please login.';
  if (code === 'auth/weak-password') {
    return 'Password must be at least 8 characters and include uppercase, lowercase, and a number.';
  }
  if (code === 'auth/too-many-requests') return 'Too many attempts. Please try again later.';
  if (code === 'auth/popup-closed-by-user') return 'Google sign-in popup was closed.';
  if (code === 'auth/popup-blocked') return 'Popup blocked. Allow popups and try again.';
  if (code === 'auth/unauthorized-domain') return 'Current domain is not allowed in Firebase Auth.';
  if (code === 'auth/network-request-failed') return 'Network error. Check your internet connection and try again.';
  if (code === 'auth/email-not-verified') return 'Please verify your email before login.';
  return 'Unable to authenticate right now. Please try again.';
}

function toAuthError(error, overrideCode = '') {
  const code = overrideCode || error?.code || 'auth/unknown';
  const mapped = new Error(getFriendlyFirebaseMessage(code));
  mapped.code = code;
  return mapped;
}

const app = initializeApp(parseFirebaseConfig());
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export function subscribeToIdTokenChanges(callback) {
  return onIdTokenChanged(auth, callback);
}

export async function signupWithEmailAndPassword(email, password, fullName = '') {
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    const normalizedName = (fullName || '').trim();
    if (normalizedName) {
      await updateProfile(credential.user, { displayName: normalizedName });
    }
    await sendEmailVerification(credential.user);
    await signOut(auth);
    return credential.user;
  } catch (error) {
    throw toAuthError(error);
  }
}

export async function loginWithEmailAndPassword(email, password) {
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    if (!credential.user.emailVerified) {
      await signOut(auth);
      throw toAuthError(null, 'auth/email-not-verified');
    }
    return credential.user;
  } catch (error) {
    if (error?.code === 'auth/email-not-verified') {
      throw error;
    }
    throw toAuthError(error);
  }
}

export async function resendVerificationEmail(email, password) {
  let signedIn = false;
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    signedIn = true;
    if (!credential.user.emailVerified) {
      await sendEmailVerification(credential.user);
    }
  } catch (error) {
    throw toAuthError(error);
  } finally {
    if (signedIn) {
      try {
        await signOut(auth);
      } catch {
        // no-op
      }
    }
  }
}

export async function loginWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    throw toAuthError(error);
  }
}

export async function getFirebaseIdToken(forceRefresh = false) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('No authenticated Firebase user.');
  }
  return user.getIdToken(forceRefresh);
}

export function getFirebaseUser() {
  return auth.currentUser;
}

export async function firebaseLogout() {
  await signOut(auth);
}
