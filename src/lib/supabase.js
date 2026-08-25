import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://qpchsvngmvpswwwjqaza.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_qUcXd4zGPoeluQND5_WJpQ_7torE5Zr';
export const MANAGE_USER_FN_URL = `${SUPABASE_URL}/functions/v1/manage-user`;

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function callManageUser(payload) {
  const { data: sessionData } = await sb.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error('Not signed in.');
  const res = await fetch(MANAGE_USER_FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Request failed.');
  return body;
}
