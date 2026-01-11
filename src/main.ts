import './style.css'
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

L.Icon.Default.imagePath = 'img/icon/';

const m_mono = L.tileLayer('https://tile.mierune.co.jp/mierune_mono/{z}/{x}/{y}.png', {
    attribution: "Maptiles by <a href='https://mierune.co.jp/' target='_blank'>MIERUNE</a>, under CC BY. Data by <a href='https://osm.org/copyright' target='_blank'>OpenStreetMap</a> contributors, under ODbL."
});

const map = L.map('map', {
    center: [35.681, 139.767],
    zoom: 11,
    zoomControl: true,
    layers: [m_mono]
});

L.control.scale({
    imperial: false,
    maxWidth: 300
}).addTo(map);
