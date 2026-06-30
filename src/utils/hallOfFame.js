/**
 * Aggregates all-time stats across every tournament by team name (case-insensitive).
 * Only completed GROUP-stage fixtures contribute to win/loss/runs counts.
 * A "title" is credited when a team wins the Final of a completed tournament.
 *
 * @param {Array} allTournaments
 * @param {Array} allTeams
 * @param {Array} allFixtures - Raw (unpopulated) fixture objects
 * @returns {Array<{ name, titles, wins, losses, ties, played, runsScored, winPct }>}
 */
export function computeHallOfFame(allTournaments, allTeams, allFixtures) {
  const stats = {};

  /** Returns or initialises the stats entry for a given display name */
  function entry(displayName) {
    const key = displayName.toLowerCase();
    if (!stats[key]) {
      stats[key] = { name: displayName, titles: 0, wins: 0, losses: 0, ties: 0, played: 0, runsScored: 0 };
    }
    return stats[key];
  }

  allTournaments.forEach((tournament) => {
    const tournamentTeams = allTeams.filter((t) => t.tournamentId === tournament._id);
    const tournamentFixtures = allFixtures.filter((f) => f.tournamentId === tournament._id);

    // Credit a title if the tournament has a completed Final
    const finalFixture = tournamentFixtures.find(
      (f) => f.type === 'final' && f.status === 'completed'
    );
    if (finalFixture?.winner) {
      const championTeam = tournamentTeams.find((t) => t._id === finalFixture.winner);
      if (championTeam) entry(championTeam.name).titles += 1;
    }

    // Aggregate wins/losses/runs from completed group fixtures
    const groupCompleted = tournamentFixtures.filter(
      (f) => f.status === 'completed' && (f.type ?? 'group') === 'group'
    );

    groupCompleted.forEach((f) => {
      const homeTeam = tournamentTeams.find((t) => t._id === f.homeTeam);
      const awayTeam = tournamentTeams.find((t) => t._id === f.awayTeam);
      if (!homeTeam || !awayTeam) return;

      const winnerId = f.winner;

      // Home team stats
      const home = entry(homeTeam.name);
      home.played += 1;
      home.runsScored += f.homeInnings?.runs ?? 0;
      if (!winnerId) home.ties += 1;
      else if (winnerId === homeTeam._id) home.wins += 1;
      else home.losses += 1;

      // Away team stats
      const away = entry(awayTeam.name);
      away.played += 1;
      away.runsScored += f.awayInnings?.runs ?? 0;
      if (!winnerId) away.ties += 1;
      else if (winnerId === awayTeam._id) away.wins += 1;
      else away.losses += 1;
    });
  });

  return Object.values(stats)
    .map((row) => ({
      ...row,
      winPct: row.played > 0 ? Math.round((row.wins / row.played) * 100) : 0,
    }))
    .sort((a, b) => {
      if (b.titles !== a.titles) return b.titles - a.titles;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.winPct - a.winPct;
    });
}
