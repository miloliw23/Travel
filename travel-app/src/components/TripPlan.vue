<script setup>
import { ref, nextTick, onMounted } from 'vue'
import { db } from '../firebase'
import { doc, updateDoc } from 'firebase/firestore'
import draggable from 'vuedraggable'

// 只需要接收資料，不需要處理切換 Tab 了
const props = defineProps(['details', 'tripId'])
const emit = defineEmits(['shrink'])

// --- 核心狀態 ---
const currentDayIdx = ref(0)
const isShrinkActive = ref(false)
const showImportModal = ref(false)
const importText = ref('')
const isEditingLoc = ref(false)
const locInputRef = ref(null)

// --- 時間設定 (00-23 時, 00-59 分) ---
const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'))
const minutes = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'))

// --- 天氣狀態 ---
const weather = ref({ temp: '', desc: '', loading: false })
const weatherCodeMap = {
  0: '晴朗', 1: '多雲', 2: '陰天', 3: '陰天',
  45: '起霧', 48: '起霧',
  51: '毛毛雨', 53: '毛毛雨', 55: '毛毛雨',
  61: '下雨', 63: '下雨', 65: '大雨',
  80: '陣雨', 81: '陣雨', 82: '暴雨',
  95: '雷雨', 96: '雷雨伴冰雹', 99: '暴雨伴冰雹'
}

// --- 初始化 ---
onMounted(() => {
  if (props.details?.setup?.location) {
    fetchWeather(props.details.setup.location)
  }
})

// --- 滾動監聽 (Header縮小特效) ---
const onScroll = (e) => {
  const scrollTop = e.target.scrollTop
  if (scrollTop > 50 && !isShrinkActive.value) {
    isShrinkActive.value = true; emit('shrink', true)
  } else if (scrollTop < 10 && isShrinkActive.value) {
    isShrinkActive.value = false; emit('shrink', false)
  }
}

// --- 天氣查詢邏輯 (優化版) ---
const fetchWeather = async (inputCity) => {
  if (!inputCity) { 
    weather.value = { temp: '', desc: '', loading: false }
    return 
  }
  
  if (inputCity.length < 2 && !/^[a-zA-Z]+$/.test(inputCity) && !/[\u4e00-\u9fa5]/.test(inputCity)) {
     return 
  }

  weather.value.loading = true
  let searchKeyword = inputCity.replace(/台/g, '臺')

  const queryApi = async (keyword, lang = null) => {
    let url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(keyword)}&count=5&format=json`
    if (lang) url += `&language=${lang}`
    const res = await fetch(url)
    return await res.json()
  }

  try {
    let geoData = await queryApi(searchKeyword, 'zh')

    if (!geoData.results && searchKeyword.length === 2) {
      geoData = await queryApi(searchKeyword + '市', 'zh')
      if (!geoData.results) {
         geoData = await queryApi(searchKeyword + '縣', 'zh')
      }
    }

    if (!geoData.results) {
       geoData = await queryApi(searchKeyword, null)
    }

    if (!geoData.results || geoData.results.length === 0) {
        weather.value = { temp: '?', desc: '未知', loading: false }
        return
    }

    const location = geoData.results[0]
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,weather_code&timezone=auto`
    const weatherRes = await fetch(weatherUrl)
    const weatherData = await weatherRes.json()

    if (weatherData.current) {
      const code = weatherData.current.weather_code
      weather.value = {
        temp: Math.round(weatherData.current.temperature_2m) + '°C',
        desc: weatherCodeMap[code] || '多雲',
        loading: false
      }
    }
  } catch (e) { 
    console.error("💥 查詢錯誤:", e)
    weather.value = { temp: 'Err', desc: '錯誤', loading: false }
  }
}

// --- 地點編輯控制 ---
const enableLocEdit = () => {
  isEditingLoc.value = true
  nextTick(() => locInputRef.value?.focus())
}

const saveLocation = async () => {
  isEditingLoc.value = false
  const loc = props.details?.setup?.location || ''
  fetchWeather(loc)

  try {
    await updateDoc(doc(db, "trip_details", props.tripId), {
       "setup.location": loc 
    })
  } catch (e) { console.error("地點儲存失敗", e) }
}

// --- 資料同步 ---
const syncData = async () => {
  if (!props.tripId) return
  try {
    // 這裡只需要同步 days，因為 checklists 已經移出去給 TripMain/TripChecklist 處理了
    await updateDoc(doc(db, "trip_details", props.tripId), { 
      days: props.details.days || []
    })
  } catch (e) { console.error("同步失敗", e) }
}

// --- 天數管理 ---
const addDay = () => {
  props.details.days.push({ items: [], location: '' })
  syncData()
  nextTick(() => {
    currentDayIdx.value = props.details.days.length - 1
  })
}

const deleteCurrentDay = async () => {
  if (!confirm(`確定要刪除 Day ${currentDayIdx.value + 1} 的所有行程嗎？`)) return
  
  props.details.days.splice(currentDayIdx.value, 1)
  
  if (props.details.days.length === 0) {
    props.details.days.push({ items: [], location: '' })
  }
  
  if (currentDayIdx.value >= props.details.days.length) {
    currentDayIdx.value = Math.max(0, props.details.days.length - 1)
  }
  
  syncData()
}

const updateTime = (element, type, value) => {
  const [h, m] = (element.time || "09:00").split(':')
  element.time = `${type === 'h' ? value : h}:${type === 'm' ? value : m}`
  syncData()
}

// --- 導航與搜尋 ---
const openNav = (loc) => {
  if (!loc) return alert('請先輸入地點名稱！')
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc)}`
  window.open(url, '_blank')
}

const searchNearby = (loc, type) => {
  const query = loc ? `${loc} ${type}` : type
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
  window.open(url, '_blank')
}

// --- 輔助功能 ---
const getDisplayDate = (idx) => {
  if (!props.details?.setup?.startDate) return ''
  const date = new Date(props.details.setup.startDate)
  date.setDate(date.getDate() + idx)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

const copyInviteCode = () => {
  navigator.clipboard.writeText(props.tripId)
  alert("邀請碼已複製！")
}

const parseAndImport = () => {
  if (!importText.value.trim() || !props.details?.days) return
  const blocks = importText.value.split('=====')
  const newItems = blocks.map(block => {
    const activity = (block.match(/活動內容[:：]\s*(.+)/) || [])[1]?.trim()
    const location = (block.match(/地點[:：]\s*(.+)/) || [])[1]?.trim()
    const timeMatch = block.match(/時間[:：]\s*(\d{1,2})[:：](\d{1,2})/)
    let time = '09:00'
    if (timeMatch) time = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2].padStart(2, '0')}`
    if (activity || location) return { id: Date.now() + Math.random(), time, activity: activity || '新行程', location: location || '', type: 'spot' }
    return null
  }).filter(i => i)
  props.details.days[currentDayIdx.value].items.push(...newItems)
  syncData(); showImportModal.value = false; importText.value = ''
}
</script>

<template>
  <div class="h-full flex flex-col bg-[#FDFBF7] text-[#8B7E74] overflow-hidden relative">
    
    <div 
      class="bg-[#F2EDE4] px-4 rounded-b-[32px] shadow-sm shrink-0 z-30 transition-all duration-500 ease-in-out"
      :class="isShrinkActive ? 'py-2' : 'py-4'"
    >
      <div class="flex gap-2 overflow-x-auto no-scrollbar scroll-smooth touch-pan-x pl-1">
        <button v-for="(day, idx) in details?.days || []" :key="idx" 
          @click="currentDayIdx = idx"
          class="flex-shrink-0 rounded-[18px] border-2 flex flex-col items-center justify-center transition-all duration-300 relative overflow-hidden"
          :class="[
            currentDayIdx === idx ? 'bg-[#E6B3A3] border-[#E6B3A3] text-white shadow-md scale-100' : 'bg-white border-[#E9E2D7] text-[#BAB3A9] scale-95',
            isShrinkActive ? 'w-10 h-12' : 'w-14 h-16'
          ]">
          <span class="font-bold uppercase tracking-wider transition-all" :class="isShrinkActive ? 'text-[8px]' : 'text-[10px]'">Day</span>
          <span class="font-black transition-all leading-none" :class="isShrinkActive ? 'text-sm' : 'text-xl'">{{ idx + 1 }}</span>
        </button>
        
        <button @click="addDay" 
          class="flex-shrink-0 border-2 border-dashed border-[#BAB3A9] text-[#BAB3A9] flex items-center justify-center transition-all duration-300 hover:bg-white hover:border-[#E6B3A3] hover:text-[#E6B3A3]"
          :class="isShrinkActive ? 'w-10 h-12 rounded-[16px]' : 'w-14 h-16 rounded-[18px]'">
          <i class="ph-bold ph-plus" :class="isShrinkActive ? 'text-sm' : 'text-xl'"></i>
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto px-5 py-4 relative custom-scroll pb-2" @scroll="onScroll">
        
      <div 
        class="sticky top-0 z-20 bg-[#FDFBF7]/95 backdrop-blur-sm py-3 transition-all duration-300"
        :class="isShrinkActive ? 'mb-4 border-b border-[#F2EDE4]' : 'mb-6'"
      >
        <div class="flex justify-between items-end">
          <div class="flex flex-col min-w-0 relative">
            <h2 class="font-black text-[#8B7E74] tracking-tight transition-all duration-300 leading-none flex items-center gap-2"
                :class="isShrinkActive ? 'text-2xl' : 'text-3xl'">
              Day {{ currentDayIdx + 1 }}
              <span class="text-sm font-bold text-[#BAB3A9] tracking-widest uppercase mt-1">{{ getDisplayDate(currentDayIdx) }}</span>
            </h2>

            <div class="flex items-center gap-2 mt-2 h-7">
              <input 
                v-if="isEditingLoc"
                ref="locInputRef"
                :value="details.setup?.location"
                @input="e => details.setup.location = e.target.value"
                @blur="saveLocation"
                @keyup.enter="saveLocation"
                class="bg-white border border-[#E6B3A3] rounded-lg px-2 py-0.5 text-sm font-bold text-[#8B7E74] outline-none w-32 shadow-sm animate-fade-in"
                placeholder="輸入城市..."
              />
              
              <div v-else @click="enableLocEdit" class="flex items-center gap-2 cursor-pointer group hover:bg-white px-2 py-1 -ml-2 rounded-xl transition-all">
                <i class="ph-fill ph-map-pin text-[#E6B3A3] group-hover:scale-110 transition"></i>
                <span class="text-sm font-bold text-[#8B7E74] border-b border-transparent group-hover:border-[#E6B3A3]/50 transition-colors">
                    {{ details?.setup?.location || '設定地點' }}
                </span>
                
                <div v-if="weather.temp && !weather.loading" class="flex items-center gap-1.5 ml-1 bg-white px-2 py-0.5 rounded-full border border-[#F2EDE4] shadow-sm">
                  <span class="text-xs font-black text-[#E6B3A3]">{{ weather.temp }}</span>
                  <span class="text-[10px] font-bold text-[#BAB3A9]">{{ weather.desc }}</span>
                </div>
                <div v-if="weather.loading" class="ml-2">
                    <i class="ph-bold ph-spinner animate-spin text-[#E6B3A3] text-sm"></i>
                </div>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2 mb-1">
            <button @click="deleteCurrentDay" class="bg-white p-2.5 rounded-xl border border-[#F2EDE4] text-[#BAB3A9] hover:text-red-400 active:scale-95 transition-all shadow-sm">
              <i class="ph-bold ph-trash text-lg"></i>
            </button>
            <button @click="copyInviteCode" class="bg-white p-2.5 rounded-xl border border-[#F2EDE4] text-[#BAB3A9] active:scale-95 transition-all shadow-sm">
              <i class="ph-bold ph-share-network text-lg"></i>
            </button>
            <button v-show="!isShrinkActive" @click="showImportModal = true" class="bg-white px-3 py-2.5 rounded-xl border border-[#F2EDE4] text-[#E6B3A3] flex items-center gap-1 active:scale-95 transition-all shadow-sm">
              <i class="ph-fill ph-magic-wand text-lg"></i>
            </button>
          </div>
        </div>
      </div>

      <div class="absolute left-[34px] top-28 bottom-20 w-[2px] bg-[#F2EDE4] z-0"></div>

      <div v-if="details.days[currentDayIdx]?.items.length === 0" class="text-center py-8 opacity-50 relative z-10">
          <p class="text-sm font-bold text-[#BAB3A9]">目前沒有行程，快去新增吧！</p>
      </div>

      <draggable 
        v-if="details?.days && details.days[currentDayIdx]"
        v-model="details.days[currentDayIdx].items" 
        item-key="id" 
        @end="syncData" 
        handle=".drag-handle" 
        class="space-y-4 z-10 relative pb-32" 
      >
        <template #item="{ element, index }">
          <div class="relative pl-8 flex w-full animate-fade-in group">
            
            <div class="absolute left-[-5px] top-6 w-3.5 h-3.5 rounded-full border-[3px] border-[#FDFBF7] shadow-sm z-20 transition-colors"
                :class="index % 2 === 0 ? 'bg-[#E6B3A3]' : 'bg-[#D1C7BD]'"></div>
            
            <div class="bg-white rounded-[24px] p-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] border border-[#F2EDE4] w-full hover:border-[#E6B3A3]/50 transition-colors">
              <div class="flex items-start gap-3">
                
                <div class="flex items-center justify-center gap-0.5 bg-[#FAF8F5] px-2 py-3 rounded-xl border border-[#F2EDE4]/50 shrink-0 h-fit">
                  <select :value="element.time?.split(':')[0] || '09'" @change="e => updateTime(element, 'h', e.target.value)" 
                    class="bg-transparent font-black text-base outline-none text-[#8B7E74] appearance-none text-center cursor-pointer hover:text-[#E6B3A3] w-7 p-0 border-none focus:ring-0">
                    <option v-for="h in hours" :key="h" :value="h">{{h}}</option>
                  </select>
                  <span class="text-[#D1C7BD] font-black text-sm relative -top-[1px]">:</span>
                  <select :value="element.time?.split(':')[1] || '00'" @change="e => updateTime(element, 'm', e.target.value)" 
                    class="bg-transparent font-black text-base outline-none text-[#8B7E74] appearance-none text-center cursor-pointer hover:text-[#E6B3A3] w-7 p-0 border-none focus:ring-0">
                    <option v-for="m in minutes" :key="m" :value="m">{{m}}</option>
                  </select>
                </div>

                <div class="flex-1 min-w-0 flex flex-col gap-2">
                  <div>
                    <input v-model="element.activity" @blur="syncData" placeholder="行程名稱" 
                      class="text-lg font-black bg-transparent outline-none w-full text-[#8B7E74] placeholder-[#E0D8D0] mb-1">
                    <div class="flex items-center gap-1.5 text-[#BAB3A9]">
                      <i class="ph-fill ph-map-pin text-xs shrink-0"></i>
                      <input v-model="element.location" @blur="syncData" placeholder="輸入地點以啟用導航..." 
                        class="bg-transparent outline-none w-full text-xs font-bold text-[#8B7E74] placeholder-[#E0D8D0]">
                    </div>
                  </div>

                  <div class="flex items-center gap-2 pt-1 overflow-x-auto no-scrollbar">
                    <button @click="openNav(element.location)" 
                      class="flex items-center gap-1 bg-[#FAF8F5] px-3 py-1.5 rounded-lg text-[10px] font-bold text-[#8B7E74] hover:bg-[#E6B3A3] hover:text-white transition-colors border border-[#F2EDE4] active:scale-95 shrink-0 shadow-sm">
                      <i class="ph-fill ph-navigation-arrow"></i> 導航
                    </button>
                    <div class="w-[1px] h-3 bg-[#E9E2D7] shrink-0"></div>
                    <div class="flex gap-1.5">
                      <button @click="searchNearby(element.location, '美食')" class="bg-[#FAF8F5] w-7 h-7 rounded-lg flex items-center justify-center border border-[#F2EDE4] hover:border-[#E6B3A3] text-xs transition active:scale-95 shadow-sm text-[#8B7E74]" title="找餐廳">🍴</button>
                      <button @click="searchNearby(element.location, '景點')" class="bg-[#FAF8F5] w-7 h-7 rounded-lg flex items-center justify-center border border-[#F2EDE4] hover:border-[#E6B3A3] text-xs transition active:scale-95 shadow-sm text-[#8B7E74]" title="找景點">🎡</button>
                      <button @click="searchNearby(element.location, '飲料')" class="bg-[#FAF8F5] w-7 h-7 rounded-lg flex items-center justify-center border border-[#F2EDE4] hover:border-[#E6B3A3] text-xs transition active:scale-95 shadow-sm text-[#8B7E74]" title="找飲料">🧋</button>
                    </div>
                  </div>
                </div>

                <div class="flex flex-col gap-1 items-center pt-1 shrink-0">
                    <button @click="details.days[currentDayIdx].items.splice(index, 1); syncData()" class="text-[#F2EDE4] hover:text-[#D98C8C] p-1 transition-colors">
                      <i class="ph-bold ph-x text-sm"></i>
                    </button>
                    <div class="drag-handle cursor-grab p-1 text-[#E0D8D0] hover:text-[#8B7E74] transition-colors">
                      <i class="ph-bold ph-dots-six-vertical text-lg"></i>
                    </div>
                </div>

              </div>
            </div>
          </div>
        </template>
      </draggable>

      <button @click="details.days[currentDayIdx].items.push({id:Date.now(), time:'09:00', activity:'', location:'', type:'spot'}); syncData()"
        class="w-full mt-4 py-4 bg-[#FAF8F5] border-2 border-dashed border-[#E9E2D7] rounded-[24px] text-[#BAB3A9] font-bold flex items-center justify-center gap-2 hover:bg-white hover:border-[#E6B3A3] hover:text-[#E6B3A3] transition-all mb-10">
        <i class="ph-bold ph-plus-circle text-lg"></i>
        <span class="text-sm">新增項目</span>
      </button>
    </div>

    <div v-if="showImportModal" class="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-[#8B7E74]/20 backdrop-blur-sm">
      <div class="bg-white w-full max-w-sm rounded-[32px] p-6 shadow-2xl border-4 border-[#F2EDE4] animate-slide-up">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-lg font-black text-[#8B7E74]">快速匯入行程</h2>
          <button @click="showImportModal = false" class="bg-[#FAF8F5] p-2 rounded-full hover:bg-[#F2EDE4]"><i class="ph-bold ph-x text-[#BAB3A9]"></i></button>
        </div>
        <textarea v-model="importText" class="w-full h-32 bg-[#FAF8F5] border border-[#E9E2D7] rounded-2xl p-4 text-xs outline-none mb-4 font-mono text-[#8B7E74] placeholder-[#D1C7BD]" placeholder="貼上文字..."></textarea>
        <button @click="parseAndImport" class="w-full bg-[#E6B3A3] text-white py-3.5 rounded-2xl font-bold shadow-md active:scale-95 transition-all">確認匯入</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scroll::-webkit-scrollbar { width: 4px; }
.custom-scroll::-webkit-scrollbar-thumb { background: #F2EDE4; border-radius: 10px; }
.no-scrollbar::-webkit-scrollbar { display: none; }
select { appearance: none; -webkit-appearance: none; }
.animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
.animate-slide-up { animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
@keyframes slideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
</style>