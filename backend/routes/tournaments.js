const router                                        = require('express').Router();
const Tournament                                    = require('../models/Tournament');
const Team                                          = require('../models/Team');
const Fixture                                       = require('../models/Fixture');
const { generateRoundRobin, generateDoubleRoundRobin } = require('../utils/roundRobin');
const { computeStandings }                          = require('../utils/standings');
const { computeTournamentStats }                    = require('../utils/tournamentStats');
const { computeSeriesResult }                       = require('../utils/bilateralSeries');

/* ── helpers ── */

function populateFixtures(query) {
  return query
    .populate('homeTeam',   'name')
    .populate('awayTeam',   'name')
    .populate('winner',     'name')
    .populate('tossWinner', 'name');
}

const INNINGS_DEFAULT = { runs: 0, wickets: 0, overs: 0 };

/** Five cricket nations players can be assigned in each fixture */
const CRICKET_TEAMS = ['India', 'Australia', 'England', 'South Africa', 'New Zealand'];

/**
 * Returns two different randomly chosen cricket team names — one per player.
 * Ensures neither player in the same fixture gets the same team.
 */
function randomCricketPair() {
  const shuffled = [...CRICKET_TEAMS].sort(() => Math.random() - 0.5);
  return { homeTeamAssignment: shuffled[0], awayTeamAssignment: shuffled[1] };
}

/* ─────────────────────────────── Tournament CRUD ─────────────────────── */

