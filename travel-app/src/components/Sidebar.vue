<script setup>
import { ref } from 'vue'
import { auth } from '../firebase'
import { signOut, updatePassword } from "firebase/auth"

const props = defineProps(['user', 'sortedTripList', 'currentTripId', 'tripDetailsMap'])
const emit = defineEmits(['close', 'switch', 'openCreate'])

const showPasswordModal = ref(false)
const newPassword = ref("")

const handleUpdatePassword = async () => {
  if (newPassword.value.length < 6) return alert("密碼長度需至少 6 位")
  try {
    await updatePassword(auth.currentUser, newPassword.value)
    alert("密碼已成功修改！")
    showPasswordModal.value = false
    newPassword.value = ""
  } catch (e) {
    alert("為了安全考量，請重新登入後再進行密碼修改")
  }
}

const handleLogout = () => {
  if (confirm('確定要登出帳號嗎？')) signOut(auth)
}
</script>

<template>
  <aside class="absolute inset-0 z-50 bg-[#FDFBF7] flex flex-col p-6 shadow-2xl">
    
    <div class="flex items-center gap-4 mb-8 bg-white p-4 rounded-[30px] border border-[#F2EDE4] shadow-sm">
      <div class="w-12 h-12 bg-[#E6B3A3] rounded-full flex items-center justify-center text-white shadow-inner">
        <i class="ph-fill ph-user text-2xl"></i>
      </div>
      <div class="flex-1 min-w-0 text-left">
        <div class="font-black text-[#8B7E74] truncate">{{ user.displayName || '旅行者' }}</div>
        <div class="text-[10px] text-[#BAB3A9] truncate font-medium">{{ user.email }}</div>
      </div>
      <button @click="emit('close')" class="p-1 hover:bg-[#F2EDE4] rounded-full transition">
        <i class="ph-bold ph-caret-left text-xl text-[#BAB3A9]"></i>
      </button>
    </div>

    <div class="flex items-center gap-2 text-[10px] font-black tracking-[0.2em] text-[#BAB3A9] mb-4 ml-2 uppercase">
      <i class="ph-bold ph-bookmarks"></i> 行程清單
    </div>

    <div class="flex-1 overflow-y-auto space-y-3 custom-scroll pr-1">
      <div v-for="trip in sortedTripList" :key="trip.id" @click="emit('switch', trip.id)" 
        class="p-4 rounded-3xl border-2 transition-all cursor-pointer flex justify-between items-center"
        :class="currentTripId === trip.id ? 'bg-[#E6B3A3] border-[#E6B3A3] text-white shadow-lg' : 'bg-white border-[#F2EDE4] hover:border-[#E6B3A3]'">
        <div class="flex flex-col text-left">
          <span class="font-bold text-sm truncate w-40">{{ trip.destination }}</span>
          <span class="text-[9px] opacity-70 flex items-center gap-1 mt-0.5">
            <i class="ph-bold ph-calendar"></i>
            {{ tripDetailsMap[trip.id]?.setup?.startDate?.replace(/-/g, '/') }}
          </span>
        </div>
        <i v-if="currentTripId === trip.id" class="ph-bold ph-check-circle text-xl"></i>
      </div>

      <button @click="emit('openCreate')" class="w-full py-4 rounded-3xl border-2 border-dashed border-[#BAB3A9] text-[#BAB3A9] font-bold mt-4 text-sm hover:bg-white hover:border-[#E6B3A3] hover:text-[#E6B3A3] transition flex items-center justify-center gap-2">
        <i class="ph-bold ph-plus-circle"></i> 建立新行程
      </button>
    </div>

    <div class="mt-4 pt-4 border-t border-[#F2EDE4] flex flex-col gap-1">
      <button @click="showPasswordModal = true" class="flex items-center gap-3 py-3 px-4 text-[#BAB3A9] hover:text-[#8B7E74] hover:bg-white rounded-2xl transition text-sm font-bold">
        <i class="ph-bold ph-key"></i> 修改密碼
      </button>
      <button @click="handleLogout" class="flex items-center gap-3 py-3 px-4 text-[#D98C8C] hover:bg-red-50 rounded-2xl transition text-sm font-bold">
        <i class="ph-bold ph-sign-out"></i> 登出帳號
      </button>
    </div>

    <div v-if="showPasswordModal" class="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/30 backdrop-blur-sm">
      <div class="bg-white w-full max-w-sm rounded-[40px] p-8 shadow-2xl border-4 border-[#F2EDE4] text-center">
        <div class="w-16 h-16 bg-[#FDFBF7] rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-[#F2EDE4]">
          <i class="ph-bold ph-shield-check text-[#E6B3A3] text-3xl"></i>
        </div>
        <h3 class="font-black text-[#8B7E74] text-xl mb-2">更新登入密碼</h3>
        <p class="text-[11px] text-[#BAB3A9] mb-6 font-bold uppercase tracking-widest">請輸入您的新密碼</p>
        
        <input v-model="newPassword" type="password" placeholder="至少 6 位字元" class="w-full bg-[#FAF8F5] px-6 py-4 rounded-2xl outline-none font-bold text-[#8B7E74] mb-6 border-2 border-transparent focus:border-[#E6B3A3] text-center">
        
        <div class="flex gap-4">
          <button @click="showPasswordModal = false" class="flex-1 py-4 text-[#BAB3A9] font-bold hover:bg-[#FAF8F5] rounded-2xl transition">取消</button>
          <button @click="handleUpdatePassword" class="flex-1 bg-[#E6B3A3] text-white py-4 rounded-2xl font-bold shadow-md hover:shadow-lg transition">確認更新</button>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.custom-scroll::-webkit-scrollbar { width: 4px; }
.custom-scroll::-webkit-scrollbar-thumb { background: #F2EDE4; border-radius: 10px; }
</style>