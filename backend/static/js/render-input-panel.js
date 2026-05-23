let currentOptions = [''];
let currentSubQuestions = [];
const MAX_OPTIONS = 10;
const MAX_SUB = 10;
let lastFocusedInput = null;
let dedupTimer = null;
let recognizedQueue = [];
let currentQueueIndex = -1;
let currentEntryMode = 'question'; // 'question' 或 'knowledge'
// 在现有声明后面添加
let questionKnowledge = { id: '', text: '' };
let kuKnowledge = { id: '', text: '' };

// 保存整个录入界面状态（包括题目和知识单元各自的知识点）
window.saveInputState = function() {
    const state = {
        entryMode: currentEntryMode,
        questionType: document.getElementById('input-question-type')?.value || '选择',
        stem: document.getElementById('stem-input')?.value || '',
        analysis: document.getElementById('analysis-input')?.value || '',
        options: currentOptions.slice(),
        subQuestions: currentSubQuestions.map(s => ({ stem: s.stem, answer: s.answer, analysis: s.analysis })),
        // 分别保存两个模式的知识点
        questionKnowledge: {
            id: questionKnowledge.id,
            text: questionKnowledge.text
        },
        kuKnowledge: {
            id: kuKnowledge.id,
            text: kuKnowledge.text
        }
    };
    window._savedInputState = state;
};

// 从保存的状态恢复整个录入界面
function restoreInputState() {
    const state = window._savedInputState;
    if (!state) return;

    // 恢复当前模式
    currentEntryMode = state.entryMode || 'question';

    // 恢复独立的两个知识点存储（无论当前模式，都恢复两份数据）
    if (state.questionKnowledge) {
        questionKnowledge.id = state.questionKnowledge.id || '';
        questionKnowledge.text = state.questionKnowledge.text || '';
    } else {
        questionKnowledge = { id: '', text: '' };
    }
    if (state.kuKnowledge) {
        kuKnowledge.id = state.kuKnowledge.id || '';
        kuKnowledge.text = state.kuKnowledge.text || '';
    } else {
        kuKnowledge = { id: '', text: '' };
    }

    // 切换选项卡样式
    document.querySelectorAll('.entry-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.mode === currentEntryMode);
        tab.classList.remove('btn-primary', 'btn-outline');
        tab.classList.add(tab.dataset.mode === currentEntryMode ? 'btn-primary' : 'btn-outline');
    });

    // 恢复题型下拉
    const typeSelect = document.getElementById('input-question-type');
    if (typeSelect) typeSelect.value = state.questionType;

    // 恢复题干/标题、解析/内容
    document.getElementById('stem-input').value = state.stem || '';
    document.getElementById('analysis-input').value = state.analysis || '';

    // 恢复选项和子题
    currentOptions = state.options && state.options.length > 0 ? state.options : [''];
    currentSubQuestions = state.subQuestions || [];

    // 重新渲染额外字段（选项、答案区等）
    updateTypeSelectOptions();
    renderExtraFields();

    // 设置标签文本
    document.getElementById('stem-label').innerText = currentEntryMode === 'knowledge' ? '标题（支持 $LaTeX$）' : '题干（支持 $LaTeX$）';
    document.getElementById('analysis-label').innerText = currentEntryMode === 'knowledge' ? '内容' : '解析';

    // 恢复知识点显示（根据当前模式显示对应的知识点）
     // 重新初始化知识点选择器（绑定事件）
    initKnowledgePicker();
    const kp = currentEntryMode === 'question' ? questionKnowledge : kuKnowledge;
    const pickerText = document.getElementById('knowledge-picker-text');
    const knowledgeId = document.getElementById('knowledge-id');
    if (pickerText) pickerText.textContent = kp.text || '请选择知识点';
    if (knowledgeId) knowledgeId.value = kp.id || '';

   

    // 恢复选项和子题的 DOM 值（需要 setTimeout 等待 DOM 渲染）
    setTimeout(() => {
        if (currentEntryMode === 'question') {
            if (state.questionType === '选择') {
                document.querySelectorAll('.option-input').forEach((inp, i) => {
                    if (i < currentOptions.length) inp.value = currentOptions[i] || '';
                });
                const ansSelect = document.getElementById('answer-select');
                if (ansSelect && state.answer) ansSelect.value = state.answer;
            } else if (state.questionType === '综合大题') {
                document.querySelectorAll('.sub-stem').forEach((el, i) => {
                    if (i < currentSubQuestions.length) el.value = currentSubQuestions[i].stem || '';
                });
                document.querySelectorAll('.sub-answer').forEach((el, i) => {
                    if (i < currentSubQuestions.length) el.value = currentSubQuestions[i].answer || '';
                });
                document.querySelectorAll('.sub-analysis').forEach((el, i) => {
                    if (i < currentSubQuestions.length) el.value = currentSubQuestions[i].analysis || '';
                });
            } else if (state.questionType === '判断') {
                const ansSelect = document.getElementById('answer-select');
                if (ansSelect && state.answer) ansSelect.value = state.answer;
            } else if (state.questionType === '填空' || state.questionType === '简答') {
                const ansInput = document.getElementById('answer-input');
                if (ansInput && state.answer) ansInput.value = state.answer;
            }
        }
        updatePreview();
    }, 80);
}

function updateTypeSelectOptions() {
    const typeSelect = document.getElementById('input-question-type');
    if (!typeSelect) return;
    if (currentEntryMode === 'knowledge') {
        typeSelect.innerHTML = `
            <option value="定义">定义</option>
            <option value="定理">定理</option>
            <option value="引理">引理</option>
            <option value="推论">推论</option>
            <option value="命题">命题</option>
            <option value="公理">公理</option>
            <option value="性质">性质</option>
            <option value="注释">注释</option>
            <option value="评注">评注</option>
            <option value="结论">结论</option>
        `;
    } else {
        typeSelect.innerHTML = `
            <option value="选择">选择题</option>
            <option value="填空">填空题</option>
            <option value="判断">判断题</option>
            <option value="简答">简答题</option>
            <option value="综合大题">综合大题</option>
        `;
    }
}

