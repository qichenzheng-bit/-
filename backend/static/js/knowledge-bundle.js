function debounce(fn, delay) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}
let allPapersCache = [];



// knowledge-bundle.js
let knowledgeTreeCache = null;

// 题目视图状态
let questionKnowledgeId = null;
let currentQuestionPage = 1;
let totalQuestions = 0;
let currentFilters = { stage: '', question_type: '', keyword: '' };
let selectedQuestionIds = new Set();

// 知识单元视图独立状态
let kuKnowledgeId = null;
let kuPage = 1;
let kuTotal = 0;
let kuFilters = { stage: '', question_type: '', keyword: '' };
let selectedKuIds = new Set();

// ========== 知识树 ==========
async function loadKnowledgeTree(questionType = null) {
    let url = '/knowledge-points/tree';
    if (questionType) url += `?question_type=${encodeURIComponent(questionType)}`;
    try {
        const data = await apiFetch(url);
        knowledgeTreeCache = data;
        return data;
    } catch (e) { console.error(e); }
}

// 通用树 HTML 生成
function renderTreeHtml(nodes, level = 0, treeId = '') {
    let html = '<ul style="list-style:none;padding-left:0;">';
    nodes.forEach(node => {
        const indent = level * 16;
        const hasChildren = node.children && node.children.length > 0;
        html += `<li class="tree-node" style="padding-left:${indent}px;">
            <div class="tree-item" data-id="${node.id}" data-tree="${treeId}">
                ${hasChildren ? '<span class="tree-toggle" style="cursor:pointer;margin-right:4px;">▼</span>' : '<span style="width:16px;display:inline-block;"></span>'}
                <span>${escapeHtml(node.name)} <span class="tree-count" style="color:var(--text-secondary);">(${node.question_count || 0})</span></span>
            </div>
            ${hasChildren ? `<div class="tree-children" style="display:block;">${renderTreeHtml(node.children, level + 1, treeId)}</div>` : ''}
        </li>`;
    });
    html += '</ul>';
    return html;
}

// 题目知识树渲染
function renderQuestionTree(treeData, container) {
    if (!container) return;
    if (!treeData || !treeData.length) {
        container.innerHTML = '<div style="padding:12px;color:var(--text-secondary);">暂无知识点</div>';
        return;
    }
    const allNode = { id: '__all__', name: '全部题目', question_count: 0, children: [] };
    const unclassifiedNode = { id: '__unclassified__', name: '未分类', question_count: 0, children: [] };
    const displayData = [allNode, ...treeData, unclassifiedNode];
    container.innerHTML = renderTreeHtml(displayData, 0, 'question-tree');
    bindQuestionTreeEvents(container);
    updateUnclassifiedCount('knowledge-tree-list', '__unclassified__', '选择,填空,判断,简答,综合大题,例题,练习,问题');
}

// 知识单元知识树渲染
function renderKuTree(treeData, container) {
    if (!container) return;
    if (!treeData || !treeData.length) {
        container.innerHTML = '<div style="padding:12px;color:var(--text-secondary);">暂无知识点</div>';
        return;
    }
    const allNode = { id: '__all__', name: '全部知识单元', question_count: 0, children: [] };
    const unclassifiedNode = { id: '__unclassified__', name: '未分类', question_count: 0, children: [] };
    const displayData = [allNode, ...treeData, unclassifiedNode];
    container.innerHTML = renderTreeHtml(displayData, 0, 'ku-tree');
    bindKuTreeEvents(container);
    updateUnclassifiedCount('knowledge-tree-list', '__unclassified__', '定义,定理,引理,推论,命题,公理,性质,注释,评注,结论');
}

// 未分类计数更新（通用）
async function updateUnclassifiedCount(treeId, nodeId, questionType) {
    try {
        let url = '/questions/?page=1&page_size=1';
        if (questionType) url += `&question_type=${encodeURIComponent(questionType)}`;
        const allData = await apiFetch(url);
        const allCount = allData.total;
        if (!knowledgeTreeCache) return;
        let assignedCount = 0;
        function sum(nodes) {
            nodes.forEach(n => {
                assignedCount += n.question_count || 0;
                if (n.children) sum(n.children);
            });
        }
        sum(knowledgeTreeCache);
        const el = document.querySelector(`#${treeId} .tree-item[data-id="${nodeId}"] .tree-count`);
        if (el) el.textContent = `(${Math.max(0, allCount - assignedCount)})`;
    } catch (e) { /* 忽略 */ }
}

// 绑定题目树事件
function bindQuestionTreeEvents(container) {
    container.querySelectorAll('.tree-item').forEach(item => {
        const toggleBtn = item.querySelector('.tree-toggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const childrenDiv = item.parentElement.querySelector('.tree-children');
                if (childrenDiv) {
                    const isHidden = childrenDiv.style.display === 'none';
                    childrenDiv.style.display = isHidden ? 'block' : 'none';
                    toggleBtn.textContent = isHidden ? '▼' : '▶';
                }
            });
        }
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = item.dataset.id;
            questionKnowledgeId = id;
            loadQuestionList(1);
            container.querySelectorAll('.tree-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
        });
    });
}

// 绑定知识单元树事件
function bindKuTreeEvents(container) {
    container.querySelectorAll('.tree-item').forEach(item => {
        const toggleBtn = item.querySelector('.tree-toggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const childrenDiv = item.parentElement.querySelector('.tree-children');
                if (childrenDiv) {
                    const isHidden = childrenDiv.style.display === 'none';
                    childrenDiv.style.display = isHidden ? 'block' : 'none';
                    toggleBtn.textContent = isHidden ? '▼' : '▶';
                }
            });
        }
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = item.dataset.id;
            kuKnowledgeId = id;
            loadKuList(1);
            container.querySelectorAll('.tree-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
        });
    });
}

// ========== 题目列表 ==========
async function loadQuestionList(page = 1) {
    currentQuestionPage = page;
    const params = new URLSearchParams();
    const questionTypeList = '选择,填空,判断,简答,综合大题,例题,练习,问题';
    if (currentFilters.stage) params.append('stage', currentFilters.stage);
    if (currentFilters.question_type) {
        params.append('question_type', currentFilters.question_type);
    } else {
        params.append('question_type', questionTypeList);
    }
    if (currentFilters.keyword) params.append('keyword', currentFilters.keyword);
    if (questionKnowledgeId) {
        if (questionKnowledgeId === '__all__') { }
        else if (questionKnowledgeId === '__unclassified__') {
            params.append('knowledge_point_id', '-1');
        } else {
            const kp = await apiFetch(`/knowledge-points/${questionKnowledgeId}`);
            if (kp) params.append('knowledge_point_path', kp.path);
        }
    }
    params.append('page', page);
    params.append('page_size', 15);
    try {
        const data = await apiFetch(`/questions/?${params.toString()}`);
        totalQuestions = data.total;
        renderQuestionList(data.items);
        renderQuestionPagination();
    } catch (e) { console.error(e); }
}

function renderQuestionList(questions) {
    const container = document.getElementById('question-list-container');
    if (!container) return;
    if (!questions.length) {
        container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary);">暂无题目</div>';
        return;
    }
    container.innerHTML = questions.map(q => `
        <div class="list-item" data-id="${q.id}">
            <div style="display:flex; align-items:center; gap:8px;">
                <input type="checkbox" class="question-checkbox" data-id="${q.id}" ${selectedQuestionIds.has(q.id) ? 'checked' : ''}>
                <div style="flex:1;">
                    <div style="display:flex;justify-content:space-between;">
                        <span class="item-id" style="color:var(--primary);font-family:monospace;">${escapeHtml(q.id)}</span>
                        <span>${q.question_type} | ⭐${q.difficulty}</span>
                    </div>
                    <div style="font-size:12px;color:var(--text-secondary);">${escapeHtml(q.content_preview?.substring(0,80) || '')}</div>
                </div>
                <button class="btn btn-sm btn-danger single-del-btn" data-del="${q.id}"><i class="fas fa-trash"></i></button>
            </div>
        </div>
    `).join('');
    container.querySelectorAll('.question-checkbox').forEach(cb => {
        cb.addEventListener('click', e => {
            e.stopPropagation();
            const id = cb.dataset.id;
            if (cb.checked) selectedQuestionIds.add(id);
            else selectedQuestionIds.delete(id);
        });
    });
    container.querySelectorAll('.list-item').forEach(el => {
        el.addEventListener('click', e => {
            if (e.target.closest('button') || e.target.closest('input[type="checkbox"]')) return;
            loadQuestionDetail(el.dataset.id);
            container.querySelectorAll('.list-item').forEach(i => i.classList.remove('active'));
            el.classList.add('active');
        });
    });
    container.querySelectorAll('.single-del-btn').forEach(btn => {
        btn.addEventListener('click', async e => {
            e.stopPropagation();
            const id = btn.dataset.del;
            if (!(await modalConfirm('确认删除', `确认删除题目 ${id}？`))) return;
            await apiFetch('/questions/batch', { method: 'DELETE', body: JSON.stringify({ question_ids: [id] }) });
            showToast('已移入回收站');
            knowledgeTreeCache = null;
            await loadKnowledgeTree('选择,填空,判断,简答,综合大题,例题,练习,问题');
            if (document.getElementById('question-list-container')) {
                renderQuestionTree(knowledgeTreeCache, document.getElementById('knowledge-tree-list'));
                loadQuestionList(currentQuestionPage);
            }
        });
    });
}

async function loadQuestionDetail(id) {
    try {
        const data = await apiFetch(`/questions/${id}`);
        const preview = document.getElementById('preview-content');
        const editBtn = document.getElementById('edit-question-btn');
        const editPanel = document.getElementById('edit-panel');
        if (editPanel) editPanel.style.display = 'none';
        if (preview) preview.style.display = 'block';
        if (editBtn) editBtn.style.display = 'inline-block';
        if (preview) preview.dataset.qid = id;

        let optionsHtml = '';
        if (data.options_latex) {
            try {
                const options = JSON.parse(data.options_latex);
                if (options.length) {
                    const labels = 'ABCDEFGHIJ';
                    optionsHtml = '<div style="margin-top:8px;"><strong>选项：</strong><div>';
                    options.forEach((opt,i) => { optionsHtml += `<div>${labels[i]}. ${opt}</div>`; });
                    optionsHtml += '</div></div>';
                }
            } catch(e) {}
        }

        let subQuestionsHtml = '';
        if (data.sub_questions && data.sub_questions.length > 0) {
            subQuestionsHtml = '<div style="margin-top:8px;"><strong>子题：</strong>';
            data.sub_questions.forEach((sub, i) => {
                subQuestionsHtml += `<div style="border:1px solid #ddd; padding:8px; margin:4px 0; border-radius:4px;">
                    <div><b>(${i+1})</b> ${escapeHtml(sub.stem || '')}</div>
                    <div><strong>答案：</strong> ${escapeHtml(sub.answer || '')}</div>
                    <div><strong>解析：</strong> ${escapeHtml(sub.analysis || '')}</div>
                </div>`;
            });
            subQuestionsHtml += '</div>';
        }

        const kpPath = data.knowledge_point_path || data.knowledge_point || '';
        const sourceInfo = data.appears_in_papers?.length ? data.appears_in_papers.map(p => `《${p.paper_title}》`).join('、') : '';
        if (preview) {
            preview.innerHTML = `
                <div><strong>编号：</strong> ${data.id}</div>
                <div><strong>题型/难度：</strong> ${data.question_type} | ⭐${data.difficulty}</div>
                <div class="latex-block">${data.content_latex}</div>
                ${optionsHtml}
                ${subQuestionsHtml}
                ${(!data.sub_questions || data.sub_questions.length === 0) ? `<div><strong>答案：</strong> ${data.answer_latex || '无'}</div>` : ''}
                ${(!data.sub_questions || data.sub_questions.length === 0) ? `<div><strong>解析：</strong> ${data.analysis_latex || '无'}</div>` : ''}
                <div><strong>知识点：</strong> ${kpPath}</div>
                ${sourceInfo ? `<div><strong>来源：</strong> ${sourceInfo}</div>` : ''}
            `;
            if (window.renderMathInElement) renderMathInElement(preview, {delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}]});
        }
    } catch(e) { console.error(e); }
}

function renderQuestionPagination() {
    const totalPages = Math.ceil(totalQuestions / 15);
    const container = document.getElementById('question-pagination');
    if (!container || totalPages <= 1) { if(container) container.innerHTML=''; return; }
    container.innerHTML = `
        <button class="btn btn-sm" ${currentQuestionPage===1?'disabled':''} id="prev-page">上一页</button>
        <span>${currentQuestionPage}/${totalPages}</span>
        <button class="btn btn-sm" ${currentQuestionPage===totalPages?'disabled':''} id="next-page">下一页</button>
    `;
    document.getElementById('prev-page')?.addEventListener('click', ()=> { if(currentQuestionPage>1) loadQuestionList(currentQuestionPage-1); });
    document.getElementById('next-page')?.addEventListener('click', ()=> { if(currentQuestionPage<totalPages) loadQuestionList(currentQuestionPage+1); });
}

// ========== 批量删除题目 ==========
function toggleSelectAll(checked) {
    const checkboxes = document.querySelectorAll('.question-checkbox');
    checkboxes.forEach(cb => { cb.checked = checked; const id = cb.dataset.id; if (checked) selectedQuestionIds.add(id); else selectedQuestionIds.delete(id); });
}
async function batchDeleteSelected() {
    if (selectedQuestionIds.size === 0) return showToast('请先选中题目');
    if (!(await modalConfirm('批量删除', `确认删除选中的 ${selectedQuestionIds.size} 道题？`))) return;
    await apiFetch('/questions/batch', { method:'DELETE', body: JSON.stringify({ question_ids: Array.from(selectedQuestionIds) }) });
    showToast('已删除');
    selectedQuestionIds.clear();
    knowledgeTreeCache = null;
    await loadKnowledgeTree('选择,填空,判断,简答,综合大题,例题,练习,问题');
    renderQuestionTree(knowledgeTreeCache, document.getElementById('knowledge-tree-list'));
    loadQuestionList(currentQuestionPage);
}

// ========== 编辑题目 ==========
async function enterEditMode(questionId) {
    const data = await apiFetch(`/questions/${questionId}`);
    const preview = document.getElementById('preview-content');
    const editPanel = document.getElementById('edit-panel');
    const editBtn = document.getElementById('edit-question-btn');
    preview.style.display = 'none';
    editPanel.style.display = 'block';
    editBtn.style.display = 'none';

    let formHtml = `
        <div class="form-group"><label>题型</label>
            <select id="edit-type">
                <option value="选择" ${data.question_type==='选择'?'selected':''}>选择题</option>
                <option value="填空" ${data.question_type==='填空'?'selected':''}>填空题</option>
                <option value="判断" ${data.question_type==='判断'?'selected':''}>判断题</option>
                <option value="简答" ${data.question_type==='简答'?'selected':''}>简答题</option>
                <option value="综合大题" ${data.question_type==='综合大题'?'selected':''}>综合大题</option>
            </select>
        </div>
        <div class="form-group"><label>题干</label><textarea id="edit-stem" rows="4" style="width:100%;">${escapeHtml(data.content_latex)}</textarea></div>
    `;

    if (data.question_type === '选择') {
        let options = [];
        try { options = JSON.parse(data.options_latex || '[]'); } catch(e) {}
        while (options.length < 4) options.push('');
        formHtml += `<div id="edit-options-area"><label>选项</label>`;
        options.forEach((opt, i) => {
            formHtml += `<div style="display:flex;align-items:center;margin-bottom:4px;">
                <span style="min-width:24px;">${'ABCD'[i]}.</span>
                <input type="text" class="edit-option" data-index="${i}" value="${escapeHtml(opt)}" style="flex:1;">
            </div>`;
        });
        formHtml += `</div><div class="form-group"><label>答案</label>
            <select id="edit-answer">
                <option value="">请选择</option>
                <option>A</option><option>B</option><option>C</option><option>D</option>
            </select></div>`;
    } else if (data.question_type === '填空' || data.question_type === '简答') {
        formHtml += `<div class="form-group"><label>答案</label><textarea id="edit-answer" rows="2" style="width:100%;">${escapeHtml(data.answer_latex || '')}</textarea></div>`;
    } else if (data.question_type === '判断') {
        formHtml += `<div class="form-group"><label>答案</label>
            <select id="edit-answer">
                <option value="正确" ${data.answer_latex==='正确'?'selected':''}>正确</option>
                <option value="错误" ${data.answer_latex==='错误'?'selected':''}>错误</option>
            </select></div>`;
    } else if (data.question_type === '综合大题') {
        let subs = [];
        try { subs = JSON.parse(data.answer_latex || '[]'); } catch(e) {}
        if (!Array.isArray(subs)) subs = [];
        formHtml += `<div id="edit-subs-area"><label>子题</label>`;
        subs.forEach((sub, i) => {
            formHtml += `<div style="border:1px solid var(--border);padding:8px;margin-bottom:8px;">
                <div>(${i+1})</div>
                <textarea class="edit-sub-stem" data-index="${i}" rows="2" style="width:100%;">${escapeHtml(sub.stem||'')}</textarea>
                <input class="edit-sub-answer" data-index="${i}" style="width:100%;" placeholder="答案" value="${escapeHtml(sub.answer||'')}">
                <textarea class="edit-sub-analysis" data-index="${i}" rows="2" style="width:100%;" placeholder="解析">${escapeHtml(sub.analysis||'')}</textarea>
            </div>`;
        });
        formHtml += `</div>`;
    }

    // 知识点选择器（与之前一致）
    formHtml += `
        <div class="form-group"><label>知识点</label>
            <div id="edit-knowledge-picker" style="position:relative;">
                <div id="edit-kp-display" style="border:1px solid var(--border);border-radius:6px;padding:8px;cursor:pointer;">${escapeHtml(data.knowledge_point || '请选择知识点')}</div>
                <div id="edit-kp-panel" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:100;background:var(--surface);border:1px solid var(--border);border-radius:8px;max-height:200px;overflow-y:auto;"></div>
            </div>
            <input type="hidden" id="edit-knowledge-id" value="${data.knowledge_point_id || ''}">
            <input type="hidden" id="edit-knowledge-text" value="${escapeHtml(data.knowledge_point || '')}">
        </div>
        <div class="form-group"><label>解析</label><textarea id="edit-analysis" rows="3" style="width:100%;">${escapeHtml(data.analysis_latex || '')}</textarea></div>
        <div style="display:flex; gap:8px;">
            <button class="btn btn-primary" id="save-edit-btn">保存</button>
            <button class="btn btn-outline" id="cancel-edit-btn">取消</button>
        </div>
    `;
    editPanel.innerHTML = formHtml;

    (async function initEditKpPicker() {
        const picker = document.getElementById('edit-kp-display');
        const panel = document.getElementById('edit-kp-panel');
        const tree = await apiFetch('/knowledge-points/tree');
        picker.addEventListener('click', () => {
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
            if (panel.style.display === 'block') {
                let html = '';
                function build(nodes, prefix = '') {
                    nodes.forEach(n => {
                        html += `<div class="list-item" data-id="${n.id}" style="padding:4px 8px;cursor:pointer;">${prefix}${escapeHtml(n.name)}</div>`;
                        if (n.children) build(n.children, prefix + '  ');
                    });
                }
                build(tree);
                panel.innerHTML = html;
                panel.querySelectorAll('.list-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const name = item.textContent.trim();
                        picker.textContent = name;
                        document.getElementById('edit-knowledge-id').value = item.dataset.id;
                        document.getElementById('edit-knowledge-text').value = name;
                        panel.style.display = 'none';
                    });
                });
            }
        });
        document.addEventListener('click', (e) => {
            if (!picker.contains(e.target) && !panel.contains(e.target)) {
                panel.style.display = 'none';
            }
        });
    })();

    if (data.question_type === '选择' && data.answer_latex) {
        const ansSelect = document.getElementById('edit-answer');
        if (ansSelect) ansSelect.value = data.answer_latex;
    }

    document.getElementById('save-edit-btn').addEventListener('click', async () => {
        const body = {
            content_latex: document.getElementById('edit-stem').value,
            analysis_latex: document.getElementById('edit-analysis').value,
            question_type: document.getElementById('edit-type').value,
            knowledge_point: document.getElementById('edit-knowledge-text').value || '',
            knowledge_point_id: document.getElementById('edit-knowledge-id').value ? parseInt(document.getElementById('edit-knowledge-id').value) : null
        };
        if (body.question_type === '选择') {
            const opts = [];
            document.querySelectorAll('.edit-option').forEach(inp => opts.push(inp.value));
            body.options_latex = JSON.stringify(opts);
            body.answer_latex = document.getElementById('edit-answer')?.value || '';
        } else if (body.question_type === '综合大题') {
            const subs = [];
            const stems = document.querySelectorAll('.edit-sub-stem');
            const answers = document.querySelectorAll('.edit-sub-answer');
            const analyses = document.querySelectorAll('.edit-sub-analysis');
            for (let i=0; i<stems.length; i++) {
                subs.push({ stem: stems[i].value, answer: answers[i].value, analysis: analyses[i].value });
            }
            body.answer_latex = JSON.stringify(subs);
        } else {
            body.answer_latex = document.getElementById('edit-answer')?.value || '';
        }
        try {
            await apiFetch(`/questions/${questionId}`, { method:'PUT', body: JSON.stringify(body) });
            showToast('题目已更新');
            cancelEdit();
            loadQuestionDetail(questionId);
            loadQuestionList(currentQuestionPage);
        } catch(e) { showToast('更新失败: '+e.message); }
    });

    document.getElementById('cancel-edit-btn').addEventListener('click', cancelEdit);
}

function cancelEdit() {
    document.getElementById('preview-content').style.display = 'block';
    document.getElementById('edit-panel').style.display = 'none';
    document.getElementById('edit-question-btn').style.display = 'inline-block';
}

// ========== 知识单元列表与操作 ==========
async function loadKuList(page = 1) {
    kuPage = page;
    const params = new URLSearchParams();
    const kuTypeList = '定义,定理,引理,推论,命题,公理,性质,注释,评注,结论';
    if (kuFilters.stage) params.append('stage', kuFilters.stage);
    if (kuFilters.question_type) {
        params.append('question_type', kuFilters.question_type);
    } else {
        params.append('question_type', kuTypeList);
    }
    if (kuFilters.keyword) params.append('keyword', kuFilters.keyword);
    if (kuKnowledgeId) {
        if (kuKnowledgeId === '__all__') { }
        else if (kuKnowledgeId === '__unclassified__') {
            params.append('knowledge_point_id', '-1');
        } else {
            const kp = await apiFetch(`/knowledge-points/${kuKnowledgeId}`);
            if (kp) params.append('knowledge_point_path', kp.path);
        }
    }
    params.append('page', page);
    params.append('page_size', 15);
    try {
        const data = await apiFetch(`/questions/?${params.toString()}`);
        kuTotal = data.total;
        renderKuList(data.items);
        renderKuPagination();
    } catch (e) { console.error(e); }
}

function renderKuList(items) {
    const container = document.getElementById('ku-list-container');
    if (!container) return;
    if (!items.length) {
        container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary);">暂无知识单元</div>';
        return;
    }
    container.innerHTML = items.map(q => `
        <div class="list-item" data-id="${q.id}">
            <div style="display:flex; align-items:center; gap:8px;">
                <input type="checkbox" class="ku-checkbox" data-id="${q.id}" ${selectedKuIds.has(q.id) ? 'checked' : ''}>
                <div style="flex:1;" class="ku-item-content">
                    <div style="display:flex; justify-content:space-between;">
                        <span style="font-family:monospace; color:var(--primary);">${escapeHtml(q.id)}</span>
                        <span style="color:var(--primary);">${q.question_type}</span>
                    </div>
                    <div style="font-size:12px; color:var(--text-secondary);">${escapeHtml(q.content_preview?.substring(0,60) || '')}</div>
                </div>
                <button class="btn btn-sm btn-outline ku-edit-btn" data-edit="${q.id}">编辑</button>
                <button class="btn btn-sm btn-danger ku-del-btn" data-del="${q.id}">删除</button>
            </div>
        </div>
    `).join('');

    // 复选框事件
    container.querySelectorAll('.ku-checkbox').forEach(cb => {
        cb.addEventListener('click', e => {
            e.stopPropagation();
            const id = cb.dataset.id;
            if (cb.checked) selectedKuIds.add(id);
            else selectedKuIds.delete(id);
        });
    });

    // 点击查看详情
    container.querySelectorAll('.ku-item-content').forEach(el => {
        el.addEventListener('click', () => {
            const id = el.closest('.list-item').dataset.id;
            loadKuDetail(id);
        });
    });

    // 编辑按钮
    container.querySelectorAll('.ku-edit-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            enterKuEditMode(btn.dataset.edit);
        });
    });

    // 删除按钮
    container.querySelectorAll('.ku-del-btn').forEach(btn => {
        btn.addEventListener('click', async e => {
            e.stopPropagation();
            deleteKuItem(btn.dataset.del);
        });
    });
}

function renderKuPagination() {
    const totalPages = Math.ceil(kuTotal / 15);
    const container = document.getElementById('ku-pagination');
    if (!container || totalPages <= 1) { if(container) container.innerHTML=''; return; }
    container.innerHTML = `
        <button class="btn btn-sm" ${kuPage===1?'disabled':''} id="ku-prev">上一页</button>
        <span>${kuPage}/${totalPages}</span>
        <button class="btn btn-sm" ${kuPage===totalPages?'disabled':''} id="ku-next">下一页</button>
    `;
    document.getElementById('ku-prev')?.addEventListener('click', () => { if(kuPage>1) loadKuList(kuPage-1); });
    document.getElementById('ku-next')?.addEventListener('click', () => { if(kuPage<totalPages) loadKuList(kuPage+1); });
}

async function loadKuDetail(id) {
    const preview = document.getElementById('preview-content');
    const editBtn = document.getElementById('edit-question-btn');
    const editPanel = document.getElementById('edit-panel');
    if (editPanel) editPanel.style.display = 'none';
    if (preview) preview.style.display = 'block';
    if (editBtn) {
        editBtn.style.display = 'inline-block';
        editBtn.onclick = () => enterKuEditMode(id);
    }
    try {
        const data = await apiFetch(`/questions/${id}`);
        if (preview) {
            preview.innerHTML = `
                <div><strong>编号：</strong> ${data.id}</div>
                <div><strong>类型：</strong> ${data.question_type} | ⭐${data.difficulty}</div>
                <div><strong>标题：</strong> ${data.content_latex}</div>
                <div style="white-space:pre-wrap;"><strong>内容：</strong> ${data.analysis_latex || '无'}</div>
                <div><strong>知识点：</strong> ${data.knowledge_point_path || data.knowledge_point || '无'}</div>
                <div><strong>年级：</strong> ${data.stage === 'X' ? '小学' : data.stage === 'C' ? '初中' : data.stage === 'G' ? '高中' : data.stage === 'Z' ? '专升本' : data.stage === 'K' ? '考研' : data.stage}</div>
            `;
            if (window.renderMathInElement) renderMathInElement(preview, {delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}]});
        }
    } catch(e) { console.error(e); }
}

async function enterKuEditMode(id) {
    const data = await apiFetch(`/questions/${id}`);
    const editPanel = document.getElementById('edit-panel');
    const preview = document.getElementById('preview-content');
    const editBtn = document.getElementById('edit-question-btn');
    if (preview) preview.style.display = 'none';
    if (editPanel) editPanel.style.display = 'block';
    if (editBtn) editBtn.style.display = 'none';

    let formHtml = `
        <div class="form-group"><label>类型</label>
            <select id="ku-edit-type">
                <option value="定义" ${data.question_type==='定义'?'selected':''}>定义</option>
                <option value="定理" ${data.question_type==='定理'?'selected':''}>定理</option>
                <option value="引理" ${data.question_type==='引理'?'selected':''}>引理</option>
                <option value="推论" ${data.question_type==='推论'?'selected':''}>推论</option>
                <option value="命题" ${data.question_type==='命题'?'selected':''}>命题</option>
                <option value="公理" ${data.question_type==='公理'?'selected':''}>公理</option>
                <option value="性质" ${data.question_type==='性质'?'selected':''}>性质</option>
                <option value="注释" ${data.question_type==='注释'?'selected':''}>注释</option>
                <option value="评注" ${data.question_type==='评注'?'selected':''}>评注</option>
                <option value="结论" ${data.question_type==='结论'?'selected':''}>结论</option>
            </select>
        </div>
        <div class="form-group"><label>标题</label><textarea id="ku-edit-title" rows="2" style="width:100%;">${escapeHtml(data.content_latex)}</textarea></div>
        <div class="form-group"><label>内容</label><textarea id="ku-edit-content" rows="6" style="width:100%;">${escapeHtml(data.analysis_latex || '')}</textarea></div>
        <div class="form-group"><label>年级</label>
            <select id="ku-edit-stage">
                <option value="X" ${data.stage==='X'?'selected':''}>小学</option>
                <option value="C" ${data.stage==='C'?'selected':''}>初中</option>
                <option value="G" ${data.stage==='G'?'selected':''}>高中</option>
                <option value="Z" ${data.stage==='Z'?'selected':''}>专升本</option>
                <option value="K" ${data.stage==='K'?'selected':''}>考研</option>
            </select>
        </div>
        <div class="form-group"><label>知识点</label>
            <div id="ku-edit-kp-picker">
                <input type="text" id="ku-edit-kp-input" placeholder="输入知识点关键词搜索" value="${escapeHtml(data.knowledge_point || '')}" style="width:100%;">
                <div id="ku-edit-kp-suggestions" style="border:1px solid var(--border); max-height:150px; overflow-y:auto; display:none;"></div>
                <input type="hidden" id="ku-edit-kp-id" value="${data.knowledge_point_id || ''}">
            </div>
        </div>
        <div style="display:flex; gap:8px;">
            <button class="btn btn-primary" id="save-ku-edit-btn">保存</button>
            <button class="btn btn-outline" id="cancel-ku-edit-btn">取消</button>
        </div>
    `;
    editPanel.innerHTML = formHtml;

    // 知识点自动补全
    const input = document.getElementById('ku-edit-kp-input');
    const suggestBox = document.getElementById('ku-edit-kp-suggestions');
    input.addEventListener('input', debounce(async () => {
        const keyword = input.value.trim();
        if (!keyword) { suggestBox.style.display = 'none'; return; }
        try {
            const tree = await apiFetch('/knowledge-points/tree');
            const results = [];
            function search(nodes) {
                nodes.forEach(n => {
                    if (n.name.includes(keyword)) results.push(n);
                    if (n.children) search(n.children);
                });
            }
            search(tree);
            if (results.length) {
                suggestBox.innerHTML = results.map(kp => `<div class="suggest-item" data-id="${kp.id}" data-name="${kp.name}">${kp.name}</div>`).join('');
                suggestBox.style.display = 'block';
                suggestBox.querySelectorAll('.suggest-item').forEach(item => {
                    item.addEventListener('click', () => {
                        input.value = item.dataset.name;
                        document.getElementById('ku-edit-kp-id').value = item.dataset.id;
                        suggestBox.style.display = 'none';
                    });
                });
            } else {
                suggestBox.innerHTML = '<div style="padding:8px;">无匹配</div>';
                suggestBox.style.display = 'block';
            }
        } catch(e) {}
    }, 300));
    document.addEventListener('click', (e) => {
        if (!document.getElementById('ku-edit-kp-picker').contains(e.target)) suggestBox.style.display = 'none';
    });

    document.getElementById('save-ku-edit-btn').addEventListener('click', async () => {
        const body = {
            question_type: document.getElementById('ku-edit-type').value,
            content_latex: document.getElementById('ku-edit-title').value,
            analysis_latex: document.getElementById('ku-edit-content').value,
            stage: document.getElementById('ku-edit-stage').value,
            knowledge_point: document.getElementById('ku-edit-kp-input').value,
            knowledge_point_id: document.getElementById('ku-edit-kp-id').value ? parseInt(document.getElementById('ku-edit-kp-id').value) : null
        };
        try {
            await apiFetch(`/questions/${id}`, { method:'PUT', body: JSON.stringify(body) });
            showToast('知识单元已更新');
            cancelKuEdit();
            loadKuDetail(id);
            loadKuList(kuPage);
        } catch(e) { showToast('更新失败: '+e.message); }
    });

    document.getElementById('cancel-ku-edit-btn').addEventListener('click', cancelKuEdit);
}

function cancelKuEdit() {
    document.getElementById('edit-panel').style.display = 'none';
    document.getElementById('preview-content').style.display = 'block';
    document.getElementById('edit-question-btn').style.display = 'inline-block';
}

async function deleteKuItem(id) {
    if (!(await modalConfirm('确认删除', `确认删除知识单元 ${id}？`))) return;
    await apiFetch('/questions/batch', { method:'DELETE', body: JSON.stringify({ question_ids: [id] }) });
    showToast('已删除');
    knowledgeTreeCache = null;
    await loadKnowledgeTree();
    renderKuTree(knowledgeTreeCache, document.getElementById('knowledge-tree-list'));
    loadKuList(kuPage);
}

function toggleSelectAllKu(checked) {
    const cbs = document.querySelectorAll('.ku-checkbox');
    cbs.forEach(cb => {
        cb.checked = checked;
        if (checked) selectedKuIds.add(cb.dataset.id);
        else selectedKuIds.delete(cb.dataset.id);
    });
}

async function batchDeleteKu() {
    if (selectedKuIds.size === 0) return showToast('请先选中知识单元');
    if (!(await modalConfirm('批量删除', `确认删除选中的 ${selectedKuIds.size} 个知识单元？`))) return;
    await apiFetch('/questions/batch', { method:'DELETE', body: JSON.stringify({ question_ids: Array.from(selectedKuIds) }) });
    showToast('已删除');
    selectedKuIds.clear();
    knowledgeTreeCache = null;
    await loadKnowledgeTree();
    renderKuTree(knowledgeTreeCache, document.getElementById('knowledge-tree-list'));
    loadKuList(kuPage);
}

async function renderKnowledgeTreeModule(container) {
    container.innerHTML = `
        <div class="two-columns" style="display:flex;height:100%;">
            <div class="sidebar" id="knowledge-sidebar" style="display:block; min-width:240px; border-right:1px solid var(--border); overflow-y:auto;">
                <div style="padding:8px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;">
                    <span style="font-weight:500;">知识图谱</span>
                    <button class="btn btn-sm btn-success" id="new-knowledge-btn" style="margin-left:auto;"><i class="fas fa-plus"></i> 新建</button>
                </div>
                <div id="knowledge-tree-list" style="padding:8px;"></div>
            </div>
            <div style="flex:1;display:flex;flex-direction:column;">
                <div style="padding:6px;border-bottom:1px solid var(--border);display:flex;gap:4px;">
                    <button class="tab-btn btn btn-sm btn-primary" id="tab-questions">题目</button>
                    <button class="tab-btn btn btn-sm btn-outline" id="tab-knowledge">知识单元</button>
                    <button class="tab-btn btn btn-sm btn-outline" id="tab-papers">试卷</button>
                </div>
                <div id="tab-content-panel" style="flex:1;display:flex;flex-direction:column; overflow:auto;"></div>
            </div>
            <div class="preview-panel" style="display:block;width:350px;">
                <div style="padding:8px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;">
                    <span>详情</span>
                    <button class="btn btn-sm" id="edit-question-btn" style="display:none;">编辑</button>
                </div>
                <div id="preview-content" style="padding:12px;overflow-y:auto;flex:1;">点击查看详情</div>
                <div id="edit-panel" style="display:none;padding:12px;overflow-y:auto;flex:1;"></div>
            </div>
        </div>
    `;

    const sidebar = document.getElementById('knowledge-sidebar');
    const tabQuestions = document.getElementById('tab-questions');
    const tabKnowledge = document.getElementById('tab-knowledge');
    const tabContent = document.getElementById('tab-content-panel');

    // 切换选项卡
    async function switchToTab(tab) {
        if (tab === 'questions') {
            tabQuestions.classList.add('btn-primary'); tabQuestions.classList.remove('btn-outline');
            tabKnowledge.classList.add('btn-outline'); tabKnowledge.classList.remove('btn-primary');
            sidebar.style.display = 'block';
            tabContent.innerHTML = `
                <div style="padding:8px;border-bottom:1px solid var(--border);display:flex;gap:8px; flex-wrap:wrap; align-items:center;">
                    <select id="filter-stage" style="width:90px;">
                        <option value="">全部学段</option>
                        <option value="X">小学</option><option value="C">初中</option>
                        <option value="G">高中</option><option value="Z">专升本</option><option value="K">考研</option>
                    </select>
                    <select id="filter-type" style="width:110px;">
                        <option value="">全部题型</option>
                        <option value="选择">选择题</option><option value="填空">填空题</option>
                        <option value="判断">判断题</option><option value="简答">简答题</option><option value="综合大题">综合大题</option>
                    </select>
                    <button class="btn btn-sm btn-primary" id="search-btn">筛选</button>
                    <button class="btn btn-sm btn-outline" id="show-all-btn">显示全部</button>
                    <div style="flex:1;"></div>
                    <label style="font-size:12px; display:flex; align-items:center; gap:4px;"><input type="checkbox" id="select-all-checkbox"> 全选</label>
                    <button class="btn btn-sm btn-danger" id="batch-delete-btn"><i class="fas fa-trash-alt"></i> 批量删除</button>
                </div>
                <div id="question-list-container" style="flex:1;overflow-y:auto;"></div>
                <div id="question-pagination" style="padding:6px;border-top:1px solid var(--border);"></div>
            `;
            await loadKnowledgeTree('选择,填空,判断,简答,综合大题,例题,练习,问题');
            const treeContainer = document.getElementById('knowledge-tree-list');
            if (treeContainer && knowledgeTreeCache) {
                renderQuestionTree(knowledgeTreeCache, treeContainer);
            }
            questionKnowledgeId = null;
            loadQuestionList(1);
            document.getElementById('search-btn')?.addEventListener('click', () => {
                currentFilters.stage = document.getElementById('filter-stage').value;
                currentFilters.question_type = document.getElementById('filter-type').value;
                questionKnowledgeId = null;
                loadQuestionList(1);
            });
            document.getElementById('show-all-btn')?.addEventListener('click', () => {
                questionKnowledgeId = '__all__';
                currentFilters = { stage: '', question_type: '', keyword: '' };
                loadQuestionList(1);
                document.querySelectorAll('#knowledge-tree-list .tree-item').forEach(i => i.classList.remove('active'));
                document.querySelector('#knowledge-tree-list .tree-item[data-id="__all__"]')?.classList.add('active');
            });
            document.getElementById('select-all-checkbox')?.addEventListener('change', (e) => toggleSelectAll(e.target.checked));
            document.getElementById('batch-delete-btn')?.addEventListener('click', batchDeleteSelected);
            document.getElementById('edit-question-btn')?.addEventListener('click', () => {
                const qid = document.getElementById('preview-content').dataset.qid;
                if (qid) enterEditMode(qid);
            });
        } else if (tab === 'knowledge') {
            tabKnowledge.classList.add('btn-primary'); tabKnowledge.classList.remove('btn-outline');
            tabQuestions.classList.add('btn-outline'); tabQuestions.classList.remove('btn-primary');
            sidebar.style.display = 'block';
            tabContent.innerHTML = `
                <div style="padding:8px;border-bottom:1px solid var(--border);display:flex;gap:8px;align-items:center;">
                    <select id="ku-filter-stage" style="width:90px;">
                        <option value="">全部年级</option>
                        <option value="X">小学</option><option value="C">初中</option>
                        <option value="G">高中</option><option value="Z">专升本</option><option value="K">考研</option>
                    </select>
                    <select id="ku-filter-type" style="width:110px;">
                        <option value="">全部类型</option>
                        <option value="定义">定义</option><option value="定理">定理</option>
                        <option value="引理">引理</option><option value="推论">推论</option>
                        <option value="命题">命题</option><option value="公理">公理</option>
                        <option value="性质">性质</option><option value="注释">注释</option>
                        <option value="评注">评注</option><option value="结论">结论</option>
                    </select>
                    <input type="text" id="ku-filter-keyword" placeholder="搜索标题" style="width:150px;">
                    <button class="btn btn-sm btn-primary" id="ku-search-btn">搜索</button>
                    <div style="flex:1;"></div>
                    <label style="font-size:12px;"><input type="checkbox" id="ku-select-all"> 全选</label>
                    <button class="btn btn-sm btn-danger" id="ku-batch-delete">批量删除</button>
                </div>
                <div id="ku-list-container" style="flex:1;overflow-y:auto;"></div>
                <div id="ku-pagination" style="padding:6px;border-top:1px solid var(--border);"></div>
            `;
            await loadKnowledgeTree('定义,定理,引理,推论,命题,公理,性质,注释,评注,结论');
            const kuTreeContainer = document.getElementById('knowledge-tree-list');
            if (kuTreeContainer && knowledgeTreeCache) {
                renderKuTree(knowledgeTreeCache, kuTreeContainer);
            }
            kuKnowledgeId = null;
            loadKuList(1);
            document.getElementById('ku-search-btn')?.addEventListener('click', () => {
                kuFilters.stage = document.getElementById('ku-filter-stage').value;
                kuFilters.question_type = document.getElementById('ku-filter-type').value;
                kuFilters.keyword = document.getElementById('ku-filter-keyword').value;
                kuKnowledgeId = null;
                loadKuList(1);
            });
            document.getElementById('ku-select-all')?.addEventListener('change', (e) => toggleSelectAllKu(e.target.checked));
            document.getElementById('ku-batch-delete')?.addEventListener('click', batchDeleteKu);
            document.getElementById('edit-question-btn')?.addEventListener('click', () => {
                const qid = document.getElementById('preview-content').dataset.qid;
                if (qid) enterKuEditMode(qid);
            });
        } else if (tab === 'papers') {
            // 试卷视图（保持原有逻辑）
            switchToPapersView();
        }
    }

    function switchToPapersView() {
        tabQuestions.classList.remove('btn-primary'); tabQuestions.classList.add('btn-outline');
        tabKnowledge.classList.remove('btn-primary'); tabKnowledge.classList.add('btn-outline');
        const tabPapers = document.getElementById('tab-papers');
        if (tabPapers) { tabPapers.classList.add('btn-primary'); tabPapers.classList.remove('btn-outline'); }
        sidebar.style.display = 'none';
        tabContent.innerHTML = `
            <div style="padding:8px;border-bottom:1px solid var(--border);display:flex;gap:8px;align-items:center;">
                <input type="text" id="paper-filter-id" placeholder="试卷ID" style="width:100px;">
                <select id="paper-filter-stage" style="width:90px;">
                    <option value="">全部学段</option>
                    <option value="X">小学</option><option value="C">初中</option>
                    <option value="G">高中</option><option value="Z">专升本</option><option value="K">考研</option>
                </select>
                <input type="number" id="paper-filter-year" placeholder="年份" style="width:80px;">
                <select id="paper-filter-type" style="width:100px;">
                    <option value="">全部类型</option>
                    <option value="试卷">试卷</option><option value="讲义">讲义</option>
                    <option value="教辅">教辅</option><option value="教材">教材</option>
                    <option value="错题本">错题本</option><option value="每日一题">每日一题</option>
                </select>
                <button class="btn btn-sm btn-primary" id="paper-search-btn">搜索</button>
            </div>
            <div id="papers-list-container" style="flex:1;overflow-y:auto;"></div>
            <div id="papers-pagination" style="padding:6px;border-top:1px solid var(--border);"></div>
        `;
        document.getElementById('paper-search-btn').addEventListener('click', () => loadPapersList(1));
        loadPapersList(1);
    }

    // 新建知识点按钮（只绑定一次，根据当前选项卡刷新对应树，并触发全局事件）
    const newBtn = document.getElementById('new-knowledge-btn');
    if (newBtn) {
        const freshBtn = newBtn.cloneNode(true);
        newBtn.parentNode.replaceChild(freshBtn, newBtn);
        freshBtn.addEventListener('click', async () => {
            const name = await modalPrompt('新建知识点', '请输入知识点名称：', { placeholder: '例如：函数' });
            if (!name) return;
            try {
                await apiFetch('/knowledge-points/', { method:'POST', body: JSON.stringify({ name, stage:'G', level_type:'point', parent_id:null }) });
                showToast('知识点已创建');
                // 触发全局事件，通知录入界面等更新
                window.dispatchEvent(new CustomEvent('knowledge-points-updated'));
                const treeContainer = document.getElementById('knowledge-tree-list');
                const isQuestionActive = document.getElementById('tab-questions').classList.contains('btn-primary');
                if (isQuestionActive) {
                    await loadKnowledgeTree('选择,填空,判断,简答,综合大题,例题,练习,问题');
                    if (treeContainer) renderQuestionTree(knowledgeTreeCache, treeContainer);
                } else {
                    await loadKnowledgeTree('定义,定理,引理,推论,命题,公理,性质,注释,评注,结论');
                    if (treeContainer) renderKuTree(knowledgeTreeCache, treeContainer);
                }
            } catch (e) { showToast('创建失败'); }
        });
    }

    tabQuestions.addEventListener('click', () => switchToTab('questions'));
    tabKnowledge.addEventListener('click', () => switchToTab('knowledge'));
    document.getElementById('tab-papers').addEventListener('click', () => switchToPapersView());

    await switchToTab('questions');
}


async function renderQuestionListModule(container) {
    await renderKnowledgeTreeModule(container);
}
window.addEventListener('knowledge-points-updated', async () => {
    const qTab = document.getElementById('tab-questions');
    const kTab = document.getElementById('tab-knowledge');
    const treeContainer = document.getElementById('knowledge-tree-list');
    if (qTab?.classList.contains('btn-primary')) {
        await loadKnowledgeTree('选择,填空,判断,简答,综合大题,例题,练习,问题');
        if (treeContainer) renderQuestionTree(knowledgeTreeCache, treeContainer);
    } else if (kTab?.classList.contains('btn-primary')) {
        await loadKnowledgeTree('定义,定理,引理,推论,命题,公理,性质,注释,评注,结论');
        if (treeContainer) renderKuTree(knowledgeTreeCache, treeContainer);
    }
});
// ========== 试卷视图相关函数 ==========
let papersViewCurrentPage = 1;
let papersViewTotal = 0;

async function loadPapersList(page = 1) {
    papersViewCurrentPage = page;
    const idSearch = document.getElementById('paper-filter-id')?.value.trim() || '';
    const stage = document.getElementById('paper-filter-stage')?.value || '';
    const year = document.getElementById('paper-filter-year')?.value || '';
    const type = document.getElementById('paper-filter-type')?.value || '';

    // 暂时先获取全部试卷（后端暂不支持分页和高级筛选），然后前端过滤和分页
    try {
        const allData = await apiFetch('/papers/');
        const papers = Array.isArray(allData) ? allData : [];
        // 前端过滤
        let filtered = papers;
        if (idSearch) {
            filtered = filtered.filter(p => String(p.id).includes(idSearch) || (p.title && p.title.includes(idSearch)));
        }
        if (stage) {
            filtered = filtered.filter(p => p.stage === stage);
        }
        if (year) {
            filtered = filtered.filter(p => {
                const meta = typeof p.meta_info === 'string' ? JSON.parse(p.meta_info) : (p.meta_info || {});
                return meta.year == year; // 假设 meta_info 中有 year 字段
            });
        }
        if (type) {
            filtered = filtered.filter(p => p.paper_type === type);
        }
        allPapersCache = filtered;
        papersViewTotal = filtered.length;

        // 前端分页：每页15条
        const pageSize = 15;
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        const pageItems = filtered.slice(start, end);
        renderPapersList(pageItems);
        renderPapersPagination();
    } catch (e) { console.error(e); }
}
function renderPapersList(papers) {
    const container = document.getElementById('papers-list-container');
    if (!container) return;
    if (!papers.length) {
        container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary);">暂无试卷</div>';
        return;
    }
    container.innerHTML = papers.map(p => {
        const meta = typeof p.meta_info === 'string' ? JSON.parse(p.meta_info) : (p.meta_info || {});
        const year = meta.year || '-';
        return `
        <div class="list-item" style="display:flex;justify-content:space-between;align-items:center;padding:8px;border-bottom:1px solid var(--border);">
            <div>
                <div><strong>${escapeHtml(p.title)}</strong> <span style="font-size:12px;color:var(--primary);">${p.paper_type}</span></div>
                <div style="font-size:12px;color:var(--text-secondary);">
                    ID: ${p.id} | 学段: ${p.stage} | 年份: ${year} | 总分: ${p.total_score || 0}
                </div>
            </div>
            <div style="display:flex;gap:4px;">
                <button class="btn btn-sm btn-primary edit-paper-btn" data-pid="${p.id}">编辑</button>
                <button class="btn btn-sm btn-outline export-paper-btn" data-pid="${p.id}">导出</button>
            </div>
        </div>
    `}).join('');

    container.querySelectorAll('.edit-paper-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const paperId = parseInt(btn.dataset.pid);
            editPaper(paperId);
        });
    });

    container.querySelectorAll('.export-paper-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const paperId = parseInt(btn.dataset.pid);
            exportPaper(paperId);
        });
    });
}

function renderPapersPagination() {
    const totalPages = Math.ceil(papersViewTotal / 15);
    const container = document.getElementById('papers-pagination');
    if (!container || totalPages <= 1) { if(container) container.innerHTML=''; return; }
    container.innerHTML = `
        <button class="btn btn-sm" ${papersViewCurrentPage===1?'disabled':''} id="papers-prev">上一页</button>
        <span>${papersViewCurrentPage}/${totalPages}</span>
        <button class="btn btn-sm" ${papersViewCurrentPage===totalPages?'disabled':''} id="papers-next">下一页</button>
    `;
    document.getElementById('papers-prev')?.addEventListener('click', ()=> { if(papersViewCurrentPage>1) loadPapersList(papersViewCurrentPage-1); });
    document.getElementById('papers-next')?.addEventListener('click', ()=> { if(papersViewCurrentPage<totalPages) loadPapersList(papersViewCurrentPage+1); });
}

async function editPaper(paperId) {
    try {
        const paper = await apiFetch(`/papers/${paperId}`);
        if (!paper) return showToast('试卷不存在');
        // 获取试卷题目列表
        const questionsData = await apiFetch(`/papers/${paperId}/questions`);
        // 构建 sections 数组
        const sections = [];
        for (const item of questionsData) {
            if (item.is_text) {
                let type = 'title';
                let content = item.text_content || '';
                // 尝试识别知识单元标记 📚
                if (content.startsWith('📚')) {
    type = 'knowledge';
    // 尝试解析：格式 "📚 定理: 勾股定理\n内容..."
    const match = content.match(/^📚\s*([^:]+):\s*(.+?)(?:\n([\s\S]*))?$/);
    let kuType = '知识单元', title = '', analysis = '';
    if (match) {
        kuType = match[1].trim();
        title = match[2].trim();
        analysis = match[3] ? match[3].trim() : '';
    } else {
        title = content.replace(/^📚\s*/, '');
    }
    sections.push({
        type: 'knowledge',
        data: {
            question_type: kuType,
            content_latex: title,
            analysis_latex: analysis,
            // 知识点等信息丢失，可置空
            knowledge_point: '',
            knowledge_point_id: null
         }
     });
    }
            } else if (item.question_id) {
                const q = await apiFetch(`/questions/${item.question_id}`);
                if (q) {
                    sections.push({ type: 'question', data: { ...q, score: item.score } });
                }
            }
        }
        // 设置全局 paperWizard 状态
        paperWizard = {
            paperId: paper.id,
            title: paper.title,
            stage: paper.stage,
            paperType: paper.paper_type,
            sections: sections,
            currentEditIndex: null,
            showAnalysis: true,
            metaInfo: paper.meta_info ? (typeof paper.meta_info === 'string' ? JSON.parse(paper.meta_info) : paper.meta_info) : {},
            originalPaperUrl: '',
        };
        // 重新渲染向导界面
        if (typeof renderWizardFullUI === 'function') {
            renderWizardFullUI();
        } else {
            // 如果向导文件未加载，尝试动态加载或提示
            showToast('试卷向导未加载');
        }
    } catch(e) {
        showToast('加载试卷失败: ' + e.message);
    }
}

async function exportPaper(paperId) {
    try {
        const res = await fetch(`/papers/${paperId}/export/pdf?mode=teacher`, {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        if (!res.ok) throw new Error('导出失败');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `paper_${paperId}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
    } catch (e) {
        showToast('导出失败: ' + e.message);
    }
}
async function renderQuestionListModule(container) {
    await renderKnowledgeTreeModule(container);
}
