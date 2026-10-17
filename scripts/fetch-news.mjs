// Codzienne News: nowe badania z PubMed i wpisy z Instytutu Aromaterapii.
// Uruchamia je GitHub Actions (.github/workflows/site.yml). Node 20+, bez zewnętrznych bibliotek.
//
// Co robi:
//  1. pobiera z PubMed najnowsze publikacje na tematy z listy TOPICS,
//  2. pobiera nowe wpisy z kanału RSS https://www.instytutaroma.pl/feed/,
//  3. (jeśli jest klucz ANTHROPIC_API_KEY) prosi Claude o streszczenie po polsku,
//  4. dopisuje wynik do news.json, który wyświetla zakładka News.
//
// Do news.json trafiają tylko: tytuł, link, data, czasopismo, autorzy i NASZE streszczenie po polsku.
// Oryginalnych streszczeń ani tekstów artykułów nie kopiujemy do repozytorium.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const OUT = new URL('../news.json', import.meta.url);
const EU = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/';
const FEED = 'https://www.instytutaroma.pl/feed/';
const UA = 'aroma-crm-news/1.0 (private learning tool)';
const KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';
const KEEP_DAYS = 90;
const PUBMED_PER_DAY = 6;
const INSTYTUT_PER_DAY = 2;
const INSTYTUT_FIRST_RUN = 5;

export const TOPICS = [
  { k: 'aroma', q: 'aromatherapy[Title/Abstract]' },
  { k: 'eo', q: '"essential oil"[Title/Abstract] OR "essential oils"[Title/Abstract]' },
  { k: 'tea', q: '"tea tree oil"[Title/Abstract] OR "Melaleuca alternifolia"[Title/Abstract]' },
  { k: 'sleep', q: '(aromatherapy[Title/Abstract] OR lavender[Title/Abstract]) AND (sleep[Title/Abstract] OR anxiety[Title/Abstract] OR stress[Title/Abstract])' },
  { k: 'skin', q: '("essential oil"[Title/Abstract] OR aromatherapy[Title/Abstract]) AND (skin[Title/Abstract] OR dermatitis[Title/Abstract] OR acne[Title/Abstract])' },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
export const todayWarsaw = (d = new Date()) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

/* ---------- XML / HTML pomocnicze ---------- */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…' };
export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    const v = ENT[e.toLowerCase()];
    return v === undefined ? m : v;
  });
}
export const stripTags = s =>
  decodeEntities(String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const tag = (xml, name) => {
  const m = String(xml || '').match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? m[1] : '';
};

/* ---------- PubMed ---------- */
const PT_PL = {
  'Randomized Controlled Trial': 'badanie RCT',
  'Systematic Review': 'przegląd systematyczny',
  'Meta-Analysis': 'metaanaliza',
  'Review': 'przegląd',
  'Clinical Trial': 'badanie kliniczne',
};
const EN_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function parsePubmedXml(xml) {
  const out = [];
  for (const art of String(xml).match(/<PubmedArticle[\s>][\s\S]*?<\/PubmedArticle>/g) || []) {
    const pmid = stripTags(tag(tag(art, 'MedlineCitation'), 'PMID'));
    if (!pmid) continue;
    const dateBlock = tag(art, 'ArticleDate') || tag(art, 'PubDate');
    const y = stripTags(tag(dateBlock, 'Year'));
    const moRaw = stripTags(tag(dateBlock, 'Month'));
    const d = stripTags(tag(dateBlock, 'Day'));
    const mi = /^\d+$/.test(moRaw) ? +moRaw - 1 : EN_MON.indexOf(moRaw.slice(0, 3));
    let date = y ? [y, mi >= 0 ? String(mi + 1).padStart(2, '0') : '', mi >= 0 && d ? d.padStart(2, '0') : ''].filter(Boolean).join('-') : stripTags(tag(dateBlock, 'MedlineDate'));
    const abs = [];
    for (const m of art.matchAll(/<AbstractText([^>]*)>([\s\S]*?)<\/AbstractText>/g)) {
      const label = (m[1].match(/Label="([^"]*)"/) || [])[1];
      abs.push((label ? label + ': ' : '') + stripTags(m[2]));
    }
    const authors = [];
    let nAuth = 0;
    for (const m of art.matchAll(/<Author[\s>][\s\S]*?<\/Author>/g)) {
      nAuth++;
      const ln = stripTags(tag(m[0], 'LastName'));
      if (ln && authors.length < 3) authors.push((ln + ' ' + stripTags(tag(m[0], 'Initials'))).trim());
    }
    const types = [];
    for (const m of art.matchAll(/<PublicationType[^>]*>([\s\S]*?)<\/PublicationType>/g)) {
      const p = PT_PL[stripTags(m[1])];
      if (p && !types.includes(p)) types.push(p);
    }
    out.push({
      id: 'pm:' + pmid,
      source: 'pubmed',
      title: stripTags(tag(art, 'ArticleTitle')).replace(/\.$/, ''),
      journal: stripTags(tag(art, 'ISOAbbreviation')) || stripTags(tag(tag(art, 'Journal'), 'Title')),
      date,
      authors: authors.join(', ') + (nAuth > 3 ? ' i in.' : ''),
      types,
      abstract: abs.join('\n'),
      link: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    });
  }
  return out;
}

async function getText(url, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA, accept: '*/*' }, signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error(`HTTP ${r.status} dla ${url.split('?')[0]}`);
      return await r.text();
    } catch (e) {
      last = e;
      await sleep(1500 * (i + 1));
    }
  }
  throw last;
}

async function pubmedCandidates(known) {
  const byTopic = [];
  let failures = 0;
  for (const T of TOPICS) {
    try {
      const url = `${EU}esearch.fcgi?db=pubmed&retmode=json&retmax=15&sort=date&datetype=edat&reldate=7&tool=aroma-crm&term=${encodeURIComponent(T.q)}`;
      const j = JSON.parse(await getText(url));
      const ids = ((j.esearchresult || {}).idlist || []).filter(id => !known.has('pm:' + id));
      await sleep(400);
      if (!ids.length) { byTopic.push({ k: T.k, items: [] }); continue; }
      const xml = await getText(`${EU}efetch.fcgi?db=pubmed&retmode=xml&tool=aroma-crm&id=${ids.join(',')}`);
      await sleep(400);
      byTopic.push({ k: T.k, items: parsePubmedXml(xml).map(a => ({ ...a, topic: T.k })) });
    } catch (e) {
      failures++;
      console.warn(`PubMed, temat ${T.k}: ${e.message}`);
    }
  }
  return { byTopic, failures };
}

const score = a => (a.abstract ? 2 : 0) + (a.types.some(t => /przegląd|metaanaliza|RCT/.test(t)) ? 1 : 0);
export function selectPubmed(byTopic, n) {
  const seen = new Set();
  const lists = byTopic.map(t =>
    t.items
      .filter(a => a.abstract && a.abstract.length >= 200)
      .filter(a => (seen.has(a.id) ? false : (seen.add(a.id), true)))
      .sort((a, b) => score(b) - score(a))
  );
  const out = [];
  for (let round = 0; out.length < n; round++) {
    let any = false;
    for (const l of lists) {
      if (l[round]) { any = true; if (out.length < n) out.push(l[round]); }
    }
    if (!any) break;
  }
  return out;
}

/* ---------- Instytut Aromaterapii (RSS) ---------- */
export function parseRss(xml) {
  const items = [];
  for (const it of String(xml).match(/<item>[\s\S]*?<\/item>/g) || []) {
    const title = stripTags(tag(it, 'title'));
    const link = stripTags(tag(it, 'link'));
    if (!title || !link) continue;
    const dt = new Date(stripTags(tag(it, 'pubDate')));
    const excerpt = stripTags(tag(it, 'description')).replace(/\s*Czytaj dalej.*$/i, '').trim();
    items.push({
      id: 'ia:' + link.replace(/^https?:\/\/[^/]+\//, '').replace(/\/$/, ''),
      source: 'instytut',
      title,
      link,
      date: isNaN(dt) ? '' : dt.toISOString().slice(0, 10),
      excerpt: clip(excerpt, 500),
    });
  }
  return items;
}
async function instytutNew(known, first) {
  const items = parseRss(await getText(FEED)).filter(a => !known.has(a.id));
  return items.slice(0, first ? INSTYTUT_FIRST_RUN : INSTYTUT_PER_DAY);
}

/* ---------- Streszczenia po polsku (Claude API) ---------- */
export function buildPrompt(items) {
  const list = items.map(a => ({
    id: a.id,
    zrodlo: a.source === 'pubmed' ? 'PubMed' : 'Instytut Aromaterapii',
    tytul: a.title,
    czasopismo: a.journal || '',
    streszczenie: clip(a.source === 'pubmed' ? a.abstract : a.excerpt, 2200),
  }));
  return `Przygotuj po polsku materiał do nauki dla aromaterapeutki, która doradza w zakresie olejków eterycznych. Dla każdego z poniższych artykułów zwróć obiekt JSON z polami:
- id (bez zmian),
- titlePl (tytuł po polsku; jeśli tytuł jest już po polsku, przepisz go bez zmian),
- summaryPl (2 do 4 zdań: czego dotyczył artykuł, jaka była metoda i główny wynik; własnymi słowami, wyłącznie na podstawie podanego streszczenia),
- takeaway (1 do 2 zdań ostrożnej wskazówki dla praktyki; gdy badanie jest wstępne, laboratoryjne, na zwierzętach albo na małej grupie, napisz to jako ograniczenie).
Zasady: nie dodawaj faktów spoza streszczenia, nie obiecuj efektów zdrowotnych, nie formułuj zaleceń leczenia, pisz prostym językiem, nazwy łacińskie zostaw bez zmian.
Odpowiedz wyłącznie poprawną tablicą JSON, bez komentarzy i bez bloków kodu.

Artykuły:
${JSON.stringify(list, null, 1)}`;
}
async function claude(prompt) {
  let last;
  for (const model of [...new Set([MODEL, 'claude-sonnet-5-5'])]) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 4000, messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(120000),
    });
    const body = await r.text();
    if (r.ok) return (JSON.parse(body).content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    last = new Error(`Claude API ${r.status} (model ${model}): ${body.slice(0, 300)}`);
    if (r.status !== 400 && r.status !== 404) break; // zły model: próbujemy następnego; inne błędy kończą
  }
  throw last;
}
export function parseJsonArray(text) {
  const s = text.indexOf('['), e = text.lastIndexOf(']');
  if (s < 0 || e <= s) throw new Error('Odpowiedź nie zawiera tablicy JSON');
  return JSON.parse(text.slice(s, e + 1));
}
export function applySummaries(items, results) {
  const byId = new Map(items.map(a => [a.id, a]));
  let n = 0;
  for (const r of Array.isArray(results) ? results : []) {
    const a = r && byId.get(r.id);
    if (!a || typeof r.summaryPl !== 'string' || !r.summaryPl.trim()) continue;
    a.summaryPl = clip(r.summaryPl, 900);
    if (typeof r.titlePl === 'string' && r.titlePl.trim()) a.titlePl = clip(r.titlePl, 300);
    if (typeof r.takeaway === 'string' && r.takeaway.trim()) a.takeaway = clip(r.takeaway, 600);
    n++;
  }
  return n;
}

/* ---------- Główna część ---------- */
export function mergeItems(existing, fresh, today, keepDays = KEEP_DAYS) {
  const cut = new Date(today); cut.setDate(cut.getDate() - keepDays);
  const cutoff = todayWarsaw(cut);
  const seen = new Set();
  return [...fresh, ...existing]
    .filter(a => (seen.has(a.id) ? false : (seen.add(a.id), true)))
    .filter(a => (a.addedAt || '') >= cutoff)
    .sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || '') || (b.date || '').localeCompare(a.date || ''));
}
const publicItem = ({ abstract, excerpt, ...rest }) => rest; // nie zapisujemy cudzych streszczeń

export async function main() {
  const today = todayWarsaw();
  let data = { updatedAt: null, items: [] };
  try { data = JSON.parse(await readFile(OUT, 'utf8')); } catch { /* pierwszy start */ }
  const known = new Set(data.items.map(a => a.id));

  let pubmed = [], inst = [], okPub = false, okInst = false;
  try {
    const { byTopic, failures } = await pubmedCandidates(known);
    okPub = failures < TOPICS.length;
    pubmed = selectPubmed(byTopic, PUBMED_PER_DAY);
  } catch (e) { console.error('PubMed:', e.message); }
  try { inst = await instytutNew(known, data.items.length === 0); okInst = true; }
  catch (e) { console.error('Instytut Aromaterapii:', e.message); }

  if (!okPub && !okInst) { console.error('Oba źródła są niedostępne, kończę bez zmian.'); process.exitCode = 1; return; }

  const fresh = [...pubmed, ...inst].map(a => ({ ...a, addedAt: today }));
  console.log(`Nowe: PubMed ${pubmed.length}, Instytut ${inst.length}.`);
  if (KEY && fresh.length) {
    let n = 0;
    for (let i = 0; i < fresh.length; i += 3) {
      const batch = fresh.slice(i, i + 3);
      let txt = '';
      try {
        txt = await claude(buildPrompt(batch));
        n += applySummaries(batch, parseJsonArray(txt));
      } catch (e) {
        console.error(`Streszczenia po polsku (porcja ${i / 3 + 1}) nie powstały:`, e.message, '| początek odpowiedzi:', JSON.stringify(txt.slice(0, 200)));
      }
    }
    console.log(`Streszczenia po polsku: ${n} z ${fresh.length}.`);
  } else if (!KEY) {
    console.log('Brak ANTHROPIC_API_KEY: zapisuję bez streszczeń po polsku.');
  }

  const items = mergeItems(data.items, fresh.map(publicItem), today);
  await writeFile(OUT, JSON.stringify({ updatedAt: new Date().toISOString(), items }, null, 1) + '\n');
  console.log(`Zapisano news.json: ${items.length} pozycji.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
