<script setup>
import { ref, computed, onMounted } from 'vue'
import { db } from '../firebase'
import { doc, updateDoc } from 'firebase/firestore'

const props = defineProps(['details', 'tripId'])
const newExpense = ref({ item: '', amount: '', payer: '' })
const isFetchingRate = ref(false)
const newParticipantName = ref('')
const showMemberManager = ref(false)

// 初始化：若有成員，預設第一個為付款人
onMounted(() => { 
  if (props.details?.participants?.length > 0) {
    newExpense.value.payer = props.details.participants[0] 
  }
})

// 抓取即時匯率
const fetchExchangeRate = async () => {
  const target = props.details?.setup?.currency
  if (!target || target === 'TWD') { 
    if(props.details?.setup) props.details.setup.exchangeRate = 1; 
    syncData(); 
    return 
  }
  
  isFetchingRate.value = true
  try {
    const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${target}`)
    const data = await res.json()
    if (data?.rates?.TWD) { 
      props.details.setup.exchangeRate = data.rates.TWD; 
      syncData() 
    }
  } catch (e) { 
    console.error("匯率抓取失敗", e) 
  } finally { 
    isFetchingRate.value = false 
  }
}

// 同步回 Firebase
const syncData = async () => { 
  if (!props.tripId || !props.details) return
  await updateDoc(doc(db, "trip_details", props.tripId), { 
    expenses: props.details.expenses || [], 
    setup: props.details.setup || {}, 
    participants: props.details.participants || [] 
  }) 
}

// 新增花費
const addExpense = () => {
  if (!newExpense.value.item || !newExpense.value.amount || !newExpense.value.payer) return alert('請完整輸入項目、金額與付款人')
  
  // 確保 expenses 陣列存在
  if (!props.details.expenses) props.details.expenses = []
  
  props.details.expenses.push({ ...newExpense.value, id: Date.now() })
  
  // 重置輸入框
  newExpense.value.item = ''
  newExpense.value.amount = ''
  syncData()
}

// ✨ 修復重點：計算總花費 (加入防呆 || [])
const totalExpense = computed(() => {
  const list = props.details?.expenses || []
  return list.reduce((sum, item) => sum + Number(item.amount), 0)
})

// ✨ 修復重點：分帳邏輯 (加入防呆)
const settlementResults = computed(() => {
  const members = props.details?.participants || []
  const expenses = props.details?.expenses || []
  
  if (!members.length || !expenses.length) return []
  
  const paidMap = {}
  members.forEach(m => paidMap[m] = 0)
  
  expenses.forEach(e => {
    // 只有當付款人在名單內才計算 (防止成員被刪除後報錯)
    if (paidMap[e.payer] !== undefined) {
      paidMap[e.payer] += Number(e.amount)
    }
  })
  
  const average = totalExpense.value / members.length
  
  // 計算每個人是該付錢 (負) 還是該收錢 (正)
  let balances = members.map(m => ({ name: m, status: paidMap[m] - average }))
  
  const debts = [] // 欠錢的人
  const debtors = balances.filter(b => b.status < -0.1).sort((a, b) => a.status - b.status)
  const creditors = balances.filter(b => b.status > 0.1).sort((a, b) => b.status - a.status)
  
  // 貪婪演算法配對
  let i = 0, j = 0
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i], c = creditors[j]
    const amount = Math.min(Math.abs(d.status), c.status) // 取兩者最小公約數
    
    debts.push({ from: d.name, to: c.name, amount: Math.round(amount) })
    
    d.status += amount
    c.status -= amount
    
    if (Math.abs(d.status) < 0.1) i++
    if (Math.abs(c.status) < 0.1) j++
  }
  return debts
})
</script>

<template>
  <div class="h-full overflow-y-auto custom-scroll p-6 space-y-6 bg-[#FDFBF7] pb-32">
    
    <div class="bg-[#8B7E74] text-white p-6 rounded-[32px] shadow-lg text-center relative overflow-hidden shrink-0">
      <div class="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
      
      <div class="text-[10px] font-bold opacity-70 mb-1 uppercase tracking-widest">Total Spending</div>
      
      <div class="text-4xl font-black mb-1 flex items-baseline justify-center gap-1">
        {{ totalExpense.toLocaleString() }} 
        <span class="text-sm opacity-60 font-bold">{{ details?.setup?.currency || 'TWD' }}</span>
      </div>

      <div v-if="details?.setup?.currency && details.setup.currency !== 'TWD'" 
           class="text-xs font-bold text-white/90 mt-1 bg-black/20 px-3 py-1 rounded-full w-fit mx-auto border border-white/10 backdrop-blur-sm animate-fade-in">
        ≈ NT$ {{ Math.round(totalExpense * (details.setup.exchangeRate || 1)).toLocaleString() }}
      </div>
      
      <div class="mt-6 flex flex-col gap-3 bg-white/10 p-4 rounded-[24px] border border-white/10 backdrop-blur-sm">
        <div class="flex justify-between items-center">
          <span class="text-[10px] font-bold opacity-60">使用幣別</span>
          <select v-model="details.setup.currency" @change="fetchExchangeRate" class="bg-white text-[#8B7E74] font-bold rounded-xl px-3 py-1.5 text-xs w-24 border-none outline-none text-center">
            <option value="TWD">NT$ TWD</option>
            <option value="JPY">¥ JPY</option>
            <option value="KRW">₩ KRW</option>
            <option value="USD">$ USD</option>
            <option value="EUR">€ EUR</option>
          </select>
        </div>
        <div class="flex justify-between items-center">
          <span class="text-[10px] font-bold opacity-60">匯率 (對台幣)</span>
          <div class="flex items-center gap-2">
            <input v-model="details.setup.exchangeRate" @change="syncData" type="number" step="0.01" class="bg-white/20 w-16 text-center outline-none font-bold text-xs rounded-lg py-1 text-white placeholder-white/50">
            <button @click="fetchExchangeRate" class="w-6 h-6 flex items-center justify-center bg-white/20 rounded-full hover:bg-white/40 transition" :class="{'animate-spin': isFetchingRate}">
              <i class="ph-bold ph-arrows-clockwise text-xs"></i>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="bg-white border-2 border-[#F2EDE4] rounded-[28px] p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] shrink-0">
      <div @click="showMemberManager = !showMemberManager" class="flex justify-between items-center cursor-pointer select-none">
        <div class="flex items-center gap-2">
           <div class="bg-[#FAF8F5] p-2 rounded-full"><i class="ph-fill ph-users text-[#E6B3A3]"></i></div>
           <span class="text-xs font-black text-[#8B7E74] uppercase tracking-wide">分帳成員 ({{ details.participants?.length || 0 }})</span>
        </div>
        <i class="ph-bold text-[#BAB3A9] transition-transform duration-300" :class="showMemberManager ? 'ph-caret-up rotate-180' : 'ph-caret-down'"></i>
      </div>
      
      <div v-if="showMemberManager" class="mt-4 space-y-4 animate-fade-in">
        <div class="flex gap-2">
          <input v-model="newParticipantName" 
            @keyup.enter="() => { if(newParticipantName) { if(!details.participants) details.participants=[]; details.participants.push(newParticipantName); newParticipantName=''; syncData(); } }" 
            placeholder="輸入名字..." 
            class="flex-1 bg-[#FAF8F5] px-4 py-3 rounded-xl text-sm font-bold text-[#8B7E74] outline-none placeholder-[#D1C7BD] border border-transparent focus:border-[#E6B3A3] transition-colors">
          <button @click="() => { if(newParticipantName) { if(!details.participants) details.participants=[]; details.participants.push(newParticipantName); newParticipantName=''; syncData(); } }" 
            class="bg-[#8B7E74] text-white w-12 rounded-xl hover:bg-[#756a61] transition shadow-sm flex items-center justify-center">
            <i class="ph-bold ph-plus"></i>
          </button>
        </div>
        <div class="flex flex-wrap gap-2">
          <div v-for="p in details.participants" :key="p" class="bg-[#FAF8F5] px-3 py-1.5 rounded-full border border-[#F2EDE4] text-xs font-bold text-[#8B7E74] flex gap-2 items-center group">
            {{ p }} 
            <button @click="details.participants = details.participants.filter(x => x!==p); syncData()" class="text-[#D98C8C] hover:text-red-500 opacity-50 group-hover:opacity-100 transition-opacity">
              <i class="ph-bold ph-x"></i>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="settlementResults.length" class="bg-white border-2 border-[#F2EDE4] rounded-[28px] p-6 space-y-3 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] shrink-0 animate-fade-in">
      <div class="text-[10px] font-black text-[#BAB3A9] uppercase mb-4 tracking-widest flex items-center gap-2">
        <i class="ph-bold ph-receipt"></i> 建議結算方式
      </div>
      <div v-for="(debt, idx) in settlementResults" :key="idx" class="flex justify-between items-center bg-[#FAF8F5] p-3 rounded-2xl border border-[#F2EDE4]">
        <div class="text-xs font-bold text-[#8B7E74] flex items-center gap-2">
          <span class="bg-white px-2 py-1 rounded-lg shadow-sm text-[#E6B3A3]">{{ debt.from }}</span>
          <i class="ph-bold ph-arrow-right text-[#BAB3A9] text-[10px]"></i>
          <span class="bg-white px-2 py-1 rounded-lg shadow-sm text-[#8B7E74]">{{ debt.to }}</span>
        </div>
        <div class="text-sm font-black text-[#8B7E74]">
          ${{ debt.amount.toLocaleString() }}
        </div>
      </div>
    </div>

    <div class="bg-white border-2 border-[#F2EDE4] rounded-[32px] p-6 space-y-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] shrink-0">
      <div class="space-y-4">
        <div class="flex flex-col gap-1.5">
          <span class="text-[10px] text-[#BAB3A9] font-bold ml-2 uppercase tracking-wider">項目名稱</span>
          <input v-model="newExpense.item" class="w-full bg-[#FAF8F5] px-4 py-3.5 rounded-2xl text-sm font-bold text-[#8B7E74] outline-none border-2 border-transparent focus:border-[#E6B3A3] transition-colors placeholder-[#D1C7BD]" placeholder="例如：午餐、車票...">
        </div>
        
        <div class="flex flex-col gap-1.5">
          <span class="text-[10px] text-[#BAB3A9] font-bold ml-2 uppercase tracking-wider">金額</span>
          <input v-model="newExpense.amount" type="number" class="w-full bg-[#FAF8F5] px-4 py-3.5 rounded-2xl text-sm font-bold text-[#8B7E74] text-right outline-none border-2 border-transparent focus:border-[#E6B3A3] transition-colors placeholder-[#D1C7BD]" placeholder="0">
        </div>
        
        <div class="flex flex-col gap-1.5">
          <span class="text-[10px] text-[#BAB3A9] font-bold ml-2 uppercase tracking-wider">先付錢的人</span>
          <div class="relative">
            <select v-model="newExpense.payer" class="w-full bg-[#FAF8F5] px-4 py-3.5 rounded-2xl text-sm font-bold text-[#8B7E74] border-none outline-none appearance-none cursor-pointer focus:ring-2 focus:ring-[#E6B3A3]">
              <option value="" disabled>請選擇成員</option>
              <option v-for="p in details.participants" :key="p" :value="p">{{p}}</option>
            </select>
            <i class="ph-bold ph-caret-down absolute right-4 top-1/2 -translate-y-1/2 text-[#BAB3A9] pointer-events-none"></i>
          </div>
        </div>
      </div>
      
      <button @click="addExpense" class="w-full bg-[#8B7E74] text-white py-4 rounded-[22px] font-bold shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 mt-2">
        <i class="ph-bold ph-plus-circle text-lg"></i>
        紀錄這筆開銷
      </button>
    </div>

    <div v-if="details.expenses && details.expenses.length > 0" class="space-y-3 pb-8">
       <div class="text-[10px] font-black text-[#BAB3A9] uppercase ml-2 tracking-widest">History</div>
       <div v-for="(exp, idx) in details.expenses.slice().reverse()" :key="idx" class="bg-white p-4 rounded-[24px] border border-[#F2EDE4] flex justify-between items-center animate-fade-in shadow-sm">
          <div class="flex flex-col">
            <span class="font-bold text-[#8B7E74]">{{ exp.item }}</span>
            <span class="text-[10px] text-[#BAB3A9] font-bold bg-[#FAF8F5] w-fit px-2 py-0.5 rounded-full mt-1">由 {{ exp.payer }} 支付</span>
          </div>
          <div class="flex items-center gap-3">
             <span class="font-black text-[#8B7E74] text-lg">${{ Number(exp.amount).toLocaleString() }}</span>
             <button @click="details.expenses = details.expenses.filter(e => e.id !== exp.id); syncData()" class="text-[#F2EDE4] hover:text-[#D98C8C]"><i class="ph-bold ph-trash"></i></button>
          </div>
       </div>
    </div>

  </div>
</template>

<style scoped>
.custom-scroll::-webkit-scrollbar { width: 4px; }
.custom-scroll::-webkit-scrollbar-thumb { background: #F2EDE4; border-radius: 10px; }
.animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
</style>