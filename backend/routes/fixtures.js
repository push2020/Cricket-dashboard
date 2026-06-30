const router     = require('express').Router();
const Fixture    = require('../models/Fixture');
const Tournament = require('../models/Tournament');

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

    if (fixtureType === 'final' && !fixture.awayTeam)
      return res.status(400).json({ message: 'Cannot enter Final result until the Eliminator is played' });

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

    if (fixtureType === 'eliminator' && savedStatus === 'completed' && winner) {
      // Wire the Eliminator winner into the Final as awayTeam
      await Fixture.findOneAndUpdate(
        { tournamentId: fixture.tournamentId, type: 'final' },
        { awayTeam: winner }
      );
    } else if (fixtureType === 'final') {
      // Final done → tournament complete
      await Tournament.findByIdAndUpdate(fixture.tournamentId, { status: 'completed' });
    } else {
      // Group stage: auto-complete tournament only when no playoffs are pending
      const tournament = await Tournament.findById(fixture.tournamentId);
      if (!tournament?.playoffGenerated) {
        const pendingCount = await Fixture.countDocuments({
          tournamentId: fixture.tournamentId,
          status: 'scheduled',
        });
        if (pendingCount === 0) {
          await Tournament.findByIdAndUpdate(fixture.tournamentId, { status: 'completed' });
        }
      }
    }

    res.json(await getPopulated(fixture._id));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
