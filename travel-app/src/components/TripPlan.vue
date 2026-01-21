<script setup>
import { ref } from 'vue'
import { db } from '../firebase'
import { doc, updateDoc } from 'firebase/firestore'
import draggable from 'vuedraggable'

const props = defineProps(['details', 'tripId'])
const currentDayIdx = ref(0)
const showImportModal = ref(false)
const importText = ref('')

// 時間下拉選單數據
const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'))
const minutes = ['00', '15', '30', '45']

// 同步資料至 Firebase
const syncData = async () => {
  if (!props.tripId || !props.details) return
  try {
    await updateDoc(doc(db, "trip_details", props.tripId), {
      days: props.details.days
    })
  } catch (e) {
    console.error("同步失敗:", e)
  }
}

// 更新時間選單邏輯
const updateTime = (element, type, value) => {
  const [h, m] = (element.time || "09:00").split(':')
  const newH = type === 'h' ? value : h
  const newM = type === 'm' ? value : m
  element.time = `${newH}:${newM}`
  syncData()
}

// 計算日期顯示
const getDisplayDate = (idx) => {
  if (!props.details?.setup?.startDate) return '未設定日期'
  try {
    const date = new Date(props.details.setup.startDate)
    date.setDate(date.getDate() + idx)
    return date.toISOString().split('T')[0].replace(/-/g, '/')
  } catch (e) {
    return '日期錯誤'
  }
}

// 外部跳轉與搜尋功能
const openNav = (loc) => {
  if (!loc) return alert('請先輸入地點名稱！')
  window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc)}`, '_blank')
}

const searchNearby = (loc, type) => {
  const query = loc ? `${loc} ${type}` : type
  window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, '_blank')
}

// 文字行程匯入
const parseAndImport = () => {
  if (!importText.value.trim()) return
  const blocks = importText.value.split('=====')
  const newItems = blocks.map(block => {
    const activity = (block.match(/活動內容[:：]\s*(.+)/) || [])[1]?.trim()
    const location = (block.match(/地點[:：]\s*(.+)/) || [])[1]?.trim()
    const timeMatch = block.match(/時間[:：]\s*(\d{1,2})[:：](\d{1,2})/)
    let time = '09:00'
    if (timeMatch) time = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2].padStart(2, '0')}`
    
    if (activity || location) {
      return { 
        id: Date.now() + Math.random(), 
        time, 
        activity: activity || '新行程', 
        location: location || '', 
        type: 'spot' 
      }
    }
    return null
  }).filter(i => i)
  
  props.details.days[currentDayIdx.value].items.push(...newItems)
  syncData()
  showImportModal.value = false
  importText.value = ''
}
</script>

<style scoped>
/* 電腦版顯示捲軸樣式 */
.pc-scroll::-webkit-scrollbar { height: 6px; }
.pc-scroll::-webkit-scrollbar-thumb { background: #E9E2D7; border-radius: 10px; }
.pc-scroll::-webkit-scrollbar-track { background: transparent; }

.custom-scroll::-webkit-scrollbar { width: 6px; }
.custom-scroll::-webkit-scrollbar-thumb { background: #F2EDE4; border-radius: 10px; }

/* 移除下拉選單原生箭頭 */
select { -webkit-appearance: none; -moz-appearance: none; appearance: none; }
</style>
<template>
  <div class="h-full flex flex-col bg-[#FDFBF7] text-[#8B7E74] overflow-hidden">
    
    <div class="bg-[#F2EDE4] pt-4 pb-4 px-4 rounded-b-[40px] shadow-sm shrink-0">
      <div class="flex gap-4 overflow-x-auto pb-4 pc-scroll scroll-smooth touch-pan-x">
        <button v-for="(day, idx) in details.days" :key="idx" 
          @click="currentDayIdx = idx"
          class="flex-shrink-0 w-16 h-20 rounded-[24px] border-2 flex flex-col items-center justify-center transition-all"
          :class="currentDayIdx === idx ? 'bg-[#E6B3A3] border-[#E6B3A3] text-white shadow-md scale-105' : 'bg-white border-[#E9E2D7] text-[#BAB3A9]'">
          <span class="text-[10px] font-bold uppercase tracking-widest">Day</span>
          <span class="text-xl font-black">{{ idx + 1 }}</span>
        </button>
        <button @click="details.days.push({items:[], location:''}); syncData()" class="flex-shrink-0 w-16 h-20 rounded-[24px] border-2 border-dashed border-[#BAB3A9] text-[#BAB3A9] flex items-center justify-center hover:bg-white transition">
          <i class="ph-bold ph-plus text-xl"></i>
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto px-6 py-8 relative custom-scroll">
      
      <div class="flex justify-between items-end mb-8 pl-2">
        <div class="min-w-0">
          <h2 class="text-4xl font-black italic tracking-tighter">Day {{ currentDayIdx + 1 }}</h2>
          <p class="text-[#BAB3A9] text-sm font-bold tracking-widest mt-1">{{ getDisplayDate(currentDayIdx) }}</p>
        </div>
        <button @click="showImportModal = true" class="bg-white px-4 py-2.5 rounded-2xl shadow-sm border border-[#F2EDE4] text-[#E6B3A3] flex items-center gap-2 active:scale-95 transition shrink-0">
          <i class="ph-fill ph-file-arrow-up text-lg"></i>
          <span class="text-xs font-bold">[匯入]</span>
        </button>
      </div>

      <div class="absolute left-[39px] top-32 bottom-20 w-0.5 bg-[#F2EDE4] z-0"></div>

      <draggable v-model="details.days[currentDayIdx].items" item-key="id" @end="syncData" handle=".drag-handle" class="space-y-8 z-10 relative">
        <template #item="{ element, index }">
          <div class="relative pl-12 flex w-full">
            <div class="absolute left-[-11px] top-10 w-4 h-4 rounded-full border-[3px] border-white shadow-sm z-20"
                 :class="index % 2 === 0 ? 'bg-[#E6B3A3]' : 'bg-[#8B7E74]'"></div>
            
            <div class="bg-white rounded-[32px] p-6 shadow-sm border border-[#F2EDE4] w-full max-w-2xl">
              <div class="flex flex-col gap-4">
                
                <div class="flex items-center gap-2 border-b border-[#FAF8F5] pb-3 flex-nowrap">
                  <div class="flex items-center gap-2 shrink-0 bg-[#FAF8F5] px-4 py-2 rounded-xl border border-[#F2EDE4]/50">
                    <i class="ph-bold ph-clock-afternoon text-[#BAB3A9]"></i>
                    <div class="flex items-center gap-1">
                      <select :value="element.time?.split(':')[0] || '09'" @change="e => updateTime(element, 'h', e.target.value)" 
                        class="bg-transparent font-black text-xl outline-none border-none p-0 text-[#8B7E74] cursor-pointer appearance-none">
                        <option v-for="h in hours" :key="h" :value="h">{{h}}</option>
                      </select>
                      <span class="font-bold text-[#BAB3A9]">:</span>
                      <select :value="element.time?.split(':')[1] || '00'" @change="e => updateTime(element, 'm', e.target.value)" 
                        class="bg-transparent font-black text-xl outline-none border-none p-0 text-[#8B7E74] cursor-pointer appearance-none">
                        <option v-for="m in minutes" :key="m" :value="m">{{m}}</option>
                      </select>
                    </div>
                  </div>
                  
                  <select v-model="element.type" @change="syncData" class="shrink-0 bg-[#E6B3A3]/10 text-[#E6B3A3] rounded-xl px-4 py-2 text-xs font-bold border-none appearance-none min-w-[90px] text-center">
                    <option value="spot">📍 景點</option>
                    <option value="food">🍴 美食</option>
                    <option value="hotel">🏨 住宿</option>
                  </select>

                  <div class="flex-1"></div>
                  <div class="drag-handle cursor-grab text-[#F2EDE4] p-1 shrink-0"><i class="ph-bold ph-dots-six-vertical text-xl"></i></div>
                </div>

                <div class="space-y-4">
                  <input v-model="element.activity" @blur="syncData" placeholder="行程標題" class="text-2xl font-bold text-[#5D5C5A] bg-transparent outline-none w-full">
                  
                  <div class="space-y-3">
                    <div class="flex items-center gap-2 bg-[#FAF8F5] px-4 py-3 rounded-2xl border border-[#F2EDE4]/50">
                      <i class="ph-fill ph-map-pin text-[#E6B3A3] shrink-0"></i>
                      <input v-model="element.location" @blur="syncData" placeholder="地點名稱" class="bg-transparent outline-none w-full text-sm font-medium">
                    </div>

                    <div class="flex gap-2 overflow-x-auto pc-scroll py-1 shrink-0">
                      <button @click="searchNearby(element.location, '熱門餐廳')" class="shrink-0 bg-[#FDFBF7] border border-[#E6B3A3]/30 px-3 py-1.5 rounded-full text-[10px] font-bold text-[#E6B3A3] whitespace-nowrap active:bg-[#E6B3A3] active:text-white transition">🍴 找餐廳</button>
                      <button @click="searchNearby(element.location, '景點')" class="shrink-0 bg-[#FDFBF7] border border-[#8B7E74]/30 px-3 py-1.5 rounded-full text-[10px] font-bold text-[#8B7E74] whitespace-nowrap active:bg-[#8B7E74] active:text-white transition">🎡 找景點</button>
                      <button @click="searchNearby(element.location, '飲料店')" class="shrink-0 bg-[#FDFBF7] border border-[#BAB3A9]/30 px-3 py-1.5 rounded-full text-[10px] font-bold text-[#BAB3A9] whitespace-nowrap active:bg-[#BAB3A9] active:text-white transition">🧋 飲料店</button>
                    </div>
                  </div>

                  <div class="flex gap-3 pt-2">
                    <button @click="openNav(element.location)" class="flex-1 bg-[#FDFBF7] border border-[#F2EDE4] py-3.5 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 active:scale-95 transition shadow-sm">
                      <i class="ph-fill ph-navigation-arrow text-[#E6B3A3]"></i> 開啟導航
                    </button>
                    <button @click="details.days[currentDayIdx].items.splice(index, 1); syncData()" class="p-3 text-[#F2EDE4] hover:text-[#D98C8C] transition">
                      <i class="ph-bold ph-trash"></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </draggable>

      <button @click="details.days[currentDayIdx].items.push({id:Date.now(), time:'09:00', activity:'', location:'', type:'spot'}); syncData()"
        class="w-full mt-8 py-6 bg-white border-2 border-dashed border-[#F2EDE4] rounded-[32px] text-[#BAB3A9] font-bold flex items-center justify-center gap-2 mb-24 shadow-sm active:bg-[#FAF8F5] transition">
        <i class="ph-bold ph-plus-circle text-xl"></i>
        <span>新增行程</span>
      </button>
    </div>

    <div v-if="showImportModal" class="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-[#8B7E74]/20 backdrop-blur-sm">
      <div class="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl border-4 border-[#F2EDE4]">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-xl font-bold text-[#8B7E74]">快速匯入行程</h2>
          <button @click="showImportModal = false"><i class="ph-bold ph-x text-[#BAB3A9] text-xl"></i></button>
        </div>
        <div class="bg-[#FAF8F5] p-3 rounded-xl mb-4 text-[10px] text-[#BAB3A9] leading-relaxed">
          格式參考：<br>活動內容: 築地市場<br>時間: 09:00<br>地點: 東京都中央區<br>=====
        </div>
        <textarea v-model="importText" class="w-full h-40 bg-[#FAF8F5] border-2 border-[#F2EDE4] rounded-2xl p-4 text-sm outline-none mb-6 font-mono"></textarea>
        <button @click="parseAndImport" class="w-full bg-[#E6B3A3] text-white py-4 rounded-2xl font-bold active:scale-95 transition">開始匯入</button>
      </div>
    </div>
  </div>
</template>