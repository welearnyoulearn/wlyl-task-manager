import { useEffect, useRef, useState } from 'react';
import { Lock, Link2, Paperclip } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';
import { sb } from '../lib/supabase.js';
import { uploadFile, UPLOAD_KINDS } from '../lib/upload.js';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const EMPTY_DRAFT = { title: '', body: '', linkUrl: '' };

// Admin-only counterpart to the team-wide Resources tab
// (ResourcesPanel.jsx) - same content shape (title, free text, link,
// optional file), but both read and write are admin-only here (see
// supabase/023_admin_resources.sql: admin_resources_select_admin is
// the difference from resources' select-open policy). For things a
// regular member should never even know exist - e.g. other admins'
// access, billing, infra credentials. Only ever rendered behind
// App.jsx's isAdmin guard, so there's no non-admin branch in here at
// all, unlike ResourcesPanel.
export default function AdminResourcesPanel({ active }) {
  const { currentUser, currentUserId } = useAuth();
  const { adminResources, loadAdminResources } = useData();
  const { toast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [existingFile, setExistingFile] = useState(null);
  const [file, setFile] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (active) loadAdminResources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const openAddForm = () => {
    setEditingKey(null);
    setDraft(EMPTY_DRAFT);
    setExistingFile(null);
    setFile(null);
    setFieldErrors({});
    if (fileInputRef.current) fileInputRef.current.value = '';
    setShowForm(true);
  };

  const openEditForm = (resource) => {
    setEditingKey(resource.key);
    setDraft({ title: resource.title || '', body: resource.body || '', linkUrl: resource.linkUrl || '' });
    setExistingFile(resource.fileUrl ? { url: resource.fileUrl, name: resource.fileName } : null);
    setFile(null);
    setFieldErrors({});
    if (fileInputRef.current) fileInputRef.current.value = '';
    setShowForm(true);
  };

  const onPickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) { setFile(null); return; }
    if (f.size > 20 * 1024 * 1024) {
      setFieldErrors(prev => ({ ...prev, file: 'File is too large (max 20MB).' }));
      e.target.value = '';
      setFile(null);
      return;
    }
    setFieldErrors(prev => ({ ...prev, file: undefined }));
    setFile(f);
  };

  const submit = async () => {
    const errors = {};
    if (!draft.title.trim()) errors.title = 'A title is required.';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      let fileUrl = existingFile?.url || null;
      let fileName = existingFile?.name || null;
      if (file) {
        const uploaded = await uploadFile(UPLOAD_KINDS.RESOURCE, file);
        fileUrl = uploaded.url;
        fileName = uploaded.fileName;
      }

      const payload = {
        title: draft.title.trim(),
        body: draft.body.trim() || null,
        link_url: draft.linkUrl.trim() || null,
        file_url: fileUrl,
        file_name: fileName
      };

      if (editingKey) {
        const { error } = await sb.from('admin_resources').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingKey);
        if (error) throw error;
        toast({ description: `"${payload.title}" updated.` });
      } else {
        const { error } = await sb.from('admin_resources').insert({
          ...payload,
          created_by: currentUser,
          created_by_id: currentUserId
        });
        if (error) throw error;
        toast({ description: `"${payload.title}" added to Admin Resources.` });
      }

      setShowForm(false);
      await loadAdminResources();
    } catch (e) {
      toast({ variant: 'destructive', description: 'Could not save resource: ' + e.message });
    } finally {
      setSubmitting(false);
    }
  };

  const deleteResource = async (resource) => {
    try {
      const { error } = await sb.from('admin_resources').delete().eq('id', resource.key);
      if (error) throw error;
      await loadAdminResources();
      toast({ description: `"${resource.title}" deleted.` });
    } catch (e) {
      toast({ variant: 'destructive', description: 'Could not delete resource: ' + e.message });
    }
  };

  return (
    <div className={`panel ${active ? 'active' : ''}`} id="panel-adminresources">
      <div className="sheet" style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div className="card-icon-badge amber" style={{ width: 44, height: 44, borderRadius: 12 }}>
              <Lock size={20} strokeWidth={2.2} />
            </div>
            <div>
              <div className="section-title" style={{ marginBottom: 4 }}>Admin Resources</div>
              <div className="section-hint">Visible only to admins — other admins' access, billing, infra credentials, anything members shouldn't see.</div>
            </div>
          </div>
          <Button size="sm" onClick={openAddForm}>Add Resource</Button>
        </div>

        <div style={{ marginTop: 16 }}>
          {adminResources.length === 0 && (
            <div className="section-hint">No admin resources yet. Click "Add Resource" to add the first one.</div>
          )}
          {adminResources.map(r => (
            <Card key={r.key} className="entry-card mb-3">
              <CardContent className="p-4">
                <div className="card-title-row">
                  <div className="card-icon-badge amber">
                    <Lock size={18} strokeWidth={2.2} />
                  </div>
                  <div className="card-title-main">
                    <div className="card-title-text">{r.title}</div>
                    {r.body && (
                      <div className="entry-block" style={{ marginTop: 8, marginBottom: 0 }}>
                        <pre>{r.body}</pre>
                      </div>
                    )}
                    {(r.linkUrl || r.fileUrl) && (
                      <div className="card-chip-row">
                        {r.linkUrl && (
                          <a href={r.linkUrl} target="_blank" rel="noreferrer" className="chip">
                            <Link2 size={13} strokeWidth={2.3} /> Open link
                          </a>
                        )}
                        {r.fileUrl && (
                          <a href={r.fileUrl} target="_blank" rel="noreferrer" className="chip chip-file">
                            <Paperclip size={13} strokeWidth={2.3} /> {r.fileName || 'Attached file'}
                          </a>
                        )}
                      </div>
                    )}
                    <div className="card-meta-line">
                      Added by {r.createdBy}{r.createdAt ? ' · ' + new Date(r.createdAt).toLocaleString() : ''}
                      {r.updatedAt && r.updatedAt !== r.createdAt ? ' · edited ' + new Date(r.updatedAt).toLocaleString() : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <Button variant="ghost" size="sm" onClick={() => openEditForm(r)}>Edit</Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm">Delete</Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this resource?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This permanently deletes "{r.title}". This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteResource(r)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Dialog open={showForm} onOpenChange={(open) => { if (!open) setShowForm(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingKey ? 'Edit admin resource' : 'Add an admin resource'}</DialogTitle>
            <DialogDescription>Visible only to admins — never shown to regular members.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Title</Label>
              <Input
                type="text"
                placeholder="e.g. Billing account access"
                value={draft.title}
                onChange={(e) => setDraft(d => ({ ...d, title: e.target.value }))}
              />
              {fieldErrors.title && <div className="text-xs text-destructive mt-1">{fieldErrors.title}</div>}
            </div>
            <div>
              <Label>Details (optional)</Label>
              <Textarea
                placeholder="Notes, credentials, instructions..."
                rows={5}
                value={draft.body}
                onChange={(e) => setDraft(d => ({ ...d, body: e.target.value }))}
              />
            </div>
            <div>
              <Label>Link (optional)</Label>
              <Input
                type="text"
                placeholder="https://..."
                value={draft.linkUrl}
                onChange={(e) => setDraft(d => ({ ...d, linkUrl: e.target.value }))}
              />
            </div>
            <div>
              <Label>Attach a file (optional, e.g. PDF)</Label>
              <input ref={fileInputRef} type="file" onChange={onPickFile} />
              {existingFile && !file && (
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                  Current file: {existingFile.name} (choosing a new one replaces it)
                </div>
              )}
              {file && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{file.name}</div>}
              {fieldErrors.file && <div className="text-xs text-destructive mt-1">{fieldErrors.file}</div>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowForm(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={submit} disabled={submitting}>{submitting ? 'Saving...' : editingKey ? 'Save changes' : 'Add Resource'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
