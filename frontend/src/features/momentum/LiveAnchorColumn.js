import React from 'react';
import Button from '../../components/ui/Button';
import { Pin } from 'lucide-react';

export default function LiveAnchorColumn({
  topicHistory,
  questionMarks,
  isHostLike,
  onConfused,
  confusedLoading,
}) {
  const cards = [...(topicHistory || [])].reverse().slice(0, 8);

  return (
    <div className="momentum-live-anchor">
      <div className="momentum-section-title">Live anchor</div>
      {!isHostLike && (
        <div style={{ marginBottom: '0.75rem' }}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onConfused}
            disabled={confusedLoading}
          >
            <Pin size={14} style={{ marginRight: 6 }} />
            I&apos;m confused
          </Button>
        </div>
      )}
      <div className="topic-card-stack" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {cards.length === 0 && (
          <p className="momentum-muted">Topics appear here as the lecture progresses.</p>
        )}
        {cards.map((entry, idx) => (
          <div key={entry.id || idx} className="topic-card">
            <div className="topic-card__label">Topic</div>
            <h3 className="topic-card__title">{entry.title || entry.currentTopic || 'Update'}</h3>
            {Array.isArray(entry.bullets) && entry.bullets.length > 0 && (
              <ul>
                {entry.bullets.map((b, j) => (
                  <li key={j}>{b}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      {questionMarks?.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <div className="topic-card__label">Student questions</div>
          <ul className="momentum-muted" style={{ margin: '0.25rem 0 0', paddingLeft: '1.1rem' }}>
            {questionMarks.map((m, i) => (
              <li key={i}>
                {m.name ? `${m.name} · ` : ''}
                {new Date(m.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
