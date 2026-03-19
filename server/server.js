require('dotenv').config();
const express = require('express');
const cors = require('cors');
const marksRoutes = require('./routes/marks');

const app = express();
const port = process.env.PORT || 4000;

function parseCorsOrigins() {
  const rawOrigins = process.env.CORS_ORIGIN || process.env.CLIENT_ORIGIN || '*';
  if (rawOrigins === '*') {
    return '*';
  }

  const origins = rawOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return origins.length ? origins : '*';
}

app.use(
  cors({
    origin: parseCorsOrigins(),
  })
);
app.use(express.json({ limit: '100kb' }));

app.get('/health', (_req, res) => {
  res.json({ success: true, status: 'ok' });
});

app.use('/marks', marksRoutes);
app.use('/api/marks', marksRoutes);

app.use((err, _req, res, _next) => {
  res.status(500).json({
    success: false,
    data: null,
    error: {
      message: 'Unhandled error',
      details: err?.message || 'Unknown error',
    },
  });
});

app.listen(port, () => {
  console.log(`Marks Book server listening on port ${port}`);
});
