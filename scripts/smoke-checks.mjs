import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function read(filePath) {
  return fs.readFileSync(path.join(root, filePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function assertIncludes(filePath, snippet, message) {
  const content = read(filePath);
  assert(content.includes(snippet), `${filePath}: ${message}`);
}

function assertNotMatch(filePath, pattern, message) {
  const content = read(filePath);
  assert(!pattern.test(content), `${filePath}: ${message}`);
}

assert(fs.existsSync(path.join(root, 'robots.txt')), 'robots.txt is missing');
assert(fs.existsSync(path.join(root, 'sitemap.xml')), 'sitemap.xml is missing');
assert(fs.existsSync(path.join(root, 'js', 'analytics.js')), 'js/analytics.js is missing');

assertIncludes('find.html', 'id="bizType"', 'business type input missing');
assertIncludes('find.html', 'id="area"', 'specific area input missing');
assertIncludes('find.html', "track('query_built'", 'query funnel event missing');
assertIncludes('find.html', "track('maps_opened'", 'maps funnel event missing');

assertIncludes('auto.html', "Authorization: `Bearer ${key}`", 'Apify bearer auth missing');
assertNotMatch('auto.html', /api\.apify\.com[^\n]*[?&]token=/i, 'Apify token should not be sent in query params');

assertIncludes('local-helper/server.js', 'Unauthorized helper request', 'helper auth guard missing');
assertIncludes('local-helper/server.js', 'Origin not allowed', 'helper origin guard missing');

assertIncludes('settings.html', "track('export_clicked'", 'export tracking missing');
assertIncludes('guide.html', 'toggleChecklistItem', 'keyboard-safe checklist toggle missing');

if (failures.length) {
  console.error('Smoke checks failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Smoke checks passed.');
