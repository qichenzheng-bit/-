let cartQuestions = [];
let currentCartQuestionPage = 1;
let totalCartQuestions = 0;
let cartMode = 'question'; // 'question' 或 'knowledge'

// 全局删除函数
window.removeFromCart = async function(itemId, index) {
    const confirmed = await modalConfirm('移除', '确认从组卷中移除此项？');
    if (!confirmed) return;
    try {
        await apiFetch(`/papers/${currentPaperId}/questions/${itemId}`, { method:'DELETE' });
    } catch(e) {
        console.error('删除失败:', e);
    }
    cartQuestions.splice(index, 1);
    renderCartItems();
    showToast('已移除');
};

window.updateCartScore = async function(index, newScore) {
    const score = parseFloat(newScore);
    if (isNaN(score) || score < 0.5 || score > 100) {
        showToast('无效分值');
        renderCartItems();
        return;
    }
    cartQuestions[index].score = score;
    try {
        await apiFetch(`/papers/${currentPaperId}/questions/${cartQuestions[index].id}`, {
            method:'PUT',
            body: JSON.stringify({score: score})
        });
    } catch(e) { console.error(e); }
    renderCartItems();
};

async function openPaperEditor(paperId, title, mode) {
    currentPaperId = paperId;
    cartQuestions = [];
    cartMode = 'question';
    const editorPanel = document.getElementById('paper-editor-panel');
    editorPanel.innerHTML = `
        <div style="display:flex;flex-direction:column;height:100%;">
            <div style="padding:8px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;">
                <strong>${escapeHtml(title)}</strong>
                <select id="paper-mode-select">
                    <option value="student" ${mode==='student'?'selected':''}>学生版</option>
                    <option value="teacher" ${mode==='teacher'?'selected':''}>教师版</option>
                    <option value="answer_only" ${mode==='answer_only'?'selected':''}>纯答案</option>
                </select>
                <label style="display:flex;align-items:center;gap:4px;font-size:13px;">
                    <input type="checkbox" id="show-score-toggle" checked> 显示分值
                </label>
                <button class="btn btn-sm btn-outline" id="add-text-block-btn"><i class="fas fa-font"></i> 文本块</button>
                <button class="btn btn-sm btn-outline" id="insert-kp-desc-btn"><i class="fas fa-book"></i> 插入知识点指导</button>
                <button class="btn btn-sm btn-primary" id="export-pdf-btn">导出 PDF</button>
                <button class="btn btn-sm btn-outline" id="export-word-btn">导出 Word</button>
                <button class="btn btn-sm btn-danger" id="delete-paper-btn"><i class="fas fa-trash"></i></button>
                <!-- 新增：核对试卷按钮 -->
                <button class="btn btn-sm btn-success" id="review-paper-btn" style="margin-left:auto;">📋 核对试卷</button>
            </div>
            <div class="two-columns" style="display:flex;flex:1;overflow:hidden;">
                <div style="flex:1;display:flex;flex-direction:column;border-right:1px solid var(--border);">
                    <div style="padding:6px;display:flex;gap:4px;border-bottom:1px solid var(--border);">
                        <button class="tab-btn btn btn-sm ${cartMode==='question'?'btn-primary':'btn-outline'}" id="cart-tab-question">题库</button>
                        <button class="tab-btn btn btn-sm ${cartMode==='knowledge'?'btn-primary':'btn-outline'}" id="cart-tab-knowledge">知识单元库</button>
                    </div>
                    <div id="cart-filter-area" style="padding:6px;display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid var(--border);"></div>
                    <div id="cart-question-list" style="flex:1;overflow-y:auto;"></div>
                    <div id="cart-pagination" style="padding:4px;border-top:1px solid var(--border);"></div>
                </div>
                <div style="width:420px;display:flex;flex-direction:column;border-left:1px solid var(--border);">
                    <div style="padding:6px;border-bottom:1px solid var(--border);">已选题 (<span id="cart-count">0</span>)</div>
                    <div id="cart-items-list" style="max-height:200px;overflow-y:auto;"></div>
                    <div style="padding:6px;border-top:1px solid var(--border);">总分: <strong id="cart-total-score">0</strong></div>
                    <div style="padding:8px; border-top:1px solid var(--border); flex:1; overflow-y:auto;" id="paper-preview-area">
                        <div style="color:var(--text-secondary); text-align:center; padding:20px;">题目预览</div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // 导出 PDF
    document.getElementById('export-pdf-btn').addEventListener('click', async () => {
        const exportMode = document.getElementById('paper-mode-select').value;
        const showScore = document.getElementById('show-score-toggle').checked;
        await apiFetch(`/papers/${currentPaperId}`, {
            method:'PUT',
            body: JSON.stringify({ meta_info: { show_score: showScore } })
        });
        const token = localStorage.getItem('token');
        fetch(`${API_BASE}/papers/${currentPaperId}/export/pdf?mode=${exportMode}`, {
            headers: { 'Authorization': 'Bearer ' + token }
        })
        .then(res => { if (!res.ok) return res.json().then(err => { throw new Error(err.detail || '导出失败'); }); return res.blob(); })
        .then(blob => { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `paper_${currentPaperId}.pdf`; a.click(); URL.revokeObjectURL(url); })
        .catch(err => showToast('PDF导出失败: ' + err.message));
    });

    // 导出 Word
    document.getElementById('export-word-btn').addEventListener('click', async () => {
        const exportMode = document.getElementById('paper-mode-select').value;
        const showScore = document.getElementById('show-score-toggle').checked;
        await apiFetch(`/papers/${currentPaperId}`, {
            method:'PUT',
            body: JSON.stringify({ meta_info: { show_score: showScore } })
        });
        const token = localStorage.getItem('token');
        fetch(`${API_BASE}/papers/${currentPaperId}/export/word?mode=${exportMode}`, {
            headers: { 'Authorization': 'Bearer ' + token }
        })
        .then(res => { if (!res.ok) return res.json().then(err => { throw new Error(err.detail || '导出失败'); }); return res.blob(); })
        .then(blob => { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `paper_${currentPaperId}.docx`; a.click(); URL.revokeObjectURL(url); })
        .catch(err => showToast('Word导出失败: ' + err.message));
    });

    // 删除组卷
    document.getElementById('delete-paper-btn').addEventListener('click', async () => {
        const confirmed = await modalConfirm('删除组卷', '确认删除该组卷？');
        if (!confirmed) return;
        await apiFetch(`/papers/${currentPaperId}`, { method:'DELETE' });
        showToast('已删除');
        currentPaperId = null;
        loadPaperList();
        document.getElementById('paper-editor-panel').innerHTML = '<div style="text-align:center;color:var(--text-secondary);">请选择或新建一个组卷</div>';
    });

    // 模式切换
    document.getElementById('paper-mode-select').addEventListener('change', async (e) => {
        await apiFetch(`/papers/${currentPaperId}`, { method:'PUT', body: JSON.stringify({answer_mode: e.target.value}) });
    });

    // 搜索题目
    document.getElementById('cart-search-btn')?.addEventListener('click', () => loadCartQuestions(1));

    // 添加文本块
    document.getElementById('add-text-block-btn').addEventListener('click', async () => {
        const text = await modalPrompt('添加文本块', '请输入文本内容（支持 LaTeX）：', { placeholder: '例如：§1.1 函数的概念' });
        if (!text) return;
        await apiFetch(`/papers/${currentPaperId}/questions`, {
            method: 'POST',
            body: JSON.stringify({ is_text: 1, text_content: text, sort_order: cartQuestions.length + 1 })
        });
        showToast('文本块已添加');
        loadCartItems();
    });

    // 插入知识点指导
    document.getElementById('insert-kp-desc-btn').addEventListener('click', async () => {
        const tree = await apiFetch('/knowledge-points/tree');
        let optionsHtml = '';
        function buildOptions(nodes, prefix = '') {
            nodes.forEach(node => {
                optionsHtml += `<option value="${node.id}">${prefix}${escapeHtml(node.name)}</option>`;
                if (node.children) buildOptions(node.children, prefix + '  ');
            });
        }
        buildOptions(tree);
        const formHtml = `<div class="form-group"><label>选择知识点</label><select id="kp-select" style="width:100%;">${optionsHtml}</select></div>`;

        await showModal('插入知识点指导', {
            type: 'form',
            html: formHtml,
            onConfirm: async (overlay) => {
                const kpId = document.getElementById('kp-select').value;
                if (!kpId) return false;
                const kp = await apiFetch(`/knowledge-points/${kpId}`);
                const content = kp.description || `${kp.name} 暂无详细指导。`;
                await apiFetch(`/papers/${currentPaperId}/questions`, {
                    method:'POST',
                    body: JSON.stringify({ is_text: 1, text_content: content, sort_order: cartQuestions.length + 1, is_knowledge_block: 1 })
                });
                showToast('知识点指导已插入');
                loadCartItems();
            }
        });
    });

    // ========== 新增：核对试卷按钮事件 ==========
    document.getElementById('review-paper-btn').addEventListener('click', () => {
        if (cartQuestions.length === 0) return showToast('请先添加题目或知识单元');
        // 收集购物车数据，打开试卷向导的核对模式
        collectCartData();
    });

    // 选项卡切换
    document.getElementById('cart-tab-question').addEventListener('click', () => {
        cartMode = 'question';
        updateTabStyles();
        renderFilterArea();
        loadCartQuestions(1);
    });
    document.getElementById('cart-tab-knowledge').addEventListener('click', () => {
        cartMode = 'knowledge';
        updateTabStyles();
        renderFilterArea();
        loadCartQuestions(1);
    });

    function updateTabStyles() {
        const qTab = document.getElementById('cart-tab-question');
        const kTab = document.getElementById('cart-tab-knowledge');
        if (cartMode === 'question') {
            qTab.classList.add('btn-primary'); qTab.classList.remove('btn-outline');
            kTab.classList.add('btn-outline'); kTab.classList.remove('btn-primary');
        } else {
            kTab.classList.add('btn-primary'); kTab.classList.remove('btn-outline');
            qTab.classList.add('btn-outline'); qTab.classList.remove('btn-primary');
        }
    }

    renderFilterArea();
    loadCartQuestions(1);
    loadCartItems();
}
async function loadCartQuestions(page) {
    const params = new URLSearchParams();
    const stage = document.getElementById('filter-stage')?.value || '';
    const knowledge = document.getElementById('filter-knowledge')?.value || '';
    const type = document.getElementById('filter-type')?.value || '';
    const idSearch = document.getElementById('filter-id')?.value || '';
    const difficulty = document.getElementById('filter-difficulty')?.value || '';

    if (stage) params.append('stage', stage);
    if (knowledge) params.append('knowledge_point', knowledge);
    if (idSearch) params.append('keyword', idSearch);
    if (difficulty && cartMode === 'question') params.append('difficulty', difficulty);

    // 题目类型列表（排除知识单元）
    const questionTypes = '选择,填空,判断,简答,综合大题,例题,练习,问题';
    // 知识单元类型列表
    const kuTypes = '定义,定理,引理,推论,命题,公理,性质,注释,评注,结论';

    if (cartMode === 'question') {
        // 题库模式：如果用户选择了具体题型，传该题型；否则传全部题目类型
        if (type) {
            params.append('question_type', type);
        } else {
            params.append('question_type', questionTypes);
        }
    } else {
        // 知识单元模式：如果用户选择了具体类型，传该类型；否则传全部知识单元类型
        if (type) {
            params.append('question_type', type);
        } else {
            params.append('question_type', kuTypes);
        }
    }

    params.append('page', page);
    params.append('page_size', 10);

    try {
        const data = await apiFetch(`/questions/?${params.toString()}`);
        totalCartQuestions = data.total;
        currentCartQuestionPage = page;
        if (cartMode === 'question') {
            renderCartQuestionList(data.items);
        } else {
            renderCartKnowledgeList(data.items);
        }
        renderCartPagination();
    } catch (e) { console.error(e); }
}

function renderCartQuestionList(questions) {
    const container = document.getElementById('cart-question-list');
    if (!questions.length) { container.innerHTML = '<div style="padding:12px;">无结果</div>'; return; }
    container.innerHTML = questions.map(q => `
        <div class="cart-item" style="display:flex;align-items:center;justify-content:space-between;padding:6px;border-bottom:1px solid var(--border);">
            <div>
                <span style="font-family:monospace;">${escapeHtml(q.id)}</span>
                <div style="font-size:12px;color:var(--text-secondary);">${escapeHtml(q.content_preview?.substring(0,50))}</div>
            </div>
            <button class="btn btn-sm btn-primary add-cart-btn" data-id="${q.id}" data-type="question">+ 加入</button>
        </div>
    `).join('');
    container.querySelectorAll('.add-cart-btn').forEach(btn => {
        btn.addEventListener('click', () => addToCart(btn.dataset.id, 'question'));
    });
}

function renderCartKnowledgeList(items) {
    const container = document.getElementById('cart-question-list');
    if (!items.length) { container.innerHTML = '<div style="padding:12px;">无结果</div>'; return; }
    container.innerHTML = items.map(q => `
        <div class="cart-item" style="display:flex;align-items:center;justify-content:space-between;padding:6px;border-bottom:1px solid var(--border);">
            <div>
                <span style="font-family:monospace;">${escapeHtml(q.id)}</span>
                <span style="font-size:12px;color:var(--primary);">${escapeHtml(q.question_type)}</span>
                <div style="font-size:12px;color:var(--text-secondary);">${escapeHtml(q.content_preview?.substring(0,50))}</div>
            </div>
            <button class="btn btn-sm btn-primary add-cart-btn" data-id="${q.id}" data-type="knowledge" data-qtype="${q.question_type}">+ 加入</button>
        </div>
    `).join('');
    container.querySelectorAll('.add-cart-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const qid = btn.dataset.id;
            const qtype = btn.dataset.qtype;
            addKnowledgeToCart(qid, qtype);
        });
    });
}

// 题目加入购物车（弹分值框）
async function addToCart(questionId, type) {
    if (type === 'knowledge') {
        return addKnowledgeToCart(questionId);
    }
    const result = await showModal('设置分值', {
        type: 'form',
        html: `<div class="form-group"><label>请输入该题的分值（0.5-100）</label>
               <input id="modal-input" type="number" value="10" min="0.5" max="100" step="0.5" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;"></div>`,
        onConfirm: (overlay) => {
            const input = document.getElementById('modal-input');
            const val = input ? parseFloat(input.value) : NaN;
            if (isNaN(val) || val < 0.5 || val > 100) {
                showToast('无效的分值，请输入 0.5-100 之间的数字');
                return false;
            }
            return val;
        }
    });
    if (!result) return;
    const score = result;
    try {
        const res = await apiFetch(`/papers/${currentPaperId}/questions`, {
            method:'POST',
            body: JSON.stringify({question_id: questionId, score: score, sort_order: cartQuestions.length+1})
        });
        cartQuestions.push({
            id: res.id,
            question_id: questionId,
            score: score,
            sort_order: cartQuestions.length+1,
            is_text: 0,
            is_knowledge: false
        });
        renderCartItems();
    } catch(e) { showToast('添加失败: '+e.message); }
}

