import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { toSyntheticEmail } from '../lib/utils.js';
import { useProfiles } from './ProfilesContext.jsx';
import { useData } from './DataContext.jsx';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState('');
  const [currentUserId, setCurrentUserId] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentMemberRole, setCurrentMemberRole] = useState(null);
  const [restoring, setRestoring] = useState(true);
  const { loadProfiles } = useProfiles();
  const { loadAllEntries, loadAllTasks } = useData();

  const finishLogin = useCallback((id, name, admin, memberRole) => {
    setCurrentUserId(id);
    setCurrentUser(name);
    setIsAdmin(admin);
    setCurrentMemberRole(memberRole);
    loadAllEntries();
    loadAllTasks();
  }, [loadAllEntries, loadAllTasks]);

  const onAuthenticated = useCallback(async () => {
    const { data: sessionData } = await sb.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) return;
    const { data: profile } = await sb.from('profiles').select('username, is_admin, member_role').eq('id', user.id).single();
    if (!profile) return;
    finishLogin(user.id, profile.username, profile.is_admin, profile.member_role);
  }, [finishLogin]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await sb.auth.getSession();
      if (!cancelled && data?.session?.user) {
        await onAuthenticated();
      }
      if (!cancelled) setRestoring(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Shared core used by both the modal login form and the two landing-page
  // Member/Admin boxes. requireAdmin restricts sign-in to admin accounts
  // (used by the Admin box so a member account can't slip in through it).
  const attemptLogin = useCallback(async (name, pw, requireAdmin) => {
    name = name.trim().toLowerCase();
    if (!name) {
      return { error: 'Enter your username to continue.' };
    }
    const { data, error } = await sb.auth.signInWithPassword({
      email: toSyntheticEmail(name),
      password: pw
    });
    if (error) {
      return { error: requireAdmin ? 'Incorrect admin username or password.' : 'Incorrect username or password.' };
    }
    const { data: profile } = await sb.from('profiles').select('username, is_admin').eq('id', data.user.id).single();
    if (!profile) {
      await sb.auth.signOut();
      return { error: 'Account has no profile — contact an admin.' };
    }
    if (requireAdmin && !profile.is_admin) {
      await sb.auth.signOut();
      return { error: 'That account is not an admin.' };
    }
    await onAuthenticated();
    return { error: null };
  }, [onAuthenticated]);

  const createFirstAdmin = useCallback(async (name, pw) => {
    name = name.trim().toLowerCase();
    if (!name || !pw) {
      return { error: 'Enter a name and password.' };
    }
    try {
      const { data, error } = await sb.auth.signUp({
        email: toSyntheticEmail(name),
        password: pw
      });
      if (error) throw error;
      const { error: profileErr } = await sb.from('profiles').insert({
        id: data.user.id, username: name, is_admin: true
      });
      if (profileErr) throw profileErr;
      await onAuthenticated();
      return { error: null };
    } catch (e) {
      return { error: 'Error creating admin: ' + e.message };
    }
  }, [onAuthenticated]);

  const logout = useCallback(async () => {
    await sb.auth.signOut();
    setCurrentUser('');
    setCurrentUserId(null);
    setIsAdmin(false);
    setCurrentMemberRole(null);
  }, []);

  return (
    <AuthContext.Provider value={{
      currentUser, currentUserId, isAdmin, currentMemberRole, restoring,
      attemptLogin, createFirstAdmin, logout, loadProfiles
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
