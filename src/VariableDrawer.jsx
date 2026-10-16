import React, { useEffect, useRef } from 'react';
import { STATUS, STATUS_LABEL } from './review.js';

const fmt = (s) => s.toFixed(4);

export default function VariableDrawer({ variable, task, options, entry, suggestion, onClose, onToggle, onAccept, onReject, onReset, onNote }) {
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [variable.name, onClose]);

  const scores = task.scores(variable);
  const preds = options
    .map((o) => ({ ...o, score: scores[o.code] ?? 0 }))
    .sort((a, b) => b.score - a.score);
  const cdif = [...(variable.cdif_predictions ?? [])].sort((a, b) => b.score - a.score);
  const valueLabels = variable.value_labels ? Object.entries(variable.value_labels) : [];

  const meta = [
    ['Type', variable.type],
    ['Measure', variable.measure],
    ['Width', variable.type === 'Str' ? variable.string_len : variable.format_width],
    ['Decimals', variable.decimal_places],
    ['Alignment', variable.alignment],
  ].filter(([, v]) => v !== undefined && v !== null && v !== '');

  return (
    <div className="drawer-layer" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <div className="drawer-head">
          <div>
            <p className="eyebrow">Variable</p>
            <h2 id="drawer-title">{variable.name}</h2>
            <p className="drawer-label">{variable.label || 'No label'}</p>
          </div>
          <button ref={closeRef} className="icon-btn" onClick={onClose} aria-label="Close details">×</button>
        </div>

        <div className="drawer-body">
          <section>
            <dl className="meta-grid">
              {meta.map(([k, v]) => (
                <div key={k}><dt>{k}</dt><dd>{String(v)}</dd></div>
              ))}
            </dl>
          </section>

          {valueLabels.length > 0 && (
            <section>
              <h3>Value labels</h3>
              <ul className="value-labels">
                {valueLabels.map(([code, text]) => (
                  <li key={code}><span className="code">{code}</span>{text}</li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <div className="section-head">
              <h3>{task.tab}</h3>
              <span className={`status-chip s-${entry.status}`}>{STATUS_LABEL[entry.status]}</span>
            </div>
            <p className="hint">{task.help} Bars show the model's confidence.</p>
            <ul className="pred-list">
              {preds.map((p) => {
                const checked = entry.selected.includes(p.code);
                const id = `drawer-${task.id}-${variable.name}-${p.code}`;
                return (
                  <li key={p.code} className={checked ? 'is-checked' : ''}>
                    <input
                      id={id}
                      type="checkbox"
                      className={`box ${task.multiple ? '' : 'single'}`}
                      checked={checked}
                      disabled={entry.status === STATUS.REJECTED}
                      onChange={() => onToggle(p.code)}
                    />
                    <label htmlFor={id} title={p.description}>
                      {p.name}
                      {suggestion.includes(p.code) && <span className="ai-tag">Model</span>}
                    </label>
                    <span className="bar" aria-hidden="true"><span style={{ width: `${Math.max(p.score * 100, 0.5)}%` }} /></span>
                    <span className="num">{fmt(p.score)}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section>
            <label className="field-label" htmlFor={`note-${task.id}-${variable.name}`}>Reviewer note ({task.tab.toLowerCase()})</label>
            <textarea
              id={`note-${task.id}-${variable.name}`}
              rows={3}
              value={entry.note}
              placeholder="Why you changed or rejected the suggestion (optional)"
              onChange={(e) => onNote(e.target.value)}
            />
          </section>

          {cdif.length > 0 && (
            <section>
              <h3>Raw model output: cdif_predictions</h3>
              <ul className="pred-list compact">
                {cdif.map((p) => (
                  <li key={p.label}>
                    <span className="cdif-name">{p.label}</span>
                    <span className="bar muted" aria-hidden="true"><span style={{ width: `${Math.max(p.score * 100, 0.5)}%` }} /></span>
                    <span className="num">{fmt(p.score)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="drawer-foot">
          {entry.status !== STATUS.PENDING && <button className="btn ghost" onClick={onReset}>Undo review</button>}
          <span className="spacer" />
          <button className="btn reject" onClick={onReject}>Reject</button>
          <button className="btn primary" onClick={onAccept}>Accept</button>
        </div>
      </aside>
    </div>
  );
}
