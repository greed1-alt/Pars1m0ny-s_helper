// ---- Точка на карте у события (правка бета-тестеров 17 октября 2026: «API карт, чтобы можно было ставить точку на карту») ----
// Карта открывается в карточке события кнопкой у поля «Место»: нажатие ставит точку (её можно перетащить), «Найти адрес» ищет
// то, что написано в «Месте», «Где я» — по геолокации; пустое «Место» само подписывается адресом точки. Точка — e.geo = [широта, долгота];
// под полем — ссылки «Яндекс Карты» и «Google» (там маршрут).
// Библиотека Leaflet 1.9.4 (vendor/leaflet, лицензия BSD-2; файлы сверены с официальной SHA-256) подгружается только при открытии карты.
// Подложка — OpenStreetMap, поиск адреса — Nominatim (OSM): туда уходят только набранный адрес и координаты точки и только по нажатию.
// Перед открытым запуском — проверить условия OSM для большой нагрузки или перейти на платную подложку (Яндекс, 2ГИС).
const MAP_DEF = [55.7522, 37.6156], MAP_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', NOMI = 'https://nominatim.openstreetmap.org/';
const geoOk = g => Array.isArray(g) && g.length === 2 && g.every(Number.isFinite) && Math.abs(g[0]) <= 90 && Math.abs(g[1]) <= 180;
const geoR = v => Math.round(v * 1e6) / 1e6;
let leafletP = null, mapObj = null, mapPin = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve();
  return leafletP = leafletP || new Promise((res, rej) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'vendor/leaflet/leaflet.css'; document.head.appendChild(css);
    const s = document.createElement('script'); s.src = 'vendor/leaflet/leaflet.js';
    s.onload = () => res(); s.onerror = () => { leafletP = null; s.remove(); rej(new Error('leaflet')); };
    document.head.appendChild(s);
  });
}
// Новая карточка события — старая карта больше не нужна
const mapDrop = () => { if (mapObj) { try { mapObj.remove(); } catch (e) {} } mapObj = mapPin = null; };
const mapOpen = () => { const b = $('#f_map'); return !!(mapObj && b && !b.hidden); };
// Строка под «Местом»: кнопки карты и ссылки на приложения карт
function mapBar() {
  const fe = window._fe, bar = $('#f_mapbar'); if (!bar || !fe) return;
  const g = fe.geo, open = mapOpen();
  bar.innerHTML = (open ? `<button type="button" class="pill sm" data-act="mapfind">${I(IC.search, 14)} Найти адрес</button><button type="button" class="pill sm" data-act="mapme">${I(IC.pin, 14)} Где я</button>` : '')
    + (g ? (open ? `<button type="button" class="pill sm" data-act="mapclr">Убрать точку</button>` : `<span class="f-geo">${I(IC.pin, 14)} Точка на карте</span>`)
      + `<a class="pill sm" href="https://yandex.ru/maps/?pt=${g[1]},${g[0]}&z=17&l=map" target="_blank" rel="noopener">Яндекс Карты</a><a class="pill sm" href="https://www.google.com/maps/search/?api=1&query=${g[0]},${g[1]}" target="_blank" rel="noopener">Google</a>` : '')
    + (open && !g ? `<span class="f-maptip">Нажмите на карту — там будет точка</span>` : '');
  bar.hidden = !bar.innerHTML;
  const b = $('#f_mapb'); if (b) { b.classList.toggle('on', !!g || open); b.setAttribute('aria-expanded', String(open)); }
}
const mapSync = () => { mapPinSet(); if (mapObj && window._fe && window._fe.geo) mapObj.setView(window._fe.geo, Math.max(mapObj.getZoom(), 15)); mapBar(); };
function mapPinSet() {
  const g = window._fe && window._fe.geo; if (!mapObj) return;
  if (!g) { if (mapPin) { mapPin.remove(); mapPin = null; } return; }
  if (mapPin) return mapPin.setLatLng(g);
  mapPin = L.marker(g, { draggable: true, keyboard: false, icon: L.divIcon({ className: 'map-pin', html: '<i></i>', iconSize: [30, 34], iconAnchor: [15, 32] }) }).addTo(mapObj);
  mapPin.on('dragend', () => { const p = mapPin.getLatLng(); mapPut([p.lat, p.lng], true); });
}
function mapPut(g, addr) {
  const fe = window._fe; if (!fe || !geoOk(g)) return;
  fe.geo = [geoR(g[0]), geoR(g[1])]; mapPinSet(); mapBar();
  const loc = $('#f_loc'); if (addr && loc && !loc.value.trim()) mapAddr(fe.geo);   // «Место» пустое — подписать адресом точки
}
// Адрес точки: «улица, дом, город» (или название места)
async function mapAddr(g) {
  const fe = window._fe;   // пока ищется адрес, карточку могли закрыть и открыть другую — в неё чужой адрес не пишем
  try {
    const r = await fetch(`${NOMI}reverse?format=jsonv2&accept-language=ru&zoom=18&lat=${g[0]}&lon=${g[1]}`); if (!r.ok) return;
    const j = await r.json(), a = j.address || {}, road = a.road || a.pedestrian || a.footway || '';
    const s = [j.name && j.name !== road ? j.name : '', [road, a.house_number].filter(Boolean).join(', '), a.city || a.town || a.village || ''].filter(Boolean).join(', ')
      || String(j.display_name || '').split(', ').slice(0, 3).join(', ');
    const loc = $('#f_loc'); if (window._fe === fe && loc && !loc.value.trim() && s) loc.value = s.slice(0, 120);
  } catch (e) {}
}
async function mapFind(quiet) {
  const loc = $('#f_loc'), q = loc ? loc.value.trim() : '';
  if (!q) { if (!quiet) { toast('Напишите адрес или название места в поле «Место»'); if (loc) loc.focus(); } return; }
  try {
    const r = await fetch(`${NOMI}search?format=jsonv2&limit=1&accept-language=ru&q=${encodeURIComponent(q)}`), j = r.ok ? await r.json() : [];
    const g = j && j[0] ? [Number(j[0].lat), Number(j[0].lon)] : null;
    if (!geoOk(g)) { if (!quiet) toast('Не нашёл такой адрес — поставьте точку на карте сами'); return; }
    mapPut(g, false); if (mapObj) mapObj.setView(window._fe.geo, 16);
  } catch (e) { if (!quiet) toast('Поиск адреса не ответил — проверьте интернет'); }
}
ACT.fmap = async () => {
  const box = $('#f_map'), fe = window._fe; if (!box || !fe) return;
  if (!box.hidden) { box.hidden = true; return mapBar(); }
  box.hidden = false; box.classList.add('loading');
  try { await loadLeaflet(); } catch (e) { box.hidden = true; box.classList.remove('loading'); mapBar(); return toast('Карта не загрузилась — проверьте интернет'); }
  if (window._fe !== fe || !box.isConnected) return;   // пока грузилось, карточку закрыли
  box.classList.remove('loading');
  if (!mapObj || mapObj.getContainer() !== box) {
    mapDrop();
    mapObj = L.map(box, { zoomControl: true }).setView(fe.geo || MAP_DEF, fe.geo ? 16 : 10);
    mapObj.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
    L.tileLayer(MAP_TILES, { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }).addTo(mapObj);
    mapObj.on('click', e => mapPut([e.latlng.lat, e.latlng.lng], true));
    mapPinSet();
  }
  setTimeout(() => { if (!mapObj) return; mapObj.invalidateSize(); if (fe.geo) mapObj.setView(fe.geo, Math.max(mapObj.getZoom(), 15)); }, 60);
  mapBar();
  if (!fe.geo && $('#f_loc') && $('#f_loc').value.trim()) mapFind(true);   // адрес уже написан — сразу найти его на карте
};
ACT.mapfind = () => mapFind(false);
ACT.mapme = () => {
  if (!navigator.geolocation) return toast('Геолокация на этом устройстве недоступна');
  navigator.geolocation.getCurrentPosition(p => { mapPut([p.coords.latitude, p.coords.longitude], true); if (mapObj && window._fe.geo) mapObj.setView(window._fe.geo, 16); },
    () => toast('Нет доступа к местоположению — разрешите его в настройках телефона или браузера'), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
};
ACT.mapclr = () => { const fe = window._fe; if (!fe) return; fe.geo = null; mapPinSet(); mapBar(); };
