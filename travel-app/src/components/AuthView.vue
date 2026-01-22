<script setup>
import { ref } from 'vue'
import { auth } from '../firebase'
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  updateProfile,
  sendPasswordResetEmail 
} from "firebase/auth"

const emit = defineEmits(['authSuccess'])
const isRegisterMode = ref(false)
const authError = ref("")
const authForm = ref({ email: '', password: '', name: '' })

const handleAuth = async () => {
  authError.value = ""
  try {
    if (isRegisterMode.value) {
      const res = await createUserWithEmailAndPassword(auth, authForm.value.email, authForm.value.password)
      await updateProfile(res.user, { displayName: authForm.value.name })
    } else {
      await signInWithEmailAndPassword(auth, authForm.value.email, authForm.value.password)
    }
  } catch (e) {
    authError.value = "驗證失敗，請檢查帳號密碼"
  }
}

const handleForgotPassword = async () => {
  if (!authForm.value.email) return alert("請先在 Email 欄位輸入信箱")
  try {
    await sendPasswordResetEmail(auth, authForm.value.email)
    alert("密碼重設郵件已寄出，請檢查信箱")
  } catch (e) {
    alert("發送失敗，請確認 Email 是否正確")
  }
}
</script>

<template>
  <div class="flex flex-col items-center justify-center h-full p-8 bg-white w-full sm:w-[400px] sm:h-[80vh] sm:rounded-[40px] shadow-xl border-8 border-[#F2EDE4]">
    <h1 class="text-3xl font-black mb-8 text-[#8B7E74]">1MIN去旅遊</h1>
    
    <div class="w-full space-y-4">
      <div v-if="isRegisterMode" class="relative">
        <i class="ph-bold ph-user absolute left-4 top-4 text-[#BAB3A9]"></i>
        <input v-model="authForm.name" type="text" placeholder="你的暱稱" class="w-full bg-[#FAF8F5] border-b-2 border-[#F2EDE4] pl-10 pr-4 py-3 outline-none focus:border-[#E6B3A3]">
      </div>

      <div class="relative">
        <i class="ph-bold ph-envelope absolute left-4 top-4 text-[#BAB3A9]"></i>
        <input v-model="authForm.email" type="email" placeholder="Email" class="w-full bg-[#FAF8F5] border-b-2 border-[#F2EDE4] pl-10 pr-4 py-3 outline-none focus:border-[#E6B3A3]">
      </div>

      <div class="relative">
        <i class="ph-bold ph-lock absolute left-4 top-4 text-[#BAB3A9]"></i>
        <input v-model="authForm.password" type="password" placeholder="密碼" class="w-full bg-[#FAF8F5] border-b-2 border-[#F2EDE4] pl-10 pr-4 py-3 outline-none focus:border-[#E6B3A3]" @keyup.enter="handleAuth">
      </div>
      
      <div v-if="!isRegisterMode" class="flex justify-end">
        <button @click="handleForgotPassword" class="text-[11px] font-bold text-[#BAB3A9] hover:text-[#E6B3A3] flex items-center gap-1 transition">
           忘記密碼？
        </button>
      </div>

      <div v-if="authError" class="text-red-400 text-[10px] text-center font-bold">{{ authError }}</div>
      
      <button @click="handleAuth" class="w-full bg-[#E6B3A3] text-white py-4 rounded-2xl font-bold shadow-md active:scale-95 transition mt-4">
        {{ isRegisterMode ? '註冊並開始' : '登入系統' }}
      </button>
    </div>

    <button @click="isRegisterMode = !isRegisterMode" class="mt-8 text-sm text-[#BAB3A9] font-bold hover:text-[#8B7E74]">
      {{ isRegisterMode ? '已有帳號？返回登入' : '還沒有帳號？點此註冊' }}
    </button>
  </div>
</template>