import React, { useEffect, useState } from 'react';

export default function TriviaView({
  questions,
  roundId,
  isHostLike,
  leaderboard,
  participantKey,
  onAnswer,
}) {
  const [idx, setIdx] = useState(0);
  const [answered, setAnswered] = useState({});

  useEffect(() => {
    setIdx(0);
    setAnswered({});
  }, [roundId]);

  if (!questions?.length) {
    return <p className="momentum-muted">No active trivia round.</p>;
  }

  const q = questions[idx];
  const done = idx >= questions.length;

  if (isHostLike) {
    return (
      <div>
        <p className="momentum-muted" style={{ marginBottom: '0.5rem' }}>
          Round: {roundId || '—'}
        </p>
        <ul className="leaderboard-list">
          {(leaderboard || []).slice(0, 5).map((row, i) => (
            <li key={i}>
              <span>{row.name}</span>
              <span>{row.score}</span>
            </li>
          ))}
        </ul>
        {(!leaderboard || leaderboard.length === 0) && (
          <p className="momentum-muted">Waiting for answers…</p>
        )}
      </div>
    );
  }

  if (done) {
    return (
      <div>
        <p className="momentum-section-title">Round complete</p>
        <p className="momentum-muted">Wait for the host to share the leaderboard.</p>
      </div>
    );
  }

  const handlePick = (choiceIndex) => {
    const key = `${idx}`;
    if (answered[key]) return;
    setAnswered((prev) => ({ ...prev, [key]: true }));
    onAnswer?.({
      questionIndex: idx,
      choiceIndex,
      correctIndex: q.correctIndex,
      participantKey,
      roundId,
    });
    setIdx((i) => i + 1);
  };

  return (
    <div>
      <p className="momentum-muted" style={{ marginBottom: '0.5rem' }}>
        Question {idx + 1} / {questions.length}
      </p>
      <p style={{ fontSize: '0.95rem', marginBottom: '0.75rem' }}>{q.question}</p>
      <div className="trivia-options">
        {(q.options || []).map((opt, i) => (
          <button
            key={i}
            type="button"
            className="trivia-option-btn"
            disabled={!!answered[`${idx}`]}
            onClick={() => handlePick(i)}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
