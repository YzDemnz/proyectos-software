import { Session, User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useRef, useState, ReactNode, useCallback } from 'react';
import { supabase, Profile } from '@/lib/supabase';
import { normalizeUsername, usernameError } from '@/lib/usernames';

type AuthResult = { error: Error | null; needsMFA: boolean; needsConfirmation?: boolean };
type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  mfaPending: boolean;
  passwordRecovery: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string, fullName: string, username: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  verifyMFA: (code: string) => Promise<{ error: string | null }>;
  refreshProfile: () => Promise<void>;
  finishPasswordRecovery: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [mfaPending, setMfaPending] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const generation = useRef(0);
  const currentUserId = useRef<string | null>(null);

  const refreshProfile = useCallback(async () => {
    const uid = currentUserId.current;
    if (!uid) return;
    const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    if (error) throw error;
    if (currentUserId.current === uid) setProfile(data as Profile | null);
  }, []);

  const synchronize = useCallback(async (nextSession: Session | null): Promise<boolean> => {
    const run = ++generation.current;
    currentUserId.current = nextSession?.user.id ?? null;
    setLoading(true);
    setUser(null);
    setSession(null);
    setProfile(null);
    if (!nextSession) {
      setMfaPending(false);
      setPasswordRecovery(false);
      setLoading(false);
      return false;
    }
    try {
      const { data: assurance, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error) throw error;
      const pending = assurance.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2';
      if (run !== generation.current) return pending;
      setMfaPending(pending);
      if (pending) return true;
      setSession(nextSession);
      setUser(nextSession.user);
      const { data, error: profileError } = await supabase.from('profiles').select('*').eq('id', nextSession.user.id).maybeSingle();
      if (profileError) throw profileError;
      if (run === generation.current) setProfile(data as Profile | null);
      return false;
    } finally {
      if (run === generation.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let receivedEvent = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      receivedEvent = true;
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      // Auth callbacks run under the SDK lock. Defer all SDK/database work.
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (active) void synchronize(nextSession).catch(() => {
          if (active) setLoading(false);
        });
      }, 0);
      timers.add(timer);
    });
    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) throw error;
      if (active && !receivedEvent) return synchronize(data.session);
    }).catch(() => { if (active) setLoading(false); });
    return () => {
      active = false;
      // This ref is a request counter; invalidate every pending request on cleanup.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++generation.current;
      timers.forEach(clearTimeout);
      listener.subscription.unsubscribe();
    };
  }, [synchronize]);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error, needsMFA: false };
      return { error: null, needsMFA: await synchronize(data.session) };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error('No se pudo iniciar sesión.'), needsMFA: false };
    }
  }, [synchronize]);

  const signUp = useCallback(async (email: string, password: string, fullName: string, rawUsername: string): Promise<AuthResult> => {
    const username = normalizeUsername(rawUsername);
    const invalid = usernameError(username);
    if (invalid) return { error: new Error(invalid), needsMFA: false };
    try {
      const { data: available, error: lookupError } = await supabase.rpc('is_username_available', { p_username: username });
      if (lookupError) return { error: new Error('No se pudo comprobar el nombre de usuario. Inténtalo de nuevo.'), needsMFA: false };
      if (available !== true) return { error: new Error('Ese nombre de usuario ya está ocupado. Elige otro.'), needsMFA: false };
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: {
          data: { full_name: fullName, username },
          emailRedirectTo: window.location.origin + window.location.pathname,
        },
      });
      if (error) {
        // A concurrent signup may reserve the name after the preflight query.
        const { data: stillAvailable } = await supabase.rpc('is_username_available', { p_username: username });
        return { error: stillAvailable === false ? new Error('Ese nombre de usuario ya está ocupado. Elige otro.') : error, needsMFA: false };
      }
      if (data.session) await synchronize(data.session);
      return { error: null, needsMFA: false, needsConfirmation: !data.session };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error('No se pudo crear la cuenta.'), needsMFA: false };
    }
  }, [synchronize]);

  const verifyMFA = useCallback(async (code: string): Promise<{ error: string | null }> => {
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) return { error: error.message };
      const factor = data.totp.find((item) => item.status === 'verified');
      if (!factor) return { error: 'No hay un autenticador activo para esta cuenta.' };
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
      if (verifyError) return { error: verifyError.message };
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) return { error: sessionError.message };
      await synchronize(sessionData.session);
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Error al verificar el código.' };
    }
  }, [synchronize]);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw error;
    await synchronize(null);
  }, [synchronize]);

  return <AuthContext.Provider value={{
    session, user, profile, loading, mfaPending, passwordRecovery,
    signIn, signUp, signOut, verifyMFA, refreshProfile,
    finishPasswordRecovery: () => setPasswordRecovery(false),
  }}>{children}</AuthContext.Provider>;
}

// Context and its consumer hook intentionally share this module.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