// 知识单元直接加入（分值0）
async function addKnowledgeToCart(questionId, questionType) {
    try {
        const res = await apiFetch(`/papers/${currentPaperId}/questions`, {
            method:'POST',
            body: JSON.stringify({question_id: questionId, score: 0, sort_order: cartQuestions.length+1})
        });
        cartQuestions.push({
            id: res.id,
            question_id: questionId,
            score: 0,
            sort_order: cartQuestions.length+1,
            is_text: 0,
            is_knowledge: true,
            question_type: questionType
        });
        renderCartItems();
        showToast('知识单元已添加');
    } catch(e) { showToast('添加失败: '+e.message); }
}

async function loadCartItems() {
    const data = await apiFetch(`/papers/${currentPaperId}/questions`);
    // 需要判断每个条目的类型（知识单元/题目），从后端获取的item中可能没有question_type，所以我们需要额外请求。
    // 简单方法：加载时批量获取所有question详情，但为了性能，我们可以在后端API中增加返回question_type字段，但先不修改后端。
    // 暂时通过is_text和is_knowledge_block区分，knowledge单元也是question_id的形式，所以需要查类型。
    // 我们采用延迟加载，在渲染时再查类型？
    // 修改：在loadCartItems中，对于有question_id的条目，并发请求question详情，然后存储question_type。
    const enrichedItems = [];
    for (const item of data) {
        if (item.question_id) {
            try {
                const q = await apiFetch(`/questions/${item.question_id}`);
                enrichedItems.push({
                    ...item,
                    question_type: q.question_type,
                    content_preview: q.content_latex?.substring(0, 60) || ''
                });
            } catch(e) {
                enrichedItems.push(item);
            }
        } else {
            enrichedItems.push(item);
        }
    }
    cartQuestions = enrichedItems;
    renderCartItems();
}

function renderCartItems() {
    const container = document.getElementById('cart-items-list');
    const countEl = document.getElementById('cart-count');
    const scoreEl = document.getElementById('cart-total-score');
    if (!cartQuestions.length) {
        container.innerHTML = '<div style="padding:12px;color:var(--text-secondary);">暂未添加题目</div>';
        countEl.innerText = '0'; scoreEl.innerText = '0';
        updatePreviewArea();
        return;
    }
    countEl.innerText = cartQuestions.length;
    // 计算总分时排除知识单元（is_knowledge 或 某些文本块）
    const total = cartQuestions.reduce((s, q) => {
        const kuTypes = ['定义','定理','引理','推论','命题','公理','性质','注释','评注','结论'];
        if (q.is_text || q.is_knowledge_block || kuTypes.includes(q.question_type)) return s;
        return s + (q.score || 0);
    }, 0);
    scoreEl.innerText = total;

    container.innerHTML = cartQuestions.map((q, idx) => {
        const kuTypes = ['定义','定理','引理','推论','命题','公理','性质','注释','评注','结论'];
        if (q.is_text) {
            const typeLabel = q.is_knowledge_block ? '知识点指导' : '文本块';
            const preview = (q.text_content || '').substring(0, 50);
            return `
                <div class="cart-item" style="display:flex;align-items:center;justify-content:space-between;padding:6px;border-bottom:1px solid var(--border);">
                    <div style="flex:1;">
                        <span style="font-weight:500;">${typeLabel}</span>
                        <div style="font-size:12px;color:var(--text-secondary);">${escapeHtml(preview)}</div>
                    </div>
                    <button class="btn btn-sm btn-danger" onclick="removeFromCart(${q.id}, ${idx})">×</button>
                </div>
            `;
        } else if (kuTypes.includes(q.question_type)) {
            // 知识单元
            const typeName = q.question_type;
            const preview = (q.content_preview || q.question_id || '');
            return `
                <div class="cart-item" style="display:flex;align-items:center;justify-content:space-between;padding:6px;border-bottom:1px solid var(--border);">
                    <div style="flex:1;">
                        <span style="font-weight:500;color:var(--primary);">📚 ${typeName}</span>
                        <span style="font-family:monospace; margin-left:8px;">${escapeHtml(q.question_id)}</span>
                        <div style="font-size:12px;color:var(--text-secondary);">${escapeHtml(preview)}</div>
                    </div>
                    <button class="btn btn-sm btn-danger" onclick="removeFromCart(${q.id}, ${idx})">×</button>
                </div>
            `;
        } else {
            // 普通题目
            return `
                <div class="cart-item" style="display:flex;align-items:center;justify-content:space-between;padding:6px;border-bottom:1px solid var(--border);">
                    <span style="font-family:monospace;">${escapeHtml(q.question_id)}</span>
                    <input type="number" class="score-input" value="${q.score}" data-index="${idx}" style="width:60px;" onchange="updateCartScore(${idx}, this.value)">
                    <button class="btn btn-sm btn-danger" onclick="removeFromCart(${q.id}, ${idx})">×</button>
                </div>
            `;
        }
    }).join('');

    updatePreviewArea();
}

async function updatePreviewArea() {
    const previewArea = document.getElementById('paper-preview-area');
    if (!previewArea) return;
    previewArea.innerHTML = '<div style="color:var(--text-secondary); text-align:center; padding:20px;">加载预览...</div>';
    if (cartQuestions.length === 0) {
        previewArea.innerHTML = '<div style="color:var(--text-secondary); text-align:center; padding:20px;">暂无内容</div>';
        return;
    }
    let previewHtml = '<div style="display:flex;flex-direction:column;gap:8px;">';
    const kuTypes = ['定义','定理','引理','推论','命题','公理','性质','注释','评注','结论'];
    for (let i = 0; i < cartQuestions.length; i++) {
        const item = cartQuestions[i];
        if (item.is_text) {
            const typeLabel = item.is_knowledge_block ? '📚 知识点指导' : '📝 文本块';
            previewHtml += `
                <div class="card" style="padding:10px; background:var(--bg); border-radius:8px;">
                    <div style="font-weight:bold; margin-bottom:4px;">${i+1}. ${typeLabel}</div>
                    <div style="font-size:13px; color:var(--text-secondary); white-space:pre-wrap;">${escapeHtml(item.text_content || '')}</div>
                </div>
            `;
        } else if (kuTypes.includes(item.question_type)) {
            // 知识单元预览
            try {
                const q = await apiFetch(`/questions/${item.question_id}`);
                const typeLabel = q.question_type;
                previewHtml += `
                    <div class="card" style="padding:10px; background:var(--surface); border:1px solid var(--primary); border-radius:8px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                            <strong>${i+1}. 📚 ${escapeHtml(typeLabel)}</strong>
                        </div>
                        <div style="font-size:14px; margin-bottom:4px;"><strong>${escapeHtml(q.content_latex?.substring(0,120) || '')}</strong></div>
                        <div style="font-size:12px; color:var(--text-secondary);">${escapeHtml(q.analysis_latex?.substring(0,100) || '')}</div>
                    </div>
                `;
            } catch(e) {
                previewHtml += `<div class="card" style="padding:10px;">知识单元加载失败</div>`;
            }
        } else {
            // 普通题目预览
            try {
                const q = await apiFetch(`/questions/${item.question_id}`);
                const typeIcon = {
                    '选择': '🔘', '填空': '✍️', '判断': '✅', '简答': '📄', '综合大题': '📋'
                }[q.question_type] || '❓';
                const stars = '⭐'.repeat(q.difficulty);
                previewHtml += `
                    <div class="card" style="padding:10px; background:var(--surface); border:1px solid var(--border); border-radius:8px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                            <strong>${i+1}. ${typeIcon} ${escapeHtml(q.question_type)}</strong>
                            <span style="font-size:12px; color:var(--text-secondary);">${stars} ${item.score || '?'}分</span>
                        </div>
                        <div style="font-size:14px; margin-bottom:4px;">${escapeHtml(q.content_latex?.substring(0,120))}...</div>
                        <div style="font-size:12px; color:var(--text-secondary);">
                            答案: ${escapeHtml(q.answer_latex?.substring(0,60) || '无')}
                        </div>
                    </div>
                `;
            } catch(e) {
                previewHtml += `<div class="card" style="padding:10px; background:var(--bg);">题目加载失败</div>`;
            }
        }
    }
    previewHtml += '</div>';
    previewArea.innerHTML = previewHtml;
    if (window.renderMathInElement) renderMathInElement(previewArea, { delimiters: [{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}] });
}

function renderCartPagination() {
    const totalPages = Math.ceil(totalCartQuestions / 10);
    const container = document.getElementById('cart-pagination');
    if (!container || totalPages <= 1) { if(container) container.innerHTML=''; return; }
    container.innerHTML = `
        <button class="btn btn-sm" ${currentCartQuestionPage===1?'disabled':''} id="cart-prev">上一页</button>
        <span>${currentCartQuestionPage}/${totalPages}</span>
        <button class="btn btn-sm" ${currentCartQuestionPage===totalPages?'disabled':''} id="cart-next">下一页</button>
    `;
    document.getElementById('cart-prev')?.addEventListener('click', ()=> loadCartQuestions(currentCartQuestionPage-1));
    document.getElementById('cart-next')?.addEventListener('click', ()=> loadCartQuestions(currentCartQuestionPage+1));
}
function renderFilterArea() {
    const area = document.getElementById('cart-filter-area');
    if (!area) return;
    if (cartMode === 'question') {
        area.innerHTML = `
            <select id="filter-stage" style="width:80px;">
                <option value="">年级</option>
                <option value="X">小学</option><option value="C">初中</option>
                <option value="G">高中</option><option value="Z">专升本</option><option value="K">考研</option>
            </select>
            <input type="text" id="filter-knowledge" placeholder="知识点" style="width:120px;">
            <select id="filter-type" style="width:90px;">
                <option value="">题型</option>
                <option value="选择">选择</option><option value="填空">填空</option>
                <option value="判断">判断</option><option value="简答">简答</option><option value="综合大题">综合大题</option>
            </select>
            <select id="filter-difficulty" style="width:70px;">
                <option value="">难度</option>
                <option value="1">⭐</option><option value="2">⭐⭐</option>
                <option value="3">⭐⭐⭐</option><option value="4">⭐⭐⭐⭐</option><option value="5">⭐⭐⭐⭐⭐</option>
            </select>
            <input type="text" id="filter-id" placeholder="编号搜索" style="width:100px;">
            <button class="btn btn-sm btn-primary" id="search-btn">搜索</button>
        `;
    } else {
        area.innerHTML = `
            <select id="filter-stage" style="width:80px;">
                <option value="">年级</option>
                <option value="X">小学</option><option value="C">初中</option>
                <option value="G">高中</option><option value="Z">专升本</option><option value="K">考研</option>
            </select>
            <input type="text" id="filter-knowledge" placeholder="知识点" style="width:120px;">
            <select id="filter-type" style="width:90px;">
                <option value="">类型</option>
                <option value="定义">定义</option><option value="定理">定理</option>
                <option value="引理">引理</option><option value="推论">推论</option>
                <option value="命题">命题</option><option value="公理">公理</option>
                <option value="性质">性质</option><option value="注释">注释</option>
                <option value="评注">评注</option><option value="结论">结论</option>
            </select>
            <input type="text" id="filter-id" placeholder="编号搜索" style="width:100px;">
            <button class="btn btn-sm btn-primary" id="search-btn">搜索</button>
        `;
    }
    document.getElementById('search-btn')?.addEventListener('click', () => loadCartQuestions(1));
}
function renderCartKnowledgeList(items) {
    const container = document.getElementById('cart-question-list');
    if (!container) return;
    if (!items.length) {
        container.innerHTML = '<div style="padding:12px;color:var(--text-secondary);">无结果</div>';
        return;
    }
    container.innerHTML = items.map(q => `
        <div class="cart-item" style="display:flex;align-items:center;justify-content:space-between;padding:6px;border-bottom:1px solid var(--border);">
            <div>
                <span style="font-family:monospace;">${escapeHtml(q.id)}</span>
                <span style="font-size:12px;color:var(--primary);margin-left:8px;">${escapeHtml(q.question_type)}</span>
                <div style="font-size:12px;color:var(--text-secondary);">${escapeHtml(q.content_preview?.substring(0,50) || '')}</div>
            </div>
            <button class="btn btn-sm btn-primary add-cart-btn" data-id="${q.id}" data-type="knowledge">+ 加入</button>
        </div>
    `).join('');
    container.querySelectorAll('.add-cart-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.type === 'knowledge') {
                addKnowledgeToCart(btn.dataset.id);
            } else {
                addToCart(btn.dataset.id, 'question');
            }
        });
    });
}
async function addKnowledgeToCart(questionId) {
    try {
        const res = await apiFetch(`/papers/${currentPaperId}/questions`, {
            method:'POST',
            body: JSON.stringify({question_id: questionId, score: 0, sort_order: cartQuestions.length+1})
        });
        cartQuestions.push({
            id: res.id,
            question_id: questionId,
            score: 0,
            sort_order: cartQuestions.length+1,
            is_text: 0,
            is_knowledge: true
        });
        renderCartItems();
        showToast('知识单元已添加');
    } catch(e) { showToast('添加失败: '+e.message); }
}
async function collectCartData() {
    const titleEl = document.querySelector('#paper-editor-panel strong');
    const title = titleEl ? titleEl.innerText : '组卷';
    const modeSelect = document.getElementById('paper-mode-select');
    const mode = modeSelect ? modeSelect.value : 'teacher';
    window._lastEditorState = {
        paperId: currentPaperId,
        title: title,
        mode: mode,
    };

    const sections = [];
    for (const item of cartQuestions) {
        if (item.is_text) {
            sections.push({
                type: item.is_knowledge_block ? 'knowledge' : 'title',
                data: { content: item.text_content || '' }
            });
        } else if (item.question_id) {
            try {
                const q = await apiFetch(`/questions/${item.question_id}`);
                if (q) {
                    sections.push({
                        type: 'question',
                        data: { ...q, score: item.score || 10 }
                    });
                }
            } catch (e) {
                console.error('获取题目失败:', item.question_id);
            }
        }
    }

    paperWizard = {
        paperId: currentPaperId,
        title: title,
        stage: 'G',
        paperType: '试卷',
        sections: sections,
        currentEditIndex: null,
        showAnalysis: true,
        metaInfo: {},
        originalPaperUrl: '',
        origin: 'group'   // 标记来源为组卷
    };

    if (typeof openPaperWizardForReview === 'function') {
        openPaperWizardForReview();
    } else {
        showToast('试卷向导未加载，请刷新页面');
    }
}