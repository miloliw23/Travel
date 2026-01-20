<script setup>
import { ref, computed, onMounted } from 'vue'

// --- 狀態管理 ---
const currentTab = ref('itinerary') // 'itinerary' or 'expense'

// --- 1. 行程與天氣功能 ---
const newEvent = ref({ time: '', activity: '', location: '' })
const itinerary = ref([
  { id: 1, time: '09:00', activity: '參觀雷門', location: '浅草寺', temp: '18°C', weather: '晴' },
  { id: 2, time: '12:30', activity: '午餐壽司', location: '築地市場', temp: '20°C', weather: '多雲' }
])

// 模擬天氣 API (真實專案請替換為 fetch OpenWeatherMap)
const fetchWeather = (location) => {
  // 這裡隨機回傳天氣，實際請接 API
  const weathers = ['晴', '多雲', '雨', '陰']
  const randomTemp = Math.floor(Math.random() * (25 - 15) + 15)
  return {
    temp: `${randomTemp}°C`,
    weather: weathers[Math.floor(Math.random() * weathers.length)]
  }
}

const addEvent = () => {
  if (!newEvent.value.time || !newEvent.value.activity) return
  
  const weatherInfo = fetchWeather(newEvent.value.location)
  
  itinerary.value.push({
    id: Date.now(),
    ...newEvent.value,
    ...weatherInfo
  })
  
  // 重置輸入並排序
  newEvent.value = { time: '', activity: '', location: '' }
  itinerary.value.sort((a, b) => a.time.localeCompare(b.time))
}

const removeEvent = (id) => {
  itinerary.value = itinerary.value.filter(item => item.id !== id)
}

// --- 2. 分帳系統 ---
const members = ref(['我', '朋友A', '朋友B']) // 預設成員
const newExpense = ref({ payer: '我', amount: '', note: '' })
const expenses = ref([
  { id: 101, payer: '我', amount: 3000, note: '機票代墊' },
  { id: 102, payer: '朋友A', amount: 500, note: '便利商店' }
])

const addExpense = () => {
  if (!newExpense.value.amount) return
  expenses.value.push({
    id: Date.now(),
    payer: newExpense.value.payer,
    amount: parseFloat(newExpense.value.amount),
    note: newExpense.value.note
  })
  newExpense.value.amount = ''
  newExpense.value.note = ''
}

// 計算分帳邏輯
const settlement = computed(() => {
  const total = expenses.value.reduce((sum, item) => sum + item.amount, 0)
  const perPerson = total / members.value.length
  
  const balances = {}
  members.value.forEach(m => balances[m] = -perPerson) // 每個人預設欠平均值
  
  expenses.value.forEach(item => {
    balances[item.payer] += item.amount // 付錢的人增加債權
  })

  const results = []
  for (const [name, amount] of Object.entries(balances)) {
    if (amount > 1) results.push(`${name} 應收 $${Math.round(amount)}`)
    else if (amount < -1) results.push(`${name} 應付 $${Math.round(Math.abs(amount))}`)
    else results.push(`${name} 已結清`)
  }
  return { total, perPerson: Math.round(perPerson), results }
})

// --- 3. 地圖導航 ---
const openMap = (location) => {
  if (!location) return
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`
  window.open(url, '_blank')
}
</script>

<template>
  <div class="min-h-screen bg-stone-50 text-stone-700 font-sans selection:bg-teal-100">
    
    <header class="bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-stone-100 px-6 py-4 shadow-sm">
      <div class="max-w-md mx-auto flex justify-between items-center">
        <h1 class="text-xl font-bold tracking-widest text-stone-800">TRAVEL<span class="text-teal-600">.LOG</span></h1>
        <div class="text-xs font-medium text-stone-400">KYOTO 2026</div>
      </div>
    </header>

    <main class="max-w-md mx-auto p-4 pb-24">
      
      <div class="flex p-1 bg-stone-200 rounded-xl mb-6">
        <button 
          @click="currentTab = 'itinerary'"
          :class="['flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-300', 
            currentTab === 'itinerary' ? 'bg-white shadow text-teal-700' : 'text-stone-500 hover:text-stone-700']">
          每日行程
        </button>
        <button 
          @click="currentTab = 'expense'"
          :class="['flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-300', 
            currentTab === 'expense' ? 'bg-white shadow text-teal-700' : 'text-stone-500 hover:text-stone-700']">
          分帳管家
        </button>
      </div>

      <div v-if="currentTab === 'itinerary'" class="space-y-4">
        
        <div class="bg-white p-5 rounded-2xl shadow-sm border border-stone-100">
          <h3 class="text-xs font-bold text-stone-400 uppercase mb-3 tracking-wider">新增計畫</h3>
          <div class="flex gap-2 mb-3">
            <input v-model="newEvent.time" type="time" class="p-2 bg-stone-50 rounded-lg border-none focus:ring-1 focus:ring-teal-500 w-1/3 text-sm">
            <input v-model="newEvent.activity" type="text" placeholder="要做什麼？" class="p-2 bg-stone-50 rounded-lg border-none focus:ring-1 focus:ring-teal-500 flex-1 text-sm">
          </div>
          <div class="flex gap-2">
            <input v-model="newEvent.location" type="text" placeholder="地點 (用於導航/天氣)" class="p-2 bg-stone-50 rounded-lg border-none focus:ring-1 focus:ring-teal-500 flex-1 text-sm">
            <button @click="addEvent" class="bg-stone-800 text-white px-4 rounded-lg text-sm hover:bg-stone-700 transition">
              ＋
            </button>
          </div>
        </div>

        <div class="relative pl-4 border-l-2 border-stone-200 space-y-6 my-6">
          <div v-for="item in itinerary" :key="item.id" class="relative pl-4 group">
            <div class="absolute -left-[21px] top-1 w-3 h-3 bg-white border-2 border-teal-500 rounded-full z-10"></div>
            
            <div class="bg-white p-4 rounded-xl shadow-sm border border-stone-100 relative overflow-hidden transition hover:shadow-md">
              <div class="flex justify-between items-start mb-2">
                <span class="text-2xl font-light text-stone-800">{{ item.time }}</span>
                <div class="flex flex-col items-end">
                   <div v-if="item.temp" class="flex items-center gap-1 text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-full mb-1">
                      <span>{{ item.weather }}</span>
                      <span class="font-bold">{{ item.temp }}</span>
                   </div>
                </div>
              </div>
              
              <h4 class="font-bold text-lg text-stone-700 mb-1">{{ item.activity }}</h4>
              
              <div class="flex justify-between items-end mt-3">
                <button @click="openMap(item.location)" class="flex items-center gap-1 text-xs text-stone-400 hover:text-teal-600 transition">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {{ item.location || '設定地點以導航' }}
                </button>
                <button @click="removeEvent(item.id)" class="text-xs text-red-300 hover:text-red-500">刪除</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="currentTab === 'expense'" class="space-y-4">
        
        <div class="bg-stone-800 text-stone-100 p-6 rounded-2xl shadow-lg">
          <h3 class="text-xs font-bold text-stone-400 uppercase tracking-wider mb-4">結算中心</h3>
          <div class="flex justify-between mb-6">
            <div>
              <div class="text-xs text-stone-400">總支出</div>
              <div class="text-2xl font-light">${{ settlement.total }}</div>
            </div>
            <div class="text-right">
              <div class="text-xs text-stone-400">每人均攤</div>
              <div class="text-2xl font-light">${{ settlement.perPerson }}</div>
            </div>
          </div>
          <div class="space-y-2 border-t border-stone-700 pt-4">
            <div v-for="(res, idx) in settlement.results" :key="idx" class="flex justify-between text-sm">
              <span class="opacity-80">{{ res.split(' ')[0] }}</span>
              <span :class="res.includes('應收') ? 'text-teal-300' : 'text-red-300'">
                {{ res.split(' ').slice(1).join(' ') }}
              </span>
            </div>
          </div>
        </div>

        <div class="bg-white p-5 rounded-2xl shadow-sm border border-stone-100">
          <div class="grid grid-cols-3 gap-2 mb-3">
            <select v-model="newExpense.payer" class="p-2 bg-stone-50 rounded-lg text-sm border-none">
              <option v-for="m in members" :key="m" :value="m">{{ m }}</option>
            </select>
            <input v-model="newExpense.amount" type="number" placeholder="$ 金額" class="col-span-2 p-2 bg-stone-50 rounded-lg text-sm border-none focus:ring-1 focus:ring-teal-500">
          </div>
          <div class="flex gap-2">
            <input v-model="newExpense.note" type="text" placeholder="項目 (例如: 晚餐)" class="flex-1 p-2 bg-stone-50 rounded-lg text-sm border-none">
            <button @click="addExpense" class="bg-teal-600 text-white px-4 rounded-lg text-sm hover:bg-teal-700 transition shadow-sm shadow-teal-200">
              記帳
            </button>
          </div>
        </div>

        <div class="space-y-2">
          <div v-for="exp in expenses" :key="exp.id" class="flex justify-between items-center bg-white p-4 rounded-xl border border-stone-50">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-xs font-bold text-stone-500">
                {{ exp.payer.charAt(0) }}
              </div>
              <div>
                <div class="text-sm font-bold text-stone-700">{{ exp.note }}</div>
                <div class="text-xs text-stone-400">{{ exp.payer }} 付款</div>
              </div>
            </div>
            <div class="font-mono text-stone-800">${{ exp.amount }}</div>
          </div>
        </div>

      </div>

    </main>
  </div>
</template>

<style>
/* 隱藏 Chrome/Safari 的捲軸，保持極簡 */
::-webkit-scrollbar {
  width: 0px;
  background: transparent;
}
</style>