// Pure review logic, shared by every tab. No React here.
import { TASKS } from './tasks.js';

export const STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  EDITED: 'edited',
  REJECTED: 'rejected',
};

export const STATUS_LABEL = {
  pending: 'To review',
  accepted: 'Accepted',
  edited: 'Edited',
  rejected: 'Rejected',
};

/** Highest-scoring option for a task, or null. */
export function topOption(task, variable) {
  let best = null;
  for (const [code, score] of Object.entries(task.scores(variable))) {
    if (!best || score > best.score) best = { code, score };
  }
  return best;
}

/**
 * The model's suggestion at a threshold.
 * Multi-choice tasks: every option at or above it. Single-choice: the top option if it clears it.
 */
export function suggestedCodes(task, variable, threshold) {
  if (!task.hasData(variable)) return [];
  if (!task.multiple) {
    const top = topOption(task, variable);
    return top && top.score >= threshold ? [top.code] : [];
  }
  const picked = Object.entries(task.scores(variable))
    .filter(([, s]) => s >= threshold)
    .sort((a, b) => b[1] - a[1])
    .map(([c]) => c);
  // Never suggest "None" together with a real concept.
  const ex = task.exclusive ?? [];
  if (picked.length > 1 && picked.some((c) => ex.includes(c))) return [picked[0]];
  return picked;
}

const freshEntry = (selected) => ({ status: STATUS.PENDING, selected, note: '', reviewedAt: null });

/** Every task's review for every variable: { taskId: { varName: entry } }. */
export function initialReview(variables, threshold) {
  const out = {};
  for (const t of TASKS) {
    out[t.id] = {};
    for (const v of variables) if (t.hasData(v)) out[t.id][v.name] = freshEntry(suggestedCodes(t, v, threshold));
  }
  return out;
}

/** Re-apply the threshold to rows nobody has reviewed yet; fill any gaps. */
export function applyThreshold(review, variables, threshold) {
  const out = {};
  for (const t of TASKS) {
    const prev = review?.[t.id] ?? {};
    out[t.id] = {};
    for (const v of variables) {
      if (!t.hasData(v)) continue;
      const r = prev[v.name];
      out[t.id][v.name] = r && r.status !== STATUS.PENDING
        ? r
        : { ...(r ?? freshEntry([])), status: STATUS.PENDING, selected: suggestedCodes(t, v, threshold) };
    }
  }
  return out;
}

const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

/** Tick or untick one option. A change from the model's suggestion counts as an edit. */
export function toggleOption(task, entry, code, suggestion) {
  const has = entry.selected.includes(code);
  let selected;
  if (!task.multiple) {
    selected = has ? [] : [code];
  } else if (has) {
    selected = entry.selected.filter((c) => c !== code);
  } else {
    const ex = task.exclusive ?? [];
    selected = ex.includes(code) ? [code] : [...entry.selected.filter((c) => !ex.includes(c)), code];
  }
  const status = sameSet(selected, suggestion) ? STATUS.ACCEPTED : STATUS.EDITED;
  return { ...entry, selected, status, reviewedAt: new Date().toISOString() };
}

export const accept = (entry) => ({ ...entry, status: STATUS.ACCEPTED, reviewedAt: new Date().toISOString() });
export const reject = (entry) => ({ ...entry, status: STATUS.REJECTED, selected: [], reviewedAt: new Date().toISOString() });
export const reset = (entry, suggestion) => ({ ...entry, status: STATUS.PENDING, selected: suggestion, reviewedAt: null });

export function summarise(taskReview = {}) {
  const counts = { pending: 0, accepted: 0, edited: 0, rejected: 0 };
  for (const r of Object.values(taskReview)) counts[r.status] += 1;
  const total = Object.keys(taskReview).length;
  return { ...counts, total, reviewed: total - counts.pending };
}

/**
 * Original file with one review block per tab added to every variable
 * (privacy_review, function_review, component_review). Model output is kept untouched.
 */
export function buildExport(data, variables, review, threshold) {
  const optionNames = {};
  for (const t of TASKS) optionNames[t.id] = Object.fromEntries(t.options(variables).map((o) => [o.code, o.name]));

  const summary = {};
  for (const t of TASKS) summary[t.id] = summarise(review[t.id]);

  return {
    ...data,
    review_meta: {
      tool: 'Variable Metadata Editor',
      exported_at: new Date().toISOString(),
      suggestion_threshold: threshold,
      summary,
    },
    variables: data.variables.map((v) => {
      const out = { ...v };
      for (const t of TASKS) {
        const r = review[t.id]?.[v.name];
        if (!r) continue;
        const pending = r.status === STATUS.PENDING;
        out[t.exportKey] = {
          status: r.status,
          selected: pending ? null : r.selected,
          selected_names: pending ? null : r.selected.map((c) => optionNames[t.id][c] ?? c),
          model_suggestion: suggestedCodes(t, v, threshold),
          note: r.note || null,
          reviewed_at: r.reviewedAt,
        };
      }
      return out;
    }),
  };
}

/** Throws a readable error if the file is not in the expected shape. */
export function validate(data) {
  if (!data || !Array.isArray(data.variables)) {
    throw new Error('This file has no "variables" list. Upload the enriched metadata JSON produced by the classifier.');
  }
  const any = data.variables.some((v) => Array.isArray(v.privacy_predictions) || Array.isArray(v.cdif_predictions));
  if (!any) {
    throw new Error('None of the variables have "privacy_predictions" or "cdif_predictions". Run the enrichment step first, then upload the output.');
  }
  return data;
}
