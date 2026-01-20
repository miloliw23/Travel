/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{vue,js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // ✨ 主色改為金黃色 (Amber-600)
                primary: { DEFAULT: '#d97706', dark: '#b45309', light: '#fbbf24' },
                // 輔助色改為原本的深青色 (Teal-700)，用於平衡視覺
                secondary: { DEFAULT: '#0f766e', light: '#14b8a6' },
                // 強調色保持胭脂紅 (Rose-700)
                accent: { DEFAULT: '#be123c', light: '#e11d48' },
                // 深色背景與文字
                dark: { DEFAULT: '#1e293b', light: '#334155' },
            },
            boxShadow: {
                'premium': '0 10px 30px -5px rgba(217, 119, 6, 0.15), 0 4px 10px -3px rgba(0, 0, 0, 0.05)', // 金色光暈陰影
                'premium-sm': '0 4px 12px -2px rgba(0, 0, 0, 0.08)',
            },
            fontFamily: {
                sans: ['"Noto Sans TC"', '"Noto Sans JP"', 'sans-serif'],
            }
        },
    },
    plugins: [],
}