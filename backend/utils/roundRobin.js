/**
 * Generates all round-robin fixture pairs for a list of team IDs.
 * Uses the circle method: one team stays fixed at position 0 while
 * the rest rotate clockwise each round.
 * If the team count is odd a null "bye" is injected and bye fixtures are skipped.
 *
 * @param {string[]} teamIds
 * @returns {{ homeTeam: string, awayTeam: string, round: number }[]}
 */
function generateRoundRobin(teamIds) {
  const teams = [...teamIds];

  if (teams.length % 2 !== 0) teams.push(null);

  const n = teams.length;
  const fixtures = [];

  for (let round = 0; round < n - 1; round++) {
    for (let match = 0; match < n / 2; match++) {
      const home = teams[match];
      const away = teams[n - 1 - match];
      if (home !== null && away !== null) {
        fixtures.push({ homeTeam: home, awayTeam: away, round: round + 1 });
      }
    }
    const last = teams.pop();
    teams.splice(1, 0, last);
  }

  return fixtures;
}

module.exports = { generateRoundRobin };
