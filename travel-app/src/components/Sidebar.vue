<script setup>
import { ref } from 'vue'
import { auth, db } from '../firebase' // 記得引入 db
import { signOut, updatePassword } from "firebase/auth"
import { writeBatch, doc } from "firebase/firestore"

const props = defineProps(['user', 'sortedTripList', 'currentTripId', 'tripDetailsMap'])
const emit = defineEmits(['close', 'switch', 'openCreate', 'openJoin', 'delete'])

const showPasswordModal = ref(false)
const newPassword = ref("")

// --- 修改密碼 ---
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

// --- 登出 ---
const handleLogout = () => {
  if (confirm('確定要登出帳號嗎？')) signOut(auth)
}

// --- 刪除行程 (新增功能) ---
const deleteTrip = async (tripId, tripName) => {
  if (!confirm(`確定要永久刪除「${tripName}」這個行程嗎？\n刪除後無法復原！`)) return

  try {
    const batch = writeBatch(db);
    
    // 1. 刪除詳細資料 (trip_details)
    const detailsRef = doc(db, "trip_details", tripId);
    batch.delete(detailsRef);

    // 2. 刪除行程概覽 (trips) - 這是為了清乾淨，不留殭屍資料
    const tripRef = doc(db, "trips", tripId);
    batch.delete(tripRef);

    // 執行批次刪除
    await batch.commit();
    
    // 通知父層更新畫面
    emit('delete', tripId)
    alert(`行程「${tripName}」已完全刪除`)

  } catch (e) {
    console.error("刪除失敗", e)
    alert(`刪除失敗：${e.message}`)
  }
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
      <div v-for="trip in sortedTripList" :key="trip.id" 
        @click="emit('switch', trip.id)" 
        class="group p-4 rounded-3xl border-2 transition-all cursor-pointer flex justify-between items-center relative overflow-hidden"
        :class="currentTripId === trip.id ? 'bg-[#E6B3A3] border-[#E6B3A3] text-white shadow-lg' : 'bg-white border-[#F2EDE4] hover:border-[#E6B3A3]'">
        
        <div class="flex flex-col text-left min-w-0">
          <span class="font-bold text-sm truncate w-36">{{ trip.destination }}</span>
          <span class="text-[9px] opacity-70 flex items-center gap-1 mt-0.5">
            <i class="ph-bold ph-calendar"></i>
            {{ tripDetailsMap[trip.id]?.setup?.startDate?.replace(/-/g, '/') || '未定日期' }}
          </span>
        </div>

        <div class="flex items-center gap-2">
          <i v-if="currentTripId === trip.id" class="ph-bold ph-check-circle text-xl"></i>
          
          <button 
            @click.stop="deleteTrip(trip.id, trip.destination)" 
            class="p-2 rounded-full hover:bg-white/20 active:scale-95 transition opacity-0 group-hover:opacity-100"
            :class="currentTripId === trip.id ? 'text-white hover:text-red-100' : 'text-[#BAB3A9] hover:bg-[#F2EDE4] hover:text-red-400'"
            title="刪除此行程">
            <i class="ph-bold ph-trash text-lg"></i>
          </button>
        </div>
      </div>

      <div class="pt-4 space-y-2">
        <button @click="emit('openCreate')" class="w-full py-4 rounded-3xl border-2 border-dashed border-[#E6B3A3] text-[#E6B3A3] font-bold text-sm hover:bg-white transition flex items-center justify-center gap-2">
          <i class="ph-bold ph-plus-circle"></i> 建立新行程
        </button>
        <button @click="emit('openJoin')" class="w-full py-4 rounded-3xl border-2 border-dashed border-[#BAB3A9] text-[#BAB3A9] font-bold text-sm hover:bg-white transition flex items-center justify-center gap-2">
          <i class="ph-bold ph-users-three"></i> 加入朋友行程
        </button>
      </div>
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
        <h3 class="font-black text-[#8B7E74] text-xl mb-6">更新登入密碼</h3>
        <input v-model="newPassword" type="password" placeholder="輸入新密碼" class="w-full bg-[#FAF8F5] px-6 py-4 rounded-2xl outline-none font-bold text-[#8B7E74] mb-6 border-2 border-transparent focus:border-[#E6B3A3] text-center">
        <div class="flex gap-4">
          <button @click="showPasswordModal = false" class="flex-1 py-4 text-[#BAB3A9] font-bold">取消</button>
          <button @click="handleUpdatePassword" class="flex-1 bg-[#E6B3A3] text-white py-4 rounded-2xl font-bold shadow-md">確認更新</button>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.custom-scroll::-webkit-scrollbar { width: 4px; }
.custom-scroll::-webkit-scrollbar-thumb { background: #E6B3A3; border-radius: 10px; }
</style>