/**
 * Computes highlight stats for a single tournament from its populated fixtures.
 * All IDs normalised via .toString() for compatibility with Mongoose documents.
 *
 * @param {object[]} fixtures - Populated fixture objects (all types/statuses)
 * @returns {object} Full stats object
 */
function computeTournamentStats(fixtures) {
  const completed = fixtures.filter(
    (f) => f.status === 'completed' && (f.type ?? 'group') === 'group'
  );

  return {
    biggestWin:   findBiggestWin(completed),
    highestScore: findHighestScore(completed),
    winStreaks:   computeWinStreaks(completed),
    closestMatch: findClosestMatch(completed),
    lowestScore:  findLowestScore(completed),
    unbeaten:     findUnbeaten(completed),
    tossLuck:     findTossLuck(fixtures),
    batFirst:     findBatFirstStats(completed),
    summary:      computeSummary(completed),
  };
}

/* ─── Existing helpers ─────────────────────────────────────────────────── */

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
      if (!winnerId)                streaks[teamId] = 0;
      else if (winnerId === teamId) streaks[teamId] = (streaks[teamId] ?? 0) + 1;
      else                          streaks[teamId] = 0;
    });
  });

  return Object.entries(streaks)
    .filter(([, s]) => s >= 2)
    .map(([id, streak]) => ({ teamName: teamMap[id], streak }))
    .sort((a, b) => b.streak - a.streak);
}

/* ─── New helpers ──────────────────────────────────────────────────────── */

/** Finds the match decided by the smallest run margin (nail-biter) */
function findClosestMatch(completed) {
  let best = null;
  completed.forEach((f) => {
    if (!f.winner) return; // skip ties
    const homeRuns = f.homeInnings?.runs ?? 0;
    const awayRuns = f.awayInnings?.runs ?? 0;
    const margin   = Math.abs(homeRuns - awayRuns);
    if (margin === 0) return; // skip if no real margin

    if (best === null || margin < best.margin) {
      const winnerId   = (f.winner?._id ?? f.winner)?.toString();
      const homeId     = (f.homeTeam?._id ?? f.homeTeam)?.toString();
      const winnerName = winnerId === homeId ? f.homeTeam?.name : f.awayTeam?.name;
      const loserName  = winnerId === homeId ? f.awayTeam?.name : f.homeTeam?.name;
      best = { margin, winnerName, loserName, resultNote: f.resultNote };
    }
  });
  return best;
}

/** Finds the lowest innings score across the tournament (worst batting) */
function findLowestScore(completed) {
  let best = null;
  completed.forEach((f) => {
    [
      { innings: f.homeInnings, teamName: f.homeTeam?.name, againstName: f.awayTeam?.name },
      { innings: f.awayInnings, teamName: f.awayTeam?.name, againstName: f.homeTeam?.name },
    ].forEach(({ innings, teamName, againstName }) => {
      if (!innings || innings.runs === undefined || innings.runs === 0) return;
      if (best === null || innings.runs < best.runs) {
        best = { teamName, runs: innings.runs, wickets: innings.wickets, againstName };
      }
    });
  });
  return best;
}

/**
 * Finds a team that has won every completed match and never lost.
 * Returns null if no such team exists.
 */
function findUnbeaten(completed) {
  if (!completed.length) return null;

  const wins   = {};
  const losses = {};

  completed.forEach((f) => {
    const homeId   = (f.homeTeam?._id ?? f.homeTeam)?.toString();
    const awayId   = (f.awayTeam?._id ?? f.awayTeam)?.toString();
    const winnerId = f.winner ? (f.winner?._id ?? f.winner)?.toString() : null;

    [homeId, awayId].forEach((id) => {
      if (!id) return;
      if (!wins[id])   wins[id]   = 0;
      if (!losses[id]) losses[id] = 0;
    });

    if (!winnerId) return; // tie — doesn't break unbeaten but doesn't add win

    if (homeId) { winnerId === homeId ? wins[homeId]++ : losses[homeId]++; }
    if (awayId) { winnerId === awayId ? wins[awayId]++ : losses[awayId]++; }
  });

  // Must have at least 2 wins and 0 losses
  const unbeatenId = Object.keys(wins).find(
    (id) => wins[id] >= 2 && (losses[id] ?? 0) === 0
  );
  if (!unbeatenId) return null;

  // Get the team name from the fixtures
  let teamName = null;
  for (const f of completed) {
    const homeId = (f.homeTeam?._id ?? f.homeTeam)?.toString();
    const awayId = (f.awayTeam?._id ?? f.awayTeam)?.toString();
    if (homeId === unbeatenId) { teamName = f.homeTeam?.name; break; }
    if (awayId === unbeatenId) { teamName = f.awayTeam?.name; break; }
  }

  return teamName ? { teamName, wins: wins[unbeatenId] } : null;
}

/**
 * Finds the team that has won the most tosses across all fixtures
 * (includes scheduled/abandoned, wherever tossWinner is set).
 */
function findTossLuck(fixtures) {
  const tossCount = {};
  let total = 0;

  fixtures.forEach((f) => {
    const tossId = (f.tossWinner?._id ?? f.tossWinner)?.toString();
    if (!tossId) return;
    total++;
    tossCount[tossId] = (tossCount[tossId] ?? 0) + 1;
  });

  if (!total) return null;

  const topId = Object.entries(tossCount).sort(([, a], [, b]) => b - a)[0]?.[0];
  if (!topId) return null;

  let teamName = null;
  for (const f of fixtures) {
    const tossId = (f.tossWinner?._id ?? f.tossWinner)?.toString();
    if (tossId === topId) {
      teamName = f.tossWinner?.name;
      break;
    }
  }

  return teamName ? { teamName, count: tossCount[topId], total } : null;
}

/**
 * Determines batting-first win rate.
 * If tossWinner chose 'bat' → they batted first.
 * If tossWinner chose 'field' → the other team batted first.
 * Only counts matches where we know both the toss and the winner.
 */
function findBatFirstStats(completed) {
  let wins = 0;
  let total = 0;

  completed.forEach((f) => {
    if (!f.winner || !f.tossWinner || !f.tossDecision) return;

    const tossId   = (f.tossWinner?._id ?? f.tossWinner)?.toString();
    const homeId   = (f.homeTeam?._id   ?? f.homeTeam)?.toString();
    const awayId   = (f.awayTeam?._id   ?? f.awayTeam)?.toString();
    const winnerId = (f.winner?._id     ?? f.winner)?.toString();

    // Who batted first?
    let batFirstId;
    if (f.tossDecision === 'bat') {
      batFirstId = tossId; // toss winner chose to bat
    } else {
      batFirstId = tossId === homeId ? awayId : homeId; // toss winner fielded
    }

    total++;
    if (batFirstId && winnerId === batFirstId) wins++;
  });

  return { wins, total };
}

/** Quick summary numbers for the top strip */
function computeSummary(completed) {
  const totalRuns = completed.reduce((sum, f) => {
    return sum + (f.homeInnings?.runs ?? 0) + (f.awayInnings?.runs ?? 0);
  }, 0);

  const avgScore = completed.length > 0
    ? Math.round(totalRuns / (completed.length * 2))
    : 0;

  return { completed: completed.length, totalRuns, avgScore };
}

module.exports = { computeTournamentStats };
