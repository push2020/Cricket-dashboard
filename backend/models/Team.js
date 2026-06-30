const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema(
  {
    name:         { type: String, required: true, trim: true },
    tournamentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tournament', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Team', teamSchema);
