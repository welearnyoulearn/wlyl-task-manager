import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function CommentThread({ comments, onPost }) {
  const [text, setText] = useState('');

  const post = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onPost(trimmed);
    setText('');
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
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <Input
          type="text"
          placeholder="Add a comment/update..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') post(); }}
          style={{ flex: 1 }}
        />
        <Button variant="secondary" onClick={post}>Post</Button>
      </div>
    </>
  );
}
