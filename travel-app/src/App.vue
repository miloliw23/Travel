<script setup>
import { ref, onMounted } from 'vue'
import { db } from './firebase' 
import { collection, doc, setDoc, onSnapshot, query, orderBy, deleteDoc } from 'firebase/firestore'
import TripMain from './components/TripMain.vue'

// --- 狀態定義 ---
const showTripMenu = ref(false)
const tripList = ref([])
const currentTripId = ref(null)
const showSetupModal = ref(false)
const setup = ref({ destination: '', currency: 'JPY', startDate: new Date().toISOString().split('T')[0], days: 5 })

// --- Firebase Logic ---
const generateId = () => 'trip_' + Date.now().toString(36)

const createNewTrip = () => { 
    // 預設空白地點，讓使用者之後再填
    setup.value = { destination: '', startDate: new Date().toISOString().split('T')[0], days: 5, currency: 'JPY' }; 
    showSetupModal.value = true; 
    showTripMenu.value = false; 
}

const initTrip = async () => {
    // 🟢 移除地點必填檢查，允許空白
    const newId = generateId();
    const newDays = Array.from({length: setup.value.days}, (_, i) => ({ date: `Day ${i+1}`, items: [] }));
    
    // 建立行程資料
    await setDoc(doc(db, "trips", newId), { 
        id: newId, 
        destination: setup.value.destination || '未命名行程', // 如果空白給個預設顯示
        startDate: setup.value.startDate, 
        daysCount: setup.value.days, 
        createdAt: Date.now() 
    });
    
    await setDoc(doc(db, "trip_details", newId), { 
        days: newDays, 
        expenses: [], 
        setup: setup.value, // 這裡存入原始設定(可能是空地點)
        participants: ['我', '旅伴A'] 
    });

    currentTripId.value = newId;
    showSetupModal.value = false;
}

const switchTrip = (id) => {
    currentTripId.value = id; 
    showTripMenu.value = false;
}

const deleteTrip = async (id) => {
    if(!confirm('確定刪除?')) return;
    await deleteDoc(doc(db, "trips", id));
    await deleteDoc(doc(db, "trip_details", id));
    if(currentTripId.value === id) currentTripId.value = null;
}

onMounted(() => {
    const q = query(collection(db, "trips"), orderBy("createdAt", "desc"));
    onSnapshot(q, (snapshot) => {
        tripList.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (tripList.value.length > 0 && !currentTripId.value) {
            currentTripId.value = tripList.value[0].id;
        } else if (tripList.value.length === 0) {
            showSetupModal.value = true;
        }
    });
})
</script>

<template>
  <div class="h-[100dvh] w-screen flex flex-col sm:items-center sm:justify-center text-dark">
    <div class="flex flex-col bg-slate-50 relative overflow-hidden w-full h-full sm:w-[414px] sm:h-[88vh] sm:rounded-[36px] sm:shadow-2xl sm:border-[10px] sm:border-dark">

        <TripMain 
            v-if="currentTripId" 
            :tripId="currentTripId" 
            :key="currentTripId" 
            @openMenu="showTripMenu = true"
        />

        <transition name="slide">
            <div v-if="showTripMenu" class="absolute inset-0 z-50 flex">
                <div class="bg-white w-[85%] max-w-xs h-full shadow-2xl flex flex-col relative z-50 p-6">
                    <div class="flex justify-between items-center mb-8">
                        <h2 class="text-2xl font-black text-dark">我的旅程</h2>
                        <button @click="showTripMenu = false" class="text-slate-400 hover:text-dark p-1 bg-slate-100 rounded-full"><i class="ph-bold ph-x text-xl"></i></button>
                    </div>
                    <button @click="createNewTrip" class="w-full py-4 mb-6 border-[3px] border-dashed border-primary/40 text-primary rounded-2xl font-black hover:bg-primary/5 flex items-center justify-center gap-2 active:scale-[0.98] transition">
                        <i class="ph-bold ph-plus-circle text-xl"></i> 建立新旅程
                    </button>
                    <div class="flex-1 overflow-y-auto space-y-3 hide-scroll">
                        <div v-for="trip in tripList" :key="trip.id" @click="switchTrip(trip.id)" class="p-4 rounded-2xl border-2 transition cursor-pointer relative group" :class="currentTripId === trip.id ? 'bg-primary/5 border-primary shadow-sm' : 'bg-slate-50 border-transparent hover:bg-slate-100'">
                            <div class="font-black text-dark text-lg">{{ trip.destination || '未命名行程' }}</div>
                            <div class="text-xs font-bold text-slate-400 mt-1">{{ trip.startDate }} • {{ trip.daysCount }} 天</div>
                            <button v-if="tripList.length > 1" @click.stop="deleteTrip(trip.id)" class="absolute right-3 top-3 text-slate-300 hover:text-accent p-2"><i class="ph-bold ph-trash text-lg"></i></button>
                        </div>
                    </div>
                </div>
                <div class="flex-1 bg-dark/60 backdrop-blur-sm z-40" @click="showTripMenu = false"></div>
            </div>
        </transition>

        <div v-if="showSetupModal" class="absolute inset-0 bg-primary-dark/95 backdrop-blur-md z-50 flex items-center justify-center p-6">
            <div class="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl relative animate-[fade-in-up_0.4s_ease-out]">
                <div class="text-center mb-8">
                    <div class="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4"><i class="ph-duotone ph-airplane-tilt text-4xl text-primary"></i></div>
                    <h2 class="text-3xl font-black text-dark">開啟新旅程</h2>
                    <p class="text-sm font-medium text-slate-400 mt-2">簡單設定，即刻出發！</p>
                </div>
                <div class="space-y-5">
                    <div>
                        <label class="block text-xs font-bold text-slate-400 mb-1.5 ml-1 uppercase tracking-wider">目的地 (可之後再填)</label>
                        <input v-model="setup.destination" type="text" placeholder="例如: Tokyo" class="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-4 text-dark font-black text-lg focus:border-primary focus:outline-none transition">
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-bold text-slate-400 mb-1.5 ml-1 uppercase">出發日</label>
                            <input v-model="setup.startDate" type="date" class="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-3 py-3.5 text-dark font-bold text-sm focus:border-primary focus:outline-none">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-400 mb-1.5 ml-1 uppercase">天數</label>
                            <input v-model.number="setup.days" type="number" min="1" max="30" class="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-3 py-3.5 text-dark font-black text-center focus:border-primary focus:outline-none">
                        </div>
                    </div>
                    <button @click="initTrip" class="w-full bg-primary hover:bg-primary-dark text-white font-black text-lg py-4 rounded-2xl shadow-xl shadow-primary/30 transform active:scale-95 transition flex items-center justify-center gap-2 mt-4">開始規劃 <i class="ph-bold ph-arrow-right"></i></button>
                    <button v-if="tripList.length>0" @click="showSetupModal = false" class="w-full text-slate-400 text-sm font-bold py-2 hover:text-dark">取消</button>
                </div>
            </div>
        </div>

    </div>
  </div>
</template>