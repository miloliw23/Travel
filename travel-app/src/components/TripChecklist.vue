<script setup>
import { ref, computed } from 'vue'

// 接收父層傳來的清單資料
const props = defineProps({
  checklists: {
    type: Array,
    default: () => []
  }
})

// 通知父層儲存資料
const emit = defineEmits(['update'])

const inputVal = ref('')
const currentType = ref('packing') // 'packing' | 'shopping'

// 計算目前要顯示的清單 (過濾類型)
const displayList = computed(() => {
  return props.checklists.filter(item => item.type === currentType.value)
})

// 新增項目
const addItem = () => {
  if (!inputVal.value.trim()) return
  
  // 直接修改 props 的陣列 (Vue 3 中物件是傳參考，這樣做雖非最嚴謹但在這種情境下最方便)
  props.checklists.push({
    id: Date.now(),
    text: inputVal.value,
    type: currentType.value,
    isDone: false
  })
  
  inputVal.value = ''
  emit('update') // 通知父層同步 Firebase
}

// 切換完成狀態
const toggleItem = (item) => {
  item.isDone = !item.isDone
  emit('update')
}

// 刪除項目
const deleteItem = (id) => {
  const index = props.checklists.findIndex(i => i.id === id)
  if (index !== -1) {
    props.checklists.splice(index, 1)
    emit('update')
  }
}
</script>

<template>
  <div class="h-full flex flex-col px-5 py-6 animate-fade-in">
    <h2 class="text-3xl font-black text-[#8B7E74] mb-6 pl-1">旅行清單</h2>
    
    <div class="flex bg-[#F2EDE4] p-1.5 rounded-2xl mb-6 shrink-0">
      <button @click="currentType = 'packing'" 
        class="flex-1 py-3 rounded-xl font-bold text-sm transition-all duration-300 flex items-center justify-center gap-2"
        :class="currentType === 'packing' ? 'bg-white text-[#E6B3A3] shadow-sm' : 'text-[#BAB3A9]'">
        <i class="ph-fill ph-suitcase-rolling text-lg"></i> 行李必帶
      </button>
      <button @click="currentType = 'shopping'" 
        class="flex-1 py-3 rounded-xl font-bold text-sm transition-all duration-300 flex items-center justify-center gap-2"
        :class="currentType === 'shopping' ? 'bg-white text-[#E6B3A3] shadow-sm' : 'text-[#BAB3A9]'">
        <i class="ph-fill ph-shopping-bag text-lg"></i> 購物清單
      </button>
    </div>

    <div class="bg-white p-2 rounded-2xl shadow-sm border border-[#F2EDE4] flex items-center gap-2 mb-6 shrink-0 sticky top-0 z-10">
      <input v-model="inputVal" @keyup.enter="addItem" 
        :placeholder="currentType === 'packing' ? '輸入要帶的東西 (如: 護照)...' : '輸入要買的東西 (如: 伴手禮)...'"
        class="flex-1 bg-transparent px-3 py-2 text-[#8B7E74] font-bold outline-none placeholder-[#D1C7BD]">
      <button @click="addItem" class="bg-[#E6B3A3] text-white w-10 h-10 rounded-xl flex items-center justify-center shadow-md active:scale-95 transition">
        <i class="ph-bold ph-plus"></i>
      </button>
    </div>

    <div class="flex-1 overflow-y-auto custom-scroll pr-1 pb-20">
      <div class="space-y-3">
        <div v-for="item in displayList" :key="item.id" 
          class="flex items-center gap-3 bg-white p-4 rounded-2xl border transition-all duration-200 group"
          :class="item.isDone ? 'border-[#F2EDE4] opacity-60' : 'border-[#F2EDE4] hover:border-[#E6B3A3] shadow-sm'">
          
          <button @click="toggleItem(item)" 
            class="w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors shrink-0"
            :class="item.isDone ? 'bg-[#E6B3A3] border-[#E6B3A3]' : 'border-[#D1C7BD]'">
            <i v-if="item.isDone" class="ph-bold ph-check text-white text-xs"></i>
          </button>
          
          <span class="flex-1 font-bold text-lg transition-all break-all" 
            :class="item.isDone ? 'text-[#D1C7BD] line-through' : 'text-[#8B7E74]'">
            {{ item.text }}
          </span>
          
          <button @click="deleteItem(item.id)" class="text-[#F2EDE4] hover:text-[#D98C8C] p-2 transition-colors shrink-0">
            <i class="ph-bold ph-trash"></i>
          </button>
        </div>

        <div v-if="displayList.length === 0" class="text-center py-10 opacity-40">
          <i :class="currentType === 'packing' ? 'ph-suitcase-rolling' : 'ph-shopping-bag'" class="text-4xl text-[#BAB3A9] mb-2 block"></i>
          <span class="text-sm font-bold text-[#BAB3A9]">目前沒有項目</span>
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