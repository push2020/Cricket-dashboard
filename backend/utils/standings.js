const ALL_OUT_WICKETS = 10;

/**
 * Converts cricket overs notation (e.g. 10.3) to a real decimal value
 * (e.g. 10.5) for run-rate arithmetic. The fractional digit represents
 * balls bowled (0-5), not tenths of an over.
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
 * Returns the overs an innings counts as for NRR purposes, applying the
 * ICC all-out rule: a team dismissed for all ten wickets is deemed to have
 * used its full quota of allotted overs, regardless of how many overs it
 * actually took to get bowled out. Otherwise the actual overs faced/bowled
 * are used (this also covers a chase completed in fewer overs).
 *
 * @param {object} innings - { runs, wickets, overs }
 * @param {number} allottedOvers - tournament's overs-per-innings limit
 * @returns {number}
 */
function effectiveOvers(innings, allottedOvers) {
  const wickets = innings?.wickets || 0;
  if (wickets >= ALL_OUT_WICKETS) return toDecimalOvers(allottedOvers || 0);
  return toDecimalOvers(innings?.overs || 0);
}

/**
 * Accumulates one team's batting/bowling totals from a single completed
 * fixture into the running aggregate.
 *
 * @param {object} aggregate - { runsScored, oversFaced, runsConceded, oversBowled }
 * @param {object} fixture
 * @param {boolean} isHome - whether the team being aggregated played as the home side
 * @param {number} allottedOvers - tournament's overs-per-innings limit
 * @returns {void}
 */
function accumulateInnings(aggregate, fixture, isHome, allottedOvers) {
  const ownInnings = isHome ? fixture.homeInnings : fixture.awayInnings;
  const oppInnings = isHome ? fixture.awayInnings : fixture.homeInnings;

  aggregate.runsScored   += ownInnings?.runs || 0;
  aggregate.oversFaced   += effectiveOvers(ownInnings, allottedOvers);
  aggregate.runsConceded += oppInnings?.runs || 0;
  aggregate.oversBowled  += effectiveOvers(oppInnings, allottedOvers);
}

/**
 * Computes net run rate from totals aggregated across every completed
 * fixture, per ICC Reg 21.3: the average runs scored per over throughout
 * the competition, minus the average runs conceded per over.
 *
 * @param {object} aggregate - { runsScored, oversFaced, runsConceded, oversBowled }
 * @returns {number}
 */
function calculateNrr({ runsScored, oversFaced, runsConceded, oversBowled }) {
  const scoreRate    = oversFaced  > 0 ? runsScored   / oversFaced  : 0;
  const concededRate = oversBowled > 0 ? runsConceded / oversBowled : 0;
  return parseFloat((scoreRate - concededRate).toFixed(3));
}

/**
 * Computes the sorted points table for a tournament (or a single pool).
 * Only fixtures with status === 'completed' count; abandoned/no-result
 * matches are excluded entirely. Net run rate is calculated once from
 * totals aggregated across every completed fixture — not averaged per
 * match — matching the official ICC net run rate formula.
 * Works with both Mongoose documents and plain JS objects — all IDs are
 * normalised via .toString() before comparison.
 *
 * @param {object[]} teams - Array of team documents { _id, name }
 * @param {object[]} fixtures - Populated fixture documents
 * @param {number} tournamentOvers - overs allotted per innings for this tournament
 * @returns {object[]} Standings rows sorted by rank
 */
function computeStandings(teams, fixtures, tournamentOvers) {
  const completed = fixtures.filter((f) => f.status === 'completed');

  const standings = teams.map((team) => {
    const teamId = team._id.toString();
    let played = 0, won = 0, lost = 0, tied = 0;
    const aggregate = { runsScored: 0, oversFaced: 0, runsConceded: 0, oversBowled: 0 };

    completed.forEach((f) => {
      const homeId   = (f.homeTeam?._id ?? f.homeTeam)?.toString();
      const awayId   = (f.awayTeam?._id ?? f.awayTeam)?.toString();
      const winnerId = f.winner ? (f.winner?._id ?? f.winner)?.toString() : null;

      const isHome = homeId === teamId;
      const isAway = awayId === teamId;
      if (!isHome && !isAway) return;

      played++;
      accumulateInnings(aggregate, f, isHome, tournamentOvers);

      if (!winnerId) tied++;
      else if (winnerId === teamId) won++;
      else lost++;
    });

    return {
      team, played, won, lost, tied,
      points: won * 2 + tied,
      nrr: calculateNrr(aggregate),
      runsScored: aggregate.runsScored,
      runsConceded: aggregate.runsConceded,
    };
  });

  standings.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.nrr    !== a.nrr)    return b.nrr    - a.nrr;
    return a.team.name.localeCompare(b.team.name);
  });

  return standings;
}

module.exports = { computeStandings };
