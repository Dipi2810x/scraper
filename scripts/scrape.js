#!/usr/bin/env node
// Scraper for KFM on radio-south-africa.co.za using Puppeteer
// Outputs JSON files: docs/data/latest.json, docs/data/kfm.json, and YYYY-MM-DD.json

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const fetch = require('node-fetch');

const OUT_DIR = path.join(__dirname, '..', 'docs', 'data');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const STATIONS = [
  {
    id: 'kfm',
    name: 'KFM',
    url: 'https://www.radio-south-africa.co.za/kfm',
  },
];

// ---------- Helper Functions ----------

function normalize(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

function buildLinks(query) {
  const q = encodeURIComponent(query || '');
  return {
    youtubeSearch: `https://www.youtube.com/results?search_query=${q}`,
    spotifySearch: `https://open.spotify.com/search/${q}`,
    appleMusicSearch: `https://music.apple.com/search?term=${q}`,
  };
}

async function queryITunes(term) {
  if (!term) return null;
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&limit=1`;
    const res = await fetch(url, { timeout: 10000 });
    const j = await res.json();
    if (j && j.resultCount && j.results?.length) {
      const r = j.results[0];
      return {
        artwork: r.artworkUrl100
          ? r.artworkUrl100.replace(/100x100bb.jpg$/, '600x600bb.jpg')
          : null,
        itunesUrl: r.trackViewUrl || r.collectionViewUrl || r.artistViewUrl || null,
        artistName: r.artistName || null,
        trackName: r.trackName || null,
      };
    }
  } catch (e) {
    console.error('iTunes lookup failed:', e.message);
  }
  return null;
}

async function youtubeFirstVideo(term) {
  if (!term) return null;
  try {
    const res = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(term)}`
    );
    const text = await res.text();
    const m = text.match(/"videoId":"([^"]+)"/);
    if (m && m[1]) return `https://www.youtube.com/watch?v=${m[1]}`;
    const m2 = text.match(/watch\\?v=([^"'&<>\s]+)/);
    if (m2 && m2[1]) return `https://www.youtube.com/watch?v=${m2[1]}`;
  } catch (e) {
    console.error('YouTube search failed:', e.message);
  }
  return null;
}

// ---------- Puppeteer Scraper ----------

async function scrapeKFM(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('https://www.radio-south-africa.co.za/kfm', {
      waitUntil: 'networkidle2',
      timeout: 20000,
    });

    const now = normalize(await page.$eval('.latest-song', el => el?.innerText || '').catch(() => ''));
    const artist = normalize(await page.$eval('.latest-song .artist-name', el => el?.innerText || '').catch(() => ''));
    const title = normalize(await page.$eval('.latest-song .song-name', el => el?.innerText || '').catch(() => ''));

    const artwork = await page
      .$eval('#player_image', el => el?.getAttribute('src'))
      .catch(async () => await page.$eval('#player_image_background', el => el?.getAttribute('src')).catch(() => ''));

    await page.close();

    let artistVal = artist;
    let titleVal = title;
    let raw = now;

    // Handle fallback formats
    if ((!artistVal || !titleVal) && raw.includes(' - ')) {
      const [a, ...rest] = raw.split(' - ');
      artistVal ||= normalize(a);
      titleVal ||= normalize(rest.join(' - '));
    } else if ((!artistVal || !titleVal) && raw.includes(' by ')) {
      const m = raw.match(/(.+) by (.+)/i);
      if (m) {
        titleVal ||= normalize(m[1]);
        artistVal ||= normalize(m[2]);
      }
    }

    const lookup = artistVal && titleVal ? `${artistVal} ${titleVal}` : raw || 'KFM';
    const it = await queryITunes(lookup);
    const yt = await youtubeFirstVideo(lookup);

    const links = buildLinks(lookup);
    if (it?.itunesUrl) links.apple = it.itunesUrl;
    if (yt) links.youtubeExact = yt;

    return {
      id: 'kfm',
      name: 'KFM',
      url: 'https://www.radio-south-africa.co.za/kfm',
      now: raw,
      artist: artistVal || null,
      title: titleVal || null,
      artwork: artwork || it?.artwork || null,
      links,
      scrapedAt: new Date().toISOString(),
    };
  } catch (err) {
    await page.close().catch(() => {});
    return {
      id: 'kfm',
      name: 'KFM',
      url: 'https://www.radio-south-africa.co.za/kfm',
      now: '',
      error: String(err),
      scrapedAt: new Date().toISOString(),
    };
  }
}

// ---------- Main Runner ----------

async function run() {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true,
  });

  try {
    const results = [];
    for (const s of STATIONS) {
      if (s.id === 'kfm') {
        results.push(await scrapeKFM(browser));
      }
    }

    const dateKey = new Date().toISOString().slice(0, 10);
    const todayPath = path.join(OUT_DIR, `${dateKey}.json`);
    const latestPath = path.join(OUT_DIR, 'latest.json');

    let today = { date: dateKey, items: [] };
    if (fs.existsSync(todayPath)) {
      try {
        today = JSON.parse(fs.readFileSync(todayPath, 'utf8'));
      } catch {
        today = { date: dateKey, items: [] };
      }
    }

    for (const r of results) {
      const isPromo = s =>
        /listen to .*live|radio-south-africa|best South African radio/i.test(s || '');
      const hasArtistTitle = r.artist && r.title;

      if (hasArtistTitle) {
        const exists = today.items.find(
          i => i.stationId === r.id && i.artist === r.artist && i.title === r.title
        );
        if (!exists)
          today.items.push({
            stationId: r.id,
            stationName: r.name,
            artist: r.artist,
            title: r.title,
            links: r.links,
            artwork: r.artwork,
            firstSeen: r.scrapedAt,
          });
      } else if (r.now && !isPromo(r.now)) {
        const exists = today.items.find(i => i.stationId === r.id && i.now === r.now);
        if (!exists)
          today.items.push({
            stationId: r.id,
            stationName: r.name,
            now: r.now,
            links: r.links,
            artwork: r.artwork,
            firstSeen: r.scrapedAt,
          });
      }

      // Write per-station JSON
      fs.writeFileSync(
        path.join(OUT_DIR, `${r.id}.json`),
        JSON.stringify(r, null, 2),
        'utf8'
      );
    }

    fs.writeFileSync(todayPath, JSON.stringify(today, null, 2), 'utf8');
    fs.writeFileSync(
      latestPath,
      JSON.stringify({ date: dateKey, stations: results }, null, 2),
      'utf8'
    );

    console.log('✅ Scrape complete', { date: dateKey });
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error('Fatal scrape error:', err);
  process.exit(1);
});
