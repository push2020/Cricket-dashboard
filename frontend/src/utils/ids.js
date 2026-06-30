/** Generates a unique ID to replace MongoDB ObjectIds in localStorage storage */
export const newId = () => crypto.randomUUID();
