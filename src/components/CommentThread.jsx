import { useState } from 'react';

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
        <input
          type="text"
          placeholder="Add a comment/update..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{ flex: 1, padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 13 }}
        />
        <button className="btn-secondary" style={{ padding: '7px 14px' }} onClick={post}>Post</button>
      </div>
    </>
  );
}
