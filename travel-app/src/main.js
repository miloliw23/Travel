import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

// Leaflet CSS (地圖樣式)
import 'leaflet/dist/leaflet.css'

// 🚑 修復圖標路徑錯誤
// 舊的寫法 (src/...) 是錯誤的，請改用下面的正確引用方式：
import '@phosphor-icons/web/bold'
import '@phosphor-icons/web/duotone'
import '@phosphor-icons/web/fill'
// 如果需要一般細體圖標，可以再加一行： import '@phosphor-icons/web/regular'

// 🚑 修復 Leaflet 在 Vite 環境下預設圖標遺失的問題
import L from 'leaflet'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
})

createApp(App).mount('#app')