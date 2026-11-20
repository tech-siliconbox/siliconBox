/** Praman's console commands (`help` lists them), for Tab completion of a line's first word. */
const COMMAND_WORDS = [
  'abstract',
  'analyze',
  'assert',
  'assume',
  'case_split',
  'check_assumptions',
  'check_conn',
  'check_cov',
  'check_equivalence',
  'check_reset',
  'check_strength',
  'clear',
  'clock',
  'cover',
  'elaborate',
  'get_clock_info',
  'get_design_info',
  'get_needed_assumptions',
  'get_property_list',
  'get_reset_info',
  'help',
  'include',
  'prove',
  'report',
  'reset',
  'set_max_trace_length',
  'set_prove_per_property_time_limit',
  'set_prove_time_limit',
  'source',
  'stop',
  'stopat',
  'task',
  'version',
  'visualize',
] as const;

/**
 * What Tab adds to the word before the caret: a command for a line's first word, else a
 * property name. One match is finished with a space; several are filled in as far as they agree.
 */
export function completion(head: string, propertyNames: readonly string[]): string {
  const word = /[^\s{}[\]]*$/.exec(head)?.[0] ?? '';
  if (word === '') return '';
  const pool: readonly string[] = head.trim() === word ? COMMAND_WORDS : propertyNames;
  const hits = pool.filter((candidate) => candidate.startsWith(word));
  const [first] = hits;
  if (first === undefined) return '';
  if (hits.length === 1) return `${first.slice(word.length)} `;
  let common = first;
  for (const hit of hits) while (!hit.startsWith(common)) common = common.slice(0, -1);
  return common.slice(word.length);
}
