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

/**
 * Generates a double round-robin schedule for a pool of teams.
 * Each pair plays twice — once with each team as home.
 * Round numbers are sequential (Leg 1 rounds 1…C(n,2), Leg 2 continues after).
 *
 * @param {string[]} teamIds
 * @returns {{ homeTeam: string, awayTeam: string, round: number }[]}
 */
function generateDoubleRoundRobin(teamIds) {
  const n = teamIds.length;
  const uniquePairs = [];

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      uniquePairs.push([i, j]);
    }
  }

  const fixtures = [];

  // Leg 1 — teamIds[i] is home
  uniquePairs.forEach(([i, j], idx) => {
    fixtures.push({ homeTeam: teamIds[i], awayTeam: teamIds[j], round: idx + 1 });
  });

  // Leg 2 — teamIds[j] is home (reversed), rounds continue after Leg 1
  const offset = uniquePairs.length;
  uniquePairs.forEach(([i, j], idx) => {
    fixtures.push({ homeTeam: teamIds[j], awayTeam: teamIds[i], round: offset + idx + 1 });
  });

  return fixtures;
}

module.exports = { generateRoundRobin, generateDoubleRoundRobin };
