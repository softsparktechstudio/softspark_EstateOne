import 'dotenv/config';
import 'express-async-errors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import dashboardRoutes from './routes/dashboard.js';
import propertyRoutes from './routes/properties.js';
import leadRoutes from './routes/leads.js';
import clientRoutes from './routes/clients.js';
import workRoutes from './routes/work.js';
import dealRoutes from './routes/deals.js';
import reportRoutes from './routes/reports.js';
import socialRoutes, { metaWebhook } from './routes/social.js';
import intelligenceRoutes from './routes/intelligence.js';
import saasRoutes from './routes/saas.js';
import marketplaceRoutes from './routes/marketplace.js';
import followupRoutes from './routes/followups.js';

if (!process.env.JWT_SECRET || !process.env.DATABASE_URL) {
  console.error('Missing JWT_SECRET or DATABASE_URL. Copy .env.example to .env and edit it.');
  process.exit(1);
}

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(',') || true }));
app.use(express.json({ limit: '8mb', verify: (req, _res, buf) => { req.rawBody = Buffer.from(buf); } }));
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(__dirname, '../uploads');
fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));

app.get('/api/health', (_req, res) => res.json({ ok: true, app: 'SoftSpark EstateOne' }));
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/work', workRoutes);
app.use('/api/deals', dealRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/intelligence', intelligenceRoutes);
app.use('/api/saas', saasRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/followups', followupRoutes);
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.resolve(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/webhooks/')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.get('/webhooks/meta', metaWebhook.verify);
app.post('/webhooks/meta', metaWebhook.receive);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
});

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`SoftSpark EstateOne API running on http://localhost:${port}`));
