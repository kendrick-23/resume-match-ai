import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { supabase } from '../services/supabase';
import Ott from '../components/ott/Ott';
import Button from '../components/ui/Button';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setUser(session?.user ?? null);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
        setAuthError(true);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signUp = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  }, []);

  const signIn = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    try { sessionStorage.removeItem('holt_jobs_search'); } catch {}
  }, []);

  if (authError) {
    return (
      <div style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-6)',
        background: 'var(--color-bg)',
      }}>
        <div style={{ textAlign: 'center', maxWidth: '320px' }}>
          <Ott state="coaching" size={120} />
          <h2 style={{ marginTop: 'var(--space-4)' }}>Having trouble connecting...</h2>
          <p style={{
            color: 'var(--color-text-secondary)',
            marginTop: 'var(--space-2)',
            marginBottom: 'var(--space-6)',
          }}>
            I can't reach the server right now. Check your connection and try again.
          </p>
          <Button full onClick={() => window.location.reload()}>
            Try refreshing
          </Button>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
