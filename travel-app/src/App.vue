<script setup>
import { ref, computed, onMounted, watch } from 'vue'

const currentTab = ref('itinerary') 

// --- 1. 行程與天氣 ---
const newEvent = ref({ time: '', activity: '', location: '' })
const itinerary = ref([
  { id: 1, time: '09:00', activity: '參觀雷門', location: '浅草寺', temp: '18°C', weather: '晴' },
  { id: 2, time: '12:30', activity: '午餐壽司', location: '築地市場', temp: '20°C', weather: '多雲' }
])

const fetchWeather = () => {
  const weathers = ['晴', '多雲', '雨', '陰']
  const randomTemp = Math.floor(Math.random() * (25 - 15) + 15)
  return { temp: `${randomTemp}°C`, weather: weathers[Math.floor(Math.random() * weathers.length)] }
}

const addEvent = () => {
  if (!newEvent.value.time || !newEvent.value.activity) return
  const weatherInfo = fetchWeather()
  itinerary.value.push({ id: Date.now(), ...newEvent.value, ...weatherInfo })
  newEvent.value = { time: '', activity: '', location: '' }
  itinerary.value.sort((a, b) => a.time.localeCompare(b.time))
}

const removeEvent = (id) => itinerary.value = itinerary.value.filter(item => item.id !== id)

// --- 2. 分帳系統 ---
const members = ref(['我', '朋友A', '朋友B'])
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

const settlement = computed(() => {
  const total = expenses.value.reduce((sum, item) => sum + item.amount, 0)
  const perPerson = total / members.value.length
  const balances = {}
  members.value.forEach(m => balances[m] = -perPerson)
  expenses.value.forEach(item => balances[item.payer] += item.amount)

  const results = []
  for (const [name, amount] of Object.entries(balances)) {
    if (amount > 1) results.push(`${name} 應收 $${Math.round(amount)}`)
    else if (amount < -1) results.push(`${name} 應付 $${Math.round(Math.abs(amount))}`)
    else results.push(`${name} 已結清`)
  }
  return { total, perPerson: Math.round(perPerson), results }
})

const openMap = (location) => {
  if (!location) return
  window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`, '_blank')
}

// --- 自動存檔 ---
onMounted(() => {
  const savedItinerary = localStorage.getItem('travel-itinerary')
  const savedExpenses = localStorage.getItem('travel-expenses')
  if (savedItinerary) itinerary.value = JSON.parse(savedItinerary)
  if (savedExpenses) expenses.value = JSON.parse(savedExpenses)
})

watch(itinerary, (newVal) => localStorage.setItem('travel-itinerary', JSON.stringify(newVal)), { deep: true })
watch(expenses, (newVal) => localStorage.setItem('travel-expenses', JSON.stringify(newVal)), { deep: true })
</script>

<template>
  <div class="min-h-screen bg-stone-50 text-stone-700 font-sans">
    <header class="bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-stone-100 px-6 py-4 shadow-sm">
      <div class="max-w-md mx-auto flex justify-between items-center">
        <h1 class="text-xl font-bold tracking-widest text-stone-800">TRAVEL<span class="text-teal-600">.LOG</span></h1>
      </div>
    </header>

    <main class="max-w-md mx-auto p-4 pb-24">
      <div class="flex p-1 bg-stone-200 rounded-xl mb-6">
        <button @click="currentTab = 'itinerary'" :class="['flex-1 py-2 text-sm font-medium rounded-lg transition-all', currentTab === 'itinerary' ? 'bg-white shadow text-teal-700' : 'text-stone-500']">每日行程</button>
        <button @click="currentTab = 'expense'" :class="['flex-1 py-2 text-sm font-medium rounded-lg transition-all', currentTab === 'expense' ? 'bg-white shadow text-teal-700' : 'text-stone-500']">分帳管家</button>
      </div>

      <div v-if="currentTab === 'itinerary'" class="space-y-4">
        <div class="bg-white p-5 rounded-2xl shadow-sm border border-stone-100">
          <div class="flex gap-2 mb-3">
            <input v-model="newEvent.time" type="time" class="p-2 bg-stone-50 rounded-lg w-1/3 text-sm">
            <input v-model="newEvent.activity" placeholder="活動" class="p-2 bg-stone-50 rounded-lg flex-1 text-sm">
          </div>
          <div class="flex gap-2">
            <input v-model="newEvent.location" placeholder="地點" class="p-2 bg-stone-50 rounded-lg flex-1 text-sm">
            <button @click="addEvent" class="bg-stone-800 text-white px-4 rounded-lg text-sm">＋</button>
          </div>
        </div>
        <div class="space-y-4">
          <div v-for="item in itinerary" :key="item.id" class="bg-white p-4 rounded-xl shadow-sm border border-stone-100 relative">
            <div class="flex justify-between items-start">
              <span class="text-2xl font-light">{{ item.time }}</span>
              <div class="bg-blue-50 text-blue-600 px-2 py-1 rounded-full text-xs">{{ item.weather }} {{ item.temp }}</div>
            </div>
            <h4 class="font-bold text-lg my-2">{{ item.activity }}</h4>
            <div class="flex justify-between items-center">
              <button @click="openMap(item.location)" class="text-xs text-stone-400 hover:text-teal-600">📍 {{ item.location || '導航' }}</button>
              <button @click="removeEvent(item.id)" class="text-xs text-red-300">刪除</button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="currentTab === 'expense'" class="space-y-4">
        <div class="bg-stone-800 text-stone-100 p-6 rounded-2xl shadow-lg">
          <div class="flex justify-between mb-4">
            <div><div class="text-xs text-stone-400">總支出</div><div class="text-2xl">${{ settlement.total }}</div></div>
            <div class="text-right"><div class="text-xs text-stone-400">每人均攤</div><div class="text-2xl">${{ settlement.perPerson }}</div></div>
          </div>
          <div class="space-y-1 text-sm border-t border-stone-700 pt-2">
            <div v-for="(res, idx) in settlement.results" :key="idx" :class="res.includes('應收') ? 'text-teal-300' : 'text-red-300'">{{ res }}</div>
          </div>
        </div>
        <div class="bg-white p-5 rounded-2xl shadow-sm border border-stone-100">
          <div class="flex gap-2 mb-2">
            <select v-model="newExpense.payer" class="p-2 bg-stone-50 rounded-lg text-sm"><option v-for="m in members" :key="m" :value="m">{{ m }}</option></select>
            <input v-model="newExpense.amount" type="number" placeholder="$" class="p-2 bg-stone-50 rounded-lg flex-1 text-sm">
          </div>
          <div class="flex gap-2">
            <input v-model="newExpense.note" placeholder="項目" class="p-2 bg-stone-50 rounded-lg flex-1 text-sm">
            <button @click="addExpense" class="bg-teal-600 text-white px-4 rounded-lg text-sm">記帳</button>
          </div>
        </div>
        <div class="space-y-2">
          <div v-for="exp in expenses" :key="exp.id" class="flex justify-between p-3 bg-white rounded-xl border border-stone-50">
            <div><div class="font-bold text-sm">{{ exp.note }}</div><div class="text-xs text-stone-400">{{ exp.payer }} 付款</div></div>
            <div class="font-mono">${{ exp.amount }}</div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>