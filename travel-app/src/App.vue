<script setup>
import { ref, onMounted, computed } from 'vue'
import { db, auth } from './firebase' 
import { onAuthStateChanged } from "firebase/auth"
import { 
    collection, doc, setDoc, onSnapshot, query, 
    where, getDoc, updateDoc, arrayUnion 
} from 'firebase/firestore'

// 引入拆分組件
import AuthView from './components/AuthView.vue'
import Sidebar from './components/Sidebar.vue'
import TripMain from './components/TripMain.vue'

// --- 狀態定義 ---
const user = ref(null)
const rawTripList = ref([])
const tripDetailsMap = ref({})
const currentTripId = ref(null)
const isSidebarOpen = ref(false)

// --- 彈窗與輸入控制 ---
const showCreateModal = ref(false)
const showJoinModal = ref(false)
const inviteCode = ref('')
const newTripData = ref({ 
    destination: '', 
    startDate: new Date().toISOString().split('T')[0], 
    daysCount: 1 
})

// --- ✨ 排序邏輯：依照第一天日期排序 ---
const sortedTripList = computed(() => {
    return [...rawTripList.value].sort((a, b) => {
        const dateA = tripDetailsMap.value[a.id]?.setup?.startDate || ''
        const dateB = tripDetailsMap.value[b.id]?.setup?.startDate || ''
        return dateA.localeCompare(dateB)
    })
})

// --- ✨ 功能：建立新行程並自動切換 ---
const createNewTrip = async () => {
    if (!user.value || !newTripData.value.destination) return
    const newId = 'trip_' + Date.now()
    const generatedDays = Array.from({ length: newTripData.value.daysCount }, () => ({ items: [], location: '' }))
    try {
        await setDoc(doc(db, "trips", newId), { 
            id: newId, 
            destination: newTripData.value.destination, 
            createdAt: Date.now(), 
            members: [user.value.uid] 
        })
        await setDoc(doc(db, "trip_details", newId), {
            days: generatedDays,
            setup: { destination: newTripData.value.destination, location: '', startDate: newTripData.value.startDate }
        })
        showCreateModal.value = false
        currentTripId.value = newId // 建立完立即切換，解決卡死問題
    } catch (e) { console.error("建立失敗:", e) }
}

// --- ✨ 功能：加入朋友行程 ---
const handleJoinTrip = async () => {
    if (!user.value || !inviteCode.value) return
    try {
        const tripRef = doc(db, "trips", inviteCode.value)
        const tripSnap = await getDoc(tripRef)
        if (tripSnap.exists()) {
            await updateDoc(tripRef, { members: arrayUnion(user.value.uid) })
            showJoinModal.value = false
            currentTripId.value = inviteCode.value
        } else { alert("邀請碼無效") }
    } catch (e) { alert("加入失敗") }
}

// --- 初始化監聽 ---
onMounted(() => {
    onAuthStateChanged(auth, (currentUser) => {
        user.value = currentUser
        if (currentUser) {
            const q = query(collection(db, "trips"), where("members", "array-contains", currentUser.uid))
            onSnapshot(q, (snapshot) => {
                rawTripList.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
                rawTripList.value.forEach(async (trip) => {
                    const detailSnap = await getDoc(doc(db, "trip_details", trip.id))
                    if (detailSnap.exists()) tripDetailsMap.value[trip.id] = detailSnap.data()
                })
                if (rawTripList.value.length > 0 && !currentTripId.value) {
                    currentTripId.value = rawTripList.value[0].id
                }
            })
        }
    })
})
</script>
<template>
  <div class="h-[100dvh] w-screen flex flex-col sm:items-center sm:justify-center bg-[#FDFBF7] overflow-hidden">
    
    <AuthView v-if="!user" />

    <div v-else class="flex w-full h-full bg-white sm:w-[450px] sm:h-[90vh] sm:rounded-[40px] shadow-2xl relative overflow-hidden">
        
        <transition name="slide">
            <Sidebar 
                v-if="isSidebarOpen" 
                :user="user" 
                :sortedTripList="sortedTripList" 
                :currentTripId="currentTripId"
                :tripDetailsMap="tripDetailsMap"
                @close="isSidebarOpen = false" 
                @switch="id => { currentTripId = id; isSidebarOpen = false }"
                @openCreate="isSidebarOpen = false; showCreateModal = true"
                @openJoin="isSidebarOpen = false; showJoinModal = true"
            />
        </transition>

        <div class="flex-1 flex flex-col min-w-0">
            <TripMain v-if="currentTripId" :tripId="currentTripId" :key="currentTripId" @openMenu="isSidebarOpen = true" />
            
            <div v-else class="flex-1 flex flex-col items-center justify-center p-10 text-center bg-[#FDFBF7]">
                <div class="w-24 h-24 bg-white rounded-full flex items-center justify-center mb-6 shadow-sm border border-[#F2EDE4]">
                    <i class="ph-bold ph-planet text-5xl text-[#E6B3A3]"></i>
                </div>
                <h2 class="text-xl font-black text-[#8B7E74] mb-2">開始您的旅程</h2>
                <p class="text-sm font-bold text-[#BAB3A9] mb-8">目前還沒有行程，請選擇：</p>
                
                <div class="w-full max-w-[240px] space-y-3">
                    <button @click="showCreateModal = true" class="w-full py-4 bg-[#E6B3A3] text-white rounded-2xl font-black shadow-md flex items-center justify-center gap-2 active:scale-95 transition">
                        <i class="ph-bold ph-plus-circle text-lg"></i> 建立新行程
                    </button>
                    <button @click="showJoinModal = true" class="w-full py-4 bg-white border-2 border-[#F2EDE4] text-[#BAB3A9] rounded-2xl font-black flex items-center justify-center gap-2 hover:border-[#E6B3A3] hover:text-[#E6B3A3] transition-all">
                        <i class="ph-bold ph-users-three text-lg"></i> 加入朋友行程
                    </button>
                </div>
                
                <button @click="isSidebarOpen = true" class="mt-8 text-[11px] font-black text-[#BAB3A9] uppercase tracking-widest hover:text-[#8B7E74] transition">
                    點擊這裡開啟管理選單
                </button>
            </div>
        </div>

        <div v-if="showCreateModal" class="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/20 backdrop-blur-sm">
            <div class="bg-white w-full max-w-sm rounded-[40px] p-10 shadow-2xl border-4 border-[#F2EDE4] text-center">
                <h2 class="text-2xl font-black text-[#8B7E74] mb-8">建立新行程</h2>
                <div class="space-y-6">
                    <input v-model="newTripData.destination" placeholder="目的地名稱" class="w-full bg-[#FAF8F5] px-6 py-4 rounded-2xl outline-none font-bold text-[#8B7E74] text-center border-2 border-transparent focus:border-[#E6B3A3]">
                    <div class="flex gap-4">
                        <input v-model="newTripData.startDate" type="date" class="flex-1 bg-[#FAF8F5] px-4 py-4 rounded-2xl outline-none font-bold text-[#8B7E74]">
                        <input v-model.number="newTripData.daysCount" type="number" min="1" class="w-20 bg-[#FAF8F5] px-2 py-4 rounded-2xl outline-none text-center font-bold text-[#8B7E74]">
                    </div>
                    <button @click="createNewTrip" class="w-full bg-[#E6B3A3] text-white py-5 rounded-2xl font-black text-lg">確認建立</button>
                    <button @click="showCreateModal = false" class="text-[#BAB3A9] font-bold text-xs">取消</button>
                </div>
            </div>
        </div>

        <div v-if="showJoinModal" class="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/20 backdrop-blur-sm">
            <div class="bg-white w-full max-w-sm rounded-[40px] p-10 shadow-2xl border-4 border-[#F2EDE4] text-center">
                <h2 class="text-2xl font-black text-[#8B7E74] mb-4">加入現有行程</h2>
                <p class="text-[10px] text-[#BAB3A9] font-bold mb-8 uppercase tracking-widest">請輸入朋友分享的邀請碼</p>
                <div class="space-y-6">
                    <input v-model="inviteCode" placeholder="貼上邀請碼" class="w-full bg-[#FAF8F5] px-6 py-4 rounded-2xl outline-none font-bold text-[#8B7E74] text-center border-2 border-transparent focus:border-[#E6B3A3]">
                    <button @click="handleJoinTrip" class="w-full bg-[#E6B3A3] text-white py-5 rounded-2xl font-black">加入協作</button>
                    <button @click="showJoinModal = false" class="text-[#BAB3A9] font-bold text-xs">取消</button>
                </div>
            </div>
        </div>

    </div>
  </div>
</template>

<style>
/* 側邊欄滑動動畫 */
.slide-enter-active, .slide-leave-active { 
    transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1); 
}
.slide-enter-from, .slide-leave-to { 
    transform: translateX(-100%); 
}

/* 內容區淡入效果 */
.animate-fade-in {
    animation: fadeIn 0.6s ease-out;
}
@keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
}

/* 捲軸美化 */
.custom-scroll::-webkit-scrollbar { width: 4px; }
.custom-scroll::-webkit-scrollbar-thumb { background: #F2EDE4; border-radius: 10px; }
</style>