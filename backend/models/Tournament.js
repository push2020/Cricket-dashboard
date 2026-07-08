const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

const tournamentSchema = new mongoose.Schema(
  {
    name:              { type: String, required: true, trim: true },
    description:       { type: String, default: '' },
    overs:             { type: Number, required: true, min: 1 },
    status:            { type: String, enum: ['upcoming', 'active', 'completed'], default: 'upcoming' },
    fixturesGenerated: { type: Boolean, default: false },
    playoffGenerated:  { type: Boolean, default: false },
    // 'standard' = regular round-robin; 'pool' = 2-pool double round-robin; 'bilateral' = N-match series between 2 teams
    format:          { type: String, enum: ['standard', 'pool', 'bilateral'], default: 'standard' },
    numberOfMatches: { type: Number, default: 1 },  // bilateral only
    poolA:   [{ type: ObjectId, ref: 'Team' }],
    poolB:   [{ type: ObjectId, ref: 'Team' }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Tournament', tournamentSchema);
