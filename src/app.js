require('dotenv').config();

const express = require('express');
const cors = require('cors');

const resources = require('./config/resources');
const buildResourceRouter = require('./routes/resourceRoutes');
const reportsRoutes = require('./routes/reportsRoutes');
const inventoryItemExtraRoutes = require('./routes/inventoryItemExtraRoutes');
const brandsRoutes = require('./routes/brandsRoutes');
const productsRoutes = require('./routes/productsRoutes');
const publicRoutes = require('./routes/publicRoutes');
const authRoutes = require('./routes/authRoutes');
const usersRoutes = require('./routes/usersRoutes');
const rolesRoutes = require('./routes/rolesRoutes');
const openapiSpec = require('./config/openapiSpec');
const apiDocsPage = require('./config/apiDocsPage');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const app = express();

// Core middleware
app.use(cors({
  origin: [
    'https://vaelorafe.netlify.app',
    'http://localhost:4000',
    'http://localhost:5173',
  ],
  credentials: true,
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ success: true, message: 'Server is up' });
});

// API docs
app.get('/api-docs', (req, res) => res.type('html').send(apiDocsPage));
app.get('/api-docs.json', (req, res) => res.json(openapiSpec));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/inventory-items', inventoryItemExtraRoutes);
app.use('/api/brands', brandsRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/public', publicRoutes);

resources.forEach(({ table, path, writable, softDelete }) => {
  app.use(`/api/${path}`, buildResourceRouter(table, { writable, softDelete }));
});

// 404 + error handling (must be registered last)
app.use(notFound);
app.use(errorHandler);

module.exports = app;
