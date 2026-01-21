<script setup>
import { ref, onMounted, computed } from 'vue'
import { db, auth } from './firebase' 
import { onAuthStateChanged } from "firebase/auth"
import { collection, doc, setDoc, onSnapshot, query, where, getDoc } from 'firebase/firestore'

import AuthView from './components/AuthView.vue'
import Sidebar from './components/Sidebar.vue'
import TripMain from './components/TripMain.vue'

const user = ref(null)
const rawTripList = ref([])
const tripDetailsMap = ref({})
const currentTripId = ref(null)
const isSidebarOpen = ref(false)
const showCreateModal = ref(false)
const newTripData = ref({ destination: '', startDate: new Date().toISOString().split('T')[0], daysCount: 1 })

// ✨ 行程清單依日期排序
const sortedTripList = computed(() => {
  return [...rawTripList.value].sort((a, b) => {
    const dateA = tripDetailsMap.value[a.id]?.setup?.startDate || ''
    const dateB = tripDetailsMap.value[b.id]?.setup?.startDate || ''
    return dateA.localeCompare(dateB)
  })
})

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
    currentTripId.value = newId
    newTripData.value = { destination: '', startDate: new Date().toISOString().split('T')[0], daysCount: 1 }
  } catch (e) { console.error(e) }
}

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
        if (rawTripList.value.length > 0 && !currentTripId.value) currentTripId.value = rawTripList.value[0].id
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
        <Sidebar v-if="isSidebarOpen" 
          :user="user" :sortedTripList="sortedTripList" :currentTripId="currentTripId" :tripDetailsMap="tripDetailsMap"
          @close="isSidebarOpen = false" 
          @switch="id => { currentTripId = id; isSidebarOpen = false }" 
          @openCreate="isSidebarOpen = false; showCreateModal = true" />
      </transition>

      <div class="flex-1 flex flex-col min-w-0">
        <TripMain v-if="currentTripId" :tripId="currentTripId" :key="currentTripId" @openMenu="isSidebarOpen = true" />
        <div v-else class="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <i class="ph-bold ph-planet text-6xl text-[#F2EDE4] mb-4"></i>
            <p class="font-bold text-[#BAB3A9]">點擊側邊欄建立您的第一個行程</p>
        </div>
      </div>

      <div v-if="showCreateModal" class="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/20 backdrop-blur-sm">
        <div class="bg-white w-full max-w-sm rounded-[40px] p-10 shadow-2xl border-4 border-[#F2EDE4] text-center">
          <h2 class="text-2xl font-black text-[#8B7E74] mb-8 flex items-center justify-center gap-2">
            <i class="ph-fill ph-map-trifold text-[#E6B3A3]"></i> 建立新行程
          </h2>
          <div class="space-y-6">
            <input v-model="newTripData.destination" placeholder="目的地名稱" class="w-full bg-[#FAF8F5] px-6 py-4 rounded-2xl outline-none font-bold text-[#8B7E74] text-center border-2 border-transparent focus:border-[#E6B3A3]">
            <div class="flex gap-4">
              <input v-model="newTripData.startDate" type="date" class="flex-1 bg-[#FAF8F5] px-4 py-4 rounded-2xl outline-none font-bold text-[#8B7E74] text-sm">
              <div class="w-20 relative">
                <input v-model.number="newTripData.daysCount" type="number" min="1" class="w-full bg-[#FAF8F5] px-2 py-4 rounded-2xl outline-none text-center font-bold text-[#8B7E74]">
                <span class="absolute -top-3 left-2 text-[8px] font-black text-[#BAB3A9] bg-white px-1">天數</span>
              </div>
            </div>
            <button @click="createNewTrip" class="w-full bg-[#E6B3A3] text-white py-5 rounded-2xl font-black text-lg shadow-md active:scale-95 transition">確認建立</button>
            <button @click="showCreateModal = false" class="text-[#BAB3A9] font-bold text-xs hover:text-[#8B7E74] transition">取消</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.slide-enter-active, .slide-leave-active { transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1); }
.slide-enter-from, .slide-leave-to { transform: translateX(-100%); }
</style>