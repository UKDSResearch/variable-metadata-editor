import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import NetworkBanner from './NetworkBanner.jsx';
import VariableDrawer from './VariableDrawer.jsx';
import { TASKS, taskById } from './tasks.js';
import {
  STATUS, STATUS_LABEL, topOption, suggestedCodes,
  initialReview, applyThreshold, toggleOption, accept, reject, reset, summarise, buildExport, validate,
} from './review.js';
import { saveTextFile } from './download.js';
import { getDataverseContext, fetchDataverseFile, addDataverseFile } from './dataverse.js';
import sampleData from './sample/sdc_example_metadata_enriched.json';

const APP_NAME = 'Variable Metadata Editor';
const DEFAULT_THRESHOLD = 0.5;
const LOW_CONFIDENCE = 0.8;
const fmt = (s) => (s ?? 0).toFixed(4);
const stripExt = (n) => n.replace(/\.[^.]+$/, '');
const formatDate = (d) =>
  d.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

const storage = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* storage unavailable */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* storage unavailable */ } },
};

const HelpIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M9.4 9.3a2.7 2.7 0 1 1 3.9 2.4c-.8.4-1.3 1-1.3 1.9v.4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <circle cx="12" cy="17" r="1.2" fill="currentColor" />
  </svg>
);
const SortArrow = ({ dir }) => (
  <svg className={`sort-arrow ${dir ? 'on' : ''}`} viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <path d={dir === 'asc' ? 'M8 13V3M4 7l4-4 4 4' : 'M8 3v10M4 9l4 4 4-4'} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function makeDataset(data, name, ingestedAt, isSample, sourceId = '') {
  const variables = data.variables.filter((v) => TASKS.some((t) => t.hasData(v)));
  // sourceId (e.g. the Dataverse file ID) keeps a recreated file from inheriting a prior file's review state.
  const key = `vme:${name}:${sourceId}:${variables.map((v) => v.name).join('|')}`;
  return { data, name, ingestedAt, isSample, variables, key };
}

const reviewCovers = (review, variables) =>
  TASKS.every((t) => variables.every((v) => !t.hasData(v) || review?.[t.id]?.[v.name]));

export default function App() {
  const [dataset, setDataset] = useState(() =>
    makeDataset(sampleData, 'sdc_example_metadata_enriched', null, true));
  const [tab, setTab] = useState(() => storage.get('vme:tab') ?? 'privacy');
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [review, setReview] = useState({});
  const [sort, setSort] = useState({ key: null, dir: null });
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [openVar, setOpenVar] = useState(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [dragging, setDragging] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [dvContext] = useState(getDataverseContext);
  const [dvBusy, setDvBusy] = useState(false);
  const fileInput = useRef(null);

  const { variables } = dataset;
  const task = taskById(tab) ?? TASKS[0];
  const options = useMemo(() => task.options(variables), [task, variables]);
  const taskVars = useMemo(() => variables.filter((v) => task.hasData(v)), [task, variables]);
  const taskReview = review[task.id] ?? {};
  const suggestions = useMemo(() => {
    const out = {};
    for (const v of taskVars) out[v.name] = suggestedCodes(task, v, threshold);
    return out;
  }, [task, taskVars, threshold]);

  // Load saved progress for this dataset, or start from the model's suggestions.
  useEffect(() => {
    const saved = storage.get(dataset.key);
    const t = saved?.threshold ?? DEFAULT_THRESHOLD;
    setThreshold(t);
    setReview(saved?.review ? applyThreshold(saved.review, variables, t) : initialReview(variables, t));
    setSort({ key: null, dir: null });
    setFilter('all');
    setQuery('');
  }, [dataset]);

  useEffect(() => {
    if (reviewCovers(review, variables)) storage.set(dataset.key, { review, threshold });
  }, [review, threshold, dataset.key, variables]);

  useEffect(() => { storage.set('vme:tab', tab); }, [tab]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const loadFile = useCallback(async (file) => {
    if (!file) return;
    setError('');
    try {
      const text = await file.text();
      let data;
      try { data = JSON.parse(text); } catch { throw new Error(`${file.name} is not valid JSON. Check the file and upload it again.`); }
      validate(data);
      setOpenVar(null);
      setDataset(makeDataset(data, stripExt(file.name), new Date(file.lastModified), false));
      setToast(`Loaded ${file.name}`);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  // Launched from Dataverse as an external tool: load the target file instead of the sample.
  useEffect(() => {
    if (!dvContext) return;
    let cancelled = false;
    (async () => {
      setDvBusy(true);
      setError('');
      try {
        const { data, filename } = await fetchDataverseFile(dvContext);
        validate(data);
        if (cancelled) return;
        setOpenVar(null);
        setDataset(makeDataset(data, stripExt(filename), null, false, dvContext.fileId));
        setToast(`Loaded ${filename} from Dataverse`);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setDvBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [dvContext]);

  const saveToDataverse = async () => {
    if (!dvContext) return;
    setDvBusy(true);
    setError('');
    try {
      const out = buildExport(dataset.data, variables, review, threshold);
      const filename = `${dataset.name}_reviewed.json`;
      await addDataverseFile(dvContext, filename, JSON.stringify(out, null, 2));
      setToast(`Added ${filename} to Dataverse`);
    } catch (e) {
      setError(e.message);
    } finally {
      setDvBusy(false);
    }
  };

  const update = (name, fn) =>
    setReview((r) => ({ ...r, [task.id]: { ...r[task.id], [name]: fn(r[task.id][name]) } }));
  const toggle = (name, code) => update(name, (e) => toggleOption(task, e, code, suggestions[name]));

  const onThreshold = (t) => {
    setThreshold(t);
    setReview((r) => applyThreshold(r, variables, t));
  };

  const switchTab = (id) => {
    setTab(id);
    setSort({ key: null, dir: null });
    setFilter('all');
    setConfirmingReset(false);
  };

  const acceptAllPending = () => {
    setReview((r) => {
      const next = { ...r[task.id] };
      for (const name of Object.keys(next)) if (next[name].status === STATUS.PENDING) next[name] = accept(next[name]);
      return { ...r, [task.id]: next };
    });
    setToast(`Accepted all remaining ${task.tab} suggestions`);
  };

  const resetTab = () => {
    setReview((r) => {
      const next = {};
      for (const v of taskVars) next[v.name] = reset({ note: '' }, suggestedCodes(task, v, threshold));
      return { ...r, [task.id]: next };
    });
    setConfirmingReset(false);
    setToast(`${task.tab} review cleared`);
  };

  const exportJson = async () => {
    const out = buildExport(dataset.data, variables, review, threshold);
    const filename = `${dataset.name}_reviewed.json`;
    try {
      const result = await saveTextFile(filename, JSON.stringify(out, null, 2));
      if (result === 'saved') setToast(`Exported ${filename}`);
    } catch {
      setError('The file could not be saved here. Try again, or run the app locally with npm run dev.');
    }
  };

  const summary = summarise(taskReview);
  const ready = reviewCovers(review, variables);

  const rows = useMemo(() => {
    if (!ready) return [];
    const q = query.trim().toLowerCase();
    let list = taskVars.map((v) => ({ v, scores: task.scores(v), top: topOption(task, v) }));
    if (q) list = list.filter(({ v }) => v.name.toLowerCase().includes(q) || (v.label ?? '').toLowerCase().includes(q));
    if (filter === 'pending') list = list.filter(({ v }) => taskReview[v.name].status === STATUS.PENDING);
    if (filter === 'reviewed') list = list.filter(({ v }) => taskReview[v.name].status !== STATUS.PENDING);
    if (filter === 'low') list = list.filter(({ top }) => (top?.score ?? 0) < LOW_CONFIDENCE);
    if (sort.key) {
      const dir = sort.dir === 'asc' ? 1 : -1;
      const val = ({ v, scores }) =>
        sort.key === '__name' ? v.name : sort.key === '__label' ? (v.label ?? '') : (scores[sort.key] ?? 0);
      list.sort((a, b) => {
        const x = val(a); const y = val(b);
        return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir;
      });
    }
    return list;
  }, [task, taskVars, taskReview, filter, query, sort, ready]);

  // Text columns sort A→Z first; score columns sort highest first.
  const cycleSort = (key) => {
    const first = key.startsWith('__') ? 'asc' : 'desc';
    const second = first === 'asc' ? 'desc' : 'asc';
    setSort((s) => {
      if (s.key !== key) return { key, dir: first };
      if (s.dir === first) return { key, dir: second };
      return { key: null, dir: null };
    });
  };
  const ariaSort = (key) => (sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none');

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    loadFile(e.dataTransfer.files?.[0]);
  };

  const open = openVar ? taskVars.find((v) => v.name === openVar) : null;

  return (
    <div
      className="app"
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={onDrop}
    >
      <NetworkBanner crumbs={['Home', 'Ingest pipeline']} title={APP_NAME} />

      <main className="page">
        <section className="card">
          <div className="card-head">
            <div className="dataset">
              <h2>Reviewing dataset: {dataset.name}</h2>
              <p className="sub">
                {dvContext
                  ? (dvBusy ? 'Loading from Dataverse…' : `Opened from Dataverse (file ${dvContext.fileId})`)
                  : dataset.isSample
                    ? 'Example file loaded. Upload your own enriched metadata JSON to review it.'
                    : dataset.ingestedAt ? `Ingested on ${formatDate(dataset.ingestedAt)}` : null}
              </p>
            </div>
            <div className="head-actions">
              <input
                ref={fileInput}
                id="file-input"
                type="file"
                accept=".json,application/json"
                hidden
                onChange={(e) => { loadFile(e.target.files?.[0]); e.target.value = ''; }}
              />
              <button className="btn" onClick={() => fileInput.current?.click()}>Upload file</button>
              {dvContext && (
                <button
                  className="btn primary"
                  onClick={saveToDataverse}
                  disabled={!ready || dvBusy}
                  title="Adds a new file to the dataset; the original enriched file is left untouched"
                >
                  Add reviewed copy to Dataverse
                </button>
              )}
              <button className="btn primary" onClick={exportJson} disabled={!ready}>Export reviewed JSON</button>
            </div>
          </div>

          {error && (
            <div className="alert" role="alert">
              <span>{error}</span>
              <button className="icon-btn small" onClick={() => setError('')} aria-label="Dismiss">×</button>
            </div>
          )}

          <div className="tabs" role="tablist">
            {TASKS.map((t) => {
              const s = summarise(review[t.id]);
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={t.id === task.id}
                  className={`tab ${t.id === task.id ? 'active' : ''}`}
                  onClick={() => switchTab(t.id)}
                >
                  <HelpIcon /><span>{t.tab}</span>
                  <span className={`tab-count num ${s.total > 0 && s.pending === 0 ? 'done' : ''}`}>{s.reviewed}/{s.total}</span>
                </button>
              );
            })}
          </div>

          <div className="progress-row">
            <div className="progress">
              <div className="progress-text">
                <strong className="num">{summary.reviewed} of {summary.total}</strong> variables reviewed for {task.tab.toLowerCase()}
              </div>
              <div className="progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={summary.total} aria-valuenow={summary.reviewed}>
                <span className="seg accepted" style={{ flexGrow: summary.accepted }} />
                <span className="seg edited" style={{ flexGrow: summary.edited }} />
                <span className="seg rejected" style={{ flexGrow: summary.rejected }} />
                <span className="seg pending" style={{ flexGrow: summary.pending }} />
              </div>
              <ul className="legend">
                {['accepted', 'edited', 'rejected', 'pending'].map((s) => (
                  <li key={s}><span className={`dot ${s}`} />{STATUS_LABEL[s]} <span className="num">{summary[s]}</span></li>
                ))}
              </ul>
            </div>
            <div className="threshold">
              <label htmlFor="threshold">Pre-tick model suggestions scoring at least <strong className="num">{threshold.toFixed(2)}</strong></label>
              <input
                id="threshold"
                type="range"
                min="0.05"
                max="0.95"
                step="0.05"
                value={threshold}
                onChange={(e) => onThreshold(Number(e.target.value))}
              />
              <span className="hint">Applies to every tab. Only changes rows still to review.</span>
            </div>
          </div>

          <div className="toolbar">
            <input
              id="search"
              className="search"
              type="search"
              placeholder="Search variable name or label"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="segmented" role="group" aria-label="Filter rows">
              {[['all', 'All'], ['pending', 'To review'], ['reviewed', 'Reviewed'], ['low', 'Low confidence']].map(([id, label]) => (
                <button key={id} className={filter === id ? 'on' : ''} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>
              ))}
            </div>
            <span className="spacer" />
            {confirmingReset ? (
              <span className="confirm">
                Clear every {task.tab} decision for this file?
                <button className="btn small reject" onClick={resetTab}>Clear</button>
                <button className="btn small ghost" onClick={() => setConfirmingReset(false)}>Cancel</button>
              </span>
            ) : (
              <>
                <button className="btn ghost small" onClick={() => setConfirmingReset(true)} disabled={summary.reviewed === 0}>Start over</button>
                <button className="btn small" onClick={acceptAllPending} disabled={summary.pending === 0}>Accept all to review</button>
              </>
            )}
          </div>

          <p className="task-help">
            {task.help} {task.multiple ? 'You can tick more than one.' : 'Choose one option per variable.'}
            {task.source === 'cdif_predictions' && <span className="source-tag">Scores from cdif_predictions</span>}
          </p>

          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th className="col-name sticky-left" aria-sort={ariaSort('__name')}>
                    <button className="th-btn" onClick={() => cycleSort('__name')} title="Variable name">
                      <span className="th-text">Variable name</span><SortArrow dir={sort.key === '__name' ? sort.dir : null} />
                    </button>
                  </th>
                  <th className="col-label" aria-sort={ariaSort('__label')}>
                    <button className="th-btn" onClick={() => cycleSort('__label')} title="Variable label">
                      <span className="th-text">Variable label</span><SortArrow dir={sort.key === '__label' ? sort.dir : null} />
                    </button>
                  </th>
                  {options.map((o) => (
                    <th key={o.code} className={`col-concept ${o.code === 'ADMIN' ? 'col-none' : ''}`} aria-sort={ariaSort(o.code)}>
                      <button className="th-btn" onClick={() => cycleSort(o.code)} title={`${o.name}. ${o.description} Click to sort by score.`}>
                        <span className="th-text">{o.name}</span><SortArrow dir={sort.key === o.code ? sort.dir : null} />
                      </button>
                    </th>
                  ))}
                  <th className="col-review sticky-right">Review</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ v, scores, top }) => {
                  const entry = taskReview[v.name];
                  const low = (top?.score ?? 0) < LOW_CONFIDENCE;
                  return (
                    <tr key={v.name} className={`row s-${entry.status}`}>
                      <td className="col-name sticky-left">
                        <button className="var-link" onClick={() => setOpenVar(v.name)} title={`Open details for ${v.name}`}>{v.name}</button>
                        {low && entry.status === STATUS.PENDING && <span className="flag" title={`Top score is below ${LOW_CONFIDENCE}`}>Low confidence</span>}
                      </td>
                      <td className="col-label"><span className="label-text" title={v.label}>{v.label}</span></td>
                      {options.map((o) => {
                        const score = scores[o.code];
                        const checked = entry.selected.includes(o.code);
                        const id = `cb-${task.id}-${v.name}-${o.code}`;
                        return (
                          <td key={o.code} className={`col-concept cell ${o.code === 'ADMIN' ? 'col-none' : ''} ${checked ? 'is-checked' : ''} ${top?.code === o.code ? 'is-top' : ''}`}>
                            <label htmlFor={id} className="cell-inner">
                              <input
                                id={id}
                                type="checkbox"
                                className={`box ${task.multiple ? '' : 'single'}`}
                                checked={checked}
                                disabled={entry.status === STATUS.REJECTED || score === undefined}
                                onChange={() => toggle(v.name, o.code)}
                                aria-label={`${v.name}: ${o.name}, score ${fmt(score)}`}
                              />
                              <span className="num">{score === undefined ? '–' : fmt(score)}</span>
                            </label>
                          </td>
                        );
                      })}
                      <td className="col-review sticky-right">
                        <div className="review-cell">
                          <span className={`status-chip s-${entry.status}`}>{STATUS_LABEL[entry.status]}</span>
                          {entry.status === STATUS.PENDING ? (
                            <span className="row-actions">
                              <button className="mini accept" onClick={() => update(v.name, accept)} aria-label={`Accept suggestion for ${v.name}`} title="Accept">✓</button>
                              <button className="mini reject" onClick={() => update(v.name, reject)} aria-label={`Reject suggestion for ${v.name}`} title="Reject the model's suggestion">✕</button>
                            </span>
                          ) : (
                            <button className="mini undo" onClick={() => update(v.name, (e) => reset(e, suggestions[v.name]))} aria-label={`Undo review of ${v.name}`} title="Undo">↺</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {ready && rows.length === 0 && (
                  <tr><td className="empty" colSpan={options.length + 3}>No variables match this filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="foot-hint">
            Click a variable name for its value labels, all scores and a reviewer note. Ticking or unticking a box counts as an edit.
            Reject marks the model's suggestion as wrong and leaves the row empty. Drop a JSON file anywhere on the page to load it.
          </p>
        </section>
      </main>

      {open && taskReview[open.name] && (
        <VariableDrawer
          variable={open}
          task={task}
          options={options}
          entry={taskReview[open.name]}
          suggestion={suggestions[open.name]}
          onClose={() => setOpenVar(null)}
          onToggle={(code) => toggle(open.name, code)}
          onAccept={() => { update(open.name, accept); setOpenVar(null); }}
          onReject={() => { update(open.name, reject); setOpenVar(null); }}
          onReset={() => update(open.name, (e) => reset(e, suggestions[open.name]))}
          onNote={(note) => update(open.name, (e) => ({ ...e, note }))}
        />
      )}

      {dragging && <div className="drop-overlay"><div>Drop the enriched metadata JSON to review it</div></div>}
      <div className="toast" role="status" aria-live="polite">{toast && <span>{toast}</span>}</div>
    </div>
  );
}
