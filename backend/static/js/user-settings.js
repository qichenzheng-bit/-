async function renderUserSettingsModule(container) {
    container.innerHTML = `
        <div style="padding:20px; max-width:600px;">
            <h3>用户设置</h3>
            <div class="card" style="padding:16px;">
                <h4>修改密码</h4>
                <div class="form-group"><label>旧密码</label><input type="password" id="old-password"></div>
                <div class="form-group"><label>新密码</label><input type="password" id="new-password"></div>
                <div class="form-group"><label>确认新密码</label><input type="password" id="confirm-new-password"></div>
                <button class="btn btn-primary" id="change-pwd-btn">修改密码</button>
            </div>
        </div>
    `;

    document.getElementById('change-pwd-btn').addEventListener('click', async () => {
        const old = document.getElementById('old-password').value;
        const newPwd = document.getElementById('new-password').value;
        const confirm = document.getElementById('confirm-new-password').value;
        if (!old || !newPwd) return showToast('请填写完整');
        if (newPwd !== confirm) return showToast('两次密码不一致');
        try {
            await apiFetch('/users/password', { method:'PUT', body: JSON.stringify({old_password: old, new_password: newPwd}) });
            showToast('密码修改成功');
        } catch(e) { showToast('修改失败: '+e.message); }
    });
}