import './style.css';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Leaflet builds its default marker/control icon URLs at runtime, so Vite
// cannot bundle them; they are served from public/img/icon/ (a copy of
// leaflet/dist/images — keep it in sync when bumping Leaflet). The path is
// deliberately relative so it also resolves under the GitHub Pages base
// (/leaflet-starter/).
L.Icon.Default.imagePath = 'img/icon/';

const mieruneMono = L.tileLayer('https://tile.mierune.co.jp/mierune_mono/{z}/{x}/{y}.png', {
    attribution:
        "Maptiles by <a href='https://mierune.co.jp/' target='_blank'>MIERUNE</a>, under CC BY. Data by <a href='https://osm.org/copyright' target='_blank'>OpenStreetMap</a> contributors, under ODbL.",
});

const map = L.map('map', {
    center: [35.681, 139.767],
    zoom: 11,
    zoomControl: true,
    layers: [mieruneMono],
});

L.control
    .scale({
        imperial: false,
        maxWidth: 300,
    })
    .addTo(map);
