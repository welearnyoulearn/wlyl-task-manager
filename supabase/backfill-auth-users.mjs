// One-time backfill: creates a real Supabase Auth user + profiles row for
// every existing row in admins/members, using their current plaintext
// password as the initial Auth password. Run once, locally, before B1 ships.
//
// Usage:
//   SUPABASE_URL=https://qpchsvngmvpswwwjqaza.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service role key, from Project Settings > API> \
//   node supabase/backfill-auth-users.mjs
//
// The service role key is never committed or hardcoded — pass it as an env
// var each run. It bypasses RLS entirely, so treat it like a root password.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars first.');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function toSyntheticEmail(username) {
  const local = username.toLowerCase().trim().replace(/[^a-z0-9._-]/g, '');
  return `${local}@wlyl.local`;
}

async function backfillOne(username, password, isAdmin) {
  const email = toSyntheticEmail(username);

  const { data: created, error: createErr } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (createErr) {
    console.error(`  FAILED creating auth user for "${username}": ${createErr.message}`);
    return;
  }

  const { error: profileErr } = await sb.from('profiles').upsert({
    id: created.user.id,
    username: username.toLowerCase(),
    is_admin: isAdmin
  });

  if (profileErr) {
    console.error(`  FAILED creating profile for "${username}": ${profileErr.message}`);
    return;
  }

  console.log(`  OK: ${username} -> ${email} (admin: ${isAdmin})`);
}

async function main() {
  const { data: admins, error: adminsErr } = await sb.from('admins').select('name, password');
  if (adminsErr) throw adminsErr;

  const { data: members, error: membersErr } = await sb.from('members').select('username, password');
  if (membersErr) throw membersErr;

  const adminNames = new Set((admins || []).map(a => a.name));

  console.log(`Backfilling ${admins.length} admin(s)...`);
  for (const a of admins || []) {
    await backfillOne(a.name, a.password, true);
  }

  console.log(`Backfilling ${members.length} member(s)...`);
  for (const m of members || []) {
    if (adminNames.has(m.username)) {
      console.log(`  skip ${m.username} (already created as admin)`);
      continue;
    }
    await backfillOne(m.username, m.password, false);
  }

  console.log('Done. Verify in Supabase dashboard: Authentication > Users, and the profiles table.');
}

main().catch(e => {
  console.error('Backfill failed:', e);
  process.exit(1);
});