function renderInputModule(container) {
    container.innerHTML = `
        <div class="two-columns" style="display:flex;height:100%;">
            <div style="flex:1;display:flex;flex-direction:column;overflow-y:auto;padding:16px;">
                <div style="display:flex;gap:4px;margin-bottom:12px;">
                    <button class="entry-tab btn btn-sm ${currentEntryMode==='question'?'btn-primary':'btn-outline'}" data-mode="question">📝 题目</button>
                    <button class="entry-tab btn btn-sm ${currentEntryMode==='knowledge'?'btn-primary':'btn-outline'}" data-mode="knowledge">📚 知识单元</button>
                </div>
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
                    <select id="input-question-type"></select>
                    <select id="ocr-mode-select" style="width:120px;">
                        <option value="ai" selected>AI (豆包)</option>
                        <option value="direct">免费 (Pix2Text)</option>
                    </select>
                    <button class="btn btn-sm" id="toggle-symbol-btn"><i class="fas fa-square-root-alt"></i> 符号</button>
                    <button class="btn btn-sm" id="input-fix-btn"><i class="fas fa-magic"></i> AI修复</button>
                    <button class="btn btn-sm btn-primary" id="ai-generate-answer-btn"><i class="fas fa-robot"></i> AI生成答案</button>
                    <button class="btn btn-sm btn-outline" id="ai-tag-btn"><i class="fas fa-tag"></i> AI打标</button>
                    <button class="btn btn-sm btn-primary" id="input-save-btn" style="margin-left:auto;"><i class="fas fa-save"></i> 保存</button>
                </div>
                <div id="symbol-panel" style="display:none;margin-bottom:12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px;max-height:200px;overflow-y:auto;">
                    <div style="display:flex;flex-wrap:wrap;gap:4px;">${renderSymbolButtons()}</div>
                </div>
                <div style="margin-bottom:12px;"><label id="stem-label">题干（支持 $LaTeX$）</label><textarea id="stem-input" rows="4" style="width:100%;"></textarea></div>
                <div id="extra-fields"></div>
                <div id="answer-area"></div>
                <div style="margin-bottom:12px;"><label id="analysis-label">解析</label><textarea id="analysis-input" rows="3" style="width:100%;"></textarea></div>
                <div style="margin-bottom:12px;position:relative;">
                    <label>知识点</label>
                    <div id="knowledge-picker" style="display:flex;align-items:center;border:1px solid var(--border);border-radius:6px;padding:8px 12px;cursor:pointer;">
                        <span id="knowledge-picker-text" style="flex:1;color:var(--text-secondary);">请选择知识点</span><i class="fas fa-chevron-down"></i>
                    </div>
                    <div id="knowledge-panel" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:100;background:var(--surface);border:1px solid var(--border);border-radius:8px;max-height:250px;overflow-y:auto;">
                        <div id="knowledge-panel-content"></div>
                        <div style="padding:6px;border-top:1px solid var(--border);"><button class="btn btn-sm" id="panel-new-knowledge-btn" style="width:100%;">+ 新建知识点</button></div>
                    </div>
                    <input type="hidden" id="knowledge-select" value="">
                    <input type="hidden" id="knowledge-id" value="">
                </div>
                <div id="queue-nav" style="display:none;align-items:center;gap:8px;margin-top:8px;">
                    <button class="btn btn-sm" id="prev-question-btn">◀ 上一题</button>
                    <span id="queue-info">0/0</span>
                    <button class="btn btn-sm" id="next-question-btn">下一题 ▶</button>
                </div>
                <div style="border-top:1px solid var(--border); padding-top:12px; margin-top:12px;">
                    <div style="font-size:13px; margin-bottom:6px;"><i class="fas fa-image"></i> 图片识别</div>
                    <div id="image-preview-list" style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px; min-height:40px;"></div>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <button class="btn btn-sm" id="select-image-btn"><i class="fas fa-paperclip"></i> 选择图片</button>
                        <input type="file" id="image-file-input" accept="image/*" style="display:none;" multiple>
                        <span style="font-size:12px; color:var(--text-secondary);">或粘贴/拖拽图片到题干框</span>
                        <button class="btn btn-sm btn-primary" id="start-ocr-btn" style="margin-left:auto;"><i class="fas fa-play"></i> 批量识别</button>
                    </div>
                </div>
            </div>
            <div class="preview-panel" style="width:380px;display:flex;flex-direction:column;">
                <div style="padding:12px;border-bottom:1px solid var(--border);font-weight:600;">实时预览</div>
                <div id="input-preview-content" style="flex:1;overflow-y:auto;padding:16px;">在左侧填写后预览</div>
                <div id="dedup-results" style="padding:8px;border-top:1px solid var(--border);font-size:13px;max-height:120px;overflow-y:auto;"></div>
            </div>
        </div>
    `;

    // ========== 选项卡切换（核心修改） ==========
    document.querySelectorAll('.entry-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            // 保存当前模式的知识点到对应变量
            const pickerText = document.getElementById('knowledge-picker-text')?.textContent || '';
            const kpId = document.getElementById('knowledge-id')?.value || '';
            if (currentEntryMode === 'question') {
                questionKnowledge = { id: kpId, text: pickerText };
            } else {
                kuKnowledge = { id: kpId, text: pickerText };
            }

            // 切换模式
            currentEntryMode = tab.dataset.mode;
            document.querySelectorAll('.entry-tab').forEach(t => {
                t.classList.remove('btn-primary', 'btn-outline');
                t.classList.add(t.dataset.mode === currentEntryMode ? 'btn-primary' : 'btn-outline');
            });

            // 重置题型和字段
            updateTypeSelectOptions();
            currentOptions = [''];
            currentSubQuestions = [];
            renderExtraFields();

            // 设置标题标签
            
            document.getElementById('stem-label').innerText = currentEntryMode === 'knowledge' ? '标题（支持 $LaTeX$）' : '题干（支持 $LaTeX$）';
            document.getElementById('analysis-label').innerText = currentEntryMode === 'knowledge' ? '内容' : '解析';
            
            initKnowledgePicker();

                // 恢复当前模式的知识点显示（必须在 initKnowledgePicker 之后执行，因为该函数会重建 DOM）
                const kp = currentEntryMode === 'question' ? questionKnowledge : kuKnowledge;
                document.getElementById('knowledge-picker-text').textContent = kp.text || '请选择知识点';
                document.getElementById('knowledge-id').value = kp.id || '';

            updatePreview();
        });
    });

    // 题型下拉框初始化
    updateTypeSelectOptions();

    // 符号面板
    document.getElementById('toggle-symbol-btn').addEventListener('click', () => {
        const p = document.getElementById('symbol-panel');
        p.style.display = p.style.display === 'none' ? 'block' : 'none';
    });
    document.querySelectorAll('#symbol-panel .sym-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            insertSymbolAtCursor(btn.dataset.code);
            document.getElementById('symbol-panel').style.display = 'none';
        });
    });

    // 题型切换
    document.getElementById('input-question-type').addEventListener('change', () => {
        const stem = document.getElementById('stem-input')?.value || '';
        const analysis = document.getElementById('analysis-input')?.value || '';
        const kp = document.getElementById('knowledge-picker-text')?.textContent || '';
        currentOptions = [''];
        currentSubQuestions = [];
        renderExtraFields();
        document.getElementById('stem-input').value = stem;
        document.getElementById('analysis-input').value = analysis;
        if (kp && kp !== '请选择知识点') document.getElementById('knowledge-picker-text').textContent = kp;
        updatePreview();
    });

    initKnowledgePicker();

    document.getElementById('input-fix-btn').addEventListener('click', async () => {
        const stem = document.getElementById('stem-input').value;
        if (!stem.trim()) return showToast('请先输入题目');
        try {
            const res = await apiFetch('/ocr/fix-latex', { method: 'POST', body: JSON.stringify({ latex: stem }) });
            document.getElementById('stem-input').value = res.latex;
            updatePreview();
            showToast('LaTeX已修复');
        } catch (e) { showToast('修复失败: ' + e.message); }
    });

    document.getElementById('ai-generate-answer-btn').addEventListener('click', async () => {
        if (currentEntryMode === 'knowledge') {
            showToast('知识单元无需生成答案');
            return;
        }
        const stem = document.getElementById('stem-input').value;
        if (!stem.trim()) return showToast('请先输入题干');
        try {
            const res = await apiFetch('/ocr/generate-answer', { method: 'POST', body: JSON.stringify({ content_latex: stem }) });
            if (res.answer) {
                const answer = res.answer.trim();
                const analysis = res.analysis ? res.analysis.trim() : '';
                const type = document.getElementById('input-question-type').value;
                if (type === '选择' || type === '判断') {
                    const sel = document.getElementById('answer-select');
                    if (sel) sel.value = answer;
                } else {
                    const inp = document.getElementById('answer-input');
                    if (inp) inp.value = answer;
                }
                document.getElementById('analysis-input').value = analysis;
                updatePreview();
                showToast('AI 答案/解析已生成');
            } else {
                showToast('生成失败：AI 未返回答案');
            }
        } catch (e) { showToast('生成失败: ' + e.message); }
    });

    document.getElementById('ai-tag-btn').addEventListener('click', async () => {
        const stem = document.getElementById('stem-input').value;
        if (!stem.trim()) return showToast('请先输入题干');
        try {
            const res = await apiFetch('/ocr/suggest-tags', { method: 'POST', body: JSON.stringify({ latex: stem }) });
            if (res.knowledge && res.knowledge !== '未知') {
                const knowledgeName = res.knowledge;
                const tree = await apiFetch('/knowledge-points/tree');
                let kpId = null;
                function findNode(nodes, name) {
                    for (const node of nodes) {
                        if (node.name === name) return node.id;
                        if (node.children) { const found = findNode(node.children, name); if (found) return found; }
                    }
                    return null;
                }
                kpId = findNode(tree, knowledgeName);
                if (!kpId) {
                    const newKp = await apiFetch('/knowledge-points/', { method:'POST', body: JSON.stringify({ name: knowledgeName, stage:'G', level_type:'point', parent_id:null }) });
                    kpId = newKp.id;
                }
                document.getElementById('knowledge-picker-text').textContent = knowledgeName;
                document.getElementById('knowledge-select').value = knowledgeName;
                document.getElementById('knowledge-id').value = kpId;
                showToast('AI 打标完成');
            } else {
                showToast('打标失败：未识别出知识点');
            }
        } catch (e) { showToast('打标失败: ' + e.message); }
    });

    document.getElementById('input-save-btn').addEventListener('click', saveQuestion);

    document.getElementById('stem-input').addEventListener('input', debounce(() => { updatePreview(); checkDuplicate(); }, 800));
    document.getElementById('analysis-input').addEventListener('input', updatePreview);

    document.addEventListener('focusin', (e) => {
        if (e.target.tagName === 'TEXTAREA' || (e.target.tagName === 'INPUT' && e.target.type === 'text')) {
            lastFocusedInput = e.target;
        }
    });

    // ========== 图片识别部分 ==========
    const fileInput = document.getElementById('image-file-input');
    const selectImageBtn = document.getElementById('select-image-btn');
    const startOcrBtn = document.getElementById('start-ocr-btn');
    const previewList = document.getElementById('image-preview-list');
    let imageFiles = [];

    selectImageBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        for (const file of e.target.files) {
            if (file.type.startsWith('image/')) {
                imageFiles.push(file);
                const div = document.createElement('div');
                div.style.cssText = 'position:relative; width:60px; height:60px; border-radius:6px; overflow:hidden; border:1px solid var(--border);';
                const img = document.createElement('img');
                img.src = URL.createObjectURL(file);
                img.style.cssText = 'width:100%; height:100%; object-fit:cover;';
                div.appendChild(img);
                const removeBtn = document.createElement('button');
                removeBtn.innerHTML = '×';
                removeBtn.style.cssText = 'position:absolute; top:2px; right:2px; border:none; background:rgba(0,0,0,0.5); color:#fff; border-radius:50%; width:20px; height:20px; font-size:12px; cursor:pointer;';
                removeBtn.onclick = () => {
                    imageFiles = imageFiles.filter(f => f !== file);
                    div.remove();
                };
                div.appendChild(removeBtn);
                previewList.appendChild(div);
            }
        }
        fileInput.value = '';
    });

    document.addEventListener('paste', (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                imageFiles.push(file);
                const div = document.createElement('div');
                div.style.cssText = 'position:relative; width:60px; height:60px; border-radius:6px; overflow:hidden; border:1px solid var(--border);';
                const img = document.createElement('img');
                img.src = URL.createObjectURL(file);
                img.style.cssText = 'width:100%; height:100%; object-fit:cover;';
                div.appendChild(img);
                previewList.appendChild(div);
                break;
            }
        }
    });

    container.addEventListener('dragover', (e) => e.preventDefault());
    container.addEventListener('drop', (e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (file.type.startsWith('image/')) {
                imageFiles.push(file);
                const div = document.createElement('div');
                div.style.cssText = 'position:relative; width:60px; height:60px; border-radius:6px; overflow:hidden; border:1px solid var(--border);';
                const img = document.createElement('img');
                img.src = URL.createObjectURL(file);
                img.style.cssText = 'width:100%; height:100%; object-fit:cover;';
                div.appendChild(img);
                previewList.appendChild(div);
            }
        }
    });

    startOcrBtn.addEventListener('click', async () => {
        if (imageFiles.length === 0) return showToast('请先添加图片');
        const mode = document.getElementById('ocr-mode-select').value;
        recognizedQueue = [];
        currentQueueIndex = -1;
        for (const file of imageFiles) {
            const formData = new FormData();
            formData.append('file', file);
            const token = localStorage.getItem('token');
            try {
                const res = await fetch(`${API_BASE}/ocr/recognize?mode=${mode}`, {
                    method: 'POST',
                    headers: token ? { 'Authorization': 'Bearer ' + token } : {},
                    body: formData
                });
                if (!res.ok) throw new Error(await res.text());
                const data = await res.json();
                let rawLatex = data.latex || '';
                if (rawLatex.length > 1000) rawLatex = rawLatex.substring(0, 1000);

                if (currentEntryMode === 'knowledge') {
                    recognizedQueue.push({
                        type: 'knowledge',
                        questionType: '定义',
                        stem: rawLatex,
                        analysis: '',
                        options: [],
                        subQuestions: [],
                        answer: '',
                        knowledgePoint: data.knowledge || '',
                        difficulty: data.difficulty || 3
                    });
                } else {
                    const detectedType = determineTypeFromOCR(rawLatex);
                    const stem = cleanStem(rawLatex);
                    const options = extractOptions(rawLatex);
                    const subs = extractSubQuestions(rawLatex);
                    const judgeAns = extractJudgeAnswer(rawLatex);
                    recognizedQueue.push({
                        type: 'question',
                        questionType: detectedType,
                        stem: stem,
                        options: options,
                        subQuestions: subs,
                        answer: detectedType === '判断' ? judgeAns : '',
                        analysis: '',
                        knowledgePoint: data.knowledge || '',
                        difficulty: data.difficulty || 3
                    });
                }
            } catch (e) {
                showToast('某张图片识别失败: ' + e.message);
            }
        }
        imageFiles = [];
        previewList.innerHTML = '';

        if (recognizedQueue.length > 0) {
            currentQueueIndex = 0;
            loadQuestionFromQueue(0);
            updateQueueNav();
        }
    });

    document.getElementById('prev-question-btn').addEventListener('click', () => {
        if (currentQueueIndex > 0) {
            currentQueueIndex--;
            loadQuestionFromQueue(currentQueueIndex);
            updateQueueNav();
        }
    });
    document.getElementById('next-question-btn').addEventListener('click', () => {
        if (currentQueueIndex < recognizedQueue.length - 1) {
            currentQueueIndex++;
            loadQuestionFromQueue(currentQueueIndex);
            updateQueueNav();
        }
    });

    renderExtraFields();
    updatePreview();
}

