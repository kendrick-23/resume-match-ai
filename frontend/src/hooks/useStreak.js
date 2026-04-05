import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

export function useStreak() {
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStreak();
  }, []);

  async function fetchStreak() {
    try {
      const headers = await authHeaders();
      const res = await fetch(`${API_URL}/profile/streak`, { headers });
      if (res.ok) {
        const data = await res.json();
        setStreak(data.streak);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }

  return { streak, loading, refetch: fetchStreak };
}
