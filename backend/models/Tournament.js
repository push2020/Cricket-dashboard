const mongoose = require('mongoose');

const tournamentSchema = new mongoose.Schema(
  {
    name:              { type: String, required: true, trim: true },
    description:       { type: String, default: '' },
    overs:             { type: Number, required: true, min: 1 },
    status:            { type: String, enum: ['upcoming', 'active', 'completed'], default: 'upcoming' },
    fixturesGenerated: { type: Boolean, default: false },
    playoffGenerated:  { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Tournament', tournamentSchema);