// ========== 队列加载与导航 ==========
function loadQuestionFromQueue(index) {
    const q = recognizedQueue[index];
    if (!q) return;
    if (q.type === 'knowledge') {
        currentEntryMode = 'knowledge';
        document.querySelectorAll('.entry-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.mode === 'knowledge');
            tab.classList.remove('btn-primary', 'btn-outline');
            tab.classList.add(tab.dataset.mode === currentEntryMode ? 'btn-primary' : 'btn-outline');
        });
        updateTypeSelectOptions();
        document.getElementById('input-question-type').value = q.questionType || '定义';
    } else {
        currentEntryMode = 'question';
        document.querySelectorAll('.entry-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.mode === 'question');
            tab.classList.remove('btn-primary', 'btn-outline');
            tab.classList.add(tab.dataset.mode === currentEntryMode ? 'btn-primary' : 'btn-outline');
        });
        updateTypeSelectOptions();
        document.getElementById('input-question-type').value = q.questionType || '选择';
    }

    currentOptions = q.options ? q.options.map(o => typeof o === 'string' ? o : (o.text || '')) : [''];
    currentSubQuestions = q.subQuestions || [];
    renderExtraFields();

    document.getElementById('stem-input').value = q.stem || '';
    if (currentEntryMode === 'question') {
        if (q.questionType === '选择') {
            setTimeout(() => {
                if (q.answer) {
                    const sel = document.getElementById('answer-select');
                    if (sel) sel.value = q.answer;
                }
            }, 50);
        } else if (q.questionType === '填空' || q.questionType === '简答') {
            document.getElementById('answer-input').value = q.answer || '';
        } else if (q.questionType === '判断') {
            const sel = document.getElementById('answer-select');
            if (sel) sel.value = q.answer || '';
        }
    }
    document.getElementById('analysis-input').value = q.analysis || '';
    if (q.knowledgePoint) {
        document.getElementById('knowledge-picker-text').textContent = q.knowledgePoint;
        document.getElementById('knowledge-select').value = q.knowledgePoint;
    }
    updatePreview();
}

function updateQueueNav() {
    const nav = document.getElementById('queue-nav');
    const info = document.getElementById('queue-info');
    if (nav && info) {
        if (recognizedQueue.length > 0) {
            nav.style.display = 'flex';
            info.textContent = `${currentQueueIndex + 1}/${recognizedQueue.length}`;
        } else {
            nav.style.display = 'none';
        }
    }
}

// ========== 辅助函数 ==========
function renderSymbolButtons() {
    const symbols = [
        '\\frac{}{}', '\\sqrt{}', '^{}', '_{}', '\\pm', '\\times', '\\div', '\\cdot',
        '\\sin', '\\cos', '\\tan', '\\log', '\\ln', '\\lim',
        '\\sum_{}^{}', '\\int_{}^{}', '\\infty', '\\alpha', '\\beta', '\\pi',
        '\\angle', '\\triangle', '\\perp', '\\parallel', '\\underline{\\hspace{2cm}}',
        '\\begin{cases}\\\\\\end{cases}'
    ];
    return symbols.map(s => `<button class="sym-btn" data-code="${s}" style="padding:4px 8px; border:1px solid var(--border); background:var(--surface); border-radius:4px; cursor:pointer;">${s}</button>`).join('');
}

function insertSymbolAtCursor(code) {
    const el = lastFocusedInput || document.getElementById('stem-input');
    if (!el) return;
    const start = el.selectionStart || 0;
    const end = el.selectionEnd || 0;
    const wrapped = code.includes('\\') && !code.startsWith('$') ? `$${code}$` : code;
    el.value = el.value.substring(0, start) + wrapped + el.value.substring(end);
    el.focus();
    el.setSelectionRange(start + wrapped.length, start + wrapped.length);
    el.dispatchEvent(new Event('input'));
}

function renderExtraFields() {
    const type = document.getElementById('input-question-type').value;
    const container = document.getElementById('extra-fields');
    const answerArea = document.getElementById('answer-area');
    container.innerHTML = '';
    answerArea.innerHTML = '';

    if (currentEntryMode === 'knowledge') return;

    if (type === '选择') {
        container.innerHTML = `<div id="options-list"></div><button class="btn btn-sm" id="add-option-btn">+ 添加选项</button>`;
        renderOptions();
        document.getElementById('add-option-btn').addEventListener('click', () => {
            if (currentOptions.length < MAX_OPTIONS) { currentOptions.push(''); renderOptions(); updatePreview(); }
        });
        answerArea.innerHTML = `<label>答案</label><select id="answer-select"><option value="">请选择</option>${'ABCDEFGHIJ'.split('').map(l => `<option>${l}</option>`).join('')}</select>`;
        document.getElementById('answer-select').addEventListener('change', updatePreview);
    } else if (type === '判断') {
        answerArea.innerHTML = `<label>答案</label><select id="answer-select"><option value="">请选择</option><option>正确</option><option>错误</option></select>`;
        document.getElementById('answer-select').addEventListener('change', updatePreview);
    } else if (type === '填空' || type === '简答') {
        answerArea.innerHTML = `<label>答案</label><textarea id="answer-input" rows="2" style="width:100%;"></textarea>`;
        document.getElementById('answer-input').addEventListener('input', updatePreview);
    } else if (type === '综合大题') {
        container.innerHTML = `<div id="sub-questions-list"></div><button class="btn btn-sm" id="add-sub-btn">+ 添加子题</button>`;
        renderSubQuestions();
        document.getElementById('add-sub-btn').addEventListener('click', () => {
            if (currentSubQuestions.length < MAX_SUB) {
                currentSubQuestions.push({stem:'', answer:'', analysis:''});
                renderSubQuestions();
                updatePreview();
            }
        });
        answerArea.innerHTML = '';
    }
}

function renderOptions() {
    const list = document.getElementById('options-list');
    if (!list) return;
    const labels = 'ABCDEFGHIJ';
    list.innerHTML = currentOptions.map((opt, i) => `
        <div style="display:flex;align-items:center;margin-bottom:4px;">
            <span style="min-width:24px;">${labels[i]}.</span>
            <input type="text" class="option-input" data-index="${i}" value="${escapeHtml(opt)}" style="flex:1;">
            <button class="btn btn-sm" data-del="${i}" style="margin-left:4px;">×</button>
        </div>
    `).join('');
    list.querySelectorAll('.option-input').forEach(inp => {
        inp.addEventListener('input', () => { currentOptions[parseInt(inp.dataset.index)] = inp.value; updatePreview(); });
    });
    list.querySelectorAll('[data-del]').forEach(btn => {
        btn.addEventListener('click', () => {
            if (currentOptions.length <= 1) return;
            currentOptions.splice(parseInt(btn.dataset.del), 1);
            renderOptions(); updatePreview();
        });
    });
}

function renderSubQuestions() {
    const list = document.getElementById('sub-questions-list');
    if (!list) return;
    list.innerHTML = currentSubQuestions.map((sub, i) => `
        <div style="border:1px solid var(--border);border-radius:8px;padding:8px;margin-bottom:8px;">
            <div style="font-weight:500;">(${i+1})</div>
            <textarea class="sub-stem" data-index="${i}" rows="2" style="width:100%;margin-bottom:4px;" placeholder="小题题干">${escapeHtml(sub.stem)}</textarea>
            <input class="sub-answer" data-index="${i}" style="width:100%;margin-bottom:4px;" placeholder="答案" value="${escapeHtml(sub.answer)}">
            <textarea class="sub-analysis" data-index="${i}" rows="2" style="width:100%;" placeholder="解析">${escapeHtml(sub.analysis)}</textarea>
            <button class="btn btn-sm" data-del="${i}">删除小题</button>
        </div>
    `).join('');
    list.querySelectorAll('.sub-stem,.sub-answer,.sub-analysis').forEach(el => {
        el.addEventListener('input', () => {
            const idx = parseInt(el.dataset.index);
            if (el.classList.contains('sub-stem')) currentSubQuestions[idx].stem = el.value;
            else if (el.classList.contains('sub-answer')) currentSubQuestions[idx].answer = el.value;
            else currentSubQuestions[idx].analysis = el.value;
            updatePreview();
        });
    });
    list.querySelectorAll('[data-del]').forEach(btn => {
        btn.addEventListener('click', () => {
            currentSubQuestions.splice(parseInt(btn.dataset.del), 1);
            renderSubQuestions(); updatePreview();
        });
    });
}

function updatePreview() {
    const preview = document.getElementById('input-preview-content');
    if (!preview) return;
    const type = document.getElementById('input-question-type').value;
    const stem = document.getElementById('stem-input')?.value || '';
    const analysis = document.getElementById('analysis-input')?.value || '';
    let html = '';

    if (currentEntryMode === 'knowledge') {
        html = `<div style="font-weight:500; color:var(--primary);">${escapeHtml(type)}</div>`;
        html += `<p><strong>标题：</strong> ${escapeHtml(stem)}</p>`;
        if (analysis) html += `<div style="white-space:pre-wrap;">${escapeHtml(analysis)}</div>`;
        const kp = document.getElementById('knowledge-picker-text')?.textContent;
        if (kp && kp !== '请选择知识点') html += `<p><strong>知识点：</strong> ${kp}</p>`;
        preview.innerHTML = html || '<div style="color:var(--text-secondary);">在左侧填写后预览</div>';
        if (window.renderMathInElement) {
            renderMathInElement(preview, { delimiters: [{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}] });
        }
        return;
    }

    if (stem) {
        let displayStem = stem.replace(/\$\\underline\{\\hspace\{([^}]+)\}\}\$/g, (match, width) => {
            return `<span style="display:inline-block;width:${width};border-bottom:1px solid #333;"></span>`;
        });
        html += `<p><strong>题干：</strong> ${displayStem}</p>`;
    }
    if (type === '选择') {
        const validOptions = currentOptions.filter(o => o.trim());
        if (validOptions.length > 0) {
            html += '<div style="margin-top:8px;">';
            validOptions.forEach((opt, i) => html += `<div><b>${'ABCDEFGHIJ'[i]}.</b> ${escapeHtml(opt)}</div>`);
            html += '</div>';
        }
        const ans = document.getElementById('answer-select')?.value;
        if (ans) html += `<p><strong>答案：</strong> ${ans}</p>`;
    } else if (type === '判断') {
        const ans = document.getElementById('answer-select')?.value;
        if (ans) html += `<p><strong>答案：</strong> ${ans}</p>`;
    } else if (type === '填空' || type === '简答') {
        const ans = document.getElementById('answer-input')?.value;
        if (ans) html += `<p><strong>答案：</strong> ${escapeHtml(ans)}</p>`;
    } else if (type === '综合大题') {
        currentSubQuestions.forEach((sub, i) => {
            if (sub.stem.trim()) html += `<p><b>(${i+1})</b> ${escapeHtml(sub.stem)}</p>`;
            if (sub.answer.trim()) html += `<p style="margin-left:16px;"><strong>答案：</strong> ${escapeHtml(sub.answer)}</p>`;
            if (sub.analysis.trim()) html += `<p style="margin-left:16px;"><strong>解析：</strong> ${escapeHtml(sub.analysis)}</p>`;
        });
    }
    if (analysis) html += `<p><strong>解析：</strong> ${escapeHtml(analysis)}</p>`;
    const kp = document.getElementById('knowledge-picker-text')?.textContent;
    if (kp && kp !== '请选择知识点') html += `<p><strong>知识点：</strong> ${kp}</p>`;

    preview.innerHTML = html || '<div style="color:var(--text-secondary);">在左侧填写后预览</div>';
    if (window.renderMathInElement) {
        renderMathInElement(preview, { delimiters: [{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}] });
    }
}

// ========== 查重 ==========
async function checkDuplicate() {
    const stem = document.getElementById('stem-input')?.value.trim();
    const dedupEl = document.getElementById('dedup-results');
    if (!stem || stem.length < 3 || !dedupEl) return;
    clearTimeout(dedupTimer);
    dedupTimer = setTimeout(async () => {
        try {
            const res = await apiFetch(`/questions/check-duplicate?content=${encodeURIComponent(stem)}`);
            if (res.similar_count > 0) {
                dedupEl.innerHTML = '<div style="color:var(--danger); margin-bottom:4px;">⚠️ 发现相似题目：</div>' +
                    res.similar_questions.map(q => `
                        <div style="padding:4px 8px; background:var(--bg); border-radius:4px; margin:2px 0; font-size:12px; display:flex; justify-content:space-between; align-items:center;">
                            <span>
                                <span style="font-family:monospace; color:var(--primary);">${escapeHtml(q.id)}</span>
                                ${escapeHtml(q.content?.substring(0,60))}
                                <span style="color:var(--text-secondary);"> (相似度: ${q.similarity}%)</span>
                            </span>
                            <div style="display:flex; gap:4px;">
                                <button class="btn btn-sm btn-outline adapt-btn" data-qid="${q.id}">📝 改编</button>
                                <button class="btn btn-sm btn-primary store-btn" data-qid="${q.id}">📥 入库</button>
                            </div>
                        </div>
                    `).join('');
                dedupEl.querySelectorAll('.adapt-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => { e.stopPropagation(); adaptFromQuestion(btn.dataset.qid); });
                });
                dedupEl.querySelectorAll('.store-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => { e.stopPropagation(); storeReplaceQuestion(btn.dataset.qid); });
                });
            } else {
                dedupEl.innerHTML = '<div style="color:var(--success); font-size:12px;">✅ 未发现相似题目</div>';
            }
        } catch(e) { console.error('查重失败:', e); }
    }, 1200);
}

// ========== 保存 ==========
async function saveQuestion() {
    const type = document.getElementById('input-question-type').value;
    const stem = document.getElementById('stem-input')?.value.trim();
    if (!stem) return showToast('请输入标题/题干');
    const kpText = document.getElementById('knowledge-picker-text')?.textContent || '';
    const kp = kpText === '请选择知识点' ? '' : kpText;
    const kpId = document.getElementById('knowledge-id')?.value;

    let body = {
        stage: 'G', category: '试卷', question_type: type,
        content_latex: stem, knowledge_point: kp, difficulty: 3
    };
    if (kpId) body.knowledge_point_id = parseInt(kpId);

    if (currentEntryMode === 'knowledge') {
        body.analysis_latex = document.getElementById('analysis-input')?.value || '';
    } else {
        if (type === '选择') {
            body.options_latex = JSON.stringify(currentOptions.filter(o => o.trim()));
            body.answer_latex = document.getElementById('answer-select')?.value || '';
        } else if (type === '判断') {
            body.answer_latex = document.getElementById('answer-select')?.value || '';
        } else if (type === '填空' || type === '简答') {
            body.answer_latex = document.getElementById('answer-input')?.value || '';
        } else if (type === '综合大题') {
            body.answer_latex = JSON.stringify(currentSubQuestions);
        }
        body.analysis_latex = document.getElementById('analysis-input')?.value || '';
    }

    try {
        const res = await apiFetch('/questions/', { method:'POST', body:JSON.stringify(body) });
        showToast(`保存成功！编号: ${res.id}`);
        document.getElementById('stem-input').value = '';
        document.getElementById('analysis-input').value = '';
        if (currentEntryMode === 'question') {
            if (type === '选择' || type === '判断') {
                const sel = document.getElementById('answer-select'); if (sel) sel.value = '';
            } else if (type === '填空' || type === '简答') {
                const inp = document.getElementById('answer-input'); if (inp) inp.value = '';
            } else if (type === '综合大题') {
                currentSubQuestions.forEach(s => { s.stem=''; s.answer=''; s.analysis=''; });
                renderSubQuestions();
            }
        }
        updatePreview();
        if (typeof loadKnowledgeTree === 'function') loadKnowledgeTree();
    } catch(e) { showToast('保存失败: '+e.message); }
}

// ========== 改编与入库 ==========
async function adaptFromQuestion(questionId) {
    try {
        const q = await apiFetch(`/questions/${questionId}`);
        const kuTypes = ['定义','定理','引理','推论','命题','公理','性质','注释','评注','结论'];
        if (kuTypes.includes(q.question_type)) {
            currentEntryMode = 'knowledge';
            document.querySelectorAll('.entry-tab').forEach(tab => {
                tab.classList.toggle('active', tab.dataset.mode === 'knowledge');
                tab.classList.remove('btn-primary', 'btn-outline');
                tab.classList.add(tab.dataset.mode === currentEntryMode ? 'btn-primary' : 'btn-outline');
            });
            updateTypeSelectOptions();
        } else {
            currentEntryMode = 'question';
            document.querySelectorAll('.entry-tab').forEach(tab => {
                tab.classList.toggle('active', tab.dataset.mode === 'question');
                tab.classList.remove('btn-primary', 'btn-outline');
                tab.classList.add(tab.dataset.mode === currentEntryMode ? 'btn-primary' : 'btn-outline');
            });
            updateTypeSelectOptions();
        }
        document.getElementById('input-question-type').value = q.question_type;
        document.getElementById('stem-input').value = q.content_latex;
        document.getElementById('analysis-input').value = q.analysis_latex || '';
        if (currentEntryMode === 'question') {
            if (q.question_type === '选择' && q.options_latex) {
                const opts = JSON.parse(q.options_latex); currentOptions = opts.length > 0 ? opts : [''];
            } else { currentOptions = ['']; }
            if (q.question_type === '综合大题' && q.answer_latex) {
                try { currentSubQuestions = JSON.parse(q.answer_latex); } catch(e) { currentSubQuestions = []; }
            } else { currentSubQuestions = []; }
            if (q.question_type === '选择' || q.question_type === '判断') {
                const ansSelect = document.getElementById('answer-select'); if (ansSelect) ansSelect.value = q.answer_latex || '';
            } else if (q.question_type === '填空' || q.question_type === '简答') {
                const ansInput = document.getElementById('answer-input'); if (ansInput) ansInput.value = q.answer_latex || '';
            }
        }
        const kpText = document.getElementById('knowledge-picker-text');
        if (kpText) kpText.textContent = q.knowledge_point || '请选择知识点';
        document.getElementById('knowledge-id').value = q.knowledge_point_id || '';
        renderExtraFields();
        updatePreview();
        showToast('已加载，修改后保存即可生成新题');
    } catch(e) { showToast('加载失败: ' + e.message); }
}

async function storeReplaceQuestion(oldQuestionId) {
    const type = document.getElementById('input-question-type').value;
    const stem = document.getElementById('stem-input')?.value.trim();
    if (!stem) return showToast('请先输入标题/题干');
    const kpId = document.getElementById('knowledge-id')?.value;
    const kpText = document.getElementById('knowledge-picker-text')?.textContent || '';
    const kp = kpText === '请选择知识点' ? '' : kpText;

    let body = {
        stage: 'G', category: '试卷', question_type: type,
        content_latex: stem, knowledge_point: kp, difficulty: 3
    };
    if (kpId) body.knowledge_point_id = parseInt(kpId);

    if (currentEntryMode === 'knowledge') {
        body.analysis_latex = document.getElementById('analysis-input')?.value || '';
    } else {
        if (type === '选择') {
            body.options_latex = JSON.stringify(currentOptions.filter(o => o.trim()));
            body.answer_latex = document.getElementById('answer-select')?.value || '';
        } else if (type === '判断') {
            body.answer_latex = document.getElementById('answer-select')?.value || '';
        } else if (type === '填空' || type === '简答') {
            body.answer_latex = document.getElementById('answer-input')?.value || '';
        } else if (type === '综合大题') {
            body.answer_latex = JSON.stringify(currentSubQuestions);
        }
        body.analysis_latex = document.getElementById('analysis-input')?.value || '';
    }

    try {
        const newQ = await apiFetch('/questions/', { method:'POST', body: JSON.stringify(body) });
        await apiFetch(`/questions/batch`, { method:'DELETE', body: JSON.stringify({ question_ids: [oldQuestionId] }) });
        showToast(`入库成功！新编号: ${newQ.id}，旧题已移入回收站`);
        document.getElementById('stem-input').value = '';
        document.getElementById('analysis-input').value = '';
        updatePreview();
        loadKnowledgeTree();
    } catch(e) { showToast('入库失败: ' + e.message); }
}

// ========== 知识点选择器 ==========
let kpPickerClickHandler = null;
let kpPanelClickHandler = null;

async function initKnowledgePicker() {
    const picker = document.getElementById('knowledge-picker');
    const panel = document.getElementById('knowledge-panel');
    const content = document.getElementById('knowledge-panel-content');
    if (!picker || !panel || !content) return;

    if (window._kpPickerClick) picker.removeEventListener('click', window._kpPickerClick);
    if (window._kpDocClick) document.removeEventListener('click', window._kpDocClick);

    async function loadData() {
        const type = currentEntryMode === 'knowledge'
            ? '定义,定理,引理,推论,命题,公理,性质,注释,评注,结论'
            : '选择,填空,判断,简答,综合大题,例题,练习,问题';
        return await apiFetch(`/knowledge-points/tree?question_type=${encodeURIComponent(type)}`);
    }

    function renderPanel(tree, parentId = null) {
        if (!content) return;
        let nodes = [];
        if (parentId === null) { nodes = tree || []; }
        else {
            const find = (list, id) => {
                for (const n of list) {
                    if (n.id === id) return n;
                    if (n.children) { const f = find(n.children, id); if (f) return f; }
                }
                return null;
            };
            const parent = find(tree, parentId);
            nodes = parent?.children || [];
        }
        let html = '';
        if (parentId === null) {
            html += `<div class="list-item" data-action="none" style="color:var(--text-secondary);"><i class="fas fa-times-circle"></i> 无（未分类）</div>`;
        } else {
            html += `<div class="list-item" data-action="back" style="color:var(--primary);"><i class="fas fa-arrow-left"></i> 返回上级</div>`;
        }
        nodes.forEach(n => {
            html += `<div class="list-item" data-id="${n.id}" data-name="${escapeHtml(n.name)}" data-has-children="${(n.children?.length||0)>0}">
                <span>${escapeHtml(n.name)} (${n.question_count||0})</span>
                ${(n.children?.length||0)>0 ? '<i class="fas fa-chevron-right" style="float:right;"></i>' : ''}
            </div>`;
        });
        content.innerHTML = html;
        content.querySelectorAll('.list-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = item.dataset.action;
                if (action === 'back') { renderPanel(tree, null); }
                else if (action === 'none') {
                    document.getElementById('knowledge-picker-text').textContent = '无（未分类）';
                    document.getElementById('knowledge-id').value = '';
                    panel.style.display = 'none';
                    updatePreview();
                } else {
                    const id = parseInt(item.dataset.id);
                    const name = item.dataset.name;
                    const hasChildren = item.dataset.hasChildren === 'true';
                    if (hasChildren) { renderPanel(tree, id); }
                    else {
                        document.getElementById('knowledge-picker-text').textContent = name;
                        document.getElementById('knowledge-id').value = id;
                        panel.style.display = 'none';
                        updatePreview();
                        if (currentEntryMode === 'question') {
                            questionKnowledge = { id: String(id), text: name };
                        } else {
                            kuKnowledge = { id: String(id), text: name };
                        }
                    }
                }
            });
        });
    }

    window._kpPickerClick = async () => {
        if (panel.style.display === 'none' || !panel.style.display) {
            panel.style.display = 'block';
            const tree = await loadData();
            renderPanel(tree, null);
        } else {
            panel.style.display = 'none';
        }
    };
    picker.addEventListener('click', window._kpPickerClick);

    // 新建知识点按钮（按当前模式刷新）
    const newBtn = document.getElementById('panel-new-knowledge-btn');
    if (newBtn) {
        const clone = newBtn.cloneNode(true);
        newBtn.parentNode.replaceChild(clone, newBtn);
        clone.addEventListener('click', async (e) => {
            e.stopPropagation();
            const name = await modalPrompt('新建知识点', '请输入知识点名称：');
            if (!name) return;
            try {
                await apiFetch('/knowledge-points/', { method:'POST', body: JSON.stringify({ name, stage:'G', level_type:'point', parent_id:null }) });
                showToast('知识点已创建');
                window.dispatchEvent(new CustomEvent('knowledge-points-updated'));
                const tree = await loadData();
                renderPanel(tree, null);
            } catch (e) { showToast('创建失败'); }
        });
    }

    window._kpDocClick = (e) => {
        if (!picker.contains(e.target) && !panel.contains(e.target)) {
            panel.style.display = 'none';
        }
    };
    document.addEventListener('click', window._kpDocClick);
}



// 处理查重结果中的“组入”点击
async function handleDedupAddToPaper(questionId) {
    // 获取用户所有组卷
    const papers = await apiFetch('/papers/');
    if (!papers.length) {
        showToast('没有可用的组卷，请先创建组卷');
        return;
    }
    let optionsHtml = papers.map(p => `<option value="${p.id}">${escapeHtml(p.title)} (${p.paper_type})</option>`).join('');
    const formHtml = `
        <div class="form-group"><label>选择目标组卷</label><select id="target-paper" style="width:100%;">${optionsHtml}</select></div>
        <div class="form-group"><label>分值</label><input id="target-score" type="number" value="10" min="0.5" max="100" step="0.5" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;"></div>
    `;
    await showModal('组入到组卷', {
        type: 'form',
        html: formHtml,
        onConfirm: async (overlay) => {
            const paperId = document.getElementById('target-paper').value;
            const score = parseFloat(document.getElementById('target-score').value);
            if (isNaN(score) || score < 0.5 || score > 100) {
                showToast('无效分值');
                return false;
            }
            try {
                await apiFetch(`/papers/${paperId}/questions`, {
                    method:'POST',
                    body: JSON.stringify({ question_id: questionId, score: score, sort_order: 999 })
                });
                showToast('题目已加入组卷');
            } catch(e) {
                showToast('组入失败: ' + e.message);
            }
        }
    });
}