/**
 * Data access layer — all calls go to the Express / MongoDB backend via axios.
 * Every function returns the axios response ({ data }) so call-sites are unchanged.
 * Errors propagate as axios errors with the shape { response: { data: { message } } }.
 */

import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
});

/* ─── Tournaments ─────────────────────────────────────────────────────── */

/** Returns all tournaments sorted newest-first */
export function getTournaments() {
  return api.get('/tournaments');
}

/** Creates a new tournament */
export function createTournament({ name, description, overs }) {
  return api.post('/tournaments', { name, description, overs });
}

/** Returns a single tournament by id */
export function getTournament(id) {
  return api.get(`/tournaments/${id}`);
}

/** Deletes a tournament and cascades to its teams and fixtures */
export function deleteTournament(id) {
  return api.delete(`/tournaments/${id}`);
}

/** Returns the group-stage standings for a tournament */
export function getStandings(id) {
  return api.get(`/tournaments/${id}/standings`);
}

/** Returns highlight stats (biggest win, highest score, win streaks) */
export function getTournamentStats(tournamentId) {
  return api.get(`/tournaments/${tournamentId}/stats`);
}

/* ─── Teams ───────────────────────────────────────────────────────────── */

/** Returns all teams for a tournament in creation order */
export function getTeams(tournamentId) {
  return api.get(`/tournaments/${tournamentId}/teams`);
}

/** Adds a team to a tournament */
export function createTeam({ name, tournamentId }) {
  return api.post(`/tournaments/${tournamentId}/teams`, { name });
}

/** Removes a team (blocked after fixtures are generated) */
export function deleteTeam(id) {
  return api.delete(`/teams/${id}`);
}

/** Returns all unique team names sorted by usage frequency across all tournaments */
export function getTeamSuggestions() {
  return api.get('/teams/suggestions');
}

/* ─── Fixtures ────────────────────────────────────────────────────────── */

/** Returns all fixtures for a tournament with team refs populated, sorted by round */
export function getFixtures(tournamentId) {
  return api.get(`/tournaments/${tournamentId}/fixtures`);
}

/**
 * Generates fixtures for a tournament.
 * @param {'standard'|'pool'} format  'pool' splits teams into 2 groups with double round-robin
 */
export function generateFixtures(tournamentId, format = 'standard') {
  return api.post(`/tournaments/${tournamentId}/fixtures/generate`, { format });
}

/** Returns pool-specific standings { poolA: [], poolB: [] } for pool-format tournaments */
export function getPoolStandings(tournamentId) {
  return api.get(`/tournaments/${tournamentId}/pool-standings`);
}

/** Generates playoff fixtures (Eliminator + Final) from group-stage standings */
export function generatePlayoffs(tournamentId) {
  return api.post(`/tournaments/${tournamentId}/playoffs/generate`);
}

/** Returns a single fixture with all refs fully populated (including tournamentId) */
export function getFixture(id) {
  return api.get(`/fixtures/${id}`);
}

/** Saves a match result; handles all playoff progression logic on the server */
export function enterResult(id, body) {
  return api.put(`/fixtures/${id}/result`, body);
}

/* ─── Hall of Fame ────────────────────────────────────────────────────── */

/** Returns all-time aggregated stats across every tournament */
export function getHallOfFame() {
  return api.get('/hof');
}
