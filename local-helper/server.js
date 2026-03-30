const express = require('express');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { runScrape } = require('./src/scraper');

const HOST = '127.0.0.1';
const PORT = Number(process.env.LEADTOOL_HELPER_PORT || 47831);
const TMP_DIR = path.join(__dirname, 'tmp');
const JOB_TTL_MS = Number(process.env.LEADTOOL_JOB_TTL_MS || 60 * 60 * 1000);
const CLEANUP_INTERVAL_MS = Number(process.env.LEADTOOL_CLEANUP_INTERVAL_MS || 5 * 60 * 1000);
const MAX_JOBS = Number(process.env.LEADTOOL_MAX_JOBS || 200);
const HELPER_TOKEN = process.env.LEADTOOL_HELPER_TOKEN || randomUUID().replace(/-/g, '');
const ORIGIN_ALLOWLIST = new Set(
  String(process.env.LEADTOOL_ALLOWED_ORIGINS || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
);

fs.mkdirSync(TMP_DIR, { recursive: true });

const app = express();
app.use(express.json({ limit: '1mb' }));

const jobs = new Map();

function allowOrigin(origin) {
  if (!origin) return false;
  if (origin === 'null') return true; // file:// origin
  if (origin === `http://${HOST}` || origin === `http://${HOST}:${PORT}`) return true;
  if (origin === 'http://127.0.0.1' || origin.startsWith('http://127.0.0.1:')) return true;
  if (origin === 'http://localhost' || origin.startsWith('http://localhost:')) return true;
  if (origin === 'http://[::1]' || origin.startsWith('http://[::1]:')) return true;
  return ORIGIN_ALLOWLIST.has(origin);
}

function hasValidToken(req) {
  const token = String(req.headers['x-leadtool-token'] || '');
  return token && token === HELPER_TOKEN;
}

function ensureScrapeAccess(req, res) {
  const origin = String(req.headers.origin || '');
  if (!origin || !allowOrigin(origin)) {
    res.status(403).json({ error: 'Origin not allowed' });
    return false;
  }
  if (!hasValidToken(req)) {
    res.status(403).json({ error: 'Unauthorized helper request' });
    return false;
  }
  return true;
}

function cleanupJob(job) {
  if (!job) return;
  if (job.csvPath && fs.existsSync(job.csvPath)) {
    try { fs.unlinkSync(job.csvPath); } catch (error) {}
  }
  jobs.delete(job.jobId);
}

function pruneJobs() {
  const now = Date.now();
  for (const job of jobs.values()) {
    const finishedAt = job.finishedAt ? new Date(job.finishedAt).getTime() : null;
    const createdAt = new Date(job.createdAt).getTime();
    const baseline = Number.isFinite(finishedAt) ? finishedAt : createdAt;
    if (now - baseline > JOB_TTL_MS) cleanupJob(job);
  }

  if (jobs.size > MAX_JOBS) {
    const ordered = [...jobs.values()].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    while (jobs.size > MAX_JOBS && ordered.length) cleanupJob(ordered.shift());
  }

  for (const entry of fs.readdirSync(TMP_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.csv')) continue;
    const fullPath = path.join(TMP_DIR, entry.name);
    try {
      const stats = fs.statSync(fullPath);
      if (now - stats.mtimeMs > JOB_TTL_MS) fs.unlinkSync(fullPath);
    } catch (error) {}
  }
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !allowOrigin(origin)) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  if (allowOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Leadtool-Token');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function serializeJob(job) {
  return {
    jobId: job.jobId,
    status: job.status,
    progressPercent: job.progressPercent,
    message: job.message,
    rowsFound: job.rowsFound,
    createdAt: job.createdAt,
    finishedAt: job.finishedAt || null,
    downloadUrl: job.status === 'succeeded' ? `/scrapes/${job.jobId}/download` : null,
    error: job.error || null,
  };
}

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    app: 'LeadTool Local Helper',
    version: '0.1.0',
    port: PORT,
    requiresAuth: true,
    token: HELPER_TOKEN,
  });
});

app.post('/scrapes', async (req, res) => {
  if (!ensureScrapeAccess(req, res)) return;
  pruneJobs();

  const businessType = String(req.body.businessType || '').trim();
  const city = String(req.body.city || '').trim();
  const area = String(req.body.area || '').trim();
  const query = String(req.body.query || '').trim();
  const rawMax = req.body.maxResults == null ? 200 : req.body.maxResults;
  const parsedMax = Number(rawMax);
  if (!Number.isFinite(parsedMax)) {
    return res.status(400).json({ error: 'maxResults must be a valid number' });
  }
  const maxResults = Math.min(500, Math.max(25, Math.floor(parsedMax || 200)));

  if (!businessType || !city || !query) {
    return res.status(400).json({ error: 'businessType, city, and query are required' });
  }

  const jobId = randomUUID();
  const csvPath = path.join(TMP_DIR, `${jobId}.csv`);
  const job = {
    jobId,
    status: 'queued',
    progressPercent: 0,
    message: 'Queued',
    rowsFound: 0,
    createdAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    cancelRequested: false,
    csvPath,
    request: { businessType, city, area, query, maxResults },
  };

  jobs.set(jobId, job);
  res.status(202).json(serializeJob(job));

  Promise.resolve().then(async () => {
    try {
      job.status = 'running';
      job.message = 'Launching local browser';
      job.progressPercent = 5;
      await runScrape({
        query,
        maxResults,
        csvPath,
        signal: () => job.cancelRequested,
        onProgress(update) {
          job.progressPercent = update.progressPercent ?? job.progressPercent;
          job.message = update.message ?? job.message;
          job.rowsFound = update.rowsFound ?? job.rowsFound;
        },
      });
      job.status = 'succeeded';
      job.progressPercent = 100;
      job.message = 'CSV ready to download';
      job.finishedAt = new Date().toISOString();
    } catch (error) {
      job.status = job.cancelRequested ? 'cancelled' : 'failed';
      job.error = error.message;
      job.message = job.cancelRequested ? 'Scrape cancelled' : 'Scrape failed';
      job.finishedAt = new Date().toISOString();
    }
  });
});

app.get('/scrapes/:jobId', (req, res) => {
  if (!ensureScrapeAccess(req, res)) return;
  pruneJobs();
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(serializeJob(job));
});

app.post('/scrapes/:jobId/cancel', (req, res) => {
  if (!ensureScrapeAccess(req, res)) return;
  pruneJobs();
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  job.cancelRequested = true;
  if (job.status === 'queued') {
    job.status = 'cancelled';
    job.message = 'Scrape cancelled';
    job.finishedAt = new Date().toISOString();
  }
  res.json(serializeJob(job));
});

app.get('/scrapes/:jobId/download', (req, res) => {
  if (!ensureScrapeAccess(req, res)) return;
  pruneJobs();
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).send('Job not found');
  if (job.status !== 'succeeded') return res.status(409).send('CSV not ready');
  if (!fs.existsSync(job.csvPath)) return res.status(404).send('CSV missing');

  const filename = `leads-${job.request.query.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'scrape'}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  const stream = fs.createReadStream(job.csvPath);
  stream.pipe(res);
  stream.on('close', () => {
    job.downloadedAt = new Date().toISOString();
    setTimeout(() => cleanupJob(job), 60 * 1000);
  });
});

app.listen(PORT, HOST, () => {
  setInterval(pruneJobs, CLEANUP_INTERVAL_MS).unref();
  console.log(`LeadTool Local Helper listening on http://${HOST}:${PORT}`);
  console.log('Helper auth token (x-leadtool-token):', HELPER_TOKEN);
});
