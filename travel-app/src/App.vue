<script setup>
import { ref, computed, watch, onMounted, nextTick, reactive } from 'vue'
import L from 'leaflet'

// --- 狀態定義 ---
const viewMode = ref('plan')
const currentDayIdx = ref(0)
const showTripMenu = ref(false)
const tripList = ref([])
const currentTripId = ref(null)
const showSetupModal = ref(false)

const days = ref([])
const expenses = ref([])
const participants = ref(['我', '旅伴A'])
const exchangeRate = ref(0.215)
const newExpense = ref({ item: '', amount: '', payer: '我' })

const isMapLoading = ref(false)
const userLocation = ref(null)
const setup = ref({ destination: 'Tokyo', currency: 'JPY', startDate: new Date().toISOString().split('T')[0], days: 5 })
let mapInstance = null
let userMarker = null
let geoWatchId = null

const recommendationsMap = reactive({})
const isSearchingRecs = ref(false)
const searchTargetIndex = ref('')

// --- Computed ---
const currentDay = computed(() => days.value[currentDayIdx.value] || { items: [] })
const totalExpense = computed(() => expenses.value.reduce((sum, item) => sum + item.amount, 0))
const currencyLabel = computed(() => setup.value.currency || '外幣')
const currencySymbol = computed(() => {
  const map = { 'JPY': '¥', 'CNY': '¥', 'USD': '$', 'EUR': '€', 'KRW': '₩', 'GBP': '£', 'TWD': 'NT$', 'HKD': 'HK$', 'THB': '฿', 'VND': '₫' }
  return map[setup.value.currency] || '$'
})
const weatherDisplay = computed(() => ({ temp: '18°C', icon: 'ph-cloud-sun', label: setup.value.destination + ' (預報)' }))

// --- Helpers ---
const getTimePeriod = (t) => { if(!t) return '時間'; const h=parseInt(t.split(':')[0]); return h<5?'凌晨':h<11?'上午':h<14?'中午':h<18?'下午':'晚上'; }

// 🔴 顏色邏輯更新：金黃色為主調
const getDotColor = (t) => {
    switch(t) { 
        case 'food': return 'bg-secondary border-secondary/30' // 美食改用深青色
        case 'shop': return 'bg-accent-light border-accent/30' // 購物用胭脂紅
        case 'transport': return 'bg-blue-500 border-blue-300' 
        default: return 'bg-primary border-primary/30' // 景點用主色(金黃)
    }
}

const updateDate = (e, day) => {
    const val = e.target.value; if(!val) return;
    day.fullDate = val; const d = new Date(val);
    const mm = d.getMonth()+1; const dd = d.getDate();
    day.date = `${mm}/${dd}`; day.shortDate = `${mm}/${dd}`;
}

// --- Actions ---
const addItem = () => currentDay.value.items.push({ time: '', type: 'spot', activity: '', location: '' })
const removeItem = (idx) => currentDay.value.items.splice(idx, 1)
const addDay = () => days.value.push({ date: `Day ${days.value.length+1}`, shortDate: `D${days.value.length+1}`, items: [] })
const addExpense = () => { if(newExpense.value.item && newExpense.value.amount) { expenses.value.unshift({...newExpense.value}); newExpense.value.item=''; newExpense.value.amount=''; }}
const removeExpense = (idx) => expenses.value.splice(idx, 1)

