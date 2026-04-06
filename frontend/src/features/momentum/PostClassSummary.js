import React, { useEffect, useState } from 'react';
import Button from '../../components/ui/Button';
import './momentum.css';

export const LAST_MEETING_KEY = 'arlo-momentum-last-meeting-id';

export default function PostClassSummary({ open, onClose, meetingId }) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !meetingId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch('/api/ai/recovery-pack', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meetingId }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Recovery failed'))))
      .then((data) => {
        if (!cancelled) setItems(data.items || []);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, meetingId]);

  if (!open) return null;

  return (
    <div className="post-class-overlay" role="dialog" aria-modal="true" aria-labelledby="pcs-title">
      <div className="post-class-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 id="pcs-title" className="momentum-section-title" style={{ margin: 0 }}>
            Class summary
          </h2>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <p className="momentum-muted" style={{ marginTop: '0.5rem' }}>
          Recovery pack from your bookmarks and transcript moments.
        </p>
        {loading && <p className="momentum-muted">Loading…</p>}
        {error && <p className="momentum-muted">{error}</p>}
        {!loading && !error && (
          <ul style={{ margin: '1rem 0 0', paddingLeft: '1.1rem' }}>
            {items.map((it) => (
              <li key={it.bookmarkId} style={{ marginBottom: '1rem' }}>
                <div className="momentum-muted" style={{ fontSize: '0.75rem' }}>
                  Bookmark · {it.source}
                </div>
                <p style={{ margin: '0.25rem 0' }}>{it.recovery?.simpleExplanation}</p>
                {it.recovery?.practiceProblem && (
                  <p className="momentum-muted" style={{ margin: 0 }}>
                    Practice: {it.recovery.practiceProblem}
                  </p>
                )}
              </li>
            ))}
            {items.length === 0 && (
              <li className="momentum-muted">No bookmarks to recover yet.</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
