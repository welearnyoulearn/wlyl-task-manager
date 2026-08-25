import { createContext, useCallback, useContext, useState } from 'react';
import { sb } from '../lib/supabase.js';

const ProfilesContext = createContext(null);

export function ProfilesProvider({ children }) {
  const [profiles, setProfiles] = useState([]);

  const loadProfiles = useCallback(async () => {
    let data = [];
    try {
      const res = await sb.from('profiles').select('id, username, is_admin, member_role');
      if (res.error) throw res.error;
      data = res.data || [];
    } catch (e) {
      data = [];
    }
    setProfiles(data);
    return data;
  }, []);

  return (
    <ProfilesContext.Provider value={{ profiles, loadProfiles }}>
      {children}
    </ProfilesContext.Provider>
  );
}

export function useProfiles() {
  const ctx = useContext(ProfilesContext);
  if (!ctx) throw new Error('useProfiles must be used within ProfilesProvider');
  return ctx;
}
