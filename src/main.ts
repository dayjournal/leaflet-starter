import './style.css';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Leaflet builds its default marker/control icon URLs at runtime, so Vite
// cannot bundle them; they are served from public/img/icon/ (leaflet's
// dist/images, re-encoded as RGBA — same artwork, different bytes). The path
// is deliberately relative so it also resolves under the GitHub Pages base
// (/leaflet-starter/).
L.Icon.Default.imagePath = 'img/icon/';

const mieruneMono = L.tileLayer('https://tile.mierune.co.jp/mierune_mono/{z}/{x}/{y}.png', {
    attribution:
        '<a href="https://mierune.co.jp">MIERUNE Inc.</a> <a href="https://www.openmaptiles.org/" target="_blank">&copy; OpenMapTiles</a> <a href="https://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap contributors</a>',
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
