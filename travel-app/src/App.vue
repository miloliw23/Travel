<script setup>
// src/App.vue
import { ref, onMounted } from 'vue'
import { db, auth } from './firebase' 
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    updateProfile 
} from "firebase/auth";

// ✨ 確保這整段只出現一次，並且包含所有需要的函式
import { 
    collection, 
    doc, 
    setDoc, 
    onSnapshot, 
    query, 
    orderBy, 
    deleteDoc, 
    where, 
    updateDoc, 
    arrayUnion, 
    getDoc, 
    writeBatch 
} from 'firebase/firestore'

import TripMain from './components/TripMain.vue'
import draggable from 'vuedraggable'

// --- 狀態定義 ---
const user = ref(null)
const showTripMenu = ref(false)
const tripList = ref([])
const currentTripId = ref(null)
const showSetupModal = ref(false)
const showJoinModal = ref(false)
const joinTripIdInput = ref('')
const setup = ref({ destination: '', currency: 'JPY', startDate: new Date().toISOString().split('T')[0], days: 5 })

// ✨ 登入/註冊表單狀態
const isRegisterMode = ref(false) // 是否為註冊模式
const authForm = ref({ email: '', password: '', name: '' })
const authError = ref('')

// --- Authentication Logic ---

// 處理登入或註冊
const handleAuth = async () => {
    authError.value = '';
    if (!authForm.value.email || !authForm.value.password) {
        authError.value = "請輸入 Email 和密碼";
        return;
    }

    try {
        if (isRegisterMode.value) {
            // --- 註冊模式 ---
            if (!authForm.value.name) {
                authError.value = "註冊請填寫暱稱";
                return;
            }
            // 1. 建立帳號
            const userCredential = await createUserWithEmailAndPassword(auth, authForm.value.email, authForm.value.password);
            // 2. 更新使用者暱稱 (顯示名稱)
            await updateProfile(userCredential.user, {
                displayName: authForm.value.name
            });
            // 手動觸發一下重新整理，確保畫面抓到名字
            user.value = Object.assign({}, userCredential.user);
        } else {
            // --- 登入模式 ---
            await signInWithEmailAndPassword(auth, authForm.value.email, authForm.value.password);
        }
        // 成功後清空表單
        authForm.value = { email: '', password: '', name: '' };
    } catch (e) {
        console.error(e);
        switch(e.code) {
            case 'auth/email-already-in-use': authError.value = "此 Email 已被註冊過"; break;
            case 'auth/invalid-email': authError.value = "Email 格式不正確"; break;
            case 'auth/weak-password': authError.value = "密碼太弱，請至少輸入6位數"; break;
            case 'auth/wrong-password': authError.value = "密碼錯誤"; break;
            case 'auth/user-not-found': authError.value = "找不到此帳號，請先註冊"; break;
            default: authError.value = "登入失敗：" + e.message;
        }
    }
}

const logout = () => {
    signOut(auth);
    user.value = null;
    tripList.value = [];
    currentTripId.value = null;
}

// --- Firebase Logic ---
const generateId = () => 'trip_' + Date.now().toString(36)

const initTrip = async () => {
    if(!user.value) return;
    const newId = generateId();
    const newDays = Array.from({length: setup.value.days}, (_, i) => ({ date: `Day ${i+1}`, items: [] }));
    
    await setDoc(doc(db, "trips", newId), { 
        id: newId, 
        destination: setup.value.destination || '未命名行程', 
        startDate: setup.value.startDate, 
        daysCount: setup.value.days, 
        createdAt: Date.now(),
        members: [user.value.uid], 
        ownerName: user.value.displayName || user.value.email.split('@')[0],// 若無名字則用 email 前綴
        order: 0
    });
    
    await setDoc(doc(db, "trip_details", newId), { 
        days: newDays, 
        expenses: [], 
        setup: setup.value, 
        participants: ['我', '旅伴A'] 
    });

    currentTripId.value = newId;
    showSetupModal.value = false;
}

const joinTrip = async () => {
    if(!joinTripIdInput.value) return;
    const tripRef = doc(db, "trips", joinTripIdInput.value);
    try {
        const docSnap = await getDoc(tripRef);
        if (docSnap.exists()) {
            await updateDoc(tripRef, {
                members: arrayUnion(user.value.uid)
            });
            alert("成功加入行程！");
            showJoinModal.value = false;
            joinTripIdInput.value = '';
        } else {
            alert("找不到這個行程 ID，請確認對方有給你正確的代碼。");
        }
    } catch (e) {
        console.error(e);
        alert("加入失敗，請稍後再試。");
    }
}

const copyTripId = (id) => {
    navigator.clipboard.writeText(id).then(() => {
        alert("已複製行程 ID！傳給朋友，請他們點擊「加入現有行程」並貼上此 ID 即可共享。");
    });
}

const createNewTrip = () => { 
    setup.value = { destination: '', startDate: new Date().toISOString().split('T')[0], days: 5, currency: 'JPY' }; 
    showSetupModal.value = true; 
    showTripMenu.value = false; 
}

const switchTrip = (id) => {
    currentTripId.value = id; 
    showTripMenu.value = false;
}

// ✨ 新增：處理側邊欄拖拉排序
const updateTripOrder = async () => {
    // 1. 建立一個批次寫入 (Batch)，因為我們要一次更新好幾個行程的順序
    const batch = writeBatch(db);
    
    // 2. 遍歷目前的列表，把新的索引 (index) 寫入 order 欄位
    tripList.value.forEach((trip, index) => {
        const tripRef = doc(db, "trips", trip.id);
        // 只更新 order 欄位
        batch.update(tripRef, { order: index });
    });

    try {
        // 3. 送出更新
        await batch.commit();
        console.log("順序更新成功");
    } catch (e) {
        console.error("順序更新失敗", e);
    }
}

const deleteTrip = async (id) => {
    if(!confirm('確定刪除? 注意：這會刪除所有人的資料！')) return;
    await deleteDoc(doc(db, "trips", id));
    await deleteDoc(doc(db, "trip_details", id));
    if(currentTripId.value === id) currentTripId.value = null;
}

// src/App.vue 的 onMounted

onMounted(() => {
    onAuthStateChanged(auth, (currentUser) => {
        user.value = currentUser;
        if (currentUser) {
            // 1. 修改 Query：只過濾「跟自己有關的」，拿掉 orderBy
            // 因為我們要用 JavaScript 在前端做更複雜的「混合排序」
            const q = query(
                collection(db, "trips"), 
                where("members", "array-contains", currentUser.uid)
            );
            
            onSnapshot(q, (snapshot) => {
                const rawList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                
                // ✨ 關鍵修正：前端混合排序邏輯
                rawList.sort((a, b) => {
                    // 情況 A：兩者都有 'order' 欄位 (新資料或已拖拉過的)
                    // -> 依照 order 數字「由小到大」排
                    if (a.order !== undefined && b.order !== undefined) {
                        return a.order - b.order;
                    }

                    // 情況 B：只有其中一個有 'order'
                    // -> 有 order 的排前面 (這樣新整理的行程會置頂)
                    if (a.order !== undefined) return -1;
                    if (b.order !== undefined) return 1;
                    
                    // 情況 C：兩者都沒有 'order' (舊資料)
                    // -> 依照 'createdAt' 建立時間「由新到舊」排
                    // (這就是您原本想要的時間排序)
                    return b.createdAt - a.createdAt;
                });

                tripList.value = rawList;

                // 如果有行程但沒選中，預設選第一個
                if (tripList.value.length > 0 && !currentTripId.value) {
                    currentTripId.value = tripList.value[0].id;
                }
            });
        } else {
            tripList.value = [];
            currentTripId.value = null;
        }
    });
})
</script>

<template>
  <div class="h-[100dvh] w-screen flex flex-col sm:items-center sm:justify-center text-dark">
    
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
        </div>

        <div class="mt-6 text-sm font-bold text-slate-400">
            {{ isRegisterMode ? '已經有帳號了嗎？' : '還沒有帳號？' }}
            <button @click="isRegisterMode = !isRegisterMode; authError=''" class="text-primary hover:underline ml-1">
                {{ isRegisterMode ? '直接登入' : '立即註冊' }}
            </button>
        </div>
    </div>

    <div v-else class="flex flex-col bg-slate-50 relative overflow-hidden w-full h-full sm:w-[414px] sm:h-[88vh] sm:rounded-[36px] sm:shadow-2xl sm:border-[10px] sm:border-dark">

        <TripMain 
            v-if="currentTripId" 
            :tripId="currentTripId" 
            :key="currentTripId" 
            @openMenu="showTripMenu = true"
        />
        
        <div v-else class="flex-1 flex flex-col items-center justify-center text-slate-300 gap-4">
            <i class="ph-duotone ph-map-trifold text-6xl opacity-50"></i>
            <div class="font-bold">還沒有行程</div>
            <button @click="showTripMenu = true" class="text-primary font-bold hover:underline">打開選單建立或加入</button>
        </div>

        <transition name="slide">
            <div v-if="showTripMenu" class="absolute inset-0 z-50 flex">
                <div class="bg-white w-[85%] max-w-xs h-full shadow-2xl flex flex-col relative z-50 p-6">
                    <div class="flex justify-between items-center mb-6">
                        <div class="flex items-center gap-3">
                            <div v-if="user.photoURL" class="w-10 h-10 rounded-full border-2 border-primary overflow-hidden">
                                <img :src="user.photoURL" class="w-full h-full object-cover">
                            </div>
                            <div v-else class="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-black border-2 border-white shadow-sm">
                                {{ (user.displayName || user.email || 'U').charAt(0).toUpperCase() }}
                            </div>
                            
                            <div class="flex flex-col">
                                <span class="text-xs font-bold text-slate-400">Hello,</span>
                                <span class="text-sm font-black text-dark truncate w-24">{{ user.displayName || '使用者' }}</span>
                            </div>
                        </div>
                        <button @click="showTripMenu = false" class="text-slate-400 hover:text-dark p-1 bg-slate-100 rounded-full"><i class="ph-bold ph-x text-xl"></i></button>
                    </div>

                    <div class="space-y-3 mb-6">
                        <button @click="createNewTrip" class="w-full py-3.5 border-[2px] border-dashed border-primary/40 text-primary rounded-xl font-bold hover:bg-primary/5 flex items-center justify-center gap-2 active:scale-[0.98] transition">
                            <i class="ph-bold ph-plus-circle text-lg"></i> 建立新旅程
                        </button>
                        <button @click="showJoinModal = true" class="w-full py-3.5 border-[2px] border-slate-200 text-slate-500 rounded-xl font-bold hover:bg-slate-50 flex items-center justify-center gap-2 active:scale-[0.98] transition">
                            <i class="ph-bold ph-users text-lg"></i> 加入朋友行程
                        </button>
                    </div>
                    
                    <div class="flex-1 overflow-y-auto space-y-3 hide-scroll">
                        <draggable v-model="tripList" item-key="id" class="space-y-3" @end="updateTripOrder">
                            <template #item="{ element }">
                                <div @click="switchTrip(element.id)" class="p-4 rounded-2xl border-2 transition cursor-pointer relative group" :class="currentTripId === element.id ? 'bg-primary/5 border-primary shadow-sm' : 'bg-slate-50 border-transparent hover:bg-slate-100'">
                                    <div class="flex justify-between items-start">
                                        <div class="font-black text-dark text-lg">{{ element.destination || '未命名行程' }}</div>
                                        <button @click.stop="copyTripId(element.id)" class="text-slate-300 hover:text-primary p-1" title="複製ID給朋友"><i class="ph-bold ph-share-network"></i></button>
                                    </div>
                                    <div class="text-xs font-bold text-slate-400 mt-1">{{ element.startDate }} • {{ element.daysCount }} 天</div>
                                    <button v-if="tripList.length > 0" @click.stop="deleteTrip(element.id)" class="absolute right-3 bottom-3 text-slate-300 hover:text-red-400 p-1"><i class="ph-bold ph-trash text-lg"></i></button>
                                </div>
                            </template>
                        </draggable>
                    </div>

                    <button @click="logout" class="mt-4 w-full py-3 bg-slate-100 text-slate-500 rounded-xl font-bold hover:bg-slate-200">登出</button>
                </div>
                <div class="flex-1 bg-dark/60 backdrop-blur-sm z-40" @click="showTripMenu = false"></div>
            </div>
        </transition>

        <div v-if="showSetupModal" class="absolute inset-0 bg-primary-dark/95 backdrop-blur-md z-50 flex items-center justify-center p-6">
            <div class="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl relative animate-[fade-in-up_0.4s_ease-out]">
                <div class="text-center mb-8">
                    <div class="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4"><i class="ph-duotone ph-airplane-tilt text-4xl text-primary"></i></div>
                    <h2 class="text-3xl font-black text-dark">開啟新旅程</h2>
                </div>
                <div class="space-y-5">
                    <div>
                        <label class="block text-xs font-bold text-slate-400 mb-1.5 ml-1 uppercase tracking-wider">目的地</label>
                        <input v-model="setup.destination" type="text" placeholder="例如: Tokyo" class="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-4 text-dark font-black text-lg focus:border-primary focus:outline-none transition">
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div><label class="block text-xs font-bold text-slate-400 mb-1.5 ml-1">出發日</label><input v-model="setup.startDate" type="date" class="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-3 py-3.5 text-dark font-bold text-sm focus:border-primary focus:outline-none"></div>
                        <div><label class="block text-xs font-bold text-slate-400 mb-1.5 ml-1">天數</label><input v-model.number="setup.days" type="number" min="1" max="30" class="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-3 py-3.5 text-dark font-black text-center focus:border-primary focus:outline-none"></div>
                    </div>
                    <button @click="initTrip" class="w-full bg-primary hover:bg-primary-dark text-white font-black text-lg py-4 rounded-2xl shadow-xl shadow-primary/30 transform active:scale-95 transition flex items-center justify-center gap-2 mt-4">建立 <i class="ph-bold ph-plus"></i></button>
                    <button @click="showSetupModal = false" class="w-full text-slate-400 text-sm font-bold py-2 hover:text-dark">取消</button>
                </div>
            </div>
        </div>

        <div v-if="showJoinModal" class="absolute inset-0 bg-dark/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <div class="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl relative animate-[fade-in-up_0.2s_ease-out]">
                <div class="text-center mb-6">
                    <div class="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-3"><i class="ph-bold ph-users text-3xl"></i></div>
                    <h2 class="text-2xl font-black text-dark">加入朋友的行程</h2>
                    <p class="text-sm text-slate-400 mt-2">請朋友點擊行程卡片上的「分享圖示」<br>並將 ID 傳送給您。</p>
                </div>
                <input v-model="joinTripIdInput" placeholder="在此貼上行程 ID" class="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-4 text-dark font-bold text-center focus:border-primary focus:outline-none mb-4">
                <button @click="joinTrip" class="w-full bg-blue-500 hover:bg-blue-600 text-white font-black text-lg py-4 rounded-2xl shadow-xl shadow-blue-500/30 transition flex items-center justify-center gap-2">加入行程 <i class="ph-bold ph-arrow-right"></i></button>
                <button @click="showJoinModal = false" class="w-full text-slate-400 text-sm font-bold py-3 mt-2 hover:text-dark">取消</button>
            </div>
        </div>

    </div>
  </div>
</template>