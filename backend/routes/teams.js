const router     = require('express').Router();
const Team       = require('../models/Team');
const Tournament = require('../models/Tournament');

// GET /api/teams/suggestions — unique names sorted by usage frequency (most used first)
router.get('/suggestions', async (req, res) => {
  try {
    const result = await Team.aggregate([
      { $group: { _id: '$name', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    res.json(result.map((r) => r._id));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/teams/:id
router.delete('/:id', async (req, res) => {
  try {
    const team = await Team.findById(req.params.id);
    if (!team) return res.status(404).json({ message: 'Team not found' });

    const tournament = await Tournament.findById(team.tournamentId);
    if (tournament?.fixturesGenerated)
      return res.status(400).json({ message: 'Cannot delete teams after fixtures are generated' });

    await Team.findByIdAndDelete(req.params.id);
    res.json({ message: 'Team deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
