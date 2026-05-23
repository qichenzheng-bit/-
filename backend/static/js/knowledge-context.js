// ========== 右键菜单 ==========
let contextMenuEl = null;

function initContextMenu() {
    contextMenuEl = document.createElement('div');
    contextMenuEl.id = 'context-menu';
    contextMenuEl.style.cssText = 'display:none; position:fixed; background:#fff; border:1px solid #dcdfe6; border-radius:6px; box-shadow:0 4px 12px rgba(0,0,0,0.15); z-index:9999; min-width:140px; padding:4px 0;';
    contextMenuEl.innerHTML = `
        <div class="ctx-item" data-action="add">📁 添加子类</div>
        <div class="ctx-item" data-action="rename">✏️ 重命名</div>
        <div class="ctx-item" data-action="delete" style="color:#e63946;">🗑️ 删除</div>
    `;
    document.body.appendChild(contextMenuEl);

    document.addEventListener('click', () => { contextMenuEl.style.display = 'none'; });

    contextMenuEl.addEventListener('click', (e) => {
        const action = e.target.getAttribute('data-action');
        const targetId = contextMenuEl.getAttribute('data-target-id');
        contextMenuEl.style.display = 'none';

        if (action === 'add') {
            showInlineInputAtCursor('请输入子类名称：', async (name) => {
                try {
                    await apiFetch('/knowledge-points/', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name, stage: 'G', level_type: 'point', parent_id: parseInt(targetId) })
                    });
                    showToast('子类已创建');
                    knowledgeTreeCache = null;
                    loadKnowledgeTree();
                    window.dispatchEvent(new CustomEvent('knowledge-points-updated'));
                } catch (e) { showToast('创建失败'); }
            });
        } else if (action === 'rename') {
            showInlineInputAtCursor('请输入新名称：', async (name) => {
                try {
                    await apiFetch(`/knowledge-points/${targetId}/rename?new_name=${encodeURIComponent(name)}`, { method: 'PUT' });
                    showToast('已重命名');
                    knowledgeTreeCache = null;
                    loadKnowledgeTree();
                } catch (e) { showToast('重命名失败'); }
            });
        } else if (action === 'delete') {
            if (confirm('确认删除该知识点？')) {
                apiFetch(`/knowledge-points/${targetId}`, { method: 'DELETE' }).then(() => {
                    showToast('已删除');
                    knowledgeTreeCache = null;
                    loadKnowledgeTree();
                }).catch(() => showToast('删除失败'));
            }
        }
    });
}

function showContextMenu(x, y, nodeId, el) {
    const old = document.getElementById('ctx-menu');
    if (old) old.remove();

    const menu = document.createElement('div');
    menu.id = 'ctx-menu';
    menu.style.cssText = 'position:fixed;background:var(--surface);border:1px solid var(--border);border-radius:6px;z-index:9999;min-width:120px;padding:4px 0;';
    menu.innerHTML = `
        <div class="ctx-item" data-action="add">📁 添加子类</div>
        <div class="ctx-item" data-action="rename">✏️ 重命名</div>
        <div class="ctx-item" data-action="edit-desc">📝 编辑指导</div>
        <div class="ctx-item" data-action="delete" style="color:var(--danger);">🗑️ 删除</div>
    `;
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    document.body.appendChild(menu);

    menu.addEventListener('click', async (e) => {
        const action = e.target.getAttribute('data-action');
        menu.remove();
        if (action === 'add') {
            const name = await modalPrompt('添加子类', '请输入子类名称：');
            if (name) {
                await apiFetch('/knowledge-points/', { method:'POST', body: JSON.stringify({ name, stage:'G', level_type:'point', parent_id: parseInt(nodeId) }) });
                knowledgeTreeCache = null;
                await loadKnowledgeTree();
                showToast('子类已创建');
            }
        } else if (action === 'rename') {
            const name = await modalPrompt('重命名', '请输入新名称：');
            if (name) {
                await apiFetch(`/knowledge-points/${nodeId}/rename?new_name=${encodeURIComponent(name)}`, { method:'PUT' });
                knowledgeTreeCache = null;
                await loadKnowledgeTree();
                showToast('已重命名');
            }
        } else if (action === 'edit-desc') {
            const kp = await apiFetch(`/knowledge-points/${nodeId}`);
            const newDesc = await modalPrompt('编辑指导内容', '支持 LaTeX，可输入知识点讲解、公式等', { defaultValue: kp.description || '' });
            if (newDesc !== null) {
                await apiFetch(`/knowledge-points/${nodeId}`, { method:'PUT', body: JSON.stringify({ description: newDesc }) });
                showToast('指导内容已更新');
            }
        } else if (action === 'delete') {
            if (await modalConfirm('确认删除', '确认删除该知识点及其子节点？')) {
                await apiFetch(`/knowledge-points/${nodeId}`, { method:'DELETE' });
                // 彻底清空缓存并强制重新加载
                knowledgeTreeCache = null;
                await loadKnowledgeTree();
                showToast('已删除');
                // 延迟一下再尝试聚焦父节点（如果存在）
                setTimeout(() => {
                    const parentId = el.closest('.tree-children')?.previousElementSibling?.dataset?.id;
                    if (parentId) {
                        const parentEl = document.querySelector(`.tree-item[data-id="${parentId}"]`);
                        if (parentEl) {
                            parentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            parentEl.classList.add('active');
                        }
                    }
                }, 300);
            }
        }
    });

    document.addEventListener('click', () => menu.remove(), { once: true });
}

function showInlineInput(btnId, prompt, callback) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = prompt;
    input.style.cssText = 'position:absolute; top:100%; left:0; z-index:1000; padding:6px 10px; border:1px solid #2c7da0; border-radius:4px; width:200px;';
    btn.parentElement.appendChild(input);
    input.focus();

    let removed = false;
    const safeRemove = () => {
        if (removed) return;
        removed = true;
        if (input && input.parentNode) {
            try {
                input.remove();
            } catch(e) {
                console.warn('移除输入框失败', e);
            }
        }
    };

    input.addEventListener('blur', safeRemove);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const name = input.value.trim();
            if (name) callback(name);
            safeRemove();
        }
        if (e.key === 'Escape') {
            safeRemove();
        }
    });
}

function showInlineInputAtCursor(prompt, callback) {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = prompt;
    input.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); z-index:10000; padding:10px 14px; border:2px solid #2c7da0; border-radius:8px; width:280px; font-size:14px; box-shadow:0 4px 16px rgba(0,0,0,0.2);';
    document.body.appendChild(input);
    input.focus();

    let removed = false;
    const safeRemove = () => {
        if (removed) return;
        removed = true;
        if (input && input.parentNode) {
            try {
                input.remove();
            } catch(e) {
                console.warn('移除输入框失败', e);
            }
        }
    };

    input.addEventListener('blur', safeRemove);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const name = input.value.trim();
            if (name) callback(name);
            safeRemove();
        }
        if (e.key === 'Escape') {
            safeRemove();
        }
    });
}
