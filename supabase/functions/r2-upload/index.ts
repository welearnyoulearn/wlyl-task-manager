// Edge Function: presigned Cloudflare R2 upload URLs.
// Runs with the R2 secret key server-side, never exposed to the client.
// Deploy: supabase functions deploy r2-upload
//
// The browser never talks to R2 directly with a shared secret - it asks
// this function for a short-lived, single-object presigned PUT URL
// (any authenticated user may ask, not admin-only: developers attach
// test plans, testers attach QA screenshots, admins attach task
// descriptions), then PUTs the file bytes straight to that URL. Only
// this function ever holds R2_SECRET_ACCESS_KEY.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const R2_ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID')!;
const R2_BUCKET = Deno.env.get('R2_BUCKET')!;
const R2_ACCESS_KEY_ID = Deno.env.get('R2_ACCESS_KEY_ID')!;
const R2_SECRET_ACCESS_KEY = Deno.env.get('R2_SECRET_ACCESS_KEY')!;
const R2_PUBLIC_URL = Deno.env.get('R2_PUBLIC_URL')!; // e.g. https://pub-xxxx.r2.dev (no trailing slash)
const R2_ENDPOINT = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

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

// Attachment kind determines the key prefix (keeps the bucket
// organized and makes it easy to see at a glance in the R2 dashboard
// what a given object is for) and the max upload size allowed for that
// kind - screenshots/photos are capped tighter than documents since
// they're compressed client-side before this is ever called.
const KIND_CONFIG: Record<string, { prefix: string; maxBytes: number }> = {
  'task-description': { prefix: 'task-description', maxBytes: 15 * 1024 * 1024 },
  'test-plan': { prefix: 'test-plan', maxBytes: 15 * 1024 * 1024 },
  'qa-evidence': { prefix: 'qa-evidence', maxBytes: 6 * 1024 * 1024 },
  'resource': { prefix: 'resource', maxBytes: 20 * 1024 * 1024 },
  'comment-attachment': { prefix: 'comment-attachment', maxBytes: 15 * 1024 * 1024 }
};

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
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

  // Any authenticated app user may request an upload URL - role/ticket
  // -level authorization for what the resulting URL gets attached to is
  // enforced by the normal tasks/bug_reports RLS policies when the
  // caller later writes the URL onto a row, same as every other write
  // in this app. This function only proves "a logged-in user asked".
  const asCaller = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: authHeader } }
  });
  const { data: callerUser, error: callerErr } = await asCaller.auth.getUser(callerToken);
  if (callerErr || !callerUser?.user) {
    return jsonResponse({ error: 'Invalid session' }, 401);
  }

  let body: { kind?: string; fileName?: string; contentType?: string; size?: number };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const { kind, fileName, contentType, size } = body;
  const config = kind ? KIND_CONFIG[kind] : undefined;
  if (!config) {
    return jsonResponse({ error: `Invalid kind. Expected one of: ${Object.keys(KIND_CONFIG).join(', ')}` }, 400);
  }
  if (!fileName || !contentType) {
    return jsonResponse({ error: 'fileName and contentType are required' }, 400);
  }
  if (typeof size !== 'number' || size <= 0) {
    return jsonResponse({ error: 'size (bytes) is required' }, 400);
  }
  if (size > config.maxBytes) {
    return jsonResponse({ error: `File too large - max ${Math.round(config.maxBytes / 1024 / 1024)}MB for ${kind}` }, 400);
  }

  const objectKey = `${config.prefix}/${callerUser.user.id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeFileName(fileName)}`;

  const client = new AwsClient({
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto'
  });

  const objectUrl = `${R2_ENDPOINT}/${R2_BUCKET}/${objectKey}`;
  const signed = await client.sign(objectUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    aws: { signQuery: true }
  });

  return jsonResponse({
    uploadUrl: signed.url,
    publicUrl: `${R2_PUBLIC_URL}/${objectKey}`,
    objectKey
  }, 200);
});
