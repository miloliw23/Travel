<script setup>
import { ref, watch, onUnmounted } from 'vue'
import { db } from '../firebase'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'

// 引入子組件
import TripPlan from './TripPlan.vue'
import TripMoney from './TripMoney.vue'
import TripChecklist from './TripChecklist.vue'

const props = defineProps(['tripId'])
const emit = defineEmits(['openMenu'])

const activeTab = ref('plan') // 'plan' | 'checklist' | 'money'
const details = ref(null)
const isHeaderShrunk = ref(false) 
let unsubscribe = null

// --- 標題同步更新 ---
const updateDestination = async (newVal) => {
  if (!props.tripId || !newVal?.trim()) return
  try {
    await updateDoc(doc(db, "trip_details", props.tripId), { "setup.destination": newVal.trim() })
    await updateDoc(doc(db, "trips", props.tripId), { destination: newVal.trim() })
  } catch (e) { console.error("更新標題失敗:", e) }
}

// --- 🔥 日期同步更新 (新增功能) ---
const updateStartDate = async (newDate) => {
  if (!props.tripId || !newDate) return
  try {
    // 1. 更新詳細資料 (讓 TripPlan 變更)
    await updateDoc(doc(db, "trip_details", props.tripId), {
      "setup.startDate": newDate
    })
    
    // 2. 🔥 新增這行：同時更新列表摘要 (讓側邊欄 Sidebar 變更)
    await updateDoc(doc(db, "trips", props.tripId), {
      startDate: newDate
    })
    
  } catch (e) { console.error("更新日期失敗:", e) }
}

// --- 清單同步更新 ---
const syncChecklist = async () => {
  if (!props.tripId || !details.value) return
  try {
    await updateDoc(doc(db, "trip_details", props.tripId), {
      checklists: details.value.checklists || []
    })
  } catch (e) { console.error("清單同步失敗:", e) }
}

// --- 🔥 自動修復缺漏欄位 🔥 ---
const repairTripData = async (data) => {
  let needsUpdate = false
  const updatePayload = {}

  if (!data.days) { updatePayload.days = []; needsUpdate = true }
  if (!data.checklists) { updatePayload.checklists = []; needsUpdate = true }
  if (!data.expenses) { updatePayload.expenses = []; needsUpdate = true }
  
  // 檢查 setup 是否存在
  if (!data.setup) { 
      updatePayload.setup = { destination: '未命名行程', startDate: new Date().toISOString().split('T')[0] }
      needsUpdate = true 
  }

  // 如果發現有缺欄位，立刻寫回資料庫，永久修復它！
  if (needsUpdate) {
    console.log("🛠️ 偵測到舊行程資料結構不完整，正在自動修復...", updatePayload)
    try {
      await updateDoc(doc(db, "trip_details", props.tripId), updatePayload)
    } catch (e) {
      console.error("自動修復失敗 (可能是權限問題):", e)
    }
  }
}

// --- 資料監聽 ---
watch(() => props.tripId, (newId) => {
  if (unsubscribe) unsubscribe();
  details.value = null;
  
  if (newId) {
    unsubscribe = onSnapshot(doc(db, "trip_details", newId), (snap) => {
      if (snap.exists()) {
        const data = snap.data()
        
        // 1. 本地防呆 (確保畫面不壞掉)
        if (!data.days) data.days = []
        if (!data.checklists) data.checklists = []
        if (!data.expenses) data.expenses = []
        if (!data.setup) data.setup = { destination: '', startDate: '' }

        details.value = data
        
        // 2. 觸發自動修復 (延遲執行避免搶資源)
        setTimeout(() => repairTripData(snap.data()), 1000)

      } else {
        // 萬一完全找不到文件，給預設值
        details.value = { setup: {}, days: [], checklists: [], expenses: [] }
      }
    });
  }
}, { immediate: true });

onUnmounted(() => { if (unsubscribe) unsubscribe(); });
</script>

