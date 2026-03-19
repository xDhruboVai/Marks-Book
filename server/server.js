require('dotenv').config();
const express = require('express');
const cors = require('cors');
const marksRoutes = require('./routes/marks');

const app = express();
const port = process.env.PORT || 4000;

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || '*',
  })
);
app.use(express.json({ limit: '100kb' }));

app.get('/health', (_req, res) => {
  res.json({ success: true, status: 'ok' });
});

app.use('/marks', marksRoutes);

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
