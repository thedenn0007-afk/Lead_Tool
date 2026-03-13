#!/usr/bin/env python3
"""
Google Maps Business Scraper — 200+ Results
============================================
INSTALL: pip install playwright pandas && playwright install chromium
USAGE:   python gmaps_scraper.py "dental clinic bangalore" 200
OUTPUT:  CSV file in same folder — import into LeadTool
"""
import sys, time, csv, re, random
from datetime import datetime
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

args = sys.argv[1:]
if args and args[-1].isdigit():
    MAX_RESULTS = int(args[-1])
    QUERY = " ".join(args[:-1]) if len(args) > 1 else "dental clinic bangalore"
else:
    MAX_RESULTS = 200
    QUERY = " ".join(args) if args else "dental clinic bangalore"

HEADLESS = True
SCROLL_PAUSE = 2.0

def clean(t): return (t or "").strip().replace("\n", " ").replace("\r", "")
def extract_phone(text):
    text = text or ""
    for pat in [r'\+91[\s\-]?[6-9]\d{9}', r'0[6-9]\d{9}', r'[6-9]\d{9}', r'\d{3,5}[\s\-]\d{5,8}']:
        m = re.search(pat, text)
        if m: return m.group().strip()
    return ""

def scroll_panel(page, target, max_scrolls=100):
    prev, stale = 0, 0
    for i in range(max_scrolls):
        items = page.query_selector_all('a[href*="/maps/place/"]')
        count = len(items)
        print(f"  Scroll {i+1:03d} -> {count} listings", end="\r")
        if count >= target: print(f"\n  Target reached: {count}"); break
        if count == prev:
            stale += 1
            if stale >= 6: print(f"\n  End of results at {count}"); break
        else: stale = 0
        prev = count
        try:
            panel = page.query_selector('div[role="feed"]')
            if panel: panel.evaluate("el => el.scrollTop += 2000")
            else: page.keyboard.press("End")
        except: pass
        time.sleep(SCROLL_PAUSE + random.uniform(0.1, 0.5))
        if (i+1) % 25 == 0: time.sleep(4)
    return page.query_selector_all('a[href*="/maps/place/"]')

def get_detail(page, url):
    d = dict(business_name="",category="",phone="",address="",area="",city="",rating="",reviews="",website="",has_website="NO",maps_url="",hours="")
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=18000)
        time.sleep(1.5)
        for sel in ['h1[data-attrid="title"]','h1.DUwDvf','h1']:
            el = page.query_selector(sel)
            if el: d["business_name"] = clean(el.inner_text()); break
        if not d["business_name"]:
            t = page.title()
            if "Google Maps" in t: d["business_name"] = t.split(" - ")[0].strip()
        for sel in ['button[jsaction*="category"]','.DkEaL']:
            el = page.query_selector(sel)
            if el: d["category"] = clean(el.inner_text()); break
        for sel in ['[data-item-id^="phone"]','button[aria-label*="phone" i]','a[href^="tel:"]']:
            el = page.query_selector(sel)
            if el:
                text = (el.get_attribute("aria-label") or el.get_attribute("href") or el.inner_text() or "").replace("tel:","")
                phone = extract_phone(text)
                if phone: d["phone"] = phone; break
        if not d["phone"]:
            try:
                for el in page.query_selector_all('[aria-label]'):
                    label = el.get_attribute("aria-label") or ""
                    if re.search(r'[6-9]\d{9}', label): d["phone"] = extract_phone(label); break
            except: pass
        for sel in ['button[data-item-id="address"]','[data-item-id="address"]']:
            el = page.query_selector(sel)
            if el:
                addr = clean(el.get_attribute("aria-label") or el.inner_text())
                addr = re.sub(r'^Address:?\s*','',addr,flags=re.IGNORECASE)
                if len(addr) > 5:
                    d["address"] = addr
                    parts = [p.strip() for p in addr.split(",")]
                    if len(parts) >= 3: d["area"],d["city"] = parts[-3],parts[-2]
                    elif len(parts)==2: d["area"],d["city"] = parts[0],parts[1]
                    break
        for sel in ['div.F7nice span[aria-hidden="true"]','span.ceNzKf']:
            el = page.query_selector(sel)
            if el:
                m = re.search(r'(\d+\.?\d*)',el.inner_text())
                if m: d["rating"] = m.group(1); break
        for sel in ['span[aria-label*="reviews" i]','button[aria-label*="reviews" i]']:
            el = page.query_selector(sel)
            if el:
                label = el.get_attribute("aria-label") or el.inner_text() or ""
                m = re.search(r'([\d,]+)',label)
                if m: d["reviews"] = m.group(1).replace(",",""); break
        for sel in ['a[data-item-id="authority"]','a[aria-label*="website" i]']:
            el = page.query_selector(sel)
            if el:
                href = el.get_attribute("href") or ""
                if href and "google" not in href and "maps" not in href: d["website"]=href; d["has_website"]="YES"; break
        cur = page.url
        d["maps_url"] = cur.split("?")[0] if "/maps/place/" in cur else cur
    except PWTimeout: print("  timeout",end=" ")
    except Exception as e: print(f"  err:{str(e)[:30]}",end=" ")
    return d

def main():
    print(f"\nQuery: {QUERY} | Target: {MAX_RESULTS}\n")
    results, seen_names, seen_urls = [], set(), set()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=HEADLESS, args=["--no-sandbox","--disable-blink-features=AutomationControlled"])
        ctx = browser.new_context(viewport={"width":1366,"height":900},user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",locale="en-IN",timezone_id="Asia/Kolkata")
        ctx.route("**/*.{png,jpg,jpeg,gif,webp,svg,ico,woff,woff2,ttf,eot}",lambda r:r.abort())
        page = ctx.new_page()
        page.set_default_timeout(20000)
        url = f"https://www.google.com/maps/search/{QUERY.replace(' ','+')}"
        print(f"Opening: {url}\n")
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
        time.sleep(3)
        for text in ["Accept all","Reject all","I agree"]:
            try:
                btn = page.query_selector(f'button:has-text("{text}")')
                if btn: btn.click(); time.sleep(1); break
            except: pass
        print(f"Scrolling to load {MAX_RESULTS}+ listings...\n")
        listings = scroll_panel(page, MAX_RESULTS)
        listing_urls = []
        for item in listings:
            href = item.get_attribute("href") or ""
            if href and "/maps/place/" in href and href not in seen_urls: seen_urls.add(href); listing_urls.append(href)
        print(f"\n{len(listing_urls)} URLs collected. Extracting details...\n")
        for i, lurl in enumerate(listing_urls[:MAX_RESULTS]):
            print(f"  [{i+1:03d}/{min(len(listing_urls),MAX_RESULTS)}] ",end="")
            detail = get_detail(page, lurl)
            name = detail.get("business_name","")
            if not name or name.lower() in seen_names: print("skip"); continue
            seen_names.add(name.lower())
            detail["search_query"] = QUERY
            detail["scraped_at"] = datetime.now().strftime("%Y-%m-%d %H:%M")
            results.append(detail)
            print(f"{name[:40]} | {'📞' if detail['phone'] else 'no phone'} | {'🌐' if detail['website'] else 'NO WEBSITE'}")
            try: page.go_back(wait_until="domcontentloaded",timeout=10000); time.sleep(random.uniform(0.8,1.8))
            except: page.goto(url,wait_until="domcontentloaded",timeout=15000); time.sleep(2)
        browser.close()
    if not results: print("\nNo results."); return
    stamp = datetime.now().strftime("%Y%m%d_%H%M")
    safe_q = QUERY[:35].replace(" ","_").replace("/","_")
    filename = f"leads_{safe_q}_{stamp}.csv"
    fields = ["business_name","category","phone","address","area","city","rating","reviews","website","has_website","maps_url","hours","search_query","scraped_at"]
    with open(filename,"w",newline="",encoding="utf-8-sig") as f:
        w = csv.DictWriter(f,fieldnames=fields,extrasaction="ignore")
        w.writeheader(); w.writerows(results)
    total=len(results); wp=sum(1 for r in results if r["phone"]); nw=sum(1 for r in results if r["has_website"]=="NO")
    print(f"\n{'='*50}\nSaved {total} businesses -> {filename}\nWith phone: {wp} | No website: {nw}\n{'='*50}\nImport this CSV into LeadTool -> Auto Scrape -> Python tab")

if __name__ == "__main__": main()
