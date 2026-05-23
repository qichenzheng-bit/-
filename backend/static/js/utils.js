const API_BASE = '';

function getToken() {
    return localStorage.getItem('token') || '';
}

function setToken(token) {
    localStorage.setItem('token', token);
}

function removeToken() {
    localStorage.removeItem('token');
}

async function apiFetch(url, options = {}) {
    const token = getToken();
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };
    if (token) {
        headers['Authorization'] = 'Bearer ' + token;
    }
    const res = await fetch(API_BASE + url, { ...options, headers });
    if (res.status === 401) {
        removeToken();
        throw new Error('登录已过期，请重新登录');
    }
    if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
    }
    return res.json();
}

function showToast(msg, type) {
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + (type || 'info');
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        if (m === '"') return '&quot;';
        if (m === "'") return '&#39;';
        return m;
    });
}

function formatDate(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function debounce(fn, delay) {
    let timer;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}