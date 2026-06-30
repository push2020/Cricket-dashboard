const path    = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cors    = require('cors');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/tournaments', require('./routes/tournaments'));
app.use('/api/teams',       require('./routes/teams'));
app.use('/api/fixtures',    require('./routes/fixtures'));
app.use('/api/hof',         require('./routes/hof'));

const PORT      = process.env.PORT       || 5000;
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/real-cricket';

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });
