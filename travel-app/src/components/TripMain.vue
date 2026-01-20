<script setup>
import { ref, computed, watch, onMounted, nextTick, reactive, onUnmounted } from 'vue'
import L from 'leaflet'
import { db } from '../firebase' 
import { doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore'

// 接收外部傳入的 ID
const props = defineProps({
  tripId: { type: String, required: true }
})

// --- 狀態定義 ---
const viewMode = ref('plan')
const currentDayIdx = ref(0)
const showImportModal = ref(false)
const importText = ref('')
const isEditingTitle = ref(false)

const days = ref([])
const expenses = ref([])
const participants = ref(['我', '旅伴A'])
const newExpense = ref({ item: '', amount: '', payer: '我' })
const newParticipantName = ref('')
const exchangeRate = ref(0.215)

const weatherData = ref({ temp: null, code: null, loading: false, error: false })
const setup = ref({ destination: '', currency: 'JPY', startDate: '', days: 1 })

let mapInstance = null
let userMarker = null
let geoWatchId = null
let unsubscribe = null

const recommendationsMap = reactive({})
const isSearchingRecs = ref(false)
const searchTargetIndex = ref('')

const currencyOptions = [
    { code: 'TWD', label: '新台幣', flag: '🇹🇼' },
    { code: 'JPY', label: '日圓', flag: '🇯🇵' },
    { code: 'KRW', label: '韓元', flag: '🇰🇷' },
    { code: 'USD', label: '美金', flag: '🇺🇸' },
    { code: 'EUR', label: '歐元', flag: '🇪🇺' },
    { code: 'CNY', label: '人民幣', flag: '🇨🇳' },
    { code: 'THB', label: '泰銖', flag: '🇹🇭' },
    { code: 'VND', label: '越南盾', flag: '🇻🇳' },
    { code: 'HKD', label: '港幣', flag: '🇭🇰' },
]

// --- Computed ---
const currentDay = computed(() => days.value[currentDayIdx.value] || { items: [], location: '' })
const totalExpense = computed(() => expenses.value.reduce((sum, item) => sum + item.amount, 0))
const currencySymbol = computed(() => {
  const map = { 'TWD': 'NT$', 'JPY': '¥', 'CNY': '¥', 'USD': '$', 'EUR': '€', 'KRW': '₩', 'GBP': '£', 'HKD': 'HK$', 'THB': '฿', 'VND': '₫' }
  return map[setup.value.currency] || '$'
})

const getDateString = (dayIndex, formatType = 'short') => {
    if (!setup.value.startDate) return '';
    const date = new Date(setup.value.startDate);
    date.setDate(date.getDate() + dayIndex);
    
    const mm = (date.getMonth() + 1).toString().padStart(2, '0');
    const dd = date.getDate().toString().padStart(2, '0');
    const yyyy = date.getFullYear();

    if (formatType === 'full') return `${yyyy}/${mm}/${dd}`;
    return `${mm}/${dd}`;
}

const weatherDisplay = computed(() => {
    if (weatherData.value.loading) return { temp: '...', icon: 'ph-spinner animate-spin', label: '載入中...' };
    if (weatherData.value.error) return null;
    if (weatherData.value.temp === null) return null;
    
    const code = weatherData.value.code;
    let icon = 'ph-sun';
    if (code >= 1 && code <= 3) icon = 'ph-cloud-sun';
    else if (code >= 45 && code <= 48) icon = 'ph-cloud-fog';
    else if (code >= 51 && code <= 67) icon = 'ph-drop';
    else if (code >= 71 && code <= 77) icon = 'ph-snowflake';
    else if (code >= 80 && code <= 82) icon = 'ph-cloud-rain';
    else if (code >= 95) icon = 'ph-lightning';
    
    return { temp: `${Math.round(weatherData.value.temp)}°C`, icon: icon, label: currentDay.value.location };
})

const settlementPlan = computed(() => {
    if (totalExpense.value === 0 || participants.value.length === 0) return [];
    const paidMap = {};
    participants.value.forEach(p => paidMap[p] = 0);
    expenses.value.forEach(exp => { if (paidMap[exp.payer] !== undefined) paidMap[exp.payer] += exp.amount; });
    const average = totalExpense.value / participants.value.length;
    let balances = participants.value.map(p => ({ name: p, balance: paidMap[p] - average }));
    const debts = [];
    let debtors = balances.filter(b => b.balance < -1).sort((a, b) => a.balance - b.balance);
    let creditors = balances.filter(b => b.balance > 1).sort((a, b) => b.balance - a.balance);
    let i = 0; let j = 0;
    while (i < debtors.length && j < creditors.length) {
        let debtor = debtors[i]; let creditor = creditors[j];
        let amount = Math.min(Math.abs(debtor.balance), creditor.balance);
        if (amount > 0) { debts.push({ from: debtor.name, to: creditor.name, amount: Math.round(amount) }); }
        debtor.balance += amount; creditor.balance -= amount;
        if (Math.abs(debtor.balance) < 1) i++;
        if (creditor.balance < 1) j++;
    }
    return debts;
})

const getTimePeriod = (t) => { if(!t) return '時間'; const h=parseInt(t.split(':')[0]); return h<5?'凌晨':h<11?'上午':h<14?'中午':h<18?'下午':'晚上'; }
const getDotColor = (t) => {
    switch(t) { 
        case 'food': return 'bg-secondary border-secondary/30' 
        case 'shop': return 'bg-accent-light border-accent/30'
        case 'transport': return 'bg-blue-500 border-blue-300' 
        default: return 'bg-primary border-primary/30'
    }
}

// 更新全域標題 & 同步到左側選單
const updateDestination = async () => {
    isEditingTitle.value = false;
    // 這裡只存標題，不再觸發天氣驗證，因為天氣只跟「當日地點」有關
    if (props.tripId) {
        try {
            await updateDoc(doc(db, "trips", props.tripId), {
                destination: setup.value.destination
            });
        } catch (e) { console.error("同步標題失敗", e); }
    }
}

const fetchExchangeRate = async () => {
    if(!setup.value.currency || setup.value.currency === 'TWD') { exchangeRate.value = 1; return; }
    try {
        const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${setup.value.currency}`);
        const data = await res.json();
        if (data && data.rates && data.rates.TWD) exchangeRate.value = data.rates.TWD;
    } catch (e) { console.error("匯率失敗", e); }
}

const fetchWeather = async (lat, lon) => {
    try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`);
        const data = await res.json();
        if (data.current) { weatherData.value.temp = data.current.temperature_2m; weatherData.value.code = data.current.weather_code; }
    } catch (e) { }
}

// ✨ 智慧天氣驗證：完全與標題脫鉤
const validateWeather = async () => {
    const targetLocation = currentDay.value.location;
    
    // 🔴 狀態一：沒有輸入 (空值)
    if(!targetLocation || targetLocation.trim() === '') {
        weatherData.value = { temp: null, code: null, loading: false, error: false }; // error: false 代表不是錯誤，只是沒填
        return;
    }
    
    weatherData.value.loading = true;
    weatherData.value.error = false;
    
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(targetLocation)}&limit=3&addressdetails=1`);
        const data = await res.json();
        
        if (data.length === 0) {
            // 🔴 狀態二：輸入了，但找不到 (錯誤)
            weatherData.value.error = true;
        } else {
            // 嚴格過濾：必須是城市或行政區
            const isValid = data.some(place => {
                const validClasses = ['place', 'boundary', 'landuse', 'tourism'];
                const validTypes = [
                    'city', 'administrative', 'country', 'state', 'town', 'island', 
                    'province', 'region', 'county', 'district', 'municipality', 'village', 'suburb',
                    'capital', 'hamlet'
                ];
                return validClasses.includes(place.class) || validTypes.includes(place.type);
            });

            if (isValid) {
                // 🟢 狀態三：成功抓到
                await fetchWeather(data[0].lat, data[0].lon);
                weatherData.value.error = false;
            } else { 
                // 🔴 狀態二：輸入了亂碼或非地名 (錯誤)
                weatherData.value.error = true; 
            }
        }
    } catch (e) {
        weatherData.value.error = true;
    } finally { 
        weatherData.value.loading = false; 
    }
}

watch(() => setup.value.currency, () => fetchExchangeRate());

// 只監聽「當日地點」的變化，不再監聽標題
let debounceTimer = null;
watch(() => currentDay.value.location, () => {
    if(debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => validateWeather(), 800);
});
watch(currentDayIdx, () => setTimeout(() => validateWeather(), 200));

const addParticipant = () => { if (newParticipantName.value && !participants.value.includes(newParticipantName.value)) { participants.value.push(newParticipantName.value); newParticipantName.value = ''; }}
const removeParticipant = (name) => { if (confirm('確定移除?')) participants.value = participants.value.filter(p => p !== name); }
const addItem = () => currentDay.value.items.push({ time: '', type: 'spot', activity: '', location: '' })
const removeItem = (idx) => currentDay.value.items.splice(idx, 1)
const addDay = () => days.value.push({ date: `Day ${days.value.length+1}`, items: [], location: '' })
const addExpense = () => { if(newExpense.value.item && newExpense.value.amount) { expenses.value.unshift({...newExpense.value}); newExpense.value.item=''; newExpense.value.amount=''; }}
const removeExpense = (idx) => expenses.value.splice(idx, 1)

const parseAndImport = () => {
    if (!importText.value) return;
    const blocks = importText.value.split('=====');
    const newItems = [];
    blocks.forEach(block => {
        if(!block.trim()) return;
        const activity = (block.match(/活動內容[:：]\s*(.+)/) || [])[1]?.trim() || '';
        const location = (block.match(/地點[:：]\s*(.+)/) || [])[1]?.trim() || '';
        let time = (block.match(/時間[:：]\s*(\d{1,2}[:.]\d{2})/) || [])[1]?.trim() || '';
        if (time) time = time.replace('.', ':').padStart(5, '0');
        if (activity || location) {
            let type = 'spot';
            const fullText = (activity + location).toLowerCase();
            if (fullText.match(/餐|吃|飯|食|cafe/)) type = 'food';
            else if (fullText.match(/逛|買|店|shop/)) type = 'shop';
            else if (fullText.match(/車|機|站|前往/)) type = 'transport';
            newItems.push({ time, type, activity: activity || location, location });
        }
    });
    if (newItems.length > 0) {
        currentDay.value.items.push(...newItems);
        showImportModal.value = false;
        importText.value = '';
    }
}

const fetchCoordsForItem = async (item) => {
    if(!item.location || item.lat) return;
    try { const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(item.location)}&limit=1`); const data = await res.json(); if(data?.[0]) { item.lat = parseFloat(data[0].lat); item.lon = parseFloat(data[0].lon); }} catch(e) {}
}

const initMap = async () => { 
    isMapLoading.value = true; await nextTick(); if (!document.getElementById('map')) return;
    if (mapInstance) { mapInstance.off(); mapInstance.remove(); mapInstance = null; }
    mapInstance = L.map('map').setView([35.6895, 139.6917], 13);
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

const searchNearby = async (item, idx) => { 
    isSearchingRecs.value = true; searchTargetIndex.value = `${currentDayIdx.value}-${idx}`;
    setTimeout(()=>{ recommendationsMap[`${currentDayIdx.value}-${idx}`] = [{name:'金賞壽司',lat:35.69,lon:139.70},{name:'琥珀咖啡',lat:35.692,lon:139.702}]; isSearchingRecs.value = false; searchTargetIndex.value=''; }, 800); 
}
const applyRecommendation = (item, rec) => { item.activity = rec.name; item.location = rec.name; item.lat=rec.lat; item.lon=rec.lon; }

watch(viewMode, (v) => { if(v === 'map') initMap(); })
watch(currentDayIdx, () => { if(viewMode.value === 'map') initMap(); })

let saveTimeout = null;
watch([days, expenses, setup, participants], () => {
    if(saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        if(props.tripId) {
            await setDoc(doc(db, "trip_details", props.tripId), { 
                days: days.value, 
                expenses: expenses.value, 
                setup: setup.value, 
                participants: participants.value 
            });
        }
    }, 1000);
}, { deep: true })

onMounted(() => {
    unsubscribe = onSnapshot(doc(db, "trip_details", props.tripId), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            days.value = data.days || [];
            expenses.value = data.expenses || [];
            setup.value = data.setup || setup.value;
            participants.value = data.participants || ['我', '旅伴A'];
            validateWeather();
        }
    });
})

onUnmounted(() => { if(unsubscribe) unsubscribe(); })
</script>

