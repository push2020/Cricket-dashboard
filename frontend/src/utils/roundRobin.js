/**
 * Generates all round-robin fixture pairs for a list of team IDs.
 * Uses the classic circle method: one team stays fixed at position 0 while
 * the rest rotate clockwise each round.
 * If the team count is odd a null "bye" is injected and bye fixtures are skipped.
 * Returns an array of { homeTeam, awayTeam, round } objects.
 *
 * @param {Array} teamIds - Array of team ID strings
 * @returns {Array<{homeTeam: string, awayTeam: string, round: number}>}
 */
export function generateRoundRobin(teamIds) {
  const teams = [...teamIds];

  if (teams.length % 2 !== 0) {
    teams.push(null); // bye placeholder so the count is even
  }

  const n = teams.length;
  const totalRounds = n - 1;
  const matchesPerRound = n / 2;
  const fixtures = [];

  for (let round = 0; round < totalRounds; round++) {
    for (let match = 0; match < matchesPerRound; match++) {
      const home = teams[match];
      const away = teams[n - 1 - match];

      if (home !== null && away !== null) {
        fixtures.push({ homeTeam: home, awayTeam: away, round: round + 1 });
      }
    }

    // Rotate: keep teams[0] fixed, insert the last element at index 1
    const last = teams.pop();
    teams.splice(1, 0, last);
  }

  return fixtures;
}
