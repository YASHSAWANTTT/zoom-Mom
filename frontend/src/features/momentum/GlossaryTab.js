import React, { useMemo, useState } from 'react';

export default function GlossaryTab({ glossary, formulas = [] }) {
  const [q, setQ] = useState('');
  const entries = useMemo(() => {
    const terms = Object.entries(glossary || {});
    const filtered = q.trim()
      ? terms.filter(([k, v]) =>
          `${k} ${v}`.toLowerCase().includes(q.trim().toLowerCase())
        )
      : terms;
    return filtered;
  }, [glossary, q]);

  return (
    <div className="momentum-glossary">
      <input
        type="search"
        className="glossary-search"
        placeholder="Search glossary…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search glossary"
      />
      <div className="glossary-list">
        {entries.map(([term, def]) => (
          <dl key={term} className="glossary-row">
            <dt>{term}</dt>
            <dd>{def}</dd>
          </dl>
        ))}
      </div>
      {formulas?.length > 0 && (
        <div style={{ marginTop: '0.75rem' }}>
          <div className="momentum-section-title">Formulas</div>
          <ul className="momentum-muted" style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {formulas.map((f, i) => (
              <li key={i}>
                {f.label || 'Formula'}: <code>{f.expression || ''}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
