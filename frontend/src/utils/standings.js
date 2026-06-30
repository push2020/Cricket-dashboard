/**
 * Converts cricket overs notation (e.g. 10.3) to a real decimal value
 * (e.g. 10.5) for NRR arithmetic. The fractional digit is balls (0–5), not tenths.
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
 * Computes the sorted points table for a tournament.
 * Fixtures may contain either raw team ID strings or populated team objects.
 * Only fixtures with status === 'completed' are counted.
 * Sort order: points DESC → NRR DESC → team name ASC.
 *
 * @param {Array} teams - Array of team documents { _id, name }
 * @param {Array} fixtures - Array of fixture documents
 * @returns {Array} Standings rows sorted by rank
 */
export function computeStandings(teams, fixtures) {
  const completed = fixtures.filter((f) => f.status === 'completed');

  const standings = teams.map((team) => {
    const teamId = team._id;
    let played = 0;
    let won = 0;
    let lost = 0;
    let tied = 0;
    let runsScored = 0;
    let runsConceded = 0;
    let oversPlayedDecimal = 0;
    let oversBowledDecimal = 0;

    completed.forEach((f) => {
      // Normalise: homeTeam/awayTeam/winner may be objects or raw ID strings
      const homeId = f.homeTeam?._id ?? f.homeTeam;
      const awayId = f.awayTeam?._id ?? f.awayTeam;
      const winnerId = f.winner ? (f.winner._id ?? f.winner) : null;

      const isHome = homeId === teamId;
      const isAway = awayId === teamId;
      if (!isHome && !isAway) return;

      played++;

      if (isHome) {
        runsScored += f.homeInnings?.runs || 0;
        runsConceded += f.awayInnings?.runs || 0;
        oversPlayedDecimal += toDecimalOvers(f.homeInnings?.overs || 0);
        oversBowledDecimal += toDecimalOvers(f.awayInnings?.overs || 0);
      } else {
        runsScored += f.awayInnings?.runs || 0;
        runsConceded += f.homeInnings?.runs || 0;
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

    const points = won * 2 + tied;
    const battingRate = oversPlayedDecimal > 0 ? runsScored / oversPlayedDecimal : 0;
    const bowlingRate = oversBowledDecimal > 0 ? runsConceded / oversBowledDecimal : 0;
    const nrr = parseFloat((battingRate - bowlingRate).toFixed(3));

    return { team, played, won, lost, tied, points, nrr, runsScored, runsConceded };
  });

  standings.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.nrr !== a.nrr) return b.nrr - a.nrr;
    return a.team.name.localeCompare(b.team.name);
  });

  return standings;
}