<template>
  <div class="h-full flex flex-col bg-[#FDFBF7] overflow-hidden">
    
    <header 
      v-if="details"
      class="bg-[#F2EDE4] px-4 border-b border-[#E9E2D7] transition-all duration-500 ease-in-out shrink-0 z-40"
      :class="isHeaderShrunk ? 'py-2 shadow-md' : 'py-4'"
    >
      <div class="flex items-center justify-between gap-3 max-w-5xl mx-auto w-full">
        <button @click="emit('openMenu')" 
          class="bg-white rounded-xl border border-[#E9E2D7] text-[#E6B3A3] shrink-0 transition-all duration-500 flex items-center justify-center shadow-sm active:scale-95"
          :class="isHeaderShrunk ? 'w-9 h-9' : 'w-10 h-10'">
          <i class="ph-bold ph-list" :class="isHeaderShrunk ? 'text-lg' : 'text-xl'"></i>
        </button>
        
        <div class="flex-1 min-w-0 flex flex-col justify-center">
          <input 
            v-model="details.setup.destination"
            @blur="updateDestination($event.target.value)"
            @keyup.enter="$event.target.blur()"
            class="w-full font-black text-[#8B7E74] bg-transparent outline-none transition-all duration-500 tracking-tight placeholder-[#D1C7BD]"
            :class="isHeaderShrunk ? 'text-base' : 'text-xl'"
            placeholder="點此輸入行程名稱..."
          />
          
          <div 
            class="flex items-center gap-1.5 mt-0.5 group w-fit transition-all duration-300 origin-left"
            :class="isHeaderShrunk ? 'scale-0 opacity-0 h-0' : 'scale-100 opacity-100'"
          >
            <i class="ph-bold ph-calendar-blank text-[#BAB3A9] text-xs group-hover:text-[#E6B3A3] transition-colors"></i>
            <input 
              type="date" 
              :value="details.setup.startDate"
              @input="e => details.setup.startDate = e.target.value"
              @change="updateStartDate($event.target.value)"
              class="bg-transparent text-[10px] font-bold text-[#BAB3A9] outline-none font-mono uppercase tracking-wider hover:text-[#E6B3A3] transition-colors cursor-pointer"
            >
          </div>
        </div>

        <div class="flex bg-white/60 rounded-xl p-1 border border-[#E9E2D7] shrink-0 transition-all duration-500 origin-right"
             :class="isHeaderShrunk ? 'scale-95' : 'scale-100'">
          
          <button @click="activeTab = 'plan'" 
            class="px-3 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1"
            :class="activeTab === 'plan' ? 'bg-[#E6B3A3] text-white shadow-sm' : 'text-[#BAB3A9] hover:bg-white/50'">
            <i class="ph-fill ph-calendar-blank text-lg"></i>
          </button>

          <button @click="activeTab = 'checklist'" 
            class="px-3 py-1.5 rounded-lg ml-1 transition-all flex items-center justify-center gap-1"
            :class="activeTab === 'checklist' ? 'bg-[#E6B3A3] text-white shadow-sm' : 'text-[#BAB3A9] hover:bg-white/50'">
            <i class="ph-bold ph-list-checks text-lg"></i>
          </button>

          <button @click="activeTab = 'money'" 
            class="px-3 py-1.5 rounded-lg ml-1 transition-all flex items-center justify-center gap-1"
            :class="activeTab === 'money' ? 'bg-[#E6B3A3] text-white shadow-sm' : 'text-[#BAB3A9] hover:bg-white/50'">
            <i class="ph-fill ph-currency-dollar text-lg"></i>
          </button>
        </div>

      </div>
    </header>

    <main class="flex-1 overflow-hidden relative">
      <transition name="fade">
        
        <div v-if="details" class="h-full absolute inset-0 w-full" key="content">
          <TripPlan 
            v-if="activeTab === 'plan'" 
            :key="tripId + '-plan'"
            :details="details" 
            :tripId="tripId" 
            @shrink="val => isHeaderShrunk = val" 
          />
          
          <TripChecklist 
            v-else-if="activeTab === 'checklist'"
            :key="tripId + '-checklist'"
            :checklists="details.checklists"
            @update="syncChecklist" 
          />

          <TripMoney 
            v-else-if="activeTab === 'money'" 
            :key="tripId + '-money'"
            :details="details" 
            :tripId="tripId" 
          />
        </div>

        <div v-else class="h-full flex flex-col items-center justify-center gap-3 bg-[#FDFBF7] absolute inset-0 w-full" key="loading">
          <i class="ph-bold ph-circle-notch animate-spin text-3xl text-[#E6B3A3]"></i>
          <span class="text-[10px] font-bold text-[#BAB3A9] tracking-widest uppercase">載入中...</span>
        </div>

      </transition>
    </main>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.h-full { height: 100dvh; }

/* 移除 date input 的預設 icon，讓介面更乾淨 */
input[type="date"]::-webkit-calendar-picker-indicator {
    opacity: 0;
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    cursor: pointer;
}
input[type="date"] {
    position: relative;
}
</style>