/**
 * Data access layer — same exported function signatures as the old axios version,
 * but reads/writes localStorage instead of making HTTP requests.
 * Every function returns Promise.resolve({ data }) so all call-sites are unchanged.
 */

import { KEYS, getAll, findById, insert, update, remove, removeWhere } from '../storage';
import { newId } from '../utils/ids';
import { generateRoundRobin } from '../utils/roundRobin';
import { computeStandings } from '../utils/standings';

/** Returns a resolved promise in axios response shape */
function ok(data) {
  return Promise.resolve({ data });
}

/** Returns a rejected promise whose .response.data.message pages can read */
function fail(message) {
  const err = new Error(message);
  err.response = { data: { message } };
  return Promise.reject(err);
}

/** Returns the current ISO timestamp string */
function now() {
  return new Date().toISOString();
}

/**
 * Resolves a raw fixture's ID references (homeTeam, awayTeam, winner, tossWinner)
 * into full team objects using the provided teams array.
 *
 * @param {object} fixture - Raw fixture from localStorage
 * @param {Array} allTeams - All teams from localStorage
 * @returns {object} Fixture with populated team objects
 */
function populateFixture(fixture, allTeams) {
  if (!fixture) return null;
  const findTeam = (id) => (id ? allTeams.find((t) => t._id === id) ?? null : null);
  return {
    ...fixture,
    homeTeam: findTeam(fixture.homeTeam),
    awayTeam: findTeam(fixture.awayTeam),
    winner: findTeam(fixture.winner),
    tossWinner: findTeam(fixture.tossWinner),
  };
}

/**
 * Like populateFixture but also replaces tournamentId with the full tournament object.
 * Used by getFixture() which MatchEntry needs to read fixture.tournamentId._id.
 *
 * @param {object} fixture - Raw fixture from localStorage
 * @param {Array} allTeams
 * @param {Array} allTournaments
 * @returns {object}
 */
function populateFixtureFull(fixture, allTeams, allTournaments) {
  const populated = populateFixture(fixture, allTeams);
  if (!populated) return null;
  const tournament = allTournaments.find((t) => t._id === fixture.tournamentId) ?? null;
  return { ...populated, tournamentId: tournament };
}

// ─── Tournaments ─────────────────────────────────────────────────────────────

/** Returns all tournaments sorted newest first */
export function getTournaments() {
  const all = getAll(KEYS.tournaments).sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
  return ok(all);
}

/** Creates a new tournament and returns the created document */
export function createTournament({ name, description, overs, startDate }) {
  const tournament = {
    _id: newId(),
    name,
    description: description || '',
    overs: Number(overs),
    startDate: startDate || null,
    status: 'upcoming',
    fixturesGenerated: false,
    createdAt: now(),
    updatedAt: now(),
  };
  insert(KEYS.tournaments, tournament);
  return ok(tournament);
}

/** Returns a single tournament by id */
export function getTournament(id) {
  const t = findById(KEYS.tournaments, id);
  if (!t) return fail('Tournament not found');
  return ok(t);
}

/** Deletes a tournament and cascades to remove its teams and fixtures */
export function deleteTournament(id) {
  remove(KEYS.tournaments, id);
  removeWhere(KEYS.teams, (t) => t.tournamentId === id);
  removeWhere(KEYS.fixtures, (f) => f.tournamentId === id);
  return ok({ message: 'Tournament deleted' });
}

/** Computes and returns the points table for a tournament */
export function getStandings(id) {
  const teams = getAll(KEYS.teams).filter((t) => t.tournamentId === id);
  const fixtures = getAll(KEYS.fixtures).filter((f) => f.tournamentId === id);
  return ok(computeStandings(teams, fixtures));
}

// ─── Teams ────────────────────────────────────────────────────────────────────

/** Returns all teams for a tournament in creation order */
export function getTeams(tournamentId) {
  const teams = getAll(KEYS.teams)
    .filter((t) => t.tournamentId === tournamentId)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  return ok(teams);
}