<template>
    <div class="flex flex-col h-full w-full relative">
        <header class="bg-primary text-white shrink-0 z-20 shadow-premium pt-safe-top relative overflow-hidden">
            <div class="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-yellow-100 via-transparent to-transparent"></div>
            <div class="p-4 flex justify-between items-center relative z-10">
                <div class="flex items-center gap-3">
                    <button @click="$emit('openMenu')" class="text-white/80 hover:text-white transition active:scale-95">
                        <i class="ph-bold ph-list text-2xl"></i>
                    </button>
                    <div class="overflow-hidden flex-1">
                        <div v-if="!isEditingTitle" @click="isEditingTitle = true" class="text-[1.35rem] font-black tracking-wider flex items-center gap-2 truncate text-white drop-shadow-sm cursor-pointer hover:opacity-90">
                            {{ setup.destination || '點擊設定地點' }} <i class="ph-bold ph-pencil-simple text-sm opacity-50"></i>
                        </div>
                        <input v-else v-model="setup.destination" @blur="updateDestination" @keyup.enter="updateDestination" class="text-[1.35rem] font-black tracking-wider bg-transparent text-white border-b-2 border-white/50 focus:border-white focus:outline-none w-full" autoFocus>
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
                    <span class="text-[10px] opacity-90">{{ getDateString(index, 'short') }}</span>
                    <span class="text-lg leading-tight">D{{ index + 1 }}</span>
                </div>
                <button @click="addDay" class="shrink-0 w-12 h-16 rounded-2xl flex items-center justify-center border-2 border-white/50 border-dashed text-white hover:bg-white/10 transition active:scale-95"><i class="ph-bold ph-plus text-xl"></i></button>
            </div>
        </header>

        <main class="flex-1 overflow-y-auto bg-slate-50 relative hide-scroll pb-safe-bottom">
            <transition name="fade" mode="out-in">
                <div v-if="viewMode === 'plan'" :key="currentDayIdx" class="p-4 pb-32">
                    <div class="bg-white p-5 rounded-[20px] shadow-premium-sm mb-6 border border-slate-100/80 flex flex-col relative overflow-hidden">
                        <div class="absolute -top-10 -right-10 w-32 h-32 bg-primary/5 rounded-full blur-2xl pointer-events-none"></div>
                        <div class="flex justify-between items-start mb-2 relative z-10">
                            <div class="flex-1 min-w-0">
                                <div class="text-2xl font-black text-dark flex items-center gap-3 relative z-0 mb-1">
                                    Day {{ currentDayIdx + 1 }}
                                    <span class="text-base text-slate-400 font-medium">{{ getDateString(currentDayIdx, 'full') }}</span>
                                </div>
                                <input v-model="currentDay.title" class="relative z-20 text-sm font-medium text-slate-500 w-full bg-transparent border-b border-transparent focus:border-primary focus:outline-none placeholder-slate-300 mb-2" placeholder="輸入當日主題">
                                <div class="flex items-center gap-2">
                                    <i class="ph-fill ph-map-pin-line text-slate-400"></i>
                                    <input v-model="currentDay.location" class="text-xs font-bold text-primary bg-slate-50 px-2 py-1 rounded-lg border-none focus:ring-1 focus:ring-primary w-32" placeholder="此處輸入城市 (如: 大阪)">
                                </div>
                            </div>
                            
                            <div class="flex flex-col items-end gap-2">
                                <button @click="showImportModal = true" class="flex flex-col items-center text-primary hover:text-primary-dark transition"><i class="ph-duotone ph-file-text text-2xl"></i><span class="text-[10px] font-bold">匯入</span></button>
                                
                                <div v-if="!currentDay.location" class="flex items-center gap-2 text-slate-400 font-bold text-sm bg-slate-100 px-2 py-1 rounded-lg mt-1 whitespace-nowrap">
                                    <i class="ph-bold ph-map-pin-line"></i><span>沒有輸入城市</span>
                                </div>
                                <div v-else-if="weatherData.error" class="flex items-center gap-2 text-red-500 font-bold text-sm bg-red-50 px-2 py-1 rounded-lg mt-1 whitespace-nowrap">
                                    <i class="ph-bold ph-warning-circle"></i><span>未輸入正確地點</span>
                                </div>
                                <div v-else-if="weatherDisplay" class="flex items-center gap-2 text-primary font-bold text-sm bg-primary/5 px-2 py-1 rounded-lg mt-1 whitespace-nowrap">
                                    <i :class="['ph-duotone', weatherDisplay.icon]"></i><span>{{ weatherDisplay.temp }} {{ weatherDisplay.label }}</span>
                                </div>
                            </div>
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
                    <div class="flex items-center gap-3"><div class="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary"><i class="ph-fill ph-map-pin text-xl"></i></div><div><div class="text-sm font-black text-dark">今日地點</div><div class="text-xs text-slate-500 font-medium">{{ currentDay.items.filter(i=>i.location).length }} 個已定位</div></div></div>
                    <div class="flex gap-2">
                        <button @click="initMap" class="w-11 h-11 bg-white text-primary-dark rounded-xl shadow-sm border border-slate-100 flex items-center justify-center active:scale-90 transition"><i class="ph-bold ph-arrows-clockwise text-xl"></i></button>
                        <button @click="centerOnUser" class="w-11 h-11 bg-accent text-white rounded-xl shadow-lg shadow-accent/30 flex items-center justify-center active:scale-90 transition"><i class="ph-bold ph-crosshair text-xl"></i></button>
                    </div>
                </div>
            </div>

            <div v-if="viewMode === 'money'" class="p-4 pb-32">
                <div class="bg-gradient-to-br from-primary to-primary-dark text-white rounded-[24px] p-5 shadow-premium mb-6 flex flex-col relative overflow-hidden">
                    <div class="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-yellow-100 via-transparent to-transparent pointer-events-none"></div>
                    <div class="self-end flex flex-col items-end relative z-10 mb-2">
                        <label class="text-[10px] text-white/80 mb-1 font-medium">匯率 (TWD)</label>
                        <div class="flex gap-2">
                             <select v-model="setup.currency" class="bg-white/20 text-white border-none rounded-lg text-xs py-1 px-1 focus:ring-0 cursor-pointer">
                                <option v-for="c in currencyOptions" :value="c.code" class="text-dark">{{ c.flag }} {{ c.code }}</option>
                             </select>
                             <input v-model.number="exchangeRate" type="number" step="0.001" class="w-14 text-right text-xs font-bold text-primary-dark bg-white/90 rounded-lg px-2 py-1 focus:outline-none">
                        </div>
                    </div>
                    <div class="text-center w-full relative z-10">
                        <div class="text-sm font-medium text-white/80 mb-1">總支出 Total</div>
                        <div class="flex flex-row justify-center items-baseline gap-2">
                            <span class="text-2xl font-bold opacity-80 transform -translate-y-1">{{ currencySymbol }}</span>
                            <span class="text-[2.75rem] font-black font-mono leading-none tracking-tight">{{ totalExpense.toLocaleString() }}</span>
                        </div>
                        <div v-if="setup.currency !== 'TWD'" class="text-lg font-bold text-white/90 mt-2">≈ NT$ {{ Math.round(totalExpense * exchangeRate).toLocaleString() }}</div>
                    </div>
                </div>
                <div v-if="settlementPlan.length > 0" class="bg-accent/5 rounded-[20px] border border-accent/20 p-4 mb-4">
                    <div class="flex items-center gap-2 mb-3"><div class="w-6 h-6 rounded-full bg-accent text-white flex items-center justify-center text-xs"><i class="ph-bold ph-handshake"></i></div><div class="text-xs font-bold text-accent">結帳建議</div></div>
                    <div class="space-y-2">
                        <div v-for="(plan, idx) in settlementPlan" :key="idx" class="flex justify-between items-center bg-white p-3 rounded-xl border border-accent/10 shadow-sm">
                            <div class="flex items-center gap-2 text-sm font-bold text-dark"><span class="bg-slate-100 px-2 py-1 rounded-md">{{ plan.from }}</span><i class="ph-bold ph-arrow-right text-slate-300"></i><span class="bg-slate-100 px-2 py-1 rounded-md">{{ plan.to }}</span></div>
                            <div class="font-mono font-black text-accent text-lg">${{ plan.amount }}</div>
                        </div>
                    </div>
                </div>
                <div class="bg-white rounded-[20px] shadow-premium-sm p-4 mb-4 border border-slate-100/80">
                    <div class="text-xs font-bold text-slate-400 mb-2 ml-1">分帳成員</div>
                    <div class="flex flex-wrap gap-2 mb-3">
                        <div v-for="p in participants" :key="p" class="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">{{ p }}<button @click="removeParticipant(p)" class="hover:text-red-500"><i class="ph-bold ph-x"></i></button></div>
                    </div>
                    <div class="flex gap-2"><input v-model="newParticipantName" placeholder="輸入成員名字..." class="flex-1 bg-slate-50 border border-slate-100 rounded-xl text-xs px-3 py-2 focus:outline-none focus:border-primary"><button @click="addParticipant" class="bg-slate-800 text-white px-3 py-1 rounded-xl text-xs font-bold hover:bg-black"><i class="ph-bold ph-plus"></i></button></div>
                </div>
                <div class="bg-white rounded-[20px] shadow-premium-sm p-4 mb-6 border border-slate-100/80">
                    <div class="flex gap-3 mb-3">
                        <div class="flex-1 relative"><i class="ph-bold ph-receipt absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i><input v-model="newExpense.item" placeholder="消費項目" class="w-full bg-slate-50 border-2 border-slate-100 rounded-xl text-sm pl-9 pr-3 py-2.5 font-bold focus:outline-none focus:border-primary/50 transition"></div>
                        <select v-model="newExpense.payer" class="w-28 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm px-3 py-2.5 font-bold focus:outline-none focus:border-primary/50 transition"><option v-for="p in participants" :value="p">{{ p }}</option></select>
                    </div>
                    <div class="flex gap-3">
                        <div class="flex-1 flex items-center bg-slate-50 border-2 border-slate-100 rounded-xl px-3 py-2 transition focus-within:border-primary/50"><span class="text-slate-400 font-bold mr-2 whitespace-nowrap">{{ currencySymbol }}</span><input v-model.number="newExpense.amount" type="number" placeholder="金額" class="w-full bg-transparent border-none p-0 text-sm font-mono font-bold focus:ring-0 placeholder-slate-300"></div>
                        <button @click="addExpense" class="bg-primary text-white h-full px-5 rounded-xl font-bold text-lg shadow-lg shadow-primary/20 hover:bg-primary-dark active:scale-95 transition flex items-center justify-center"><i class="ph-bold ph-plus"></i></button>
                    </div>
                </div>
                <div class="space-y-3">
                    <div v-for="(exp, idx) in expenses" :key="idx" class="flex justify-between items-center bg-white p-3.5 rounded-[18px] border border-slate-100 shadow-sm transition hover:shadow-md">
                        <div class="flex items-center gap-3"><div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary-dark text-sm font-black">{{ exp.payer.charAt(0) }}</div><div><div class="font-bold text-dark text-[15px]">{{ exp.item }}</div></div></div>
                        <div class="flex items-center gap-4"><span class="font-mono font-black text-dark text-lg">{{ currencySymbol }}{{ exp.amount.toLocaleString() }}</span><button @click="removeExpense(idx)" class="text-slate-300 hover:text-accent-light transition p-1"><i class="ph-fill ph-x-circle text-xl"></i></button></div>
                    </div>
                </div>
            </div>
        </main>

        <div v-if="showImportModal" class="absolute inset-0 bg-dark/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <div class="bg-white w-full max-w-sm rounded-[32px] p-6 shadow-2xl relative animate-[fade-in-up_0.2s_ease-out]">
                <div class="flex justify-between items-center mb-4"><h2 class="text-xl font-black text-dark">匯入文字行程</h2><button @click="showImportModal = false" class="w-8 h-8 bg-slate-100 rounded-full text-slate-400 hover:bg-slate-200 hover:text-dark flex items-center justify-center"><i class="ph-bold ph-x"></i></button></div>
                <div class="text-xs text-slate-400 mb-3 bg-slate-50 p-2 rounded-xl border border-slate-100">請使用以下格式 (每筆行程用 ===== 分隔)：<br><br>活動內容: 吃早餐<br>時間: 09:00<br>地點: 阜杭豆漿<br>=====<br>活動內容: 參觀博物館<br>時間: 10:30<br>地點: 故宮博物院</div>
                <textarea v-model="importText" class="w-full h-40 bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-sm font-medium text-dark focus:border-primary focus:outline-none resize-none mb-4" placeholder="在此貼上您的行程..."></textarea>
                <button @click="parseAndImport" class="w-full bg-primary hover:bg-primary-dark text-white font-bold py-3.5 rounded-2xl shadow-lg shadow-primary/30 transition flex items-center justify-center gap-2"><i class="ph-bold ph-magic-wand"></i> 開始分析並匯入</button>
            </div>
        </div>
    </div>
</template>