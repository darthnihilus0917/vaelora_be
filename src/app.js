require('dotenv').config();

const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');

const resources = require('./config/resources');
const buildResourceRouter = require('./routes/resourceRoutes');
const reportsRoutes = require('./routes/reportsRoutes');
const inventoryItemExtraRoutes = require('./routes/inventoryItemExtraRoutes');
const brandsRoutes = require('./routes/brandsRoutes');
const openapiSpec = require('./config/openapiSpec');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const app = express();

// Core middleware
app.use(cors({ origin: [
  'https://vaelorafe.netlify.app',
  'http://localhost:4000',
  'http://localhost:5173',
]}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ success: true, message: 'Server is up' });
});

// API docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));
app.get('/api-docs.json', (req, res) => res.json(openapiSpec));

// Routes
app.use('/api/reports', reportsRoutes);
app.use('/api/inventory-items', inventoryItemExtraRoutes);
app.use('/api/brands', brandsRoutes);

resources.forEach(({ table, path, writable, softDelete }) => {
  app.use(`/api/${path}`, buildResourceRouter(table, { writable, softDelete }));
});

// 404 + error handling (must be registered last)
app.use(notFound);
app.use(errorHandler);

module.exports = app;
