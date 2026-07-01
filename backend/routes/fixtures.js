const router     = require('express').Router();
const Fixture    = require('../models/Fixture');
const Tournament = require('../models/Tournament');
const Team       = require('../models/Team');

/** Returns a fully populated fixture (including tournamentId for MatchEntry / FinalMatch) */
async function getPopulated(id) {
  return Fixture.findById(id)
    .populate('homeTeam',    'name')
    .populate('awayTeam',    'name')
    .populate('winner',      'name')
    .populate('tossWinner',  'name')
    .populate('tournamentId','name overs');
}

// GET /api/fixtures/:id
router.get('/:id', async (req, res) => {
  try {
    const fixture = await getPopulated(req.params.id);
    if (!fixture) return res.status(404).json({ message: 'Fixture not found' });
    res.json(fixture);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/fixtures/:id/result
router.put('/:id/result', async (req, res) => {
  try {
    const fixture = await Fixture.findById(req.params.id);
    if (!fixture) return res.status(404).json({ message: 'Fixture not found' });

    const fixtureType = fixture.type ?? 'group';

    if (['qualifier2', 'final'].includes(fixtureType) && (!fixture.homeTeam || !fixture.awayTeam))
      return res.status(400).json({ message: 'Cannot enter result until all preceding playoff matches are played' });

    const { homeInnings, awayInnings, winner, resultNote, tossWinner, tossDecision, status } = req.body;
    const savedStatus = status || 'completed';

    fixture.homeInnings  = homeInnings  ?? fixture.homeInnings;
    fixture.awayInnings  = awayInnings  ?? fixture.awayInnings;
    fixture.winner       = winner       || null;
    fixture.resultNote   = resultNote   || '';
    fixture.tossWinner   = tossWinner   || null;
    fixture.tossDecision = tossDecision || null;
    fixture.status       = savedStatus;
    await fixture.save();

    /* ── Post-save side effects ── */

    if (fixtureType === 'qualifier1' && savedStatus === 'completed' && winner) {
      // Q1 winner → Final homeTeam; Q1 loser → Q2 homeTeam
      const homeId = fixture.homeTeam.toString();
      const awayId = fixture.awayTeam.toString();
      const loser  = winner.toString() === homeId ? awayId : homeId;

      await Promise.all([
        Fixture.findOneAndUpdate(
          { tournamentId: fixture.tournamentId, type: 'final' },
          { homeTeam: winner }
        ),
        Fixture.findOneAndUpdate(
          { tournamentId: fixture.tournamentId, type: 'qualifier2' },
          { homeTeam: loser }
        ),
      ]);
    } else if (fixtureType === 'eliminator' && savedStatus === 'completed' && winner) {
      // IPL / pool format: winner → Q2 awayTeam
      // Standard 3-team (no Q2): winner → Final awayTeam
      const q2 = await Fixture.findOne({ tournamentId: fixture.tournamentId, type: 'qualifier2' });
      if (q2) {
        await Fixture.findByIdAndUpdate(q2._id, { awayTeam: winner });
      } else {
        await Fixture.findOneAndUpdate(
          { tournamentId: fixture.tournamentId, type: 'final' },
          { awayTeam: winner }
        );
      }
    } else if (fixtureType === 'qualifier2' && savedStatus === 'completed' && winner) {
      // Q2 winner → Final awayTeam
      await Fixture.findOneAndUpdate(
        { tournamentId: fixture.tournamentId, type: 'final' },
        { awayTeam: winner }
      );
    } else if (fixtureType === 'final') {
      // Final done → tournament complete
      await Tournament.findByIdAndUpdate(fixture.tournamentId, { status: 'completed' });
    } else if (fixtureType === 'group') {
      const tournament = await Tournament.findById(fixture.tournamentId);
      if (!tournament?.playoffGenerated) {
        const pendingCount = await Fixture.countDocuments({
          tournamentId: fixture.tournamentId,
          status: 'scheduled',
        });
        if (pendingCount === 0) {
          // Only auto-complete for very small tournaments (< 3 teams) where no
          // playoffs are possible. For 3+ team tournaments, completion is owned
          // by the Final fixture handler — premature completion here would mark
          // the tournament done before playoffs are even generated.
          const teamCount = await Team.countDocuments({ tournamentId: fixture.tournamentId });
          if (teamCount < 3) {
            await Tournament.findByIdAndUpdate(fixture.tournamentId, { status: 'completed' });
          }
        }
      }
    }

    res.json(await getPopulated(fixture._id));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
