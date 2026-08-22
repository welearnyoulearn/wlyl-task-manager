// Edge Function: admin-only user management (create / promote / remove).
// Runs with the service role key server-side, never exposed to the client.
// Deploy: supabase functions deploy manage-user
//
// Every request must come from a caller whose own session proves they are
// an admin (checked via the profiles table using their own JWT) before any
// service-role action runs — this is what stops a non-admin from calling
// this function directly and creating/deleting accounts.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  });
}

function toSyntheticEmail(username: string): string {
  return `${username.toLowerCase()}@wlyl.local`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization') || '';
  const callerToken = authHeader.replace('Bearer ', '');
  if (!callerToken) {
    return jsonResponse({ error: 'Missing auth token' }, 401);
  }

  const asCaller = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: authHeader } }
  });
  const { data: callerUser, error: callerErr } = await asCaller.auth.getUser(callerToken);
  if (callerErr || !callerUser?.user) {
    return jsonResponse({ error: 'Invalid session' }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('id', callerUser.user.id)
    .single();

  if (!callerProfile?.is_admin) {
    return jsonResponse({ error: 'Admin access required' }, 403);
  }

  const body = await req.json();
  const { action, username, password, isAdmin } = body;

  if (!username && action !== 'list') {
    return jsonResponse({ error: 'username is required' }, 400);
  }

  try {
    if (action === 'create') {
      if (!password) {
        return jsonResponse({ error: 'password is required' }, 400);
      }
      const email = toSyntheticEmail(username);
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email, password, email_confirm: true
      });
      if (createErr) throw createErr;

      const { error: profileErr } = await admin.from('profiles').insert({
        id: created.user.id,
        username: username.toLowerCase(),
        is_admin: !!isAdmin
      });
      if (profileErr) throw profileErr;

      return jsonResponse({ ok: true }, 200);
    }

    if (action === 'promote') {
      const { data: profile } = await admin
        .from('profiles')
        .select('id')
        .eq('username', username.toLowerCase())
        .single();
      if (!profile) {
        return jsonResponse({ error: 'User not found' }, 404);
      }
      const { error: updateErr } = await admin
        .from('profiles')
        .update({ is_admin: true })
        .eq('id', profile.id);
      if (updateErr) throw updateErr;

      if (password) {
        const { error: pwErr } = await admin.auth.admin.updateUserById(profile.id, { password });
        if (pwErr) throw pwErr;
      }

      return jsonResponse({ ok: true }, 200);
    }

    if (action === 'set-password') {
      if (!password) {
        return jsonResponse({ error: 'password is required' }, 400);
      }
      const { data: profile } = await admin
        .from('profiles')
        .select('id')
        .eq('username', username.toLowerCase())
        .single();
      if (!profile) {
        return jsonResponse({ error: 'User not found' }, 404);
      }
      const { error: pwErr } = await admin.auth.admin.updateUserById(profile.id, { password });
      if (pwErr) throw pwErr;

      return jsonResponse({ ok: true }, 200);
    }

    if (action === 'remove') {
      const { data: profile } = await admin
        .from('profiles')
        .select('id')
        .eq('username', username.toLowerCase())
        .single();
      if (!profile) {
        return jsonResponse({ error: 'User not found' }, 404);
      }
      const { error: deleteErr } = await admin.auth.admin.deleteUser(profile.id);
      if (deleteErr) throw deleteErr;
      // profiles row cascades via FK on auth.users delete

      return jsonResponse({ ok: true }, 200);
    }

    return jsonResponse({ error: 'Unknown action' }, 400);
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
