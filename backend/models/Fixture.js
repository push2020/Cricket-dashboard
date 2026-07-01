const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

const inningsSchema = new mongoose.Schema(
  { runs: { type: Number, default: 0 }, wickets: { type: Number, default: 0 }, overs: { type: Number, default: 0 } },
  { _id: false }
);

const fixtureSchema = new mongoose.Schema(
  {
    tournamentId: { type: ObjectId, ref: 'Tournament', required: true },
    homeTeam:     { type: ObjectId, ref: 'Team', default: null },
    awayTeam:     { type: ObjectId, ref: 'Team', default: null },
    round:        { type: Number, required: true },
    type:         { type: String, enum: ['group', 'qualifier1', 'eliminator', 'qualifier2', 'final'], default: 'group' },
    pool:         { type: String, enum: ['A', 'B', null], default: null },
    status:       { type: String, enum: ['scheduled', 'completed', 'abandoned'], default: 'scheduled' },
    homeInnings:  { type: inningsSchema, default: () => ({ runs: 0, wickets: 0, overs: 0 }) },
    awayInnings:  { type: inningsSchema, default: () => ({ runs: 0, wickets: 0, overs: 0 }) },
    winner:       { type: ObjectId, ref: 'Team', default: null },
    resultNote:   { type: String, default: '' },
    tossWinner:   { type: ObjectId, ref: 'Team', default: null },
    tossDecision: { type: String, enum: ['bat', 'field'], default: null },
    matchDate:    { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Fixture', fixtureSchema);
