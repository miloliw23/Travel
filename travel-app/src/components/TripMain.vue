<script setup>
import { ref, watch, onUnmounted } from 'vue'
import { db } from '../firebase'
import { doc, onSnapshot, updateDoc, deleteDoc } from 'firebase/firestore'
import TripPlan from './TripPlan.vue'
import TripMoney from './TripMoney.vue'

const props = defineProps(['tripId'])
const emit = defineEmits(['openMenu'])

const activeTab = ref('plan')
const details = ref(null)
const weather = ref({ temp: '', desc: '', error: false })
const isWeatherLoading = ref(false)
let unsubscribe = null

// ✨ 核心功能：複製行程代碼 (邀請碼)
const copyInviteCode = () => {
  if (!props.tripId) return
  navigator.clipboard.writeText(props.tripId)
  alert("行程代碼已複製！將此代碼傳給朋友，他們就能加入協作。")
}

// ✨ 天氣獲取邏輯 (wttr.in)
const fetchWeather = async (city) => {
  if (!city) {
    weather.value = { temp: '', desc: '', error: false }
    return
  }
  isWeatherLoading.value = true
  weather.value.error = false
  
  try {
    const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`)
    if (!res.ok) throw new Error("Network error")
    
    const data = await res.json()
    if (data.current_condition && data.current_condition.length > 0) {
      const cond = data.current_condition[0]
      weather.value = {
        temp: cond.temp_C + '°C',
        desc: cond.lang_zh ? cond.lang_zh[0].value : cond.weatherDesc[0].value,
        error: false
      }
    } else {
      throw new Error("Location not found")
    }
  } catch (e) {
    weather.value = { temp: '', desc: '地點錯誤', error: true }
  } finally {
    isWeatherLoading.value = false
  }
}

// 監聽 Firebase 數據同步
watch(() => props.tripId, (newId) => {
  if (unsubscribe) unsubscribe();
  if (newId) {
    unsubscribe = onSnapshot(doc(db, "trip_details", newId), (snap) => {
      if (snap.exists()) {
        details.value = snap.data();
        if (details.value.setup?.location) {
          fetchWeather(details.value.setup.location)
        }
      }
    });
  }
}, { immediate: true });

// 更新地點並儲存
const updateLocation = async () => {
  if (!details.value.setup.location) return
  try {
    await updateDoc(doc(db, "trip_details", props.tripId), {
      "setup.location": details.value.setup.location
    })
    fetchWeather(details.value.setup.location)
  } catch (e) {
    console.error("儲存失敗", e)
  }
}

// 刪除行程
const handleDelete = async () => {
  if(confirm('確定要刪除這份行程嗎？')) {
    await deleteDoc(doc(db, "trips", props.tripId));
    await deleteDoc(doc(db, "trip_details", props.tripId));
    window.location.reload();
  }
}

onUnmounted(() => { if (unsubscribe) unsubscribe(); });
</script>

<template>
  <div v-if="details" class="h-full flex flex-col bg-[#FDFBF7]">
    <header class="bg-[#F2EDE4] px-6 pt-6 pb-4 shrink-0 border-b border-[#E9E2D7]">
      <div class="flex justify-between items-center mb-5">
        <button @click="emit('openMenu')" class="bg-white p-2.5 rounded-2xl shadow-sm border border-[#E9E2D7] text-[#E6B3A3] active:scale-90 transition">
          <i class="ph-bold ph-list text-xl"></i>
        </button>
        
        <div class="flex bg-white/50 rounded-2xl p-1 border border-[#E9E2D7] backdrop-blur-md">
          <button @click="activeTab = 'plan'" 
            :class="activeTab === 'plan' ? 'bg-[#E6B3A3] text-white shadow-sm' : 'text-[#BAB3A9]'" 
            class="p-2.5 rounded-xl transition-all">
            <i class="ph-fill ph-calendar-blank text-lg"></i>
          </button>
          <button @click="activeTab = 'money'" 
            :class="activeTab === 'money' ? 'bg-[#E6B3A3] text-white shadow-sm' : 'text-[#BAB3A9]'" 
            class="p-2.5 rounded-xl transition-all ml-1">
            <i class="ph-fill ph-currency-dollar text-lg"></i>
          </button>
        </div>
        
        <div class="w-10"></div>
      </div>

      <div class="text-center space-y-3 px-4">
        <h1 class="text-2xl font-black text-[#8B7E74] tracking-tight truncate">
          {{ details.setup.destination }}
        </h1>
        
        <div class="flex items-center justify-center gap-2">
          <div class="flex items-center bg-white/60 px-3 py-1.5 rounded-full border border-[#E9E2D7] shadow-inner">
            <i class="ph-fill ph-map-pin text-[#E6B3A3] text-xs shrink-0"></i>
            <input 
              v-model="details.setup.location" 
              @blur="updateLocation" 
              placeholder="城市" 
              class="bg-transparent text-[11px] font-bold text-[#8B7E74] outline-none ml-1 w-20 placeholder:opacity-40"
            >
          </div>
          
          <div v-if="weather.temp || weather.error" 
               class="flex items-center gap-1.5 bg-white/80 px-3 py-1.5 rounded-full border shadow-sm shrink-0 animate-fade-in"
               :class="weather.error ? 'border-red-100 bg-red-50/20' : 'border-[#F2EDE4]'">
            <span v-if="!weather.error" class="text-xs font-black text-[#E6B3A3]">{{ weather.temp }}</span>
            <span class="text-[10px] font-bold" :class="weather.error ? 'text-red-400' : 'text-[#BAB3A9]'">{{ weather.desc }}</span>
          </div>
          <div v-else-if="isWeatherLoading" class="text-[10px] font-bold text-[#BAB3A9] animate-pulse shrink-0">
            查詢中...
          </div>

          <button @click="copyInviteCode" class="w-8 h-8 bg-white border border-[#E9E2D7] rounded-full flex items-center justify-center text-[#BAB3A9] hover:text-[#E6B3A3] transition shadow-sm active:scale-90">
            <i class="ph-bold ph-share-network"></i>
          </button>
        </div>
      </div>
    </header>

    <main class="flex-1 overflow-hidden relative">
      <TripPlan v-if="activeTab === 'plan'" :details="details" :tripId="tripId" />
      <TripMoney v-if="activeTab === 'money'" :details="details" :tripId="tripId" />
      
      <button @click="handleDelete" class="absolute bottom-6 right-6 w-12 h-12 bg-white/90 text-[#D98C8C] rounded-full shadow-lg flex items-center justify-center border border-[#F2EDE4] z-50 active:scale-90 transition">
        <i class="ph-bold ph-trash text-xl"></i>
      </button>
    </main>
  </div>
</template>

<style scoped>
.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.animate-fade-in { animation: fadeIn 0.4s ease-out; }
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-5px); }
  to { opacity: 1; transform: translateY(0); }
}

/* 確保行動端滾動順暢 */
main {
  -webkit-overflow-scrolling: touch;
}
</style>