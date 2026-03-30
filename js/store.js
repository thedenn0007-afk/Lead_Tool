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
      toast('No CSV data received', 'err');
      return { imported: 0, skipped: 0 };
    }

    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      toast('CSV must include header and at least one row', 'err');
      return { imported: 0, skipped: 0 };
    }

    const firstLine = lines[0];
    const dataLine = lines[1] || lines[0];
    const SEP = ((dataLine.match(/\t/g) || []).length >= (dataLine.match(/,/g) || []).length) ? '\t' : ',';

    function parseCSVLine(line, sep) {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        const next = line[i + 1];
        if (char === '"' && !inQuotes) inQuotes = true;
        else if (char === '"' && inQuotes && next === '"') { current += '"'; i += 1; }
        else if (char === '"' && inQuotes) inQuotes = false;
        else if (char === sep && !inQuotes) { result.push(current.trim()); current = ''; }
        else current += char;
      }
      result.push(current.trim());
      return result;
    }

    const headers = parseCSVLine(firstLine, SEP).map((h) => h.replace(/^"|"$/g, '').trim());
    function findCol(row, ...names) {
      for (const name of names) {
        const idx = headers.findIndex((h) => h.toLowerCase().replace(/\s/g, '').includes(name.toLowerCase().replace(/\s/g, '')));
        if (idx !== -1) return row[idx] || '';
      }
      return '';
    }

    const firstDataRow = parseCSVLine(lines[1], SEP);
    const instantMode = (firstDataRow[0] || '').includes('google.com/maps') || (firstDataRow[0] || '').includes('/maps/place/');
    const toAdd = [];

    for (let i = 1; i < lines.length; i += 1) {
      if (!lines[i].trim()) continue;
      const row = parseCSVLine(lines[i], SEP);
      let lead = {};

      if (instantMode) {
        lead = {
          name: (row[1] || '').split('|')[0].trim(),
          category: row[4] || '',
          phone: row[10] || '',
          address: row[6] || '',
          area: '',
          city: '',
          rating: row[2] || '',
          reviews: String(Math.abs(parseInt(row[3], 10) || 0)),
          website: (row[11] || '').startsWith('http') ? row[11] : '',
          hasWebsite: (row[11] || '').startsWith('http') ? 'YES' : 'NO',
          mapsUrl: row[0] || '',
          hours: row[8] || '',
          source: 'Instant Data Scraper',
        };

        if (lead.address) {
          const parts = lead.address.split(',').map((p) => p.trim()).filter(Boolean);
          if (parts.length >= 2) {
            lead.area = parts[parts.length - 2] || '';
            lead.city = parts[parts.length - 1] || '';
          }
        }
      } else {
        lead = {
          name: findCol(row, 'title', 'name', 'businessname', 'business name'),
          category: findCol(row, 'category', 'type'),
          phone: findCol(row, 'phone', 'phonenumber', 'phone number'),
          address: findCol(row, 'address', 'street'),
          area: findCol(row, 'area', 'neighborhood', 'locality'),
          city: findCol(row, 'city'),
          rating: findCol(row, 'rating', 'totalscore'),
          reviews: findCol(row, 'reviews', 'reviewscount', 'review count'),
          website: findCol(row, 'website'),
          hasWebsite: findCol(row, 'website') ? 'YES' : 'NO',
          mapsUrl: findCol(row, 'url', 'mapsurl', 'maps url', 'maps link'),
          source: 'CSV Import',
        };
      }

      if (!lead.name || lead.name.length < 2) continue;

      lead.id = Date.now().toString(36) + Math.random().toString(36).slice(2) + i;
      lead.addedAt = new Date().toISOString();
      lead.status = 'new';
      lead.notes = [];
      lead.followUp = '';
      toAdd.push(lead);
    }

    if (!toAdd.length) {
      toast('No valid lead rows found in CSV', 'err');
      return { imported: 0, skipped: 0 };
    }

    try {
      let savedLeads = [];
      let skipped = 0;
      let finalLeads = [];

      if (mode === 'replace') {
        savedLeads = toAdd;
        finalLeads = [...savedLeads];
      } else {
        const existing = this.leads();
        const existingNames = new Set(existing.map((l) => (l.name || '').toLowerCase().trim()));
        savedLeads = toAdd.filter((l) => !existingNames.has(l.name.toLowerCase().trim()));
        skipped = toAdd.length - savedLeads.length;
        finalLeads = [...existing, ...savedLeads];
      }

      if (savedLeads.length) {
        const batchLabel = savedLeads[0]?.source || 'Import';
        const batchSource = instantMode ? 'Instant Data Scraper' : 'CSV Import';
        const batchId = Date.now().toString(36);
        savedLeads.forEach((l) => { l.batchId = batchId; });
        const batches = JSON.parse(localStorage.getItem('lt_batches') || '[]');
        batches.unshift({
          id: batchId,
          name: batchLabel,
          source: batchSource,
          query: batchLabel,
          count: savedLeads.length,
          noWebsite: savedLeads.filter((l) => l.hasWebsite === 'NO').length,
          createdAt: new Date().toISOString(),
          leadIds: savedLeads.map((l) => l.id),
        });
        localStorage.setItem('lt_batches', JSON.stringify(batches));
      }
      localStorage.setItem('lt_leads', JSON.stringify(finalLeads));

      return { imported: savedLeads.length, skipped };
    } catch (e) {
      if (e.name === 'QuotaExceededError') toast('Storage full. Export and clear old data, then retry.', 'err');
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

// Seed demo data
if (!Store.leads().length && window.location.search.includes('demo=1')) {
  [{name:'SkinGlow Dermatology',category:'Dermatology Clinic',phone:'+91 98765 43210',address:'12 MG Road, Bangalore',area:'MG Road',city:'Bangalore',rating:'4.5',reviews:'48',website:'',mapsUrl:'https://maps.google.com',source:'demo'}].forEach((l) => Store.add(l));
}