const fetchCoordsForItem = async (item) => {
    if(!item.location || item.lat) return;
    try { const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(item.location)}&limit=1`); const data = await res.json(); if(data?.[0]) { item.lat = parseFloat(data[0].lat); item.lon = parseFloat(data[0].lon); }} catch(e) {}
}

const initMap = async () => { 
    isMapLoading.value = true; await nextTick(); if (!document.getElementById('map')) return;
    if (mapInstance) { mapInstance.off(); mapInstance.remove(); mapInstance = null; }
    mapInstance = L.map('map').setView([35.6895, 139.6917], 13);
    // 使用 CARTO Voyager (淺色質感圖資)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { attribution: '©CARTO' }).addTo(mapInstance);
    if ("geolocation" in navigator) {
            if (geoWatchId) navigator.geolocation.clearWatch(geoWatchId);
            geoWatchId = navigator.geolocation.watchPosition(pos => {
                userLocation.value = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                const icon = L.divIcon({ className: 'custom-div-icon', html: "<div class='gps-pulse'></div>", iconSize: [14, 14] });
                if (userMarker) userMarker.setLatLng(userLocation.value); else userMarker = L.marker(userLocation.value, { icon: icon }).addTo(mapInstance);
            }, null, { enableHighAccuracy: true });
    }
    const items = currentDay.value.items.filter(i => i.lat);
    if(items.length){ const bounds = L.latLngBounds(); items.forEach(i => { L.marker([i.lat, i.lon]).addTo(mapInstance).bindPopup(i.activity); bounds.extend([i.lat, i.lon]); }); mapInstance.fitBounds(bounds, { padding: [50, 50] }); }
    isMapLoading.value = false; 
}
const centerOnUser = () => { if(userLocation.value && mapInstance) mapInstance.flyTo(userLocation.value, 15); }

// Watchers
watch(viewMode, (v) => { if(v === 'map') initMap(); })
watch(currentDayIdx, () => { if(viewMode.value === 'map') initMap(); })

const searchNearby = async (item, idx) => { 
    isSearchingRecs.value = true; searchTargetIndex.value = `${currentDayIdx.value}-${idx}`;
    setTimeout(()=>{ recommendationsMap[`${currentDayIdx.value}-${idx}`] = [{name:'金賞壽司',lat:35.69,lon:139.70},{name:'琥珀咖啡',lat:35.692,lon:139.702}]; isSearchingRecs.value = false; searchTargetIndex.value=''; }, 800); 
}
const applyRecommendation = (item, rec) => { item.activity = rec.name; item.location = rec.name; item.lat=rec.lat; item.lon=rec.lon; }

// Storage Logic
const generateId = () => 'trip_' + Date.now().toString(36)
const saveTripList = () => localStorage.setItem('travel_app_index', JSON.stringify(tripList.value))
const createNewTrip = () => { setup.value = { destination: '', startDate: new Date().toISOString().split('T')[0], days: 5, currency: 'JPY' }; showSetupModal.value = true; showTripMenu.value = false; }
const deleteTrip = (id) => { if(!confirm('確定刪除?')) return; tripList.value = tripList.value.filter(t=>t.id!==id); saveTripList(); localStorage.removeItem(id); if(currentTripId.value===id) location.reload(); }

const initTrip = () => {
    if(!setup.value.destination) return alert('請輸入目的地');
    const newId = generateId();
    const newDays = Array.from({length: setup.value.days}, (_, i) => ({ date: `Day ${i+1}`, shortDate: `D${i+1}`, items: [] }));
    tripList.value.unshift({ id: newId, destination: setup.value.destination, startDate: setup.value.startDate, daysCount: setup.value.days });
    saveTripList();
    localStorage.setItem(newId, JSON.stringify({ days: newDays, expenses: [], setup: setup.value }));
    switchTrip(newId);
    showSetupModal.value = false;
}
const switchTrip = (id) => {
    currentTripId.value = id; showTripMenu.value = false;
    const data = JSON.parse(localStorage.getItem(id) || '{}');
    days.value = data.days || []; expenses.value = data.expenses || []; setup.value = data.setup || setup.value;
}

onMounted(() => {
    const list = JSON.parse(localStorage.getItem('travel_app_index') || '[]');
    tripList.value = list;
    if(list.length > 0) switchTrip(list[0].id); else showSetupModal.value = true;
    watch([days, expenses, setup], () => {
        if(currentTripId.value) localStorage.setItem(currentTripId.value, JSON.stringify({ days: days.value, expenses: expenses.value, setup: setup.value }));
    }, { deep: true });
})
</script>

<template>
  <div class="h-[100dvh] w-screen flex flex-col sm:items-center sm:justify-center text-dark">
    <div class="flex flex-col bg-slate-50 relative overflow-hidden w-full h-full sm:w-[414px] sm:h-[88vh] sm:rounded-[36px] sm:shadow-2xl sm:border-[10px] sm:border-dark">

        <header class="bg-primary text-white shrink-0 z-20 shadow-premium pt-safe-top relative overflow-hidden">
            <div class="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-yellow-100 via-transparent to-transparent"></div>
            
            <div class="p-4 flex justify-between items-center relative z-10">
                <div class="flex items-center gap-3">
                    <button @click="showTripMenu = true" class="text-white/80 hover:text-white transition active:scale-95">
                        <i class="ph-bold ph-list text-2xl"></i>
                    </button>
                    <div class="overflow-hidden">
                        <h1 class="text-[1.35rem] font-black tracking-wider flex items-center gap-2 truncate text-white drop-shadow-sm">
                            {{ setup.destination || '旅程規劃' }} 
                        </h1>
                    </div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                    <div class="flex bg-black/10 p-1 rounded-xl backdrop-blur-md border border-white/20">
                        <button @click="viewMode = 'plan'" :class="viewMode === 'plan' ? 'bg-white text-primary shadow-sm' : 'text-white/70 hover:text-white'" class="p-2 rounded-lg transition-all"><i class="ph-bold ph-calendar-check text-lg"></i></button>
                        <button @click="viewMode = 'map'" :class="viewMode === 'map' ? 'bg-white text-primary shadow-sm' : 'text-white/70 hover:text-white'" class="p-2 rounded-lg transition-all"><i class="ph-bold ph-map-trifold text-lg"></i></button>
                        <button @click="viewMode = 'money'" :class="viewMode === 'money' ? 'bg-white text-primary shadow-sm' : 'text-white/70 hover:text-white'" class="p-2 rounded-lg transition-all"><i class="ph-bold ph-currency-dollar text-lg"></i></button>
                    </div>
                </div>
            </div>
            <div class="flex overflow-x-auto hide-scroll px-3 pb-4 space-x-3 snap-x relative z-10">
                <div v-for="(day, index) in days" :key="index" @click="currentDayIdx = index" class="snap-center shrink-0 flex flex-col items-center justify-center w-14 h-16 rounded-2xl cursor-pointer transition-all border-[1.5px]" :class="currentDayIdx === index ? 'bg-white text-primary border-white shadow-lg scale-105 font-bold' : 'bg-white/20 text-white border-transparent hover:bg-white/30'">
                    <span class="text-[10px] opacity-90">{{ day.shortDate }}</span>
                    <span class="text-lg leading-tight">D{{ index + 1 }}</span>
                </div>
                <button @click="addDay" class="shrink-0 w-12 h-16 rounded-2xl flex items-center justify-center border-2 border-white/50 border-dashed text-white hover:bg-white/10 transition active:scale-95"><i class="ph-bold ph-plus text-xl"></i></button>
            </div>
        </header>

        <main class="flex-1 overflow-y-auto bg-slate-50 relative hide-scroll pb-safe-bottom">
            <transition name="fade" mode="out-in">
                <div v-if="viewMode === 'plan'" :key="currentDayIdx" class="p-4 pb-32">
                    <div class="bg-white p-5 rounded-[20px] shadow-premium-sm mb-6 border border-slate-100/80 flex justify-between items-start relative overflow-hidden">
                        <div class="absolute -top-10 -right-10 w-32 h-32 bg-primary/5 rounded-full blur-2xl pointer-events-none"></div>
                        <div class="flex-1 relative z-10">
                            <input type="date" :value="currentDay.fullDate" @change="updateDate($event, currentDay)" class="absolute inset-0 opacity-0 z-10 cursor-pointer">
                            <div class="text-2xl font-black text-dark flex items-center gap-2">{{ currentDay.date || '設定日期' }} <i class="ph-bold ph-caret-down text-sm text-slate-300"></i></div>
                            <input v-model="currentDay.title" class="text-sm font-medium text-slate-500 w-full bg-transparent border-b border-transparent focus:border-primary focus:outline-none placeholder-slate-300 mt-1" placeholder="輸入當日主題">
                        </div>
                        <div v-if="weatherDisplay" class="text-right pl-4 relative z-10">
                             <div class="flex items-center justify-end gap-1 text-primary font-black text-xl"><i :class="['ph-duotone', weatherDisplay.icon, 'text-2xl']"></i><span>{{ weatherDisplay.temp }}</span></div>
                            <div class="text-[11px] font-medium text-slate-400 mt-0.5">{{ weatherDisplay.label }}</div>
                        </div>
                    </div>

                    <div class="relative pl-5 border-l-[3px] border-primary/20 space-y-6">
                        <div v-for="(item, idx) in currentDay.items" :key="idx" class="relative group">
                            <div class="absolute -left-[25px] top-5 w-4 h-4 rounded-full border-[3px] border-white shadow-sm ring-1 ring-slate-200 z-10" :class="getDotColor(item.type)"></div>
                            <div class="bg-white p-4 rounded-[20px] shadow-premium-sm border border-slate-100/80 transition-all hover:shadow-premium relative overflow-hidden">
                                <div class="flex gap-3 relative z-10">
                                    <div class="flex flex-col gap-2 w-[76px] shrink-0">
                                        <div class="relative bg-slate-50 rounded-2xl border border-slate-100 h-16 flex flex-col items-center justify-center overflow-hidden">
                                            <input v-model="item.time" type="time" class="absolute inset-0 opacity-0 z-10 w-full h-full cursor-pointer">
                                            <span class="text-[10px] text-slate-400 font-bold tracking-wider">{{ getTimePeriod(item.time) }}</span>
                                            <span class="text-xl font-black text-dark font-mono leading-none mt-0.5">{{ item.time || '--:--' }}</span>
                                        </div>
                                        <select v-model="item.type" class="text-[11px] font-medium bg-white border border-slate-200 rounded-xl py-1.5 w-full text-center focus:ring-1 focus:ring-primary/50">
                                            <option value="spot">📍 景點</option><option value="food">🍴 美食</option><option value="shop">🛍️ 購物</option><option value="transport">🚇 交通</option>
                                        </select>
                                    </div>
                                    <div class="flex-1 min-w-0 flex flex-col justify-center py-1">
                                        <input v-model="item.activity" class="text-lg font-black text-dark bg-transparent placeholder-slate-300 w-full mb-1 focus:outline-none" placeholder="行程名稱">
                                        <div class="flex items-center gap-1.5 mb-2">
                                            <i class="ph-fill ph-map-pin text-primary text-sm"></i>
                                            <input v-model="item.location" @blur="fetchCoordsForItem(item)" class="text-sm font-medium text-slate-500 bg-transparent w-full focus:outline-none truncate placeholder-slate-300" placeholder="地點">
                                            <i v-if="item.lat" class="ph-bold ph-check-circle text-primary text-sm"></i>
                                        </div>
                                        <div class="flex items-center gap-2">
                                            <a v-if="item.location" :href="`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.location)}`" target="_blank" class="text-[11px] font-bold bg-primary/10 text-primary-dark px-2.5 py-1 rounded-full flex items-center gap-1 hover:bg-primary/20 transition"><i class="ph-bold ph-navigation-arrow"></i> 導航</a>
                                            <button @click="removeItem(idx)" class="ml-auto text-slate-300 hover:text-accent p-1.5 transition"><i class="ph-bold ph-trash text-lg"></i></button>
                                        </div>
                                    </div>
                                </div>
                                <div v-if="item.type === 'food'" class="mt-3 pt-3 border-t border-dashed border-slate-100 relative z-10">
                                    <button @click="searchNearby(item, idx)" class="w-full text-xs text-primary bg-primary/10 py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 active:bg-primary/20 transition">
                                        <i v-if="isSearchingRecs && searchTargetIndex === `${currentDayIdx}-${idx}`" class="ph-bold ph-spinner animate-spin"></i>
                                        <i v-else class="ph-bold ph-fork-knife"></i> 搜尋附近美食
                                    </button>
                                    <div v-if="recommendationsMap[`${currentDayIdx}-${idx}`]" class="flex gap-2 overflow-x-auto hide-scroll mt-3 pb-1">
                                        <div v-for="rec in recommendationsMap[`${currentDayIdx}-${idx}`]" @click="applyRecommendation(item, rec)" class="shrink-0 w-32 p-2.5 bg-white border border-primary/30 rounded-xl shadow-sm flex flex-col gap-1 cursor-pointer hover:border-primary transition active:scale-95 relative overflow-hidden">
                                            <div class="absolute inset-0 bg-primary/5 pointer-events-none"></div>
                                            <span class="text-xs font-bold text-dark truncate">{{ rec.name }}</span><span class="text-[10px] text-primary opacity-80">推薦</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <button @click="addItem" class="group flex items-center gap-3 text-primary font-bold text-sm px-2 py-3 w-full rounded-2xl border-2 border-dashed border-primary/30 hover:bg-primary/5 hover:border-primary transition active:scale-[0.98]">
                            <div class="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center group-hover:bg-primary group-hover:text-white transition"><i class="ph-bold ph-plus"></i></div> 新增行程
                        </button>
                    </div>
                </div>
            </transition>

            <div v-if="viewMode === 'map'" class="h-full flex flex-col relative w-full bg-slate-200">
                <div id="map" class="absolute inset-0 w-full h-full" style="z-index: 0;"></div>
                <div v-if="isMapLoading" class="absolute inset-0 bg-white/60 backdrop-blur-md z-20 flex flex-col items-center justify-center text-primary"><i class="ph-duotone ph-spinner-gap animate-spin text-5xl mb-3 opacity-80"></i><span class="text-sm font-bold tracking-wider">地圖載入中...</span></div>
                <div class="absolute bottom-safe-bottom left-4 right-4 mb-4 bg-white/80 backdrop-blur-xl rounded-[24px] p-4 shadow-premium border border-white/40 z-10 flex justify-between items-center">
                    <div class="flex items-center gap-3">
                         <div class="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary"><i class="ph-fill ph-map-pin text-xl"></i></div>
                        <div><div class="text-sm font-black text-dark">今日地點</div><div class="text-xs text-slate-500 font-medium">{{ currentDay.items.filter(i=>i.location).length }} 個已定位</div></div>
                    </div>
                    <div class="flex gap-2">
                        <button @click="initMap" class="w-11 h-11 bg-white text-primary-dark rounded-xl shadow-sm border border-slate-100 flex items-center justify-center active:scale-90 transition"><i class="ph-bold ph-arrows-clockwise text-xl"></i></button>
                        <button @click="centerOnUser" class="w-11 h-11 bg-accent text-white rounded-xl shadow-lg shadow-accent/30 flex items-center justify-center active:scale-90 transition"><i class="ph-bold ph-crosshair text-xl"></i></button>
                    </div>
                </div>
            </div>

            <div v-if="viewMode === 'money'" class="p-4 pb-32">
                <div class="bg-gradient-to-br from-primary to-primary-dark text-white rounded-[24px] p-6 shadow-premium mb-6 text-center relative overflow-hidden">
                    <div class="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-yellow-100 via-transparent to-transparent pointer-events-none"></div>
                    <div class="absolute top-4 right-4 flex flex-col items-end relative z-10">
                        <label class="text-[10px] text-white/80 mb-1 font-medium">匯率 ({{ currencyLabel }})</label>
                        <input v-model.number="exchangeRate" type="number" step="0.001" class="w-16 text-right text-xs font-bold text-primary-dark bg-white/90 rounded-lg px-2 py-1 focus:outline-none">
                    </div>
                    <div class="text-sm font-medium text-white/80 mb-1 relative z-10">總支出 Total</div>
                    <div class="text-[2.75rem] font-black font-mono leading-tight relative z-10 tracking-tight">{{ currencySymbol }} {{ totalExpense.toLocaleString() }}</div>
                    <div class="text-lg font-bold text-white/90 mt-1 relative z-10">≈ NT$ {{ Math.round(totalExpense * exchangeRate).toLocaleString() }}</div>
                </div>
                <div class="bg-white rounded-[20px] shadow-premium-sm p-4 mb-6 border border-slate-100/80">
                    <div class="flex gap-3 mb-3">
                        <div class="flex-1 relative">
                            <i class="ph-bold ph-receipt absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
                            <input v-model="newExpense.item" placeholder="消費項目" class="w-full bg-slate-50 border-2 border-slate-100 rounded-xl text-sm pl-9 pr-3 py-2.5 font-bold focus:outline-none focus:border-primary/50 transition">
                        </div>
                        <select v-model="newExpense.payer" class="w-28 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm px-3 py-2.5 font-bold focus:outline-none focus:border-primary/50 transition">
                            <option v-for="p in participants" :value="p">{{ p }}</option>
                        </select>
                    </div>
                    <div class="flex gap-3">
                        <div class="relative flex-1">
                             <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">{{ currencySymbol }}</span>
                            <input v-model.number="newExpense.amount" type="number" placeholder="金額" class="w-full bg-slate-50 border-2 border-slate-100 rounded-xl text-sm pl-8 pr-3 py-2.5 font-mono font-bold focus:outline-none focus:border-primary/50 transition">
                        </div>
                        <button @click="addExpense" class="bg-primary text-white h-full px-5 rounded-xl font-bold text-lg shadow-lg shadow-primary/20 hover:bg-primary-dark active:scale-95 transition flex items-center justify-center"><i class="ph-bold ph-plus"></i></button>
                    </div>
                </div>
                <div class="space-y-3">
                    <div v-for="(exp, idx) in expenses" :key="idx" class="flex justify-between items-center bg-white p-3.5 rounded-[18px] border border-slate-100 shadow-sm transition hover:shadow-md">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary-dark text-sm font-black">{{ exp.payer.charAt(0) }}</div>
                            <div><div class="font-bold text-dark text-[15px]">{{ exp.item }}</div></div>
                        </div>
                        <div class="flex items-center gap-4">
                            <span class="font-mono font-black text-dark text-lg">{{ currencySymbol }}{{ exp.amount.toLocaleString() }}</span>
                            <button @click="removeExpense(idx)" class="text-slate-300 hover:text-accent-light transition p-1"><i class="ph-fill ph-x-circle text-xl"></i></button>
                        </div>
                    </div>
                </div>
            </div>
        </main>

        <transition name="slide">
            <div v-if="showTripMenu" class="absolute inset-0 z-50 flex">
                <div class="bg-white w-[85%] max-w-xs h-full shadow-2xl flex flex-col relative z-50 p-6">
                    <div class="flex justify-between items-center mb-8">
                        <h2 class="text-2xl font-black text-dark">我的旅程</h2>
                        <button @click="showTripMenu = false" class="text-slate-400 hover:text-dark p-1 bg-slate-100 rounded-full"><i class="ph-bold ph-x text-xl"></i></button>
                    </div>
                    <button @click="createNewTrip" class="w-full py-4 mb-6 border-[3px] border-dashed border-primary/40 text-primary rounded-2xl font-black hover:bg-primary/5 flex items-center justify-center gap-2 active:scale-[0.98] transition">
                        <i class="ph-bold ph-plus-circle text-xl"></i> 建立新旅程
                    </button>
                    <div class="flex-1 overflow-y-auto space-y-3 hide-scroll">
                        <div v-for="trip in tripList" :key="trip.id" @click="switchTrip(trip.id)" class="p-4 rounded-2xl border-2 transition cursor-pointer relative group" :class="currentTripId === trip.id ? 'bg-primary/5 border-primary shadow-sm' : 'bg-slate-50 border-transparent hover:bg-slate-100'">
                            <div class="font-black text-dark text-lg">{{ trip.destination || '未命名行程' }}</div>
                            <div class="text-xs font-bold text-slate-400 mt-1">{{ trip.startDate }} • {{ trip.daysCount }} 天</div>
                            <button v-if="tripList.length > 1" @click.stop="deleteTrip(trip.id)" class="absolute right-3 top-3 text-slate-300 hover:text-accent p-2"><i class="ph-bold ph-trash text-lg"></i></button>
                        </div>
                    </div>
                </div>
                <div class="flex-1 bg-dark/60 backdrop-blur-sm z-40" @click="showTripMenu = false"></div>
            </div>
        </transition>

        <div v-if="showSetupModal" class="absolute inset-0 bg-primary-dark/95 backdrop-blur-md z-50 flex items-center justify-center p-6">
            <div class="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl relative animate-[fade-in-up_0.4s_ease-out]">
                <div class="text-center mb-8">
                    <div class="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4"><i class="ph-duotone ph-airplane-tilt text-4xl text-primary"></i></div>
                    <h2 class="text-3xl font-black text-dark">開啟新旅程</h2>
                    <p class="text-sm font-medium text-slate-400 mt-2">簡單設定，即刻出發！</p>
                </div>
                <div class="space-y-5">
                    <div>
                        <label class="block text-xs font-bold text-slate-400 mb-1.5 ml-1 uppercase tracking-wider">目的地 Destination</label>
                        <input v-model="setup.destination" type="text" placeholder="例如: Tokyo" class="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-4 text-dark font-black text-lg focus:border-primary focus:outline-none transition">
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-bold text-slate-400 mb-1.5 ml-1 uppercase">出發日</label>
                            <input v-model="setup.startDate" type="date" class="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-3 py-3.5 text-dark font-bold text-sm focus:border-primary focus:outline-none">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-400 mb-1.5 ml-1 uppercase">天數</label>
                            <input v-model.number="setup.days" type="number" min="1" max="30" class="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-3 py-3.5 text-dark font-black text-center focus:border-primary focus:outline-none">
                        </div>
                    </div>
                    <button @click="initTrip" class="w-full bg-primary hover:bg-primary-dark text-white font-black text-lg py-4 rounded-2xl shadow-xl shadow-primary/30 transform active:scale-95 transition flex items-center justify-center gap-2 mt-4">開始規劃 <i class="ph-bold ph-arrow-right"></i></button>
                    <button v-if="tripList.length>0" @click="showSetupModal = false" class="w-full text-slate-400 text-sm font-bold py-2 hover:text-dark">取消</button>
                </div>
            </div>
        </div>

    </div>
  </div>
</template>