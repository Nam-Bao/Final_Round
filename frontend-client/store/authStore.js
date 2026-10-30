import { create } from 'zustand';

// Phiên đăng nhập lưu trong sessionStorage: đóng trình duyệt / tab là phải đăng nhập lại.
// (Trước đây dùng localStorage nên mở lại web vẫn còn đăng nhập — xoá dữ liệu cũ đó đi.)
localStorage.removeItem('token');
localStorage.removeItem('user');

// Đọc thời điểm hết hạn (exp, giây) trong payload JWT; token hỏng coi như đã hết hạn
const getTokenExpiry = (token) => {
    try {
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        return payload.exp ? payload.exp * 1000 : 0;
    } catch {
        return 0;
    }
};

const loadSession = () => {
    const token = sessionStorage.getItem('token');
    if (!token || getTokenExpiry(token) <= Date.now()) {
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
        return { user: null, token: null };
    }
    return { user: JSON.parse(sessionStorage.getItem('user')) || null, token };
};

let expiryTimer = null;

export const useAuthStore = create((set, get) => {
    // Tự đăng xuất đúng lúc token hết hạn
    const scheduleLogout = (token) => {
        clearTimeout(expiryTimer);
        if (!token) return;
        expiryTimer = setTimeout(() => get().logout(), Math.max(getTokenExpiry(token) - Date.now(), 0));
    };

    const initial = loadSession();
    scheduleLogout(initial.token);

    return {
        ...initial,
        login: (userData, token) => {
            sessionStorage.setItem('user', JSON.stringify(userData));
            sessionStorage.setItem('token', token);
            scheduleLogout(token);
            set({ user: userData, token });
        },
        // Cập nhật lại thông tin user (sau khi sửa hồ sơ) mà không đụng tới token
        updateUser: (userData) => {
            sessionStorage.setItem('user', JSON.stringify(userData));
            set({ user: userData });
        },
        logout: () => {
            clearTimeout(expiryTimer);
            sessionStorage.removeItem('user');
            sessionStorage.removeItem('token');
            set({ user: null, token: null });
        }
    };
});

// Token để gắn vào header Authorization
export const getToken = () => useAuthStore.getState().token;
