/**
 * Converts cricket overs notation (e.g. 10.3 → 10 + 3/6) to decimal for NRR.
 *
 * @param {number} cricketOvers
 * @returns {number}
 */
function toDecimalOvers(cricketOvers) {
  const whole = Math.floor(cricketOvers);
  const balls = Math.round((cricketOvers - whole) * 10);
  return whole + balls / 6;
}

/**
 * Computes the sorted points table.
 * Works with both Mongoose documents and plain JS objects — all IDs are
 * normalised via .toString() before comparison.
 *
 * @param {object[]} teams  - Array of team documents { _id, name }
 * @param {object[]} fixtures - Populated fixture documents (group stage only, all statuses)
 * @returns {object[]} Standings rows sorted by rank
 */
function computeStandings(teams, fixtures) {
  const completed = fixtures.filter((f) => f.status === 'completed');

  const standings = teams.map((team) => {
    const teamId = team._id.toString();
    let played = 0, won = 0, lost = 0, tied = 0;
    let runsScored = 0, runsConceded = 0;
    let oversPlayedDecimal = 0, oversBowledDecimal = 0;

    completed.forEach((f) => {
      const homeId   = (f.homeTeam?._id ?? f.homeTeam)?.toString();
      const awayId   = (f.awayTeam?._id ?? f.awayTeam)?.toString();
      const winnerId = f.winner ? (f.winner?._id ?? f.winner)?.toString() : null;

      const isHome = homeId === teamId;
      const isAway = awayId === teamId;
      if (!isHome && !isAway) return;

      played++;

      if (isHome) {
        runsScored        += f.homeInnings?.runs || 0;
        runsConceded      += f.awayInnings?.runs || 0;
        oversPlayedDecimal += toDecimalOvers(f.homeInnings?.overs || 0);
        oversBowledDecimal += toDecimalOvers(f.awayInnings?.overs || 0);
      } else {
        runsScored        += f.awayInnings?.runs || 0;
        runsConceded      += f.homeInnings?.runs || 0;
        oversPlayedDecimal += toDecimalOvers(f.awayInnings?.overs || 0);
        oversBowledDecimal += toDecimalOvers(f.homeInnings?.overs || 0);
      }

      if (!winnerId) {
        tied++;
      } else if (winnerId === teamId) {
        won++;
      } else {
        lost++;
      }
    });

    const points      = won * 2 + tied;
    const battingRate = oversPlayedDecimal > 0 ? runsScored   / oversPlayedDecimal : 0;
    const bowlingRate = oversBowledDecimal > 0 ? runsConceded / oversBowledDecimal : 0;
    const nrr         = parseFloat((battingRate - bowlingRate).toFixed(3));

    return { team, played, won, lost, tied, points, nrr, runsScored, runsConceded };
  });

  standings.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.nrr    !== a.nrr)    return b.nrr    - a.nrr;
    return a.team.name.localeCompare(b.team.name);
  });

  return standings;
}

module.exports = { computeStandings };
