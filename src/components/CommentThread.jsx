import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const MAX_ATTACHMENTS = 5;

export default function CommentThread({ comments, onPost }) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [posting, setPosting] = useState(false);
  const fileInputRef = useRef(null);

  const onPickFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    if (picked.length === 0) return;
    setFiles(prev => [...prev, ...picked].slice(0, MAX_ATTACHMENTS));
  };

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const post = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setPosting(true);
    try {
      await onPost(trimmed, files);
      setText('');
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } finally {
      setPosting(false);
    }
  };

  return (
    <>
      <div>
        {(comments || []).map((c, i) => (
          <div key={i} style={{ borderTop: '1px solid var(--line)', padding: '8px 0', fontSize: 13 }}>
            <div style={{ color: 'var(--muted)', fontSize: 11, marginBottom: 2 }}>
              {c.author} &middot; {new Date(c.at).toLocaleString()}
            </div>
            <div>{c.text}</div>
            {c.attachmentUrls && c.attachmentUrls.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {c.attachmentUrls.map((url, idx) => (
                  <a key={idx} href={url} target="_blank" rel="noreferrer" className="chip chip-file" style={{ fontSize: 11, padding: '3px 8px' }}>
                    📎 {c.attachmentNames?.[idx] || 'Attachment'}
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Input
            type="text"
            placeholder="Add a comment/update..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') post(); }}
            style={{ flex: 1 }}
          />
          <Button variant="secondary" onClick={post} disabled={posting}>{posting ? 'Posting...' : 'Post'}</Button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          {files.length < MAX_ATTACHMENTS && (
            <label style={{ fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}>
              📎 Attach file{files.length > 0 ? ' (' + files.length + '/' + MAX_ATTACHMENTS + ')' : ''}
              <input ref={fileInputRef} type="file" multiple onChange={onPickFiles} style={{ display: 'none' }} />
            </label>
          )}
        </div>
        {files.length > 0 && (
          <ul style={{ margin: '6px 0 0', paddingLeft: 0, listStyle: 'none', fontSize: 12 }}>
            {files.map((f, i) => (
              <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)' }}>
                <span>{f.name}</span>
                <button type="button" onClick={() => removeFile(i)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 11, padding: 0 }}>Remove</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
