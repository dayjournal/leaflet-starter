//デフォルトアイコンパス
L.Icon.Default.imagePath = 'img/icon/';

//MIERUNE Color読み込み
const m_color = new L.tileLayer('https://tile.mierune.co.jp/mierune/{z}/{x}/{y}.png', {
    attribution: "Maptiles by <a href='http://mierune.co.jp/' target='_blank'>MIERUNE</a>, under CC BY. Data by <a href='http://osm.org/copyright' target='_blank'>OpenStreetMap</a> contributors, under ODbL."
});

//MIERUNE MONO読み込み
const m_mono = new L.tileLayer('https://tile.mierune.co.jp/mierune_mono/{z}/{x}/{y}.png', {
    attribution: "Maptiles by <a href='http://mierune.co.jp/' target='_blank'>MIERUNE</a>, under CC BY. Data by <a href='http://osm.org/copyright' target='_blank'>OpenStreetMap</a> contributors, under ODbL."
});

//経緯度設定
const lat = 35.681;
const lng = 139.763;

//MAP読み込み
const map = L.map('map', {
    center: [lat, lng],
    zoom: 14,
    zoomControl: true,
    layers: [m_mono]
});

//背景レイヤ
const Map_BaseLayer = {
    "MIERUNE Color": m_color,
    "MIERUNE MONO": m_mono
};

//レイヤ設定
L.control.layers(
    Map_BaseLayer,
    null
).addTo(map);

//スケール設定
L.control.scale({
    imperial: false,
    maxWidth: 300
}).addTo(map);
