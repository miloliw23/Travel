<script setup>
import { ref, onMounted } from 'vue'
import { db, auth } from './firebase' 
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    updateProfile,
    sendPasswordResetEmail,
    updatePassword // ✨ 匯入修改密碼功能
} from "firebase/auth";

import { 
    collection, 
    doc, 
    setDoc, 
    onSnapshot, 
    query, 
    where, 
    deleteDoc, 
    writeBatch 
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

// ✨ 修改密碼相關狀態
const showChangePassword = ref(false);
const newPasswordInput = ref("");

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
        authError.value = "驗證失敗：" + e.message;
    }
};

const handleLogout = () => {
    if(confirm('確定要登出帳號嗎？')) {
        signOut(auth);
    }
};

// ✨ 忘記密碼邏輯 (登入前)
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

// ✨ 修改密碼邏輯 (登入後)
const handleUpdatePassword = async () => {
    if (newPasswordInput.value.length < 6) {
        alert("新密碼長度至少需要 6 位數！");
        return;
    }
    try {
        await updatePassword(auth.currentUser, newPasswordInput.value);
        alert("密碼修改成功！下次登入請使用新密碼。");
        newPasswordInput.value = "";
        showChangePassword.value = false;
    } catch (e) {
        if (e.code === 'auth/requires-recent-login') {
            alert("為了帳號安全，請先「登出並重新登入」後再執行修改密碼。");
        } else {
            alert("修改失敗：" + e.message);
        }
    }
};

// --- 行程管理邏輯 ---
const createNewTrip = async () => {
    if(!user.value) return;
    const newId = 'trip_' + Date.now();
    await setDoc(doc(db, "trips", newId), { 
        id: newId, 
        destination: '新旅程', 
        createdAt: Date.now(),
        members: [user.value.uid], 
        ownerName: user.value.displayName || user.value.email.split('@')[0],
        order: 0 
    });
    await setDoc(doc(db, "trip_details", newId), {
        days: [{ date: 'Day 1', items: [], location: '' }],
        expenses: [],
        setup: { destination: '新旅程', currency: 'TWD', startDate: new Date().toISOString().split('T')[0], days: 1 },
        participants: [user.value.displayName || '我']
    });
    currentTripId.value = newId;
    isSidebarOpen.value = false;
};

const updateTripOrder = async () => {
    const batch = writeBatch(db);
    tripList.value.forEach((trip, index) => {
        const tripRef = doc(db, "trips", trip.id);
        batch.update(tripRef, { order: index });
    });
    await batch.commit();
};

const switchTrip = (id) => {
    currentTripId.value = id;
    isSidebarOpen.value = false;
};

const deleteTrip = async (id) => {
    if (confirm('確定要刪除整個行程嗎？')) {
        await deleteDoc(doc(db, "trips", id));
        await deleteDoc(doc(db, "trip_details", id));
        if (currentTripId.value === id) currentTripId.value = null;
    }
};

const copyTripId = (id) => {
    navigator.clipboard.writeText(id);
    alert("行程 ID 已複製！");
};

onMounted(() => {
    onAuthStateChanged(auth, (currentUser) => {
        user.value = currentUser;
        if (currentUser) {
            const q = query(collection(db, "trips"), where("members", "array-contains", currentUser.uid));
            onSnapshot(q, (snapshot) => {
                const rawList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                rawList.sort((a, b) => {
                    if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
                    return b.createdAt - a.createdAt;
                });
                tripList.value = rawList;
                if (tripList.value.length > 0 && !currentTripId.value) currentTripId.value = tripList.value[0].id;
            });
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
            <p class="text-slate-400 text-sm font-medium mt-1">{{ isRegisterMode ? '建立帳號以開始規劃旅程' : '登入以繼續您的旅程' }}</p>
        </div>
        <div class="w-full space-y-3">
            <div v-if="isRegisterMode"><input v-model="authForm.name" type="text" placeholder="您的暱稱" class="w-full bg-white border-2 border-slate-100 rounded-xl px-4 py-3 font-bold"></div>
            <div><input v-model="authForm.email" type="email" placeholder="Email 信箱" class="w-full bg-white border-2 border-slate-100 rounded-xl px-4 py-3 font-bold"></div>
            <div><input v-model="authForm.password" type="password" placeholder="密碼 (至少6位)" class="w-full bg-white border-2 border-slate-100 rounded-xl px-4 py-3 font-bold" @keyup.enter="handleAuth"></div>
            <div v-if="authError" class="text-red-500 text-xs font-bold text-center bg-red-50 py-2 rounded-lg">{{ authError }}</div>
            <button @click="handleAuth" class="w-full bg-primary hover:bg-primary-dark text-white font-black text-lg py-3.5 rounded-xl shadow-lg shadow-primary/30 transition">{{ isRegisterMode ? '註冊並登入' : '登入' }}</button>
            <div v-if="!isRegisterMode" class="text-center mt-2">
                <button @click="resetPassword" class="text-xs font-bold text-slate-400 hover:text-primary transition">忘記密碼？</button>
            </div>
        </div>
        <div class="mt-6 text-sm font-bold text-slate-400">
            {{ isRegisterMode ? '已經有帳號了嗎？' : '還沒有帳號？' }}
            <button @click="isRegisterMode = !isRegisterMode; authError=''" class="text-primary hover:underline ml-1">{{ isRegisterMode ? '直接登入' : '立即註冊' }}</button>
        </div>
    </div>

    <div v-else class="flex w-full h-full bg-white sm:w-[414px] sm:h-[88vh] sm:rounded-[36px] sm:shadow-2xl sm:border-[10px] sm:border-dark relative overflow-hidden shadow-premium">
        
        <transition name="slide">
            <aside v-if="isSidebarOpen" class="absolute inset-0 z-50 bg-white flex flex-col p-6 shadow-2xl">
                <div class="mb-8">
                    <div class="flex justify-between items-start mb-4">
                        <div class="flex items-center gap-4">
                            <div class="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary"><i class="ph-fill ph-user text-2xl"></i></div>
                            <div>
                                <div class="text-lg font-black text-dark leading-none">{{ user.displayName || '旅行者' }}</div>
                                <button @click="showChangePassword = !showChangePassword" class="text-xs font-bold text-primary mt-1">修改密碼</button>
                            </div>
                        </div>
                        <button @click="isSidebarOpen = false" class="text-slate-300 hover:text-dark"><i class="ph-bold ph-x text-2xl"></i></button>
                    </div>

                    <transition name="fade">
                        <div v-if="showChangePassword" class="mb-4 p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 space-y-3">
                            <input v-model="newPasswordInput" type="password" placeholder="輸入新密碼 (6位以上)" class="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none">
                            <div class="flex gap-2">
                                <button @click="handleUpdatePassword" class="flex-1 bg-primary text-white text-xs py-2 rounded-lg font-bold">確認</button>
                                <button @click="showChangePassword = false" class="flex-1 bg-white border border-slate-200 text-slate-400 text-xs py-2 rounded-lg font-bold">取消</button>
                            </div>
                        </div>
                    </transition>

                    <button @click="handleLogout" class="w-full bg-red-50 hover:bg-red-100 text-red-500 py-3 rounded-2xl text-sm font-black flex items-center justify-center gap-2 transition active:scale-95 border-2 border-red-100/50">
                        <i class="ph-bold ph-sign-out"></i> 登出帳號系統
                    </button>
                </div>

                <div class="flex-1 overflow-y-auto space-y-3 hide-scroll">
                    <div class="text-[10px] font-black text-slate-300 tracking-widest uppercase mb-2">我的旅程清單</div>
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
                    <button @click="createNewTrip" class="w-full py-4 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 font-bold hover:bg-slate-50 hover:border-primary/30 transition mt-4">
                        + 建立新旅程
                    </button>
                </div>
            </aside>
        </transition>

        <div class="flex-1 flex flex-col min-w-0">
            <TripMain v-if="currentTripId" :tripId="currentTripId" @openMenu="isSidebarOpen = true" />
            <div v-else class="flex-1 flex flex-col items-center justify-center p-12 text-center">
                <h2 class="text-xl font-black text-dark mb-2">開始您的冒險</h2>
                <button @click="createNewTrip" class="w-full bg-primary text-white py-4 rounded-2xl font-black">建立新旅程</button>
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