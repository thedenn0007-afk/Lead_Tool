// ── LeadTool Store ────────────────────────────────────────────────────────────
const Store = {
  K: { leads:'lt_leads', searches:'lt_searches', settings:'lt_settings' },

  // ── Leads ──
  leads() { return JSON.parse(localStorage.getItem(this.K.leads)||'[]'); },
  save(leads) { localStorage.setItem(this.K.leads,JSON.stringify(leads)); },

  add(lead) {
    const all = this.leads();
    lead.id       = Date.now()+Math.random().toString(36).slice(2);
    lead.addedAt  = new Date().toISOString();
    lead.status   = 'new';
    lead.notes    = [];
    lead.followUp = '';
    all.push(lead);
    this.save(all);
    return lead;
  },

  update(id, patch) {
    const all = this.leads();
    const i = all.findIndex(l=>l.id===id);
    if(i!==-1){ all[i]={...all[i],...patch,updatedAt:new Date().toISOString()}; this.save(all); return all[i]; }
  },

  del(id) { this.save(this.leads().filter(l=>l.id!==id)); },

  addNote(id, text) {
    const lead = this.leads().find(l=>l.id===id);
    if(!lead) return;
    const notes = lead.notes||[];
    notes.push({ text, at: new Date().toISOString() });
    this.update(id,{notes});
  },

  importCSV(text, mode = 'merge') {
  if (!text || !text.trim()) {
    alert('No text received');
    return { imported: 0, skipped: 0 };
  }

  // Normalize line endings
  const lines = text.replace(/\r\n/g, '\n')
                    .replace(/\r/g, '\n')
                    .split('\n')
                    .filter(l => l.trim().length > 0);

  if (lines.length < 2) {
    alert('Only ' + lines.length + ' lines found in CSV');
    return { imported: 0, skipped: 0 };
  }

  // Detect separator from first line
  const firstLine = lines[0];
  const dataLine = lines[1] || lines[0];
  const tabCount = (dataLine.match(/\t/g) || []).length;
  const commaCount = (dataLine.match(/,/g) || []).length;
  const SEP = tabCount >= commaCount ? '\t' : ',';

  // Proper quoted-CSV parser
  function parseCSVLine(line, sep) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const next = line[i + 1];
      
      if (char === '"' && !inQuotes) {
        inQuotes = true;
      } else if (char === '"' && inQuotes && next === '"') {
        // escaped quote inside field
        current += '"';
        i++;
      } else if (char === '"' && inQuotes) {
        inQuotes = false;
      } else if (char === sep && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  alert('Separator detected: ' + (SEP === '\t' ? 'TAB' : 'COMMA') + 
        '\nTotal lines: ' + lines.length +
        '\nHeader: ' + firstLine.substring(0, 120));

  // Split header
  const headers = parseCSVLine(firstLine, SEP).map(h => h.replace(/^"|"$/g, '').trim());

  // Find column indexes by checking header values
  // Instant Data Scraper uses class names - we find by position
  // Based on known Instant Data Scraper output order:
  // col 0 = Maps URL (contains google.com/maps)
  // col 1 = Business Name
  // col 2 = Rating (number like 4.9)
  // col 3 = Reviews (negative number like -258)
  // col 4 = Category
  // col 6 = Address
  // col 8 = Hours
  // col 10 = Phone
  // col 11 = Website URL

  // But also support normal CSV with named headers
  function findCol(row, ...names) {
    for (const name of names) {
      const idx = headers.findIndex(h => 
        h.toLowerCase().replace(/\s/g,'').includes(name.toLowerCase().replace(/\s/g,''))
      );
      if (idx !== -1) return row[idx] || '';
    }
    return '';
  }

  function isInstantScraper() {
    const firstDataRow = parseCSVLine(lines[1], SEP);
    const col0 = firstDataRow[0] || '';
    return col0.includes('google.com/maps') || col0.includes('/maps/place/');
  }

  const instantMode = isInstantScraper();
  alert('Format detected: ' + (instantMode ? 'Instant Data Scraper' : 'Standard CSV'));

  const toAdd = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    // Use proper CSV parser for all rows
    const row = parseCSVLine(lines[i], SEP);

    let lead = {};

    if (instantMode) {
      lead = {
        name:       (row[1] || '').split('|')[0].trim(),
        category:   row[4] || '',
        phone:      row[10] || '',
        address:    row[6] || '',
        area:       '',
        city:       '',
        rating:     row[2] || '',
        reviews:    String(Math.abs(parseInt(row[3]) || 0)),
        website:    (row[11] || '').startsWith('http') ? row[11] : '',
        hasWebsite: (row[11] || '').startsWith('http') ? 'YES' : 'NO',
        mapsUrl:    row[0] || '',
        hours:      row[8] || '',
        source:     'Instant Data Scraper',
      };

      // Extract area from address
      if (lead.address) {
        const parts = lead.address.split(',').map(p => p.trim()).filter(Boolean);
        if (parts.length >= 2) {
          lead.area = parts[parts.length - 2] || '';
          lead.city = parts[parts.length - 1] || '';
        }
      }

    } else {
      // Standard named-column CSV
      lead = {
        name:       findCol(row, 'title', 'name', 'businessname', 'business name'),
        category:   findCol(row, 'category', 'type'),
        phone:      findCol(row, 'phone', 'phonenumber', 'phone number'),
        address:    findCol(row, 'address', 'street'),
        area:       findCol(row, 'area', 'neighborhood', 'locality'),
        city:       findCol(row, 'city'),
        rating:     findCol(row, 'rating', 'totalscore'),
        reviews:    findCol(row, 'reviews', 'reviewscount', 'review count'),
        website:    findCol(row, 'website'),
        hasWebsite: findCol(row, 'website') ? 'YES' : 'NO',
        mapsUrl:    findCol(row, 'url', 'mapsurl', 'maps url', 'maps link'),
        source:     'CSV Import',
      };
    }

    // Skip if no name
    if (!lead.name || lead.name.length < 2) continue;

    lead.id       = Date.now().toString(36) + Math.random().toString(36).slice(2) + i;
    lead.addedAt  = new Date().toISOString();
    lead.status   = 'new';
    lead.notes    = [];
    lead.followUp = '';

    toAdd.push(lead);
  }

  if (toAdd.length === 0) {
    alert('Parsed ' + (lines.length - 1) + ' rows but 0 had valid names.\n' +
          'First data row col[1] = ' + (lines[1].split(SEP)[1] || 'EMPTY'));
    return { imported: 0, skipped: 0 };
  }

  // Save enough metadata for the dashboard and batch-specific views.
  const batchLabel = toAdd[0]?.source || 'Import';
  const batchSource = instantMode ? 'Instant Data Scraper' : 'CSV Import';
  const batch = {
    id: Date.now().toString(36),
    name: batchLabel,
    source: batchSource,
    query: batchLabel,
    count: toAdd.length,
    noWebsite: toAdd.filter(l => l.hasWebsite === 'NO').length,
    createdAt: new Date().toISOString(),
    leadIds: toAdd.map(l => l.id),
  };
  toAdd.forEach(l => l.batchId = batch.id);

  const batches = JSON.parse(localStorage.getItem('lt_batches') || '[]');
  batches.unshift(batch);
  localStorage.setItem('lt_batches', JSON.stringify(batches));

  try {
    if (mode === 'replace') {
      localStorage.setItem('lt_leads', JSON.stringify(toAdd));
      return { imported: toAdd.length, skipped: 0 };
    } else {
      const existing = this.leads();
      const existingNames = new Set(existing.map(l => (l.name||'').toLowerCase().trim()));
      const deduped = toAdd.filter(l => !existingNames.has(l.name.toLowerCase().trim()));
      const skipped = toAdd.length - deduped.length;
      localStorage.setItem('lt_leads', JSON.stringify([...existing, ...deduped]));
      return { imported: deduped.length, skipped };
    }
  } catch(e) {
    if (e.name === 'QuotaExceededError') {
      alert('Storage full! Go to Settings → Export leads → Clear → Re-import.');
    }
    return { imported: 0, skipped: 0 };
  }
},

  exportCSV() {
    const all = this.leads();
    if(!all.length) return;
    const cols = ['name','category','phone','address','area','city','rating','reviews','website','hasWebsite','mapsUrl','status','followUp','addedAt'];
    const header = ['Business Name','Category','Phone','Address','Area','City','Rating','Reviews','Website','Has Website','Maps URL','Status','Follow Up','Added'];
    const rows = all.map(l=>cols.map(c=>`"${String(l[c]||'').replace(/"/g,'""')}"`).join(','));
    const csv = [header.join(','),...rows].join('\n');
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv'}));
    a.download=`leads-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  },

  exportFiltered(leads) {
    if(!leads.length) return;
    const cols = ['name','category','phone','address','area','city','rating','reviews','website','hasWebsite','mapsUrl','status','followUp','addedAt'];
    const header = ['Business Name','Category','Phone','Address','Area','City','Rating','Reviews','Website','Has Website','Maps URL','Status','Follow Up','Added'];
    const rows = leads.map(l=>cols.map(c=>`"${String(l[c]||'').replace(/"/g,'""')}"`).join(','));
    const csv = [header.join(','),...rows].join('\n');
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv'}));
    a.download=`no-website-leads-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  },

  // ── Searches ──
  searches() { return JSON.parse(localStorage.getItem(this.K.searches)||'[]'); },
  addSearch(q) {
    const s=this.searches();
    s.unshift({q,at:new Date().toISOString()});
    localStorage.setItem(this.K.searches,JSON.stringify(s.slice(0,50)));
  },

  // ── Batches ──
  batches() { return JSON.parse(localStorage.getItem('lt_batches')||'[]'); },

  // ── Settings ──
  settings() {
    return JSON.parse(localStorage.getItem(this.K.settings)||JSON.stringify({
      city:'Bangalore',
      niches:['Dental Clinic','Dermatology','Architect','Visa Consultant','Interior Designer','CA Firm','Law Firm','Yoga Studio']
    }));
  },
  saveSettings(s){ localStorage.setItem(this.K.settings,JSON.stringify(s)); },

  // ── Stats ──
  stats() {
    const all=this.leads();
    return {
      total:    all.length,
      noSite:   all.filter(l=>!hasWebsite(l)).length,
      new:      all.filter(l=>l.status==='new').length,
      called:   all.filter(l=>l.status==='called').length,
      callback: all.filter(l=>l.status==='callback').length,
      interest: all.filter(l=>l.status==='interest').length,
      closed:   all.filter(l=>l.status==='closed').length,
      lost:     all.filter(l=>l.status==='lost').length,
    };
  }
};

function hasWebsite(lead) {
  const w=(lead.website||lead.hasWebsite||'').toLowerCase().trim();
  return w && !['','none','no','null','n/a','-','false'].includes(w) && w!=='no';
}

function statusLabel(s) {
  const map={new:'🔵 New',called:'🟡 Called',callback:'🟠 Callback',interest:'🟢 Interested',closed:'✅ Closed',lost:'🔴 Lost'};
  return map[s]||s;
}

function statusClass(s) {
  const map={new:'b-new',called:'b-called',callback:'b-callback',interest:'b-interest',closed:'b-closed',lost:'b-lost'};
  return map[s]||'b-new';
}

function toast(msg,type='') {
  const t=document.getElementById('toast');
  if(!t) return;
  t.textContent=msg;
  t.className='show '+(type||'');
  clearTimeout(t._t);
  t._t=setTimeout(()=>t.className='',3000);
}

function ago(iso) {
  const d=new Date(iso), now=new Date();
  const s=Math.floor((now-d)/1000);
  if(s<60) return 'just now';
  if(s<3600) return Math.floor(s/60)+'m ago';
  if(s<86400) return Math.floor(s/3600)+'h ago';
  return Math.floor(s/86400)+'d ago';
}

// ── Seed demo data ──
if(!Store.leads().length) {
  [
    {name:'SkinGlow Dermatology',category:'Dermatology Clinic',phone:'+91 98765 43210',address:'12 MG Road, Bangalore',area:'MG Road',city:'Bangalore',rating:'4.5',reviews:'48',website:'',mapsUrl:'https://maps.google.com',source:'dermatology clinic bangalore'},
    {name:'UrbanSmile Dental Care',category:'Dental Clinic',phone:'+91 98765 11111',address:'45 Koramangala 5th Block',area:'Koramangala',city:'Bangalore',rating:'4.2',reviews:'32',website:'',mapsUrl:'https://maps.google.com',source:'dental clinic koramangala'},
    {name:'PrimeVisa Consultants',category:'Visa Consultant',phone:'+91 80 2222 3333',address:'77 Brigade Road',area:'Brigade Road',city:'Bangalore',rating:'4.0',reviews:'19',website:'',mapsUrl:'https://maps.google.com',source:'visa consultant bangalore'},
    {name:'Archi Studio Bengaluru',category:'Architect',phone:'+91 77777 88888',address:'8 HSR Layout Sector 2',area:'HSR Layout',city:'Bangalore',rating:'4.7',reviews:'61',website:'',mapsUrl:'https://maps.google.com',source:'architect bangalore'},
    {name:'LegalEdge Advocates',category:'Law Firm',phone:'+91 99999 00000',address:'23 Jayanagar 4th Block',area:'Jayanagar',city:'Bangalore',rating:'3.9',reviews:'14',website:'',mapsUrl:'https://maps.google.com',source:'law firm bangalore'},
    {name:'GlowUp Salon & Spa',category:'Salon',phone:'+91 88888 12345',address:'101 Indiranagar 100ft Road',area:'Indiranagar',city:'Bangalore',rating:'4.3',reviews:'87',website:'https://glowupsalon.com',mapsUrl:'https://maps.google.com',source:'salon bangalore'},
    {name:'FitLife Yoga Studio',category:'Yoga Studio',phone:'+91 77788 99900',address:'34 JP Nagar Phase 2',area:'JP Nagar',city:'Bangalore',rating:'4.8',reviews:'103',website:'',mapsUrl:'https://maps.google.com',source:'yoga studio bangalore'},
    {name:'TaxPro CA Firm',category:'CA Firm',phone:'+91 90000 11223',address:'56 BTM Layout 2nd Stage',area:'BTM Layout',city:'Bangalore',rating:'4.1',reviews:'27',website:'',mapsUrl:'https://maps.google.com',source:'CA firm bangalore'},
  ].forEach(l=>Store.add(l));
  Store.update(Store.leads()[3].id,{status:'called'});
  Store.update(Store.leads()[0].id,{status:'interest'});
  Store.update(Store.leads()[1].id,{status:'callback',followUp:'Call back Friday 3pm'});
}
