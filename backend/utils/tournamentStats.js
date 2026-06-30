/**
 * Computes fun highlight stats for a single tournament from its populated fixtures.
 * Only completed group-stage fixtures are counted.
 * All IDs normalised via .toString() for compatibility with Mongoose documents.
 *
 * @param {object[]} fixtures - Populated fixture objects
 * @returns {{ biggestWin, highestScore, winStreaks }}
 */
function computeTournamentStats(fixtures) {
  const completed = fixtures.filter(
    (f) => f.status === 'completed' && (f.type ?? 'group') === 'group'
  );

  return {
    biggestWin:  findBiggestWin(completed),
    highestScore: findHighestScore(completed),
    winStreaks:   computeWinStreaks(completed),
  };
}

function findBiggestWin(completed) {
  let best = null;
  completed.forEach((f) => {
    const homeRuns = f.homeInnings?.runs ?? 0;
    const awayRuns = f.awayInnings?.runs ?? 0;
    const margin   = Math.abs(homeRuns - awayRuns);

    if (best === null || margin > best.margin) {
      const winnerId   = (f.winner?._id ?? f.winner)?.toString();
      const homeId     = (f.homeTeam?._id ?? f.homeTeam)?.toString();
      const winnerName = winnerId === homeId ? f.homeTeam?.name : f.awayTeam?.name;
      const loserName  = winnerId === homeId ? f.awayTeam?.name : f.homeTeam?.name;
      best = { margin, winnerName, loserName, resultNote: f.resultNote };
    }
  });
  return best;
}

function findHighestScore(completed) {
  let best = null;
  completed.forEach((f) => {
    [
      { innings: f.homeInnings, teamName: f.homeTeam?.name, againstName: f.awayTeam?.name },
      { innings: f.awayInnings, teamName: f.awayTeam?.name, againstName: f.homeTeam?.name },
    ].forEach(({ innings, teamName, againstName }) => {
      if (!innings || innings.runs === undefined) return;
      if (best === null || innings.runs > best.runs) {
        best = { teamName, runs: innings.runs, wickets: innings.wickets, againstName };
      }
    });
  });
  return best;
}

function computeWinStreaks(completed) {
  if (!completed.length) return [];

  const teamMap = {};
  completed.forEach((f) => {
    const homeId = (f.homeTeam?._id ?? f.homeTeam)?.toString();
    const awayId = (f.awayTeam?._id ?? f.awayTeam)?.toString();
    if (homeId && !teamMap[homeId]) teamMap[homeId] = f.homeTeam?.name ?? homeId;
    if (awayId && !teamMap[awayId]) teamMap[awayId] = f.awayTeam?.name ?? awayId;
  });

  const sorted  = [...completed].sort((a, b) => a.round - b.round);
  const streaks = {};
  Object.keys(teamMap).forEach((id) => { streaks[id] = 0; });

  sorted.forEach((f) => {
    const homeId   = (f.homeTeam?._id ?? f.homeTeam)?.toString();
    const awayId   = (f.awayTeam?._id ?? f.awayTeam)?.toString();
    const winnerId = f.winner ? (f.winner?._id ?? f.winner)?.toString() : null;

    [homeId, awayId].forEach((teamId) => {
      if (!teamId) return;
      if (!winnerId)            streaks[teamId] = 0;
      else if (winnerId === teamId) streaks[teamId] = (streaks[teamId] ?? 0) + 1;
      else                      streaks[teamId] = 0;
    });
  });

  return Object.entries(streaks)
    .filter(([, s]) => s >= 2)
    .map(([id, streak]) => ({ teamName: teamMap[id], streak }))
    .sort((a, b) => b.streak - a.streak);
}

module.exports = { computeTournamentStats };
