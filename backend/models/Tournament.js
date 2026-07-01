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
    // 'standard' = regular round-robin; 'pool' = 2-pool double round-robin
    format:  { type: String, enum: ['standard', 'pool'], default: 'standard' },
    poolA:   [{ type: ObjectId, ref: 'Team' }],
    poolB:   [{ type: ObjectId, ref: 'Team' }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Tournament', tournamentSchema);
