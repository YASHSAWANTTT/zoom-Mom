import React from 'react';
import Button from '../../components/ui/Button';

export default function PollView({
  poll,
  pollResults,
  isHostLike,
  participantKey,
  onVote,
  hostPollQuestion,
  hostPollOptions,
  setHostPollQuestion,
  setHostPollOptions,
  onStartPoll,
}) {
  const totalVotes = pollResults?.counts
    ? Object.values(pollResults.counts).reduce((a, b) => a + b, 0)
    : 0;

  if (isHostLike) {
    const opts = hostPollOptions || ['', '', '', ''];
    return (
      <div>
        <label className="momentum-muted" htmlFor="poll-q">
          Question
        </label>
        <input
          id="poll-q"
          className="glossary-search"
          value={hostPollQuestion}
          onChange={(e) => setHostPollQuestion(e.target.value)}
          placeholder="e.g. Any questions on the midterm?"
        />
        {opts.map((o, i) => (
          <input
            key={i}
            className="glossary-search"
            value={o}
            placeholder={`Option ${i + 1}`}
            onChange={(e) => {
              const next = [...opts];
              next[i] = e.target.value;
              setHostPollOptions(next);
            }}
          />
        ))}
        <Button type="button" size="sm" onClick={onStartPoll}>
          Launch poll
        </Button>
        {pollResults?.counts && (
          <div style={{ marginTop: '1rem' }}>
            <div className="momentum-section-title">Results</div>
            <PollBars options={poll?.options || opts} counts={pollResults.counts} total={totalVotes} />
          </div>
        )}
      </div>
    );
  }

  if (pollResults?.counts && !poll) {
    const labels = pollResults.options || [];
    return (
      <div>
        <div className="momentum-section-title">Poll results</div>
        <PollBars
          options={labels}
          counts={pollResults.counts}
          total={totalVotes}
        />
      </div>
    );
  }

  if (!poll) {
    return <p className="momentum-muted">No active poll.</p>;
  }

  return (
    <div className="poll-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="poll-h">
      <div className="poll-modal">
        <h2 id="poll-h" className="momentum-section-title">
          {poll.question}
        </h2>
        <div className="trivia-options">
          {(poll.options || []).map((opt, i) => (
            <button
              key={i}
              type="button"
              className="trivia-option-btn"
              onClick={() =>
                onVote?.({
                  pollId: poll.pollId,
                  optionIndex: i,
                  participantKey,
                })
              }
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PollBars({ options, counts, total }) {
  const opts = options || [];
  return (
    <div className="poll-results-bars">
      {opts.map((label, i) => {
        const c = counts?.[i] ?? counts?.[String(i)] ?? 0;
        const pct = total ? Math.round((c / total) * 100) : 0;
        return (
          <div key={i} className="poll-bar-row">
            <span style={{ flex: '0 0 40%' }}>{label || `Option ${i + 1}`}</span>
            <div className="poll-bar">
              <div className="poll-bar-fill" style={{ width: `${pct}%` }} />
            </div>
            <span style={{ flex: '0 0 2rem', textAlign: 'right' }}>{c}</span>
          </div>
        );
      })}
    </div>
  );
}
