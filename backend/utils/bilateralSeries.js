/**
 * Computes the live series result for a bilateral tournament.
 * Works with both raw (unpopulated) and populated fixture objects.
 *
 * @param {object[]} teams    - Array of 2 team documents { _id, name }
 * @param {object[]} fixtures - All fixtures for the tournament
 * @returns {object} Series result shape
 */
function computeSeriesResult(teams, fixtures) {
  const completed = fixtures.filter((f) => f.status === 'completed');
  const total     = fixtures.length;

  const wins  = {};
  const names = {};

  teams.forEach((t) => {
    const id = t._id.toString();
    wins[id]  = 0;
    names[id] = t.name;
  });

  completed.forEach((f) => {
    const winnerId = (f.winner?._id ?? f.winner)?.toString();
    if (winnerId && wins[winnerId] !== undefined) {
      wins[winnerId]++;
    }
  });

  const teamIds = teams.map((t) => t._id.toString());
  const [aId, bId] = teamIds;
  const aWins = wins[aId] ?? 0;
  const bWins = wins[bId] ?? 0;
  const aName = names[aId] ?? 'Team A';
  const bName = names[bId] ?? 'Team B';

  const played  = completed.length;
  const tied    = played - aWins - bWins;

  // Series decided when majority is reached or all matches played
  const majority = Math.ceil(total / 2);
  const decided  = aWins >= majority || bWins >= majority || played === total;
  let   winner   = null;

  if (decided) {
    if (aWins > bWins)      winner = { _id: aId, name: aName };
    else if (bWins > aWins) winner = { _id: bId, name: bName };
    // else: tied series (no outright winner)
  }

  return {
    teamA:      { _id: aId, name: aName, wins: aWins },
    teamB:      { _id: bId, name: bName, wins: bWins },
    tied,
    played,
    total,
    decided,
    winner,
  };
}

module.exports = { computeSeriesResult };