/** Adds a team to a tournament (blocked after fixtures are generated) */
export function createTeam({ name, tournamentId }) {
  const tournament = findById(KEYS.tournaments, tournamentId);
  if (!tournament) return fail('Tournament not found');
  if (tournament.fixturesGenerated) return fail('Cannot add teams after fixtures are generated');
  const team = { _id: newId(), name, tournamentId, createdAt: now(), updatedAt: now() };
  insert(KEYS.teams, team);
  return ok(team);
}

/** Removes a team (blocked after fixtures are generated) */
export function deleteTeam(id) {
  const team = findById(KEYS.teams, id);
  if (!team) return fail('Team not found');
  const tournament = findById(KEYS.tournaments, team.tournamentId);
  if (tournament?.fixturesGenerated) return fail('Cannot delete teams after fixtures are generated');
  remove(KEYS.teams, id);
  return ok({ message: 'Team deleted' });
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** Returns all fixtures for a tournament with team references populated, sorted by round */
export function getFixtures(tournamentId) {
  const allTeams = getAll(KEYS.teams);
  const fixtures = getAll(KEYS.fixtures)
    .filter((f) => f.tournamentId === tournamentId)
    .sort((a, b) => a.round - b.round)
    .map((f) => populateFixture(f, allTeams));
  return ok(fixtures);
}

/**
 * Generates round-robin fixtures for all teams in the tournament.
 * Requires ≥ 2 teams and blocks re-generation once run.
 */
export function generateFixtures(tournamentId) {
  const tournament = findById(KEYS.tournaments, tournamentId);
  if (!tournament) return fail('Tournament not found');
  if (tournament.fixturesGenerated) return fail('Fixtures already generated');

  const teams = getAll(KEYS.teams).filter((t) => t.tournamentId === tournamentId);
  if (teams.length < 2) return fail('Need at least 2 teams to generate fixtures');

  const pairs = generateRoundRobin(teams.map((t) => t._id));
  pairs.forEach(({ homeTeam, awayTeam, round }) => {
    insert(KEYS.fixtures, {
      _id: newId(),
      tournamentId,
      homeTeam,
      awayTeam,
      round,
      status: 'scheduled',
      homeInnings: { runs: 0, wickets: 0, overs: 0 },
      awayInnings: { runs: 0, wickets: 0, overs: 0 },
      winner: null,
      resultNote: '',
      tossWinner: null,
      tossDecision: null,
      matchDate: null,
      createdAt: now(),
      updatedAt: now(),
    });
  });

  update(KEYS.tournaments, tournamentId, {
    fixturesGenerated: true,
    status: 'active',
    updatedAt: now(),
  });

  return ok({ message: 'Fixtures generated', count: pairs.length });
}

/** Returns a single fixture with all references fully populated (including tournamentId) */
export function getFixture(id) {
  const fixture = findById(KEYS.fixtures, id);
  if (!fixture) return fail('Fixture not found');
  return ok(populateFixtureFull(fixture, getAll(KEYS.teams), getAll(KEYS.tournaments)));
}

/**
 * Saves a match result for a fixture. Automatically marks the tournament
 * as completed when no scheduled fixtures remain.
 */
export function enterResult(id, { homeInnings, awayInnings, winner, resultNote, tossWinner, tossDecision, matchDate, status }) {
  const fixture = findById(KEYS.fixtures, id);
  if (!fixture) return fail('Fixture not found');

  const updated = update(KEYS.fixtures, id, {
    homeInnings,
    awayInnings,
    winner: winner || null,
    resultNote: resultNote || '',
    tossWinner: tossWinner || null,
    tossDecision: tossDecision || null,
    matchDate: matchDate || null,
    status: status || 'completed',
    updatedAt: now(),
  });

  // Auto-complete tournament when every fixture is done
  const pendingCount = getAll(KEYS.fixtures).filter(
    (f) => f.tournamentId === fixture.tournamentId && f.status === 'scheduled'
  ).length;

  if (pendingCount === 0) {
    update(KEYS.tournaments, fixture.tournamentId, { status: 'completed', updatedAt: now() });
  }

  return ok(populateFixtureFull(updated, getAll(KEYS.teams), getAll(KEYS.tournaments)));
}
