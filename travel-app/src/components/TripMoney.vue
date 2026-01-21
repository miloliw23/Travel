<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { db } from '../firebase'
import { doc, updateDoc } from 'firebase/firestore'

const props = defineProps(['details', 'tripId'])
const newExpense = ref({ item: '', amount: '', payer: '' })
const isFetchingRate = ref(false)
const newParticipantName = ref('')
const showMemberManager = ref(false)

onMounted(() => { if (props.details?.participants?.length > 0) newExpense.value.payer = props.details.participants[0] })

const fetchExchangeRate = async () => {
  const target = props.details.setup.currency
  if (target === 'TWD') { props.details.setup.exchangeRate = 1; return }
  isFetchingRate.value = true
  try {
    const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${target}`)
    const data = await res.json()
    if (data?.rates?.TWD) { props.details.setup.exchangeRate = data.rates.TWD; syncData() }
  } catch (e) { console.error(e) } finally { isFetchingRate.value = false }
}

const syncData = async () => { await updateDoc(doc(db, "trip_details", props.tripId), { expenses: props.details.expenses, setup: props.details.setup, participants: props.details.participants }) }

const totalExpense = computed(() => props.details.expenses.reduce((sum, item) => sum + Number(item.amount), 0))
const settlementResults = computed(() => {
  const members = props.details.participants; if (!members.length || !props.details.expenses.length) return [];
  const paidMap = {}; members.forEach(m => paidMap[m] = 0);
  props.details.expenses.forEach(e => paidMap[e.payer] += Number(e.amount));
  const average = totalExpense.value / members.length;
  let balances = members.map(m => ({ name: m, status: paidMap[m] - average }));
  const debts = [];
  const debtors = balances.filter(b => b.status < -0.1).sort((a, b) => a.status - b.status);
  const creditors = balances.filter(b => b.status > 0.1).sort((a, b) => b.status - a.status);
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i], c = creditors[j];
    const amount = Math.min(Math.abs(d.status), c.status);
    debts.push({ from: d.name, to: c.name, amount: Math.round(amount) });
    d.status += amount; c.status -= amount;
    if (Math.abs(d.status) < 0.1) i++; if (Math.abs(c.status) < 0.1) j++;
  }
  return debts;
})
</script>

<template>
  <div class="p-6 space-y-6 bg-[#FDFBF7] pb-24">
    <div class="bg-[#8B7E74] text-white p-6 rounded-[32px] shadow-lg text-center">
      <div class="text-[10px] font-bold opacity-70 mb-1 uppercase">Total Spending</div>
      <div class="text-4xl font-black">{{ totalExpense.toLocaleString() }} <span class="text-sm opacity-60">{{ details.setup.currency }}</span></div>
      
      <div class="mt-6 flex flex-col gap-3 bg-white/10 p-4 rounded-[24px]">
        <div class="flex justify-between items-center">
          <span class="text-[10px] font-bold opacity-60">幣別</span>
          <select v-model="details.setup.currency" @change="fetchExchangeRate" class="bg-white text-[#8B7E74] font-bold rounded-xl px-4 py-1.5 text-xs w-28 border-none">
            <option value="TWD">NT$ TWD</option><option value="JPY">¥ JPY</option><option value="KRW">₩ KRW</option><option value="USD">$ USD</option>
          </select>
        </div>
        <div class="flex justify-between items-center">
          <span class="text-[10px] font-bold opacity-60">匯率 (TWD)</span>
          <div class="flex items-center gap-2">
            <input v-model="details.setup.exchangeRate" @change="syncData" type="number" step="0.01" class="bg-white/20 w-16 text-center outline-none font-bold text-xs rounded-lg py-1">
            <button @click="fetchExchangeRate" :class="{'animate-spin': isFetchingRate}"><i class="ph-bold ph-arrows-clockwise text-lg"></i></button>
          </div>
        </div>
      </div>
    </div>

    <div class="bg-white border-2 border-[#F2EDE4] rounded-[28px] p-5">
      <div @click="showMemberManager = !showMemberManager" class="flex justify-between items-center cursor-pointer">
        <span class="text-xs font-bold text-[#8B7E74] uppercase">旅伴 ({{ details.participants.length }})</span>
        <i class="ph-bold" :class="showMemberManager ? 'ph-caret-up' : 'ph-caret-down'"></i>
      </div>
      <div v-if="showMemberManager" class="mt-4 space-y-4">
        <div class="flex gap-2">
          <input v-model="newParticipantName" @keyup.enter="() => { if(newParticipantName) { details.participants.push(newParticipantName); newParticipantName=''; syncData(); } }" placeholder="輸入旅伴名字..." class="flex-1 bg-[#FAF8F5] px-4 py-2 rounded-xl text-sm outline-none">
          <button @click="() => { if(newParticipantName) { details.participants.push(newParticipantName); newParticipantName=''; syncData(); } }" class="bg-[#E6B3A3] text-white px-4 py-2 rounded-xl">+</button>
        </div>
        <div class="flex flex-wrap gap-2">
          <div v-for="p in details.participants" :key="p" class="bg-[#FAF8F5] px-3 py-1.5 rounded-full border border-[#F2EDE4] text-xs font-bold text-[#8B7E74] flex gap-2">
            {{ p }} <button @click="details.participants = details.participants.filter(x => x!==p); syncData()" class="text-[#D98C8C]">×</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="settlementResults.length" class="bg-white border-2 border-[#F2EDE4] rounded-[28px] p-6 space-y-3">
      <div class="text-xs font-bold text-[#8B7E74] uppercase mb-4 tracking-widest">Settlement</div>
      <div v-for="debt in settlementResults" class="flex justify-between items-center bg-[#FAF8F5] p-3 rounded-2xl border border-[#F2EDE4]">
        <div class="text-xs font-bold">{{ debt.from }} <i class="ph-bold ph-arrow-right text-[#BAB3A9] mx-1"></i> {{ debt.to }}</div>
        <div class="text-sm font-black text-[#8B7E74]">{{ debt.amount.toLocaleString() }}</div>
      </div>
    </div>

    <div class="bg-white border-2 border-[#F2EDE4] rounded-[32px] p-6 space-y-4 shadow-sm">
      <div class="space-y-4">
        <div class="flex flex-col gap-1.5"><span class="text-[10px] text-[#BAB3A9] font-bold ml-2">Item</span><input v-model="newExpense.item" class="w-full bg-[#FAF8F5] px-4 py-3.5 rounded-2xl text-sm outline-none border-2 border-transparent focus:border-[#E6B3A3]"></div>
        <div class="flex flex-col gap-1.5"><span class="text-[10px] text-[#BAB3A9] font-bold ml-2">Amount</span><input v-model="newExpense.amount" type="number" class="w-full bg-[#FAF8F5] px-4 py-3.5 rounded-2xl text-sm text-right outline-none border-2 border-transparent focus:border-[#E6B3A3]"></div>
        <div class="flex flex-col gap-1.5"><span class="text-[10px] text-[#BAB3A9] font-bold ml-2">Payer</span><select v-model="newExpense.payer" class="w-full bg-[#FAF8F5] px-4 py-3.5 rounded-2xl text-sm font-bold text-[#8B7E74] border-none"><option v-for="p in details.participants" :value="p">{{p}}</option></select></div>
      </div>
      <button @click="addExpense" class="w-full bg-[#8B7E74] text-white py-4 rounded-[22px] font-bold shadow-md active:scale-95 transition">紀錄開銷</button>
    </div>
  </div>
</template>