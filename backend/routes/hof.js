const router                   = require('express').Router();
const Tournament               = require('../models/Tournament');
const Team                     = require('../models/Team');
const Fixture                  = require('../models/Fixture');
const { computeHallOfFame }    = require('../utils/hallOfFame');
const { computeBilateralHof }  = require('../utils/bilateralHof');

// GET /api/hof
// Returns { regular: [...], bilateral: { leaderboard: [...], headToHead: [...] } }
router.get('/', async (_req, res) => {
  try {
    const [tournaments, teams, fixtures] = await Promise.all([
      Tournament.find().lean(),
      Team.find().lean(),
      Fixture.find().lean(),
    ]);
    res.json({
      regular:   computeHallOfFame(tournaments, teams, fixtures),
      bilateral: computeBilateralHof(tournaments, teams, fixtures),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
