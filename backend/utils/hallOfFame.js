/**
 * Aggregates all-time stats across every tournament by team name (case-insensitive).
 * All IDs normalised via .toString() for compatibility with Mongoose documents.
 *
 * @param {object[]} allTournaments
 * @param {object[]} allTeams
 * @param {object[]} allFixtures - Raw (unpopulated) fixture objects
 * @returns {object[]}
 */
function computeHallOfFame(allTournaments, allTeams, allFixtures) {
  const stats = {};

  function entry(displayName) {
    const key = displayName.toLowerCase();
    if (!stats[key]) {
      stats[key] = { name: displayName, titles: 0, wins: 0, losses: 0, ties: 0, played: 0, runsScored: 0 };
    }
    return stats[key];
  }

  allTournaments.forEach((tournament) => {
    const tid = tournament._id.toString();
    const tournamentTeams    = allTeams.filter((t) => t.tournamentId.toString() === tid);
    const tournamentFixtures = allFixtures.filter((f) => f.tournamentId.toString() === tid);

    // Credit title for Final winner
    const finalFixture = tournamentFixtures.find(
      (f) => f.type === 'final' && f.status === 'completed'
    );
    if (finalFixture?.winner) {
      const winnerId    = finalFixture.winner.toString();
      const championTeam = tournamentTeams.find((t) => t._id.toString() === winnerId);
      if (championTeam) entry(championTeam.name).titles += 1;
    }

    // Aggregate group-stage wins/losses/runs
    const groupCompleted = tournamentFixtures.filter(
      (f) => f.status === 'completed' && (f.type ?? 'group') === 'group'
    );

    groupCompleted.forEach((f) => {
      const homeId = f.homeTeam?.toString() ?? f.homeTeam;
      const awayId = f.awayTeam?.toString() ?? f.awayTeam;
      const homeTeam = tournamentTeams.find((t) => t._id.toString() === homeId);
      const awayTeam = tournamentTeams.find((t) => t._id.toString() === awayId);
      if (!homeTeam || !awayTeam) return;

      const winnerId = f.winner?.toString() ?? f.winner;

      const home = entry(homeTeam.name);
      home.played     += 1;
      home.runsScored += f.homeInnings?.runs ?? 0;
      if (!winnerId)                    home.ties   += 1;
      else if (winnerId === homeId)     home.wins   += 1;
      else                              home.losses += 1;

      const away = entry(awayTeam.name);
      away.played     += 1;
      away.runsScored += f.awayInnings?.runs ?? 0;
      if (!winnerId)                    away.ties   += 1;
      else if (winnerId === awayId)     away.wins   += 1;
      else                              away.losses += 1;
    });
  });

  return Object.values(stats)
    .map((row) => ({
      ...row,
      winPct: row.played > 0 ? Math.round((row.wins / row.played) * 100) : 0,
    }))
    .sort((a, b) => {
      if (b.titles !== a.titles) return b.titles - a.titles;
      if (b.wins   !== a.wins)   return b.wins   - a.wins;
      return b.winPct - a.winPct;
    });
}

module.exports = { computeHallOfFame };
