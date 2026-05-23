async function renderKnowledgeLibrary(container) {
    container.innerHTML = `
        <div style="display:flex;height:100%;">
            <div style="flex:1;display:flex;flex-direction:column;">
                <div style="padding:8px;border-bottom:1px solid var(--border);display:flex;gap:8px;">
                    <input type="text" id="kp-lib-search" placeholder="搜索知识点" style="flex:1;">
                    <button class="btn btn-sm btn-primary" id="kp-lib-search-btn">搜索</button>
                    <button class="btn btn-sm btn-outline" id="kp-lib-new-btn">新建</button>
                </div>
                <div id="kp-lib-list" style="flex:1;overflow-y:auto;padding:8px;"></div>
            </div>
            <div class="preview-panel" style="width:350px;">
                <div style="padding:8px;border-bottom:1px solid var(--border);">知识点详情</div>
                <div id="kp-lib-detail" style="padding:12px;overflow-y:auto;flex:1;">点击知识点查看</div>
            </div>
        </div>
    `;

    loadKpLib();

    document.getElementById('kp-lib-search-btn').addEventListener('click', loadKpLib);
    document.getElementById('kp-lib-new-btn').addEventListener('click', async () => {
        const name = await modalPrompt('新建知识点', '名称：');
        if (!name) return;
        await apiFetch('/knowledge-points/', { method:'POST', body: JSON.stringify({name, stage:'G'}) });
        loadKpLib();
    });
}

async function loadKpLib() {
    const keyword = document.getElementById('kp-lib-search')?.value || '';
    const tree = await apiFetch('/knowledge-points/tree');
    const list = document.getElementById('kp-lib-list');
    list.innerHTML = '';
    function render(nodes, level = 0) {
        nodes.forEach(node => {
            if (!keyword || node.name.includes(keyword)) {
                const div = document.createElement('div');
                div.className = 'list-item';
                div.style.paddingLeft = (level * 16 + 8) + 'px';
                div.innerHTML = `<span>${escapeHtml(node.name)} (${node.question_count||0})</span>`;
                div.addEventListener('click', () => {
                    apiFetch(`/knowledge-points/${node.id}`).then(kp => {
                        document.getElementById('kp-lib-detail').innerHTML = `
                            <strong>${escapeHtml(kp.name)}</strong>
                            <p>${kp.description || '暂无指导内容'}</p>
                            <button class="btn btn-sm btn-primary" data-insert="${kp.id}">插入到组卷</button>
                        `;
                        document.querySelector('[data-insert]').addEventListener('click', () => {
                            if (typeof insertKnowledgePointToPaper === 'function') {
                                insertKnowledgePointToPaper(kp.id, kp.name, kp.description);
                            } else {
                                showToast('请在试卷向导中使用');
                            }
                        });
                    });
                });
                list.appendChild(div);
            }
            if (node.children) render(node.children, level + 1);
        });
    }
    render(tree);
}