let currentPaperId = null;

async function renderPaperListModule(container) {
    container.innerHTML = `
        <div class="two-columns" style="display:flex;height:100%;">
            <div style="width:260px;border-right:1px solid var(--border);display:flex;flex-direction:column;">
                <div style="padding:8px;border-bottom:1px solid var(--border);display:flex;gap:6px;">
                    <select id="paper-type-filter" style="flex:1;">
                        <option value="">全部类型</option>
                        <option value="试卷">试卷</option>
                        <option value="讲义">讲义</option>
                        <option value="教辅">教辅</option>
                        <option value="教材">教材</option>
                        <option value="错题本">错题本</option>
                        <option value="每日一题">每日一题</option>
                    </select>
                    <button class="btn btn-sm btn-primary" id="new-paper-btn">+ 新建</button>
                </div>
                <div id="paper-list-container" style="flex:1;overflow-y:auto;"></div>
            </div>
            <div id="paper-editor-panel" style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-secondary);">
                <div style="text-align:center;"><i class="fas fa-arrow-left" style="font-size:48px;"></i><p>请选择或新建一个组卷</p></div>
            </div>
        </div>
    `;
    loadPaperList();
    document.getElementById('paper-type-filter').addEventListener('change', loadPaperList);
    document.getElementById('new-paper-btn').addEventListener('click', createNewPaper);
}

async function loadPaperList() {
    const type = document.getElementById('paper-type-filter')?.value || '';
    const params = new URLSearchParams();
    if (type) params.append('paper_type', type);
    try {
        const data = await apiFetch(`/papers/?${params.toString()}`);
        const container = document.getElementById('paper-list-container');
        if (!data.length) {
            container.innerHTML = '<div style="padding:12px;color:var(--text-secondary);">暂无组卷</div>';
            return;
        }
        container.innerHTML = data.map(p => `
            <div class="list-item" data-id="${p.id}" data-title="${escapeHtml(p.title)}" data-mode="${p.answer_mode}">
                <div><strong>${escapeHtml(p.title)}</strong> <span class="status-badge">${p.paper_type}</span></div>
                <div style="font-size:12px;color:var(--text-secondary);">${p.stage} | 模式:${p.answer_mode} | ${formatDate(p.created_at)}</div>
            </div>
        `).join('');
        container.querySelectorAll('.list-item').forEach(el => {
            el.addEventListener('click', () => {
                const id = parseInt(el.dataset.id);
                const title = el.dataset.title;
                const mode = el.dataset.mode;
                openPaperEditor(id, title, mode);
                container.querySelectorAll('.list-item').forEach(i => i.classList.remove('active'));
                el.classList.add('active');
            });
        });
    } catch(e) { console.error(e); }
}

async function createNewPaper() {
    const formHtml = `
        <div class="form-group"><label>标题</label><input id="paper-title" style="width:100%;" placeholder="例如：2024年期末考试"></div>
        <div class="form-group"><label>类型</label>
            <select id="paper-type" style="width:100%;">
                <option value="试卷">试卷</option><option value="讲义">讲义</option>
                <option value="教辅">教辅</option><option value="教材">教材</option>
                <option value="错题本">错题本</option>
                <option value="每日一题">每日一题</option>
            </select>
        </div>
        <div class="form-group"><label>学段</label>
            <select id="paper-stage" style="width:100%;">
                <option value="X">小学</option><option value="C">初中</option>
                <option value="G" selected>高中</option><option value="Z">专升本</option><option value="K">考研</option>
            </select>
        </div>
    `;

    await showModal('新建组卷', {
        type: 'form',
        html: formHtml,
        onConfirm: async (overlay) => {
            const title = document.getElementById('paper-title').value.trim();
            if (!title) { showToast('请输入标题'); return false; }
            const paperType = document.getElementById('paper-type').value;
            const stage = document.getElementById('paper-stage').value;
            try {
                const data = await apiFetch('/papers/', {
                    method: 'POST',
                    body: JSON.stringify({ title, paper_type: paperType, stage, answer_mode: 'teacher' })
                });
                showToast('创建成功');
                loadPaperList();
                openPaperEditor(data.id, data.title, data.answer_mode);
            } catch(e) { showToast('创建失败: ' + e.message); }
        }
    });
}