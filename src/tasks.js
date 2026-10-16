// One entry per tab. Each task turns a variable's model output into
// { optionCode: score } and says whether several options may be ticked.
// To add a tab or change a mapping, edit this file only.

const PRIVACY_NAMES = {
  ADMIN: { name: 'None', description: 'No privacy concept. Administrative or technical variable (IDs, dates, weights).' },
  AGE: { name: 'Age', description: 'Age or date of birth of the respondent.' },
  COB: { name: 'Country of birth', description: 'Country or region of birth, nationality.' },
  EDU: { name: 'Highest qualification', description: 'Education level or highest qualification.' },
  ETH: { name: 'Ethnicity', description: 'Ethnic group or background.' },
  HLTH: { name: 'Health', description: 'General health, disability or health conditions.' },
  MS: { name: 'Marital status', description: 'Marital or civil partnership status.' },
  NOC: { name: 'Number of children', description: 'Number of dependent children in the household.' },
  NOP: { name: 'Number of people', description: 'Number of people in the household.' },
  NSSEC: { name: 'NS-SEC', description: 'National Statistics Socio-economic Classification.' },
  REL: { name: 'Religion', description: 'Religion or belief.' },
  SEX: { name: 'Sex', description: 'Sex or gender of the respondent.' },
};

/** Raw model output as { LABEL: score }. */
export function rawScores(variable, key) {
  const out = {};
  for (const p of variable[key] ?? []) out[p.label] = p.score;
  return out;
}

export const TASKS = [
  {
    id: 'privacy',
    tab: 'Privacy',
    noun: 'privacy concept',
    source: 'privacy_predictions',
    exportKey: 'privacy_review',
    multiple: true,
    // "None" can't be combined with a real concept.
    exclusive: ['ADMIN'],
    options(variables) {
      const codes = new Set();
      for (const v of variables) for (const p of v.privacy_predictions ?? []) codes.add(p.label);
      const opts = [...codes].map((code) => ({
        code,
        name: PRIVACY_NAMES[code]?.name ?? code,
        description: PRIVACY_NAMES[code]?.description ?? '',
      }));
      // "None" first, then A–Z.
      return opts.sort((a, b) => (a.code === 'ADMIN' ? -1 : b.code === 'ADMIN' ? 1 : a.name.localeCompare(b.name)));
    },
    scores: (v) => rawScores(v, 'privacy_predictions'),
    hasData: (v) => Array.isArray(v.privacy_predictions),
    help: 'Tick every privacy concept this variable describes, or None.',
  },
  {
    id: 'functions',
    tab: 'Functions',
    noun: 'function',
    source: 'cdif_predictions',
    exportKey: 'function_review',
    multiple: false,
    options: () => [
      { code: 'WEIGHT', name: 'Weight', description: 'Survey or analysis weight. Score = CDIF WEIGHT.' },
      { code: 'NONE', name: 'None', description: 'No special function. Score = 1 − CDIF WEIGHT.' },
    ],
    scores(v) {
      const r = rawScores(v, 'cdif_predictions');
      const w = r.WEIGHT ?? 0;
      return { WEIGHT: w, NONE: Math.max(0, 1 - w) };
    },
    hasData: (v) => Array.isArray(v.cdif_predictions),
    help: 'Pick the variable’s function. Only Weight is defined so far; anything else is None.',
  },
  {
    id: 'components',
    tab: 'Components',
    noun: 'component',
    source: 'cdif_predictions',
    exportKey: 'component_review',
    multiple: false,
    options: () => [
      { code: 'IDENTIFIER', name: 'Identifier', description: 'Identifies a unit or record. Score = CDIF IDENTIFIER.' },
      { code: 'ATTRIBUTE', name: 'Attribute', description: 'Describes or qualifies other values. Score = CDIF ATTRIBUTE + WEIGHT.' },
      { code: 'MEASURE', name: 'Measure', description: 'An observed value about the unit. Score = CDIF ADMIN.' },
    ],
    scores(v) {
      const r = rawScores(v, 'cdif_predictions');
      return {
        IDENTIFIER: r.IDENTIFIER ?? 0,
        ATTRIBUTE: (r.ATTRIBUTE ?? 0) + (r.WEIGHT ?? 0),
        MEASURE: r.ADMIN ?? 0,
      };
    },
    hasData: (v) => Array.isArray(v.cdif_predictions),
    help: 'Pick the variable’s CDIF component.',
  },
];

export const taskById = (id) => TASKS.find((t) => t.id === id);
