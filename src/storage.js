/**
 * Low-level localStorage CRUD helpers.
 * Each collection is stored as a JSON array under a fixed key.
 * All writes are synchronous; every function returns plain values (no Promises).
 */

export const KEYS = {
  tournaments: 'rc_tournaments',
  teams: 'rc_teams',
  fixtures: 'rc_fixtures',
};

/** Reads and parses a collection from localStorage. Returns [] on parse error. */
export function getAll(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

/** Overwrites a collection in localStorage with the given items array. */
export function save(key, items) {
  localStorage.setItem(key, JSON.stringify(items));
}

/** Returns the first item whose _id matches, or null. */
export function findById(key, id) {
  return getAll(key).find((item) => item._id === id) ?? null;
}

/** Appends an item to a collection and returns the item. */
export function insert(key, item) {
  const items = getAll(key);
  items.push(item);
  save(key, items);
  return item;
}

/**
 * Merges patch into the item with the given id.
 * Returns the updated item, or null if id not found.
 */
export function update(key, id, patch) {
  const items = getAll(key);
  const idx = items.findIndex((item) => item._id === id);
  if (idx === -1) return null;
  items[idx] = { ...items[idx], ...patch };
  save(key, items);
  return items[idx];
}

/** Removes the item with the given id from a collection. */
export function remove(key, id) {
  save(key, getAll(key).filter((item) => item._id !== id));
}

/** Removes all items from a collection for which predicate returns true. */
export function removeWhere(key, predicate) {
  save(key, getAll(key).filter((item) => !predicate(item)));
}
