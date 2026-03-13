const fs = require('fs');
const { chromium } = require('playwright');

function clean(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function csvEscape(value) {
  return `"${String(value || '').replace(/"/g, '""')}"`;
}

function extractPhone(text) {
  const value = String(text || '');
  const patterns = [
    /\+91[\s-]?[6-9]\d{9}/,
    /0[6-9]\d{9}/,
    /[6-9]\d{9}/,
    /\d{3,5}[\s-]\d{5,8}/,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) return match[0].trim();
  }
  return '';
}

async function scrollPanel(page, target, signal, onProgress) {
  let previousCount = 0;
  let stale = 0;

  for (let i = 0; i < 100; i += 1) {
    if (signal()) throw new Error('Scrape cancelled');
    const listings = await page.locator('a[href*="/maps/place/"]').elementHandles();
    const count = listings.length;
    onProgress({
      progressPercent: Math.min(45, 10 + Math.round((count / Math.max(target, 1)) * 35)),
      rowsFound: count,
      message: `Loading listings (${count}/${target})`,
    });

    if (count >= target) break;
    if (count === previousCount) {
      stale += 1;
      if (stale >= 6) break;
    } else {
      stale = 0;
    }
    previousCount = count;

    const panel = page.locator('div[role="feed"]').first();
    if (await panel.count()) {
      await panel.evaluate((el) => { el.scrollTop += 2000; });
    } else {
      await page.keyboard.press('End');
    }
    await page.waitForTimeout(2200);
  }

  return page.locator('a[href*="/maps/place/"]').elementHandles();
}

async function safeInnerText(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count()) {
      const text = clean(await locator.innerText().catch(() => ''));
      if (text) return text;
    }
  }
  return '';
}

async function safeAttribute(page, selectors, attr) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count()) {
      const value = clean(await locator.getAttribute(attr).catch(() => ''));
      if (value) return value;
    }
  }
  return '';
}

async function getDetail(page, url, query, signal) {
  if (signal()) throw new Error('Scrape cancelled');

  const detail = {
    business_name: '',
    category: '',
    phone: '',
    address: '',
    area: '',
    city: '',
    rating: '',
    reviews: '',
    website: '',
    has_website: 'NO',
    maps_url: url,
    hours: '',
    search_query: query,
    scraped_at: new Date().toISOString(),
  };

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForTimeout(1500);

  detail.business_name = await safeInnerText(page, ['h1[data-attrid="title"]', 'h1.DUwDvf', 'h1']);
  detail.category = await safeInnerText(page, ['button[jsaction*="category"]', '.DkEaL']);

  const phoneText = await safeAttribute(page, ['[data-item-id^="phone"]', 'button[aria-label*="phone" i]', 'a[href^="tel:"]'], 'aria-label')
    || await safeAttribute(page, ['a[href^="tel:"]'], 'href')
    || await safeInnerText(page, ['[data-item-id^="phone"]', 'button[aria-label*="phone" i]']);
  detail.phone = extractPhone(phoneText.replace('tel:', ''));

  const addressText = await safeAttribute(page, ['button[data-item-id="address"]', '[data-item-id="address"]'], 'aria-label')
    || await safeInnerText(page, ['button[data-item-id="address"]', '[data-item-id="address"]']);
  detail.address = addressText.replace(/^Address:?\s*/i, '');

  if (detail.address) {
    const parts = detail.address.split(',').map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 3) {
      detail.area = parts[parts.length - 3] || '';
      detail.city = parts[parts.length - 2] || '';
    } else if (parts.length === 2) {
      detail.area = parts[0] || '';
      detail.city = parts[1] || '';
    }
  }

  const ratingText = await safeInnerText(page, ['div.F7nice span[aria-hidden="true"]', 'span.ceNzKf']);
  const ratingMatch = ratingText.match(/(\d+\.?\d*)/);
  if (ratingMatch) detail.rating = ratingMatch[1];

  const reviewsText = await safeAttribute(page, ['span[aria-label*="reviews" i]', 'button[aria-label*="reviews" i]'], 'aria-label')
    || await safeInnerText(page, ['span[aria-label*="reviews" i]', 'button[aria-label*="reviews" i]']);
  const reviewsMatch = reviewsText.match(/([\d,]+)/);
  if (reviewsMatch) detail.reviews = reviewsMatch[1].replace(/,/g, '');

  const website = await safeAttribute(page, ['a[data-item-id="authority"]', 'a[aria-label*="website" i]'], 'href');
  if (website && !website.includes('google') && !website.includes('maps')) {
    detail.website = website;
    detail.has_website = 'YES';
  }

  return detail;
}

async function runScrape({ query, maxResults, csvPath, signal, onProgress }) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
  });

  await context.route('**/*.{png,jpg,jpeg,gif,webp,svg,ico,woff,woff2,ttf,eot}', (route) => route.abort());

  const page = await context.newPage();
  await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(query)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForTimeout(3000);

  for (const text of ['Accept all', 'Reject all', 'I agree']) {
    const button = page.locator(`button:has-text("${text}")`).first();
    if (await button.count()) {
      await button.click().catch(() => {});
      await page.waitForTimeout(1000);
      break;
    }
  }

  onProgress({ progressPercent: 10, rowsFound: 0, message: 'Google Maps opened' });
  const listingHandles = await scrollPanel(page, maxResults, signal, onProgress);

  const listingUrls = [];
  const seenUrls = new Set();
  for (const handle of listingHandles) {
    const href = await handle.getAttribute('href');
    if (href && href.includes('/maps/place/') && !seenUrls.has(href)) {
      seenUrls.add(href);
      listingUrls.push(href);
    }
  }

  const results = [];
  const seenNames = new Set();
  for (let index = 0; index < Math.min(listingUrls.length, maxResults); index += 1) {
    if (signal()) throw new Error('Scrape cancelled');
    const url = listingUrls[index];
    onProgress({
      progressPercent: Math.min(95, 45 + Math.round(((index + 1) / Math.max(Math.min(listingUrls.length, maxResults), 1)) * 50)),
      rowsFound: results.length,
      message: `Extracting business ${index + 1} of ${Math.min(listingUrls.length, maxResults)}`,
    });

    try {
      const detail = await getDetail(page, url, query, signal);
      const nameKey = detail.business_name.toLowerCase();
      if (!detail.business_name || seenNames.has(nameKey)) {
        await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
        continue;
      }
      seenNames.add(nameKey);
      results.push(detail);
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(async () => {
        await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(query)}`, {
          waitUntil: 'domcontentloaded',
          timeout: 20000,
        });
      });
      await page.waitForTimeout(1200);
    } catch (error) {
      await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(query)}`, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      }).catch(() => {});
      await page.waitForTimeout(1200);
    }
  }

  await browser.close();

  if (!results.length) throw new Error('No businesses found');

  const header = [
    'business_name', 'category', 'phone', 'address', 'area', 'city',
    'rating', 'reviews', 'website', 'has_website', 'maps_url', 'hours',
    'search_query', 'scraped_at',
  ];
  const lines = [header.join(',')];
  for (const row of results) {
    lines.push(header.map((key) => csvEscape(row[key])).join(','));
  }
  fs.writeFileSync(csvPath, `\uFEFF${lines.join('\n')}`, 'utf8');
  onProgress({ progressPercent: 100, rowsFound: results.length, message: 'CSV ready' });
}

module.exports = { runScrape };
