<script setup>
import { ref, onMounted, computed } from 'vue'
import { db, auth } from './firebase' 
import { onAuthStateChanged } from "firebase/auth"
import { 
    collection, doc, setDoc, onSnapshot, query, 
    where, getDoc, updateDoc, arrayUnion 
} from 'firebase/firestore'

// 引入組件
import AuthView from './components/AuthView.vue'
import Sidebar from './components/Sidebar.vue'
import TripMain from './components/TripMain.vue'

// --- 狀態定義 ---
const user = ref(null)
const rawTripList = ref([])
const tripDetailsMap = ref({})
const currentTripId = ref(null)
const isSidebarOpen = ref(false)

// --- 彈窗控制 ---
const showCreateModal = ref(false)
const showJoinModal = ref(false)
const inviteCode = ref('')
const newTripData = ref({ 
    destination: '', 
    startDate: new Date().toISOString().split('T')[0], 
    daysCount: 1 
})

// --- ✨ 邏輯：依日期排序行程 ---
const sortedTripList = computed(() => {
    return [...rawTripList.value].sort((a, b) => {
        const dateA = tripDetailsMap.value[a.id]?.setup?.startDate || ''
        const dateB = tripDetailsMap.value[b.id]?.setup?.startDate || ''
        return dateA.localeCompare(dateB)
    })
})

// --- ✨ 功能：建立新行程 ---
const createNewTrip = async () => {
    if (!user.value || !newTripData.value.destination) return
    const newId = 'trip_' + Date.now()
    const generatedDays = Array.from({ length: newTripData.value.daysCount }, () => ({ items: [], location: '' }))

    try {
        // 1. 建立行程索引
        await setDoc(doc(db, "trips", newId), { 
            id: newId, 
            destination: newTripData.value.destination, 
            createdAt: Date.now(), 
            members: [user.value.uid] 
        })
        // 2. 建立行程詳細內容
        await setDoc(doc(db, "trip_details", newId), {
            days: generatedDays,
            setup: { 
                destination: newTripData.value.destination, 
                location: '', 
                startDate: newTripData.value.startDate 
            }
        })
        showCreateModal.value = false
        currentTripId.value = newId // 自動切換到新行程
        newTripData.value = { destination: '', startDate: new Date().toISOString().split('T')[0], daysCount: 1 }
    } catch (e) {
        console.error("建立失敗:", e)
    }
}

// --- ✨ 功能：加入朋友行程 ---
const handleJoinTrip = async () => {
    if (!user.value || !inviteCode.value) return
    try {
        const tripRef = doc(db, "trips", inviteCode.value)
        const tripSnap = await getDoc(tripRef)
        
        if (tripSnap.exists()) {
            await updateDoc(tripRef, {
                members: arrayUnion(user.value.uid)
            })
            alert("成功加入行程！")
            showJoinModal.value = false
            currentTripId.value = inviteCode.value
            inviteCode.value = ''
        } else {
            alert("找不到該行程，請確認邀請碼正確")
        }
    } catch (e) {
        alert("加入失敗，請檢查邀請碼或權限")
    }
}

// --- 生命週期與監聽 ---
onMounted(() => {
    onAuthStateChanged(auth, (currentUser) => {
        user.value = currentUser
        if (currentUser) {
            // 監聽使用者參與的所有行程
            const q = query(collection(db, "trips"), where("members", "array-contains", currentUser.uid))
            onSnapshot(q, (snapshot) => {
                rawTripList.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
                
                // 抓取詳細資料以獲取日期進行排序
                rawTripList.value.forEach(async (trip) => {
                    const detailSnap = await getDoc(doc(db, "trip_details", trip.id))
                    if (detailSnap.exists()) {
                        tripDetailsMap.value[trip.id] = detailSnap.data()
                    }
                })

                // 如果目前沒選中行程且列表有資料，預設選第一個
                if (rawTripList.value.length > 0 && !currentTripId.value) {
                    currentTripId.value = rawTripList.value[0].id
                }
            })
        }
    })
})
</script>

<template>
  <div class="h-[100dvh] w-screen flex flex-col sm:items-center sm:justify-center text-[#8B7E74] bg-[#FDFBF7] overflow-hidden">
    
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
                    <button @click="showCreateModal = true" class="w-full py-4 bg-[#E6B3A3] text-white rounded-2xl font-black shadow-md active:scale-95 transition flex items-center justify-center gap-2">
                        <i class="ph-bold ph-plus-circle text-lg"></i> 建立新行程
                    </button>
                    <button @click="showJoinModal = true" class="w-full py-4 bg-white border-2 border-[#F2EDE4] text-[#BAB3A9] rounded-2xl font-black hover:border-[#E6B3A3] hover:text-[#E6B3A3] transition-all flex items-center justify-center gap-2">
                        <i class="ph-bold ph-users-three text-lg"></i> 加入朋友行程
                    </button>
                </div>
                <button @click="isSidebarOpen = true" class="mt-8 text-[10px] font-black text-[#BAB3A9] uppercase tracking-widest hover:text-[#8B7E74]">
                    或從選單查看所有行程
                </button>
            </div>
        </div>

        <div v-if="showCreateModal" class="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/20 backdrop-blur-sm">
            <div class="bg-white w-full max-w-sm rounded-[40px] p-10 shadow-2xl border-4 border-[#F2EDE4] text-center">
                <h2 class="text-2xl font-black text-[#8B7E74] mb-8">建立新行程</h2>
                <div class="space-y-6">
                    <div class="text-left space-y-1">
                        <label class="text-[10px] font-bold text-[#BAB3A9] ml-2">目的地名稱</label>
                        <input v-model="newTripData.destination" placeholder="例如：東京五天四夜" class="w-full bg-[#FAF8F5] px-6 py-4 rounded-2xl outline-none font-bold text-[#8B7E74] border-2 border-transparent focus:border-[#E6B3A3]">
                    </div>
                    <div class="flex gap-4">
                        <div class="flex-1 text-left space-y-1">
                            <label class="text-[10px] font-bold text-[#BAB3A9] ml-2">開始日期</label>
                            <input v-model="newTripData.startDate" type="date" class="w-full bg-[#FAF8F5] px-4 py-4 rounded-2xl outline-none font-bold text-[#8B7E74]">
                        </div>
                        <div class="w-20 text-left space-y-1">
                            <label class="text-[10px] font-bold text-[#BAB3A9] ml-2">天數</label>
                            <input v-model.number="newTripData.daysCount" type="number" min="1" class="w-full bg-[#FAF8F5] px-2 py-4 rounded-2xl outline-none text-center font-bold text-[#8B7E74]">
                        </div>
                    </div>
                    <button @click="createNewTrip" class="w-full bg-[#E6B3A3] text-white py-5 rounded-2xl font-black text-lg shadow-md active:scale-95 transition">確認建立</button>
                    <button @click="showCreateModal = false" class="text-[#BAB3A9] font-bold text-xs">取消</button>
                </div>
            </div>
        </div>

        <div v-if="showJoinModal" class="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/20 backdrop-blur-sm">
            <div class="bg-white w-full max-w-sm rounded-[40px] p-10 shadow-2xl border-4 border-[#F2EDE4] text-center">
                <h2 class="text-2xl font-black text-[#8B7E74] mb-2">加入行程</h2>
                <p class="text-[10px] text-[#BAB3A9] font-bold mb-8 uppercase tracking-widest">請輸入朋友分享的行程代碼</p>
                <div class="space-y-6">
                    <input v-model="inviteCode" placeholder="貼上行程代碼" class="w-full bg-[#FAF8F5] px-6 py-4 rounded-2xl outline-none font-bold text-[#8B7E74] text-center border-2 border-transparent focus:border-[#E6B3A3]">
                    <button @click="handleJoinTrip" class="w-full bg-[#E6B3A3] text-white py-5 rounded-2xl font-black shadow-md active:scale-95 transition">確認加入</button>
                    <button @click="showJoinModal = false" class="text-[#BAB3A9] font-bold text-xs">取消</button>
                </div>
            </div>
        </div>

    </div>
  </div>
</template>

<style>
.slide-enter-active, .slide-leave-active { transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1); }
.slide-enter-from, .slide-leave-to { transform: translateX(-100%); }

/* 入場動畫 */
.animate-fade-in {
    animation: fadeIn 0.6s ease-out forwards;
}
@keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
}
</style>