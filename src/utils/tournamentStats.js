/**
 * Computes fun highlight stats for a single tournament from its populated fixtures.
 * Only group-stage completed fixtures are considered.
 *
 * @param {Array} fixtures - Populated fixture objects (homeTeam/awayTeam as objects)
 * @returns {{ biggestWin, highestScore, winStreaks }}
 */
export function computeTournamentStats(fixtures) {
  const completed = fixtures.filter(
    (f) => f.status === 'completed' && (f.type ?? 'group') === 'group'
  );

  const biggestWin = findBiggestWin(completed);
  const highestScore = findHighestScore(completed);
  const winStreaks = computeWinStreaks(completed);

  return { biggestWin, highestScore, winStreaks };
}

/**
 * Finds the completed match with the largest run margin.
 * Returns null if no completed matches exist.
 *
 * @param {Array} completed
 * @returns {{ fixture, margin, winnerName, loserName } | null}
 */
function findBiggestWin(completed) {
  let best = null;

  completed.forEach((f) => {
    const homeRuns = f.homeInnings?.runs ?? 0;
    const awayRuns = f.awayInnings?.runs ?? 0;
    const margin = Math.abs(homeRuns - awayRuns);

    if (best === null || margin > best.margin) {
      const winnerId = f.winner?._id ?? f.winner;
      const homeId = f.homeTeam?._id ?? f.homeTeam;
      const winnerName = winnerId === homeId ? f.homeTeam?.name : f.awayTeam?.name;
      const loserName = winnerId === homeId ? f.awayTeam?.name : f.homeTeam?.name;
      best = { fixture: f, margin, winnerName, loserName, resultNote: f.resultNote };
    }
  });

  return best;
}

/**
 * Finds the highest single-innings team score across all completed matches.
 * Returns null if no completed matches exist.
 *
 * @param {Array} completed
 * @returns {{ teamName, runs, wickets, againstName } | null}
 */
function findHighestScore(completed) {
  let best = null;

  completed.forEach((f) => {
    const candidates = [
      { innings: f.homeInnings, teamName: f.homeTeam?.name, againstName: f.awayTeam?.name },
      { innings: f.awayInnings, teamName: f.awayTeam?.name, againstName: f.homeTeam?.name },
    ];

    candidates.forEach(({ innings, teamName, againstName }) => {
      if (!innings || innings.runs === undefined) return;
      if (best === null || innings.runs > best.runs) {
        best = { teamName, runs: innings.runs, wickets: innings.wickets, againstName };
      }
    });
  });

  return best;
}

/**
 * Computes current consecutive-win streaks per team.
 * Walks rounds in ascending order; resets streak on a loss or tie.
 * Returns only teams with a streak of 2 or more, sorted by streak descending.
 *
 * @param {Array} completed
 * @returns {Array<{ teamName, streak }>}
 */
function computeWinStreaks(completed) {
  if (completed.length === 0) return [];

  // Collect all unique team IDs present
  const teamMap = {};
  completed.forEach((f) => {
    const homeId = f.homeTeam?._id ?? f.homeTeam;
    const awayId = f.awayTeam?._id ?? f.awayTeam;
    if (homeId && !teamMap[homeId]) teamMap[homeId] = f.homeTeam?.name ?? homeId;
    if (awayId && !teamMap[awayId]) teamMap[awayId] = f.awayTeam?.name ?? awayId;
  });

  const sortedFixtures = [...completed].sort((a, b) => a.round - b.round);

  const streaks = {};
  Object.keys(teamMap).forEach((id) => { streaks[id] = 0; });

  sortedFixtures.forEach((f) => {
    const homeId = f.homeTeam?._id ?? f.homeTeam;
    const awayId = f.awayTeam?._id ?? f.awayTeam;
    const winnerId = f.winner?._id ?? f.winner;

    [homeId, awayId].forEach((teamId) => {
      if (!teamId) return;
      if (!winnerId) {
        // Tie — reset streak
        streaks[teamId] = 0;
      } else if (winnerId === teamId) {
        streaks[teamId] = (streaks[teamId] ?? 0) + 1;
      } else {
        streaks[teamId] = 0;
      }
    });
  });

  return Object.entries(streaks)
    .filter(([, streak]) => streak >= 2)
    .map(([id, streak]) => ({ teamName: teamMap[id], streak }))
    .sort((a, b) => b.streak - a.streak);
}
