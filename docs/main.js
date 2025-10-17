const stationSelect = document.getElementById('station');
const nowInfo = document.getElementById('nowInfo');
const linksDiv = document.getElementById('links');
const todayList = document.getElementById('todayList');
const artworkImg = document.getElementById('artwork');
const refreshBtn = document.getElementById('refreshBtn');

async function loadLatest() {
  try {
    const res = await fetch('data/latest.json');
    const json = await res.json();
    return json;
  } catch (e) {
    console.error('loadLatest error', e);
    return null;
  }
}

async function loadToday() {
  const dt = new Date().toISOString().slice(0,10);
  try {
    const res = await fetch(`data/${dt}.json`);
    if (!res.ok) return null;
    return await res.json();
  } catch(e) { return null; }
}

function setNow(station) {
  if (!station) { nowInfo.textContent = 'No data'; linksDiv.innerHTML=''; artworkImg.style.display='none'; return; }
  if (station.artist || station.title) {
    nowInfo.innerHTML = `<strong>${station.title || ''}</strong><div style="color:#666">${station.artist || ''}</div>`;
  } else {
    nowInfo.textContent = station.now || '—';
  }

  if (station.artwork) {
    artworkImg.src = station.artwork;
    artworkImg.style.display = '';
  } else {
    artworkImg.style.display = 'none';
    artworkImg.src = '';
  }

  linksDiv.innerHTML = '';
  if (station.links) {
    // prefer exact links
    const order = ['youtubeExact','youtube','apple','spotify','applemusic'];
    for (const k of order) {
      if (station.links[k]) {
        const a = document.createElement('a');
        a.href = station.links[k]; a.target='_blank'; a.rel='noopener'; a.textContent = k.toUpperCase();
        a.style.marginRight = '8px'; a.style.padding='6px 10px'; a.style.background='#111'; a.style.color='#fff'; a.style.borderRadius='6px'; a.style.textDecoration='none';
        linksDiv.appendChild(a);
      }
    }
  }
}

async function init() {
  nowInfo.textContent = '';
  const latest = await loadLatest();
  console.log('loadLatest ->', latest);
  if (!latest) {
    nowInfo.textContent = 'Failed to load data (check console)';
    console.error('Could not load data/latest.json; make sure you are serving the `docs/` folder over HTTP (e.g. `npm run start`)');
    return;
  }
  const today = await loadToday();
  const stations = Array.isArray(latest.stations) ? latest.stations : [];
  stationSelect.innerHTML = '';
  stations.forEach(s => {
    const opt = document.createElement('option'); opt.value = s.id; opt.textContent = s.name; stationSelect.appendChild(opt);
  });
  stationSelect.addEventListener('change', () => {
    const id = stationSelect.value;
    const s = stations.find(x => x.id === id);
    setNow(s);
  });
  if (stations.length) {
    // select the first station and display it
    stationSelect.value = stations[0].id;
    setNow(stations[0]);
  } else {
    nowInfo.textContent = 'No station data available';
  }

  // wire refresh button
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      refreshBtn.textContent = 'Refreshing...';
      try {
        await init();
      } finally {
        refreshBtn.disabled = false;
        refreshBtn.textContent = 'Refresh';
      }
    });
  }

  todayList.innerHTML = '';
  if (today && today.items) {
    today.items.forEach(it => {
      const li = document.createElement('li');
      const title = document.createElement('div');
      if (it.artist && it.title) title.textContent = `${it.stationName}: ${it.title} — ${it.artist}`;
      else title.textContent = `${it.stationName}: ${it.now || ''}`;
      const linkRow = document.createElement('div');
      for (const [k,v] of Object.entries(it.links||{})) {
        const a = document.createElement('a'); a.href = v; a.target='_blank'; a.rel='noopener'; a.textContent = k; a.style.marginRight='8px'; linkRow.appendChild(a);
      }
      if (it.artwork) {
        const img = document.createElement('img'); img.src = it.artwork; img.style.width='48px'; img.style.height='48px'; img.style.objectFit='cover'; img.style.borderRadius='4px'; img.style.marginRight='8px'; li.appendChild(img);
      }
      li.appendChild(title); li.appendChild(linkRow); todayList.appendChild(li);
    });
  } else {
    todayList.innerHTML = '<li>No songs yet for today</li>';
  }
}

init();
