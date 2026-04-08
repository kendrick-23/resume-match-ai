import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../hooks/useAuth.jsx';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const StreakContext = createContext(null);

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

export function StreakProvider({ children }) {
  const { user } = useAuth();
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!user) {
      setStreak(0);
      return;
    }
    setLoading(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`${API_URL}/profile/streak`, { headers });
      if (res.ok) {
        const data = await res.json();
        setStreak(data.streak ?? 0);
      }
    } catch {
      // Silently fail — streak is non-critical surface info
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const value = useMemo(() => ({ streak, loading, refetch }), [streak, loading, refetch]);

  return <StreakContext.Provider value={value}>{children}</StreakContext.Provider>;
}

export function useStreak() {
  const ctx = useContext(StreakContext);
  if (!ctx) throw new Error('useStreak must be used within StreakProvider');
  return ctx;
}
