const express = require('express');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { runScrape } = require('./src/scraper');

const HOST = '127.0.0.1';
const PORT = Number(process.env.LEADTOOL_HELPER_PORT || 47831);
const TMP_DIR = path.join(__dirname, 'tmp');

fs.mkdirSync(TMP_DIR, { recursive: true });

const app = express();
app.use(express.json({ limit: '1mb' }));

const jobs = new Map();

function allowOrigin(origin) {
  if (!origin) return true;
  return origin === 'null'
    || origin.startsWith('http://127.0.0.1')
    || origin.startsWith('http://localhost')
    || origin.startsWith('http://[::1]')
    || origin.startsWith('https://[::1]')
    || origin.startsWith('https://');
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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
  });
});

app.post('/scrapes', async (req, res) => {
  const businessType = String(req.body.businessType || '').trim();
  const city = String(req.body.city || '').trim();
  const area = String(req.body.area || '').trim();
  const query = String(req.body.query || '').trim();
  const maxResults = Math.min(500, Math.max(25, Number(req.body.maxResults || 200)));

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
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(serializeJob(job));
});

app.post('/scrapes/:jobId/cancel', (req, res) => {
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
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).send('Job not found');
  if (job.status !== 'succeeded') return res.status(409).send('CSV not ready');
  if (!fs.existsSync(job.csvPath)) return res.status(404).send('CSV missing');

  const filename = `leads-${job.request.query.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'scrape'}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  fs.createReadStream(job.csvPath).pipe(res);
});

app.listen(PORT, HOST, () => {
  console.log(`LeadTool Local Helper listening on http://${HOST}:${PORT}`);
});
