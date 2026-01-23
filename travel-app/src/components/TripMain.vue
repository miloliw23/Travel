<script setup>
import { ref, watch, onUnmounted } from 'vue'
import { db } from '../firebase'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'

// 引入子組件
import TripPlan from './TripPlan.vue'
import TripMoney from './TripMoney.vue'
import TripChecklist from './TripChecklist.vue' // 🔥 1. 引入清單組件

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

// --- 🔥 2. 清單同步更新函式 ---
// 當 TripChecklist 發出 @update 事件時呼叫此函式
const syncChecklist = async () => {
  if (!props.tripId || !details.value) return
  try {
    await updateDoc(doc(db, "trip_details", props.tripId), {
      checklists: details.value.checklists || []
    })
  } catch (e) { console.error("清單同步失敗:", e) }
}

// --- 資料監聽 ---
watch(() => props.tripId, (newId) => {
  if (unsubscribe) unsubscribe();
  details.value = null;
  
  if (newId) {
    unsubscribe = onSnapshot(doc(db, "trip_details", newId), (snap) => {
      if (snap.exists()) {
        const data = snap.data()
        // 確保陣列存在，防止報錯
        if (!data.days) data.days = []
        if (!data.checklists) data.checklists = [] // 🔥 確保 checklists 存在
        details.value = data
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
        
        <div class="flex-1 min-w-0">
          <input 
            v-model="details.setup.destination"
            @blur="updateDestination($event.target.value)"
            @keyup.enter="$event.target.blur()"
            class="w-full font-black text-[#8B7E74] bg-transparent outline-none transition-all duration-500 tracking-tight placeholder-[#D1C7BD]"
            :class="isHeaderShrunk ? 'text-base' : 'text-xl'"
            placeholder="點此輸入行程名稱..."
          />
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
.fade-enter-active, .fade-leave-active { 
  transition: opacity 0.2s ease; 
}
.fade-enter-from, .fade-leave-to { 
  opacity: 0; 
}
.h-full { height: 100dvh; }
</style>