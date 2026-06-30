const router                  = require('express').Router();
const Tournament              = require('../models/Tournament');
const Team                    = require('../models/Team');
const Fixture                 = require('../models/Fixture');
const { computeHallOfFame }   = require('../utils/hallOfFame');

// GET /api/hof
router.get('/', async (_req, res) => {
  try {
    const [tournaments, teams, fixtures] = await Promise.all([
      Tournament.find().lean(),
      Team.find().lean(),
      Fixture.find().lean(),
    ]);
    res.json(computeHallOfFame(tournaments, teams, fixtures));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
