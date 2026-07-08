const { computeSeriesResult } = require('./bilateralSeries');

/**
 * Computes Hall of Fame stats specifically for bilateral series tournaments.
 * Returns a series leaderboard and head-to-head records between pairs.
 *
 * @param {object[]} allTournaments
 * @param {object[]} allTeams       - All team documents (lean)
 * @param {object[]} allFixtures    - All fixture documents (lean)
 * @returns {{ leaderboard: object[], headToHead: object[] }}
 */
function computeBilateralHof(allTournaments, allTeams, allFixtures) {
  const bilateralTournaments = allTournaments.filter((t) => t.format === 'bilateral');

  const seriesStats = {}; // keyed by player name (lowercase)
  const h2hMap      = {}; // keyed by canonical pair key

  function getStats(name) {
    const key = name.toLowerCase();
    if (!seriesStats[key]) {
      seriesStats[key] = {
        name,
        seriesWon: 0, seriesLost: 0, seriesTied: 0,
        matchesWon: 0, matchesLost: 0,
      };
    }
    return seriesStats[key];
  }

  function getH2H(nameA, nameB) {
    // Canonical order: alphabetical so A vs B and B vs A map to same entry
    const [p1, p2] = [nameA, nameB].sort((x, y) =>
      x.toLowerCase().localeCompare(y.toLowerCase())
    );
    const key = `${p1.toLowerCase()}|||${p2.toLowerCase()}`;
    if (!h2hMap[key]) {
      h2hMap[key] = {
        player1: p1, player2: p2,
        p1SeriesWins: 0, p2SeriesWins: 0, seriesTied: 0,
        p1MatchWins:  0, p2MatchWins:  0, totalSeries: 0,
      };
    }
    return h2hMap[key];
  }

  bilateralTournaments.forEach((tournament) => {
    const tid   = tournament._id.toString();
    const teams = allTeams.filter((t) => t.tournamentId.toString() === tid);
    const fixes = allFixtures.filter((f) => f.tournamentId.toString() === tid);

    if (teams.length !== 2) return;

    const result = computeSeriesResult(teams, fixes);
    const { teamA, teamB, winner } = result;

    const h2h = getH2H(teamA.name, teamB.name);
    h2h.totalSeries++;

    const aIsP1 = teamA.name.toLowerCase() === h2h.player1.toLowerCase();

    // Distribute match wins
    if (aIsP1) {
      h2h.p1MatchWins += teamA.wins;
      h2h.p2MatchWins += teamB.wins;
    } else {
      h2h.p1MatchWins += teamB.wins;
      h2h.p2MatchWins += teamA.wins;
    }

    // Distribute series result
    if (winner) {
      const aWon = winner.name.toLowerCase() === teamA.name.toLowerCase();
      getStats(teamA.name)[aWon ? 'seriesWon' : 'seriesLost']++;
      getStats(teamB.name)[aWon ? 'seriesLost' : 'seriesWon']++;

      if ((aIsP1 && aWon) || (!aIsP1 && !aWon)) h2h.p1SeriesWins++;
      else                                        h2h.p2SeriesWins++;
    } else {
      getStats(teamA.name).seriesTied++;
      getStats(teamB.name).seriesTied++;
      h2h.seriesTied++;
    }

    getStats(teamA.name).matchesWon  += teamA.wins;
    getStats(teamA.name).matchesLost += teamB.wins;
    getStats(teamB.name).matchesWon  += teamB.wins;
    getStats(teamB.name).matchesLost += teamA.wins;
  });

  const leaderboard = Object.values(seriesStats)
    .sort((a, b) => b.seriesWon - a.seriesWon || b.matchesWon - a.matchesWon);

  const headToHead = Object.values(h2hMap)
    .sort((a, b) => b.totalSeries - a.totalSeries);

  return { leaderboard, headToHead };
}

module.exports = { computeBilateralHof };
