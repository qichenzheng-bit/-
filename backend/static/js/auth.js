document.addEventListener('DOMContentLoaded', () => {
    const loginTab = document.getElementById('login-tab');
    const registerTab = document.getElementById('register-tab');
    const authForm = document.getElementById('auth-form');
    const submitBtn = document.getElementById('submit-btn');
    const errorMsg = document.getElementById('error-msg');
    const registerExtra = document.getElementById('register-extra');
    const rememberGroup = document.getElementById('remember-group');
    let isLogin = true;

    function showError(msg) { errorMsg.textContent = msg; errorMsg.style.display = 'block'; }
    function hideError() { errorMsg.style.display = 'none'; }

    loginTab.addEventListener('click', () => {
        isLogin = true;
        loginTab.classList.add('active'); registerTab.classList.remove('active');
        submitBtn.textContent = '登 录';
        registerExtra.style.display = 'none';
        rememberGroup.style.display = 'flex';
        hideError();
    });
    registerTab.addEventListener('click', () => {
        isLogin = false;
        registerTab.classList.add('active'); loginTab.classList.remove('active');
        submitBtn.textContent = '注 册';
        registerExtra.style.display = 'block';
        rememberGroup.style.display = 'none';
        hideError();
    });

    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError();
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;
        if (!username || !password) return showError('请填写完整');
        if (!isLogin) {
            const confirm = document.getElementById('confirm-password').value;
            if (password !== confirm) return showError('两次密码不一致');
        }
        submitBtn.disabled = true;
        try {
            const endpoint = isLogin ? '/auth/login' : '/auth/register';
            const body = { username, password };
            const res = await fetch(API_BASE + endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (!res.ok) {
                let errMsg = '请求失败';
                if (data.detail) {
                    if (typeof data.detail === 'string') errMsg = data.detail;
                    else if (Array.isArray(data.detail)) errMsg = data.detail[0]?.msg || JSON.stringify(data.detail[0]);
                    else errMsg = JSON.stringify(data.detail);
                }
                throw new Error(errMsg);
            }
            // 保存 Token
            setToken(data.access_token);

            // 如果填写了 API Key，自动保存并激活
            const apiKey = document.getElementById('api-key').value.trim();
            if (apiKey) {
                try {
                    // 使用刚获取的 token 操作
                    const headers = {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + data.access_token
                    };
                    // 获取现有配置
                    const configsRes = await fetch(API_BASE + '/users/ai-keys', { headers });
                    const configs = await configsRes.json();
                    const existing = configs.find(c => c.provider === 'doubao');
                    if (existing) {
                        await fetch(API_BASE + '/users/ai-keys/' + existing.id, {
                            method: 'PUT',
                            headers,
                            body: JSON.stringify({ api_key: apiKey, is_active: true })
                        });
                    } else {
                        await fetch(API_BASE + '/users/ai-keys', {
                            method: 'POST',
                            headers,
                            body: JSON.stringify({
                                provider: 'doubao',
                                api_key: apiKey,
                                base_url: 'https://ark.cn-beijing.volces.com/api/v3',
                                model_name: 'doubao-1.5-pro-32k-250115',
                                is_active: true
                            })
                        });
                    }
                } catch(e) { console.error('保存 API Key 失败', e); }
            }

            window.location.href = '/';
        } catch(err) {
            showError(err.message);
        } finally {
            submitBtn.disabled = false;
        }
    });

    // 如果已经登录，直接跳转
    if (getToken()) {
        fetch(API_BASE + '/auth/me', {
            headers: { 'Authorization': 'Bearer ' + getToken() }
        }).then(res => {
            if (res.ok) window.location.href = '/';
        }).catch(() => {});
    }
});