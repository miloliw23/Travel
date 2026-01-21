<script setup>
import { ref, onMounted } from 'vue'
import { db, auth } from './firebase' 
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    updateProfile,
    sendPasswordResetEmail // ✨ 匯入忘記密碼功能
} from "firebase/auth";

import { 
    collection, 
    doc, 
    setDoc, 
    onSnapshot, 
    query, 
    where, 
    deleteDoc, 
    writeBatch // ✨ 匯入批次寫入功能
} from 'firebase/firestore'

import TripMain from './components/TripMain.vue'
import draggable from 'vuedraggable'

// --- 狀態定義 ---
const user = ref(null);
const isRegisterMode = ref(false);
const authError = ref("");
const authForm = ref({ email: '', password: '', name: '' });

const tripList = ref([]);
const currentTripId = ref(null);
const isSidebarOpen = ref(false);
const showJoinModal = ref(false);
const joinTripId = ref("");

// --- 身分驗證邏輯 ---
const handleAuth = async () => {
    authError.value = "";
    try {
        if (isRegisterMode.value) {
            const res = await createUserWithEmailAndPassword(auth, authForm.value.email, authForm.value.password);
            await updateProfile(res.user, { displayName: authForm.value.name });
        } else {
            await signInWithEmailAndPassword(auth, authForm.value.email, authForm.value.password);
        }
    } catch (e) {
        authError.value = e.message;
    }
};

const handleLogout = () => signOut(auth);

// ✨ 忘記密碼邏輯
const resetPassword = async () => {
    if (!authForm.value.email) {
        authError.value = "請先輸入您的 Email 以便接收重設信件。";
        return;
    }
    try {
        await sendPasswordResetEmail(auth, authForm.value.email);
        alert("重設密碼信件已寄出！請至信箱查看連結。");
        authError.value = "";
    } catch (e) {
        authError.value = "發送失敗：" + e.message;
    }
};

// --- 行程管理邏輯 ---
const createNewTrip = async () => {
    if(!user.value) return;
    const newId = 'trip_' + Date.now();
    
    // 新增行程索引
    await setDoc(doc(db, "trips", newId), { 
        id: newId, 
        destination: '新旅程', 
        createdAt: Date.now(),
        members: [user.value.uid], 
        ownerName: user.value.displayName || user.value.email.split('@')[0],
        order: 0 // ✨ 預設排序值
    });

    // 初始化行程細節
    await setDoc(doc(db, "trip_details", newId), {
        days: [{ date: 'Day 1', items: [], location: '' }],
        expenses: [],
        setup: { destination: '新旅程', currency: 'TWD', startDate: new Date().toISOString().split('T')[0], days: 1 },
        participants: [user.value.displayName || '我']
    });

    currentTripId.value = newId;
    isSidebarOpen.value = false;
};

// ✨ 處理左側選單拖拉排序並存入資料庫
const updateTripOrder = async () => {
    const batch = writeBatch(db);
    tripList.value.forEach((trip, index) => {
        const tripRef = doc(db, "trips", trip.id);
        batch.update(tripRef, { order: index });
    });
    try {
        await batch.commit();
        console.log("順序更新成功");
    } catch (e) {
        console.error("順序更新失敗", e);
    }
};

const switchTrip = (id) => {
    currentTripId.value = id;
    isSidebarOpen.value = false;
};

const deleteTrip = async (id) => {
    if (confirm('確定要刪除整個行程嗎？此動作無法復原。')) {
        await deleteDoc(doc(db, "trips", id));
        await deleteDoc(doc(db, "trip_details", id));
        if (currentTripId.value === id) currentTripId.value = null;
    }
};

const copyTripId = (id) => {
    navigator.clipboard.writeText(id);
    alert("行程 ID 已複製，傳給朋友加入吧！");
};

// --- 生命週期與資料監聽 ---
onMounted(() => {
    onAuthStateChanged(auth, (currentUser) => {
        user.value = currentUser;
        if (currentUser) {
            // 監聽該使用者的行程列表
            const q = query(collection(db, "trips"), where("members", "array-contains", currentUser.uid));
            onSnapshot(q, (snapshot) => {
                const rawList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                
                // ✨ 前端混合排序邏輯：優先看 order，沒有則看時間
                rawList.sort((a, b) => {
                    if (a.order !== undefined && b.order !== undefined) {
                        if (a.order === b.order) return b.createdAt - a.createdAt;
                        return a.order - b.order;
                    }
                    if (a.order !== undefined) return -1;
                    if (b.order !== undefined) return 1;
                    return b.createdAt - a.createdAt;
                });

                tripList.value = rawList;
                if (tripList.value.length > 0 && !currentTripId.value) {
                    currentTripId.value = tripList.value[0].id;
                }
            });
        } else {
            tripList.value = [];
            currentTripId.value = null;
        }
    });
});
</script>

<template>
  <div class="h-[100dvh] w-screen flex flex-col sm:items-center sm:justify-center text-dark bg-slate-100">
    
    <div v-if="!user" class="flex flex-col items-center justify-center h-full p-8 bg-slate-50 w-full sm:w-[414px] sm:h-[88vh] sm:rounded-[36px] sm:shadow-2xl sm:border-[10px] sm:border-dark relative overflow-hidden transition-all">
        <div class="w-20 h-20 bg-primary rounded-[1.5rem] flex items-center justify-center shadow-lg rotate-3 mb-6">
            <i class="ph-duotone ph-airplane-tilt text-4xl text-white"></i>
        </div>
        
        <div class="text-center mb-6">
            <h1 class="text-2xl font-black text-dark">{{ isRegisterMode ? '註冊帳號' : '歡迎回來' }}</h1>
            <p class="text-slate-400 text-sm font-medium mt-1">
                {{ isRegisterMode ? '建立帳號以開始規劃旅程' : '登入以繼續您的旅程' }}
            </p>
        </div>

        <div class="w-full space-y-3">
            <div v-if="isRegisterMode" class="space-y-1">
                <input v-model="authForm.name" type="text" placeholder="您的暱稱" class="w-full bg-white border-2 border-slate-100 rounded-xl px-4 py-3 font-bold text-dark focus:border-primary focus:outline-none transition">
            </div>
            <div class="space-y-1">
                <input v-model="authForm.email" type="email" placeholder="Email 信箱" class="w-full bg-white border-2 border-slate-100 rounded-xl px-4 py-3 font-bold text-dark focus:border-primary focus:outline-none transition">
            </div>
            <div class="space-y-1">
                <input v-model="authForm.password" type="password" placeholder="密碼 (至少6位)" class="w-full bg-white border-2 border-slate-100 rounded-xl px-4 py-3 font-bold text-dark focus:border-primary focus:outline-none transition" @keyup.enter="handleAuth">
            </div>

            <div v-if="authError" class="text-red-500 text-xs font-bold text-center bg-red-50 py-2 rounded-lg">
                <i class="ph-bold ph-warning-circle"></i> {{ authError }}
            </div>

            <button @click="handleAuth" class="w-full bg-primary hover:bg-primary-dark text-white font-black text-lg py-3.5 rounded-xl shadow-lg shadow-primary/30 transition active:scale-95 flex items-center justify-center gap-2">
                {{ isRegisterMode ? '註冊並登入' : '登入' }}
            </button>

            <div v-if="!isRegisterMode" class="text-center mt-2">
                <button @click="resetPassword" class="text-xs font-bold text-slate-400 hover:text-primary transition">忘記密碼？</button>
            </div>
        </div>

        <div class="mt-6 text-sm font-bold text-slate-400">
            {{ isRegisterMode ? '已經有帳號了嗎？' : '還沒有帳號？' }}
            <button @click="isRegisterMode = !isRegisterMode; authError=''" class="text-primary hover:underline ml-1">
                {{ isRegisterMode ? '直接登入' : '立即註冊' }}
            </button>
        </div>
    </div>

    <div v-else class="flex w-full h-full bg-white sm:w-[414px] sm:h-[88vh] sm:rounded-[36px] sm:shadow-2xl sm:border-[10px] sm:border-dark relative overflow-hidden shadow-premium">
        
        <transition name="slide">
            <aside v-if="isSidebarOpen" class="absolute inset-0 z-50 bg-white flex flex-col p-6 shadow-2xl">
                <div class="flex justify-between items-center mb-8">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary"><i class="ph-fill ph-user text-xl"></i></div>
                        <div>
                            <div class="text-sm font-black text-dark">{{ user.displayName || '旅行者' }}</div>
                            <button @click="handleLogout" class="text-[10px] font-bold text-slate-400 hover:text-red-400">登出帳號</button>
                        </div>
                    </div>
                    <button @click="isSidebarOpen = false" class="text-slate-300 hover:text-dark"><i class="ph-bold ph-x text-2xl"></i></button>
                </div>

                <div class="flex-1 overflow-y-auto space-y-3 hide-scroll">
                    <div class="text-[10px] font-black text-slate-300 tracking-widest uppercase mb-2 ml-1">我的旅程清單</div>
                    
                    <draggable v-model="tripList" item-key="id" class="space-y-3" @end="updateTripOrder">
                        <template #item="{ element }">
                            <div @click="switchTrip(element.id)" class="p-4 rounded-2xl border-2 transition cursor-pointer relative group" :class="currentTripId === element.id ? 'bg-primary/5 border-primary shadow-sm' : 'bg-slate-50 border-transparent hover:bg-slate-100'">
                                <div class="font-black text-dark text-lg truncate pr-8">{{ element.destination || '未命名行程' }}</div>
                                <div class="text-[10px] font-bold text-slate-400 mt-1 uppercase">由 {{ element.ownerName }} 建立</div>
                                <button @click.stop="copyTripId(element.id)" class="absolute right-3 top-4 text-slate-300 hover:text-primary"><i class="ph-bold ph-share-network"></i></button>
                                <button @click.stop="deleteTrip(element.id)" class="absolute right-3 bottom-3 text-slate-200 hover:text-red-400 opacity-0 group-hover:opacity-100 transition"><i class="ph-bold ph-trash"></i></button>
                            </div>
                        </template>
                    </draggable>

                    <button @click="createNewTrip" class="w-full py-4 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 font-bold hover:bg-slate-50 hover:border-primary/30 hover:text-primary transition flex items-center justify-center gap-2 mt-4">
                        <i class="ph-bold ph-plus"></i> 建立新旅程
                    </button>
                </div>
            </aside>
        </transition>

        <div class="flex-1 flex flex-col min-w-0">
            <TripMain v-if="currentTripId" :tripId="currentTripId" @openMenu="isSidebarOpen = true" />
            <div v-else class="flex-1 flex flex-col items-center justify-center p-12 text-center bg-slate-50">
                <div class="w-24 h-24 bg-white rounded-3xl shadow-premium flex items-center justify-center mb-6 text-primary/20"><i class="ph-duotone ph-map-trifold text-6xl"></i></div>
                <h2 class="text-xl font-black text-dark mb-2">開始您的冒險</h2>
                <p class="text-sm text-slate-400 font-medium mb-8">點擊下方按鈕建立第一個行程，<br>或向朋友索取行程 ID 加入。</p>
                <div class="flex flex-col gap-3 w-full">
                    <button @click="createNewTrip" class="w-full bg-primary text-white py-4 rounded-2xl font-black shadow-lg shadow-primary/20 active:scale-95 transition">建立新旅程</button>
                    <button @click="isSidebarOpen = true" class="w-full bg-white text-slate-500 py-4 rounded-2xl font-bold border-2 border-slate-100 active:scale-95 transition">開啟行程選單</button>
                </div>
            </div>
        </div>
    </div>
  </div>
</template>

<style>
.hide-scroll::-webkit-scrollbar { display: none; }
.hide-scroll { -ms-overflow-style: none; scrollbar-width: none; }
.slide-enter-active, .slide-leave-active { transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
.slide-enter-from, .slide-leave-to { transform: translateX(-100%); }
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>