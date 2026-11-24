// Educational facts database: fact cards for celestial bodies ("Did You Know").
// Curated science facts with source links for educational exploration.

import { FACTS_EN } from './contentEn.js';

export const FACTS = FACTS_EN;
export { FACTS_EN };

/** Get educational facts for a celestial body: defaults to English version. */
export function factsFor(id) {
  const table = FACTS_EN;
  const arr = table[id] ?? table._generic ?? [];
  return arr.map((f) => (typeof f === 'string' ? f : f.text));
}
