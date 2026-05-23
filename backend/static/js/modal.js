function showModal(title, content, onConfirm = null, confirmText = '确定', cancelText = '取消') {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';

        let bodyHtml = '';
        let isForm = false;
        if (typeof content === 'object' && content.type === 'form') {
            bodyHtml = content.html;
            isForm = true;
        } else if (typeof content === 'string') {
            bodyHtml = content;
        }

        overlay.innerHTML = `
            <div class="modal-card" style="background:var(--surface);border-radius:12px;padding:24px;min-width:300px;max-width:420px;box-shadow:0 10px 30px rgba(0,0,0,0.3);">
                <h3 style="margin:0 0 8px;">${title}</h3>
                <div class="modal-body">${bodyHtml}</div>
                <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
                    <button class="btn btn-outline modal-cancel">${cancelText}</button>
                    <button class="btn btn-primary modal-confirm">${confirmText}</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const handleConfirm = () => {
            if (isForm && content.onConfirm) {
                // 自定义表单模式：调用 onConfirm，允许阻止关闭
                const result = content.onConfirm(overlay);
                if (result === false) return; // 阻止关闭
                overlay.remove();
                resolve(result);
            } else {
                // 简单模式：检查是否存在输入框
                const input = document.getElementById('modal-input');
                if (input) {
                    overlay.remove();
                    resolve(input.value.trim());
                } else {
                    // 无输入框，确认为 true（如 modalConfirm）
                    overlay.remove();
                    resolve(true);
                }
            }
        };

        const handleCancel = () => {
            overlay.remove();
            resolve(false);
        };

        overlay.querySelector('.modal-confirm').addEventListener('click', handleConfirm);
        overlay.querySelector('.modal-cancel').addEventListener('click', handleCancel);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) handleCancel();
        });

        // 自动聚焦输入框
        setTimeout(() => {
            const input = document.getElementById('modal-input');
            if (input) input.focus();
        }, 100);
    });
}

function modalAlert(title, message) { return showModal(title, message); }
function modalConfirm(title, message) {
    return showModal(title, message);
}
async function modalPrompt(title, message, options = {}) {
    const inputHtml = `<div class="form-group" style="margin:12px 0;">
        <input id="modal-input" placeholder="${options.placeholder || ''}" value="${options.defaultValue || ''}" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;">
    </div>`;
    return await showModal(title, message + inputHtml);
}