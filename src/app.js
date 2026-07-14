require('dotenv').config();

const express = require('express');
const cors = require('cors');

const resources = require('./config/resources');
const buildResourceRouter = require('./routes/resourceRoutes');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const app = express();

// Core middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ success: true, message: 'Server is up' });
});

// Routes
resources.forEach(({ table, path, writable }) => {
  app.use(`/api/${path}`, buildResourceRouter(table, { writable }));
});

// 404 + error handling (must be registered last)
app.use(notFound);
app.use(errorHandler);

module.exports = app;
