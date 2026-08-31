import { sb } from './supabase.js';

const SUPABASE_URL = 'https://qpchsvngmvpswwwjqaza.supabase.co';
const R2_UPLOAD_FN_URL = `${SUPABASE_URL}/functions/v1/r2-upload`;

// Kind -> { maxBytes } must stay in sync with supabase/functions/r2-upload
// (the function re-checks size server-side too - this is just so the UI
// can reject an oversized file before ever asking for a presigned URL).
export const UPLOAD_KINDS = {
  TASK_DESCRIPTION: 'task-description',
  TEST_PLAN: 'test-plan',
  QA_EVIDENCE: 'qa-evidence',
  RESOURCE: 'resource'
};

// Screenshots/photos are the only files compressed - test plan/description
// attachments are treated as documents (PDF, docx, etc.) and passed
// through untouched, since re-encoding an arbitrary document isn't
// possible client-side. Images are downscaled to fit within
// MAX_IMAGE_DIMENSION on the long edge and re-encoded as JPEG at
// IMAGE_QUALITY - this is what actually saves R2 storage/egress on
// phone-camera screenshots, which otherwise routinely run 3-8MB each.
const MAX_IMAGE_DIMENSION = 1600;
const IMAGE_QUALITY = 0.75;

function isCompressibleImage(file) {
  return file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'image/webp';
}

async function compressImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', IMAGE_QUALITY));
  if (!blob || blob.size >= file.size) {
    // Compression didn't actually help (e.g. already-small image) -
    // keep the original rather than force a worse-quality re-encode.
    return file;
  }
  const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
  return new File([blob], newName, { type: 'image/jpeg' });
}

// Uploads a single file for the given kind and returns { url, fileName }
// to store on the row (tasks.description_file_url, bug_reports.evidence_urls,
// etc). Images are compressed first; other file types upload as-is.
export async function uploadFile(kind, file) {
  const toUpload = isCompressibleImage(file) ? await compressImage(file) : file;

  const { data: sessionData } = await sb.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error('Not signed in.');

  const presignRes = await fetch(R2_UPLOAD_FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ kind, fileName: toUpload.name, contentType: toUpload.type || 'application/octet-stream', size: toUpload.size })
  });
  const presignBody = await presignRes.json();
  if (!presignRes.ok) throw new Error(presignBody.error || 'Could not prepare upload.');

  const putRes = await fetch(presignBody.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': toUpload.type || 'application/octet-stream' },
    body: toUpload
  });
  if (!putRes.ok) throw new Error(`Upload to storage failed (${putRes.status}).`);

  return { url: presignBody.publicUrl, fileName: file.name };
}
