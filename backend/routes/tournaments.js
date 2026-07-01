const router                            = require('express').Router();
const Tournament                        = require('../models/Tournament');
const Team                              = require('../models/Team');
const Fixture                           = require('../models/Fixture');
const { generateRoundRobin }            = require('../utils/roundRobin');
const { computeStandings }              = require('../utils/standings');
const { computeTournamentStats }        = require('../utils/tournamentStats');

/* ── helpers ── */

/** Populates a fixture query with team + toss refs */
function populateFixtures(query) {
  return query
    .populate('homeTeam',   'name')
    .populate('awayTeam',   'name')
    .populate('winner',     'name')
    .populate('tossWinner', 'name');
}

/* ─────────────────────────────── Tournament CRUD ─────────────────────── */

// GET /api/tournaments
router.get('/', async (_req, res) => {
  try {
    const tournaments = await Tournament.find().sort({ createdAt: -1 });
    res.json(tournaments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/tournaments
router.post('/', async (req, res) => {
  try {
    const { name, description, overs } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Tournament name is required' });
    const oversNum = Number(overs);
    if (!overs || oversNum < 1 || !Number.isInteger(oversNum))
      return res.status(400).json({ message: 'Overs must be a whole number of 1 or more' });

    const tournament = await Tournament.create({
      name: name.trim(),
      description: description?.trim() || '',
      overs: oversNum,
    });
    res.status(201).json(tournament);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/tournaments/:id
router.get('/:id', async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).json({ message: 'Tournament not found' });
    res.json(tournament);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/tournaments/:id  (cascades to teams + fixtures)
router.delete('/:id', async (req, res) => {
  try {
    const tournament = await Tournament.findByIdAndDelete(req.params.id);
    if (!tournament) return res.status(404).json({ message: 'Tournament not found' });
    await Team.deleteMany({ tournamentId: req.params.id });
    await Fixture.deleteMany({ tournamentId: req.params.id });
    res.json({ message: 'Tournament deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* ─────────────────────────────── Teams ───────────────────────────────── */

// GET /api/tournaments/:id/teams
router.get('/:id/teams', async (req, res) => {
  try {
    const teams = await Team.find({ tournamentId: req.params.id }).sort({ createdAt: 1 });
    res.json(teams);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/tournaments/:id/teams
router.post('/:id/teams', async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).json({ message: 'Tournament not found' });
    if (tournament.fixturesGenerated)
      return res.status(400).json({ message: 'Cannot add teams after fixtures are generated' });

    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Team name is required' });

    const team = await Team.create({ name: name.trim(), tournamentId: req.params.id });
    res.status(201).json(team);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* ─────────────────────────────── Fixtures ────────────────────────────── */

// GET /api/tournaments/:id/fixtures
router.get('/:id/fixtures', async (req, res) => {
  try {
    const fixtures = await populateFixtures(
      Fixture.find({ tournamentId: req.params.id }).sort({ round: 1 })
    );
    res.json(fixtures);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/tournaments/:id/fixtures/generate  (round-robin)
router.post('/:id/fixtures/generate', async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).json({ message: 'Tournament not found' });
    if (tournament.fixturesGenerated)
      return res.status(400).json({ message: 'Fixtures already generated' });

    const teams = await Team.find({ tournamentId: req.params.id });
    if (teams.length < 2)
      return res.status(400).json({ message: 'Need at least 2 teams to generate fixtures' });

    const pairs = generateRoundRobin(teams.map((t) => t._id.toString()));

    await Fixture.insertMany(
      pairs.map(({ homeTeam, awayTeam, round }) => ({
        tournamentId: req.params.id,
        homeTeam,
        awayTeam,
        round,
        type: 'group',
        status: 'scheduled',
        homeInnings: { runs: 0, wickets: 0, overs: 0 },
        awayInnings: { runs: 0, wickets: 0, overs: 0 },
      }))
    );

    tournament.fixturesGenerated = true;
    tournament.status = 'active';
    await tournament.save();

    res.json({ message: 'Fixtures generated', count: pairs.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/tournaments/:id/playoffs/generate
router.post('/:id/playoffs/generate', async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).json({ message: 'Tournament not found' });
    if (tournament.playoffGenerated)
      return res.status(400).json({ message: 'Playoffs already generated' });

    const teams = await Team.find({ tournamentId: req.params.id });
    if (teams.length < 3)
      return res.status(400).json({ message: 'Need at least 3 teams to generate playoffs' });

    const groupFixtures = await Fixture.find({ tournamentId: req.params.id, type: 'group' });
    const allGroupDone  = groupFixtures.every(
      (f) => f.status === 'completed' || f.status === 'abandoned'
    );
    if (!allGroupDone)
      return res.status(400).json({ message: 'All group stage matches must be completed first' });

    const populatedGroupFixtures = await populateFixtures(
      Fixture.find({ tournamentId: req.params.id, type: 'group' })
    );

    const standings = computeStandings(teams, populatedGroupFixtures);
    const [first, second, third, fourth] = standings;
    const maxRound = groupFixtures.reduce((m, f) => Math.max(m, f.round), 0);

    if (teams.length === 3) {
      // Exactly 3 teams → Direct Final between 1st and 2nd (no Eliminator)
      if (standings.length < 2)
        return res.status(400).json({ message: 'Need at least 2 teams in standings for playoffs' });

      await Fixture.create({
        tournamentId: req.params.id,
        homeTeam: first.team._id,
        awayTeam: second.team._id,
        round: maxRound + 1,
        type: 'final',
        status: 'scheduled',
        homeInnings: { runs: 0, wickets: 0, overs: 0 },
        awayInnings: { runs: 0, wickets: 0, overs: 0 },
      });
    } else {
      // 4+ teams → IPL format: Q1 (1st vs 2nd), Eliminator (3rd vs 4th), Q2, Final
      if (standings.length < 4)
        return res.status(400).json({ message: 'Need at least 4 teams in standings for IPL playoffs' });

      const inningsDefault = { runs: 0, wickets: 0, overs: 0 };

      // Qualifier 1: 1st vs 2nd — winner goes to Final, loser goes to Q2
      await Fixture.create({
        tournamentId: req.params.id,
        homeTeam: first.team._id,
        awayTeam: second.team._id,
        round: maxRound + 1,
        type: 'qualifier1',
        status: 'scheduled',
        homeInnings: inningsDefault,
        awayInnings: inningsDefault,
      });

      // Eliminator: 3rd vs 4th — winner goes to Q2, loser is eliminated
      await Fixture.create({
        tournamentId: req.params.id,
        homeTeam: third.team._id,
        awayTeam: fourth.team._id,
        round: maxRound + 1,
        type: 'eliminator',
        status: 'scheduled',
        homeInnings: inningsDefault,
        awayInnings: inningsDefault,
      });

      // Qualifier 2: Q1 loser vs Eliminator winner — both TBD, filled in after Q1 and Eliminator
      await Fixture.create({
        tournamentId: req.params.id,
        homeTeam: null,
        awayTeam: null,
        round: maxRound + 2,
        type: 'qualifier2',
        status: 'scheduled',
        homeInnings: inningsDefault,
        awayInnings: inningsDefault,
      });

      // Final: Q1 winner vs Q2 winner — both TBD until Q1 and Q2 are played
      await Fixture.create({
        tournamentId: req.params.id,
        homeTeam: null,
        awayTeam: null,
        round: maxRound + 3,
        type: 'final',
        status: 'scheduled',
        homeInnings: inningsDefault,
        awayInnings: inningsDefault,
      });
    }

    tournament.playoffGenerated = true;
    await tournament.save();

    res.json({ message: 'Playoffs generated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* ─────────────────────────────── Standings & Stats ──────────────────── */

// GET /api/tournaments/:id/standings
router.get('/:id/standings', async (req, res) => {
  try {
    const teams    = await Team.find({ tournamentId: req.params.id });
    const fixtures = await populateFixtures(
      Fixture.find({ tournamentId: req.params.id, type: 'group' })
    );
    res.json(computeStandings(teams, fixtures));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/tournaments/:id/stats  (highlights: biggest win, highest score, streaks)
router.get('/:id/stats', async (req, res) => {
  try {
    const fixtures = await populateFixtures(
      Fixture.find({ tournamentId: req.params.id, type: 'group' })
    );
    res.json(computeTournamentStats(fixtures));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