router.get('/', async (_req, res) => {
  try {
    const [tournaments, fixtureCounts] = await Promise.all([
      Tournament.find().sort({ createdAt: -1 }),
      Fixture.aggregate([
        {
          $group: {
            _id: '$tournamentId',
            total:     { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          },
        },
      ]),
    ]);

    /** Build a lookup map: tournamentId → { total, completed } */
    const countMap = {};
    fixtureCounts.forEach(({ _id, total, completed }) => {
      countMap[_id.toString()] = { total, completed };
    });

    /**
     * Derive the effective status from real fixture counts so the home page
     * always agrees with what TournamentDetail shows.  The DB status can lag
     * behind (e.g. still 'completed' after a result is edited) so we recompute
     * it here rather than trusting the stored value.
     */
    const result = tournaments.map((t) => {
      const obj = t.toObject();
      const { total = 0, completed = 0 } = countMap[t._id.toString()] ?? {};
      if (total > 0 && completed === total) {
        obj.status = 'completed';
      } else if (total > 0) {
        obj.status = 'active';
      }
      // total === 0: no fixtures yet — keep the stored status ('upcoming')
      return obj;
    });

    res.json(result);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { name, description, overs, format, numberOfMatches } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Tournament name is required' });
    const oversNum = Number(overs);
    if (!overs || oversNum < 1 || !Number.isInteger(oversNum))
      return res.status(400).json({ message: 'Overs must be a whole number of 1 or more' });

    const isBilateral = format === 'bilateral';
    const nMatches    = isBilateral ? Math.max(1, Number(numberOfMatches) || 1) : 1;

    const tournament = await Tournament.create({
      name: name.trim(),
      description: description?.trim() || '',
      overs: oversNum,
      format: isBilateral ? 'bilateral' : 'standard',
      numberOfMatches: nMatches,
    });
    res.status(201).json(tournament);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).json({ message: 'Tournament not found' });
    res.json(tournament);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const tournament = await Tournament.findByIdAndDelete(req.params.id);
    if (!tournament) return res.status(404).json({ message: 'Tournament not found' });
    await Team.deleteMany({ tournamentId: req.params.id });
    await Fixture.deleteMany({ tournamentId: req.params.id });
    res.json({ message: 'Tournament deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

/* ─────────────────────────────── Teams ───────────────────────────────── */

router.get('/:id/teams', async (req, res) => {
  try {
    res.json(await Team.find({ tournamentId: req.params.id }).sort({ createdAt: 1 }));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

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
  } catch (err) { res.status(500).json({ message: err.message }); }
});

/* ─────────────────────────────── Fixtures ────────────────────────────── */

router.get('/:id/fixtures', async (req, res) => {
  try {
    const fixtures = await populateFixtures(
      Fixture.find({ tournamentId: req.params.id }).sort({ round: 1 })
    );
    res.json(fixtures);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

/**
 * POST /api/tournaments/:id/fixtures/generate
 * Body: { format: 'standard' | 'pool' }
 *
 * standard — regular single round-robin across all teams (existing behaviour)
 * pool     — teams split randomly into 2 equal pools; double round-robin within each
 *            requires ≥ 6 teams
 */
router.post('/:id/fixtures/generate', async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).json({ message: 'Tournament not found' });
    if (tournament.fixturesGenerated) return res.status(400).json({ message: 'Fixtures already generated' });

    const teams = await Team.find({ tournamentId: req.params.id });
    if (teams.length < 2) return res.status(400).json({ message: 'Need at least 2 teams to generate fixtures' });

    const tournamentFormat = tournament.format ?? 'standard';
    const format = req.body.format === 'pool' ? 'pool'
                 : tournamentFormat === 'bilateral' ? 'bilateral'
                 : 'standard';

    /* ── Pool format ── */
    if (format === 'pool') {
      if (teams.length < 6)
        return res.status(400).json({ message: 'Pool format requires at least 6 teams' });

      // Randomly shuffle and split into 2 pools
      const shuffled  = [...teams].sort(() => Math.random() - 0.5);
      const mid       = Math.ceil(shuffled.length / 2);
      const poolATeams = shuffled.slice(0, mid);
      const poolBTeams = shuffled.slice(mid);

      const poolAPairs = generateDoubleRoundRobin(poolATeams.map((t) => t._id.toString()));
      const poolBPairs = generateDoubleRoundRobin(poolBTeams.map((t) => t._id.toString()));

      await Fixture.insertMany([
        ...poolAPairs.map(({ homeTeam, awayTeam, round }) => ({
          tournamentId: req.params.id, homeTeam, awayTeam, round,
          type: 'group', pool: 'A', status: 'scheduled',
          ...randomCricketPair(),
          homeInnings: INNINGS_DEFAULT, awayInnings: INNINGS_DEFAULT,
        })),
        ...poolBPairs.map(({ homeTeam, awayTeam, round }) => ({
          tournamentId: req.params.id, homeTeam, awayTeam, round,
          type: 'group', pool: 'B', status: 'scheduled',
          ...randomCricketPair(),
          homeInnings: INNINGS_DEFAULT, awayInnings: INNINGS_DEFAULT,
        })),
      ]);

      tournament.format = 'pool';
      tournament.poolA  = poolATeams.map((t) => t._id);
      tournament.poolB  = poolBTeams.map((t) => t._id);
      tournament.fixturesGenerated = true;
      tournament.status = 'active';
      await tournament.save();

      return res.json({
        message: 'Pool fixtures generated',
        count: poolAPairs.length + poolBPairs.length,
        poolA: poolATeams.length,
        poolB: poolBTeams.length,
      });
    }

    /* ── Bilateral series ── */
    if (format === 'bilateral') {
      if (teams.length !== 2)
        return res.status(400).json({ message: 'Bilateral series requires exactly 2 teams' });

      const [teamA, teamB] = teams;
      const n = tournament.numberOfMatches ?? 1;
      const fixtures = [];

      for (let i = 0; i < n; i++) {
        // Alternate home/away each match for fairness
        const isOdd    = i % 2 === 0;
        const homeTeam = isOdd ? teamA._id.toString() : teamB._id.toString();
        const awayTeam = isOdd ? teamB._id.toString() : teamA._id.toString();
        fixtures.push({
          tournamentId: req.params.id,
          homeTeam, awayTeam,
          round: i + 1,
          type: 'group', status: 'scheduled',
          ...randomCricketPair(),
          homeInnings: INNINGS_DEFAULT, awayInnings: INNINGS_DEFAULT,
        });
      }

      await Fixture.insertMany(fixtures);
      tournament.fixturesGenerated = true;
      tournament.status = 'active';
      await tournament.save();
      return res.json({ message: `Bilateral series generated (${n} matches)`, count: n });
    }

    /* ── Standard round-robin ── */
    const pairs = generateRoundRobin(teams.map((t) => t._id.toString()));
    await Fixture.insertMany(
      pairs.map(({ homeTeam, awayTeam, round }) => ({
        tournamentId: req.params.id, homeTeam, awayTeam, round,
        type: 'group', status: 'scheduled',
        ...randomCricketPair(),
        homeInnings: INNINGS_DEFAULT, awayInnings: INNINGS_DEFAULT,
      }))
    );
    tournament.fixturesGenerated = true;
    tournament.status = 'active';
    await tournament.save();
    res.json({ message: 'Fixtures generated', count: pairs.length });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

/**
 * POST /api/tournaments/:id/playoffs/generate
 *
 * Pool format  → Q1 (A1 vs B1) + Eliminator (A2 vs B2) + Q2 + Final (IPL)
 * 3 teams      → Direct Final (1st vs 2nd)
 * 4+ teams     → Q1 (1st vs 2nd) + Eliminator (3rd vs 4th) + Q2 + Final (IPL)
 */
router.post('/:id/playoffs/generate', async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).json({ message: 'Tournament not found' });
    if (tournament.playoffGenerated) return res.status(400).json({ message: 'Playoffs already generated' });

    const teams = await Team.find({ tournamentId: req.params.id });
    if (teams.length < 3) return res.status(400).json({ message: 'Need at least 3 teams to generate playoffs' });

    const groupFixtures = await Fixture.find({ tournamentId: req.params.id, type: 'group' });
    const allGroupDone  = groupFixtures.every((f) => f.status === 'completed' || f.status === 'abandoned');
    if (!allGroupDone) return res.status(400).json({ message: 'All group stage matches must be completed first' });

    const maxRound = groupFixtures.reduce((m, f) => Math.max(m, f.round), 0);
    const R = maxRound + 1;

    /* ── Pool format: A1 vs B1 (Q1), A2 vs B2 (Elim), Q2, Final ── */
    if (tournament.format === 'pool') {
      const poolATeams = await Team.find({ _id: { $in: tournament.poolA } });
      const poolBTeams = await Team.find({ _id: { $in: tournament.poolB } });

      const [poolAFixtures, poolBFixtures] = await Promise.all([
        populateFixtures(Fixture.find({ tournamentId: req.params.id, type: 'group', pool: 'A' })),
        populateFixtures(Fixture.find({ tournamentId: req.params.id, type: 'group', pool: 'B' })),
      ]);

      const poolAStandings = computeStandings(poolATeams, poolAFixtures, tournament.overs);
      const poolBStandings = computeStandings(poolBTeams, poolBFixtures, tournament.overs);

      if (poolAStandings.length < 2 || poolBStandings.length < 2)
        return res.status(400).json({ message: 'Each pool needs at least 2 teams in standings' });

      const { team: A1 } = poolAStandings[0];
      const { team: A2 } = poolAStandings[1];
      const { team: B1 } = poolBStandings[0];
      const { team: B2 } = poolBStandings[1];

      await Promise.all([
        Fixture.create({ tournamentId: req.params.id, homeTeam: A1._id, awayTeam: B1._id, round: R,     type: 'qualifier1', status: 'scheduled', ...randomCricketPair(), homeInnings: INNINGS_DEFAULT, awayInnings: INNINGS_DEFAULT }),
        Fixture.create({ tournamentId: req.params.id, homeTeam: A2._id, awayTeam: B2._id, round: R,     type: 'eliminator', status: 'scheduled', ...randomCricketPair(), homeInnings: INNINGS_DEFAULT, awayInnings: INNINGS_DEFAULT }),
        Fixture.create({ tournamentId: req.params.id, homeTeam: null,   awayTeam: null,   round: R + 1, type: 'qualifier2', status: 'scheduled', ...randomCricketPair(), homeInnings: INNINGS_DEFAULT, awayInnings: INNINGS_DEFAULT }),
        Fixture.create({ tournamentId: req.params.id, homeTeam: null,   awayTeam: null,   round: R + 2, type: 'final',      status: 'scheduled', ...randomCricketPair(), homeInnings: INNINGS_DEFAULT, awayInnings: INNINGS_DEFAULT }),
      ]);

      tournament.playoffGenerated = true;
      await tournament.save();
      return res.json({ message: 'Pool playoffs generated (IPL format)' });
    }

    /* ── 3 teams: Direct Final ── */
    if (teams.length === 3) {
      const populatedFixtures = await populateFixtures(Fixture.find({ tournamentId: req.params.id, type: 'group' }));
      const standings = computeStandings(teams, populatedFixtures, tournament.overs);
      if (standings.length < 2) return res.status(400).json({ message: 'Need at least 2 teams in standings' });
      const [first, second] = standings;
      await Fixture.create({ tournamentId: req.params.id, homeTeam: first.team._id, awayTeam: second.team._id, round: R, type: 'final', status: 'scheduled', ...randomCricketPair(), homeInnings: INNINGS_DEFAULT, awayInnings: INNINGS_DEFAULT });
      tournament.playoffGenerated = true;
      await tournament.save();
      return res.json({ message: 'Direct final generated' });
    }

    /* ── 4+ teams: IPL format (Q1, Eliminator, Q2, Final) ── */
    const populatedFixtures = await populateFixtures(Fixture.find({ tournamentId: req.params.id, type: 'group' }));
    const standings = computeStandings(teams, populatedFixtures, tournament.overs);
    if (standings.length < 4) return res.status(400).json({ message: 'Need at least 4 teams in standings for IPL playoffs' });

    const [first, second, third, fourth] = standings;
    await Promise.all([
      Fixture.create({ tournamentId: req.params.id, homeTeam: first.team._id,  awayTeam: second.team._id, round: R,     type: 'qualifier1', status: 'scheduled', ...randomCricketPair(), homeInnings: INNINGS_DEFAULT, awayInnings: INNINGS_DEFAULT }),
      Fixture.create({ tournamentId: req.params.id, homeTeam: third.team._id,  awayTeam: fourth.team._id, round: R,     type: 'eliminator', status: 'scheduled', ...randomCricketPair(), homeInnings: INNINGS_DEFAULT, awayInnings: INNINGS_DEFAULT }),
      Fixture.create({ tournamentId: req.params.id, homeTeam: null,            awayTeam: null,            round: R + 1, type: 'qualifier2', status: 'scheduled', ...randomCricketPair(), homeInnings: INNINGS_DEFAULT, awayInnings: INNINGS_DEFAULT }),
      Fixture.create({ tournamentId: req.params.id, homeTeam: null,            awayTeam: null,            round: R + 2, type: 'final',      status: 'scheduled', ...randomCricketPair(), homeInnings: INNINGS_DEFAULT, awayInnings: INNINGS_DEFAULT }),
    ]);

    tournament.playoffGenerated = true;
    await tournament.save();
    res.json({ message: 'IPL playoffs generated' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

/* ─────────────────────────────── Standings & Stats ──────────────────── */

// GET /api/tournaments/:id/series-result  (bilateral series only)
router.get('/:id/series-result', async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).json({ message: 'Tournament not found' });
    if (tournament.format !== 'bilateral')
      return res.status(400).json({ message: 'Not a bilateral series tournament' });

    const [teams, fixtures] = await Promise.all([
      Team.find({ tournamentId: req.params.id }).lean(),
      Fixture.find({ tournamentId: req.params.id }).lean(),
    ]);
    res.json(computeSeriesResult(teams, fixtures));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/tournaments/:id/standings  (group-stage overall)
router.get('/:id/standings', async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).json({ message: 'Tournament not found' });
    const teams    = await Team.find({ tournamentId: req.params.id });
    const fixtures = await populateFixtures(Fixture.find({ tournamentId: req.params.id, type: 'group' }));
    res.json(computeStandings(teams, fixtures, tournament.overs));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/tournaments/:id/pool-standings  (pool A and pool B separately)
router.get('/:id/pool-standings', async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).json({ message: 'Tournament not found' });
    if (tournament.format !== 'pool') return res.status(400).json({ message: 'Not a pool-format tournament' });

    const [poolATeams, poolBTeams, poolAFixtures, poolBFixtures] = await Promise.all([
      Team.find({ _id: { $in: tournament.poolA } }),
      Team.find({ _id: { $in: tournament.poolB } }),
      populateFixtures(Fixture.find({ tournamentId: req.params.id, type: 'group', pool: 'A' })),
      populateFixtures(Fixture.find({ tournamentId: req.params.id, type: 'group', pool: 'B' })),
    ]);

    res.json({
      poolA: computeStandings(poolATeams, poolAFixtures, tournament.overs),
      poolB: computeStandings(poolBTeams, poolBFixtures, tournament.overs),
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/tournaments/:id/stats  (all match types — group + playoffs)
router.get('/:id/stats', async (req, res) => {
  try {
    const fixtures = await populateFixtures(Fixture.find({ tournamentId: req.params.id }));
    res.json(computeTournamentStats(fixtures));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
