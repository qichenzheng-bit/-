// Word 工作区：提取段落，识别选中段落，逐题编辑入库
let wordFile = null;
let wordParagraphs = [];
let wordRecognizedQueue = [];
let currentWordIndex = -1;
let wordSelectedIndices = [];

async function openWordWorkspace(file) {
    wordFile = file;
    wordRecognizedQueue = [];
    currentWordIndex = -1;
    wordSelectedIndices = [];
    try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(API_BASE + '/ocr/recognize-word-batch?mode=direct', { method: 'POST', body: formData });
        const data = await res.json();
        wordParagraphs = (data.questions || []).map((q, i) => ({ index: i, text: q.latex || '' }));
        if (wordParagraphs.length === 0) {
            showToast('未提取到文本段落');
            return;
        }
        renderWordWorkspace();
    } catch (e) {
        showToast('Word 解析失败: ' + e.message);
    }
}

function renderWordWorkspace() {
    const panel = document.getElementById('work-panel');
    panel.innerHTML = `
        <div style="display:flex;flex-direction:column;height:100%;">
            <div style="padding:8px;background:var(--surface);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px;">
                <strong>📝 Word 识别</strong>
                <button class="btn btn-primary btn-sm" id="word-recognize-btn"><i class="fas fa-play"></i> 识别选中段落</button>
                <span style="font-size:12px;color:var(--text-secondary);">点击段落选中，然后识别</span>
            </div>
            <div class="two-columns" style="display:flex;flex:1;overflow:hidden;">
                <div style="flex:1;overflow-y:auto;padding:8px;background:var(--bg);" id="word-paragraphs-list">
                    ${wordParagraphs.map(p => `
                        <div class="word-para" data-index="${p.index}" style="padding:8px;margin-bottom:4px;background:var(--surface);border:1px solid var(--border);border-radius:6px;cursor:pointer;">
                            <span style="color:var(--primary);">[${p.index + 1}]</span> ${escapeHtml(p.text.substring(0, 150))}${p.text.length > 150 ? '...' : ''}
                        </div>
                    `).join('')}
                </div>
                <div style="flex:1;overflow-y:auto;padding:12px;background:var(--surface);" id="word-form-wrapper">
                    <p style="color:var(--text-secondary);">识别结果将显示在此处</p>
                </div>
                <div class="preview-panel" style="width:300px;display:flex;flex-direction:column;">
                    <div style="padding:8px;border-bottom:1px solid var(--border);">实时预览</div>
                    <div id="word-preview-content" style="flex:1;overflow-y:auto;padding:12px;"></div>
                </div>
            </div>
            <div id="word-queue-nav" style="display:none;padding:4px 16px;background:var(--surface);border-top:1px solid var(--border);align-items:center;gap:8px;">
                <button class="btn btn-sm" id="word-prev-question">◀ 上一题</button>
                <span id="word-queue-info" style="font-size:12px;">0/0</span>
                <button class="btn btn-sm" id="word-next-question">下一题 ▶</button>
            </div>
        </div>
    `;

    // 段落点击选中/取消
    document.querySelectorAll('.word-para').forEach(el => {
        el.addEventListener('click', () => {
            const idx = parseInt(el.dataset.index);
            if (wordSelectedIndices.includes(idx)) {
                wordSelectedIndices = wordSelectedIndices.filter(i => i !== idx);
                el.style.background = 'var(--surface)';
            } else {
                wordSelectedIndices.push(idx);
                el.style.background = 'var(--primary-light)';
            }
        });
    });

    // 识别按钮
    document.getElementById('word-recognize-btn').addEventListener('click', async () => {
        if (wordSelectedIndices.length === 0) {
            showToast('请先选中要识别的段落');
            return;
        }
        const btn = document.getElementById('word-recognize-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 识别中...';
        wordRecognizedQueue = [];
        currentWordIndex = -1;
        for (const idx of wordSelectedIndices) {
            const rawText = wordParagraphs[idx].text;
            try {
                const res = await apiFetch('/ocr/fix-latex', { method: 'POST', body: JSON.stringify({ latex: rawText }) });
                const latex = res.latex || rawText;
                const detectedType = determineTypeFromOCR(latex);
                const q = { type: detectedType, stem: '', options: [], answer: '', analysis: '', subQuestions: [] };
                const lines = latex.split('\n').filter(l => l.trim());
                if (lines.length > 0) q.stem = lines[0];
                if (detectedType === '选择') {
                    for (let i = 1; i < lines.length; i++) {
                        const match = lines[i].match(/^\s*([A-D])\s*\.\s+(.*)/);
                        if (match) q.options.push(match[2].trim());
                    }
                } else if (detectedType === '综合大题') {
                    for (let i = 1; i < lines.length; i++) {
                        const match = lines[i].match(/^\s*\((\d+)\)\s+(.*)/);
                        if (match) q.subQuestions.push({ stem: match[2].trim(), answer: '', analysis: '' });
                    }
                }
                wordRecognizedQueue.push(q);
            } catch (e) {
                console.error('段落识别失败', e);
            }
        }
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-play"></i> 识别选中段落';
        if (wordRecognizedQueue.length > 0) {
            currentWordIndex = 0;
            displayWordQuestion(0);
            updateWordQueueNav();
        } else {
            showToast('识别失败');
        }
    });

    // 导航
    document.getElementById('word-prev-question')?.addEventListener('click', () => {
        if (currentWordIndex > 0) { currentWordIndex--; displayWordQuestion(currentWordIndex); updateWordQueueNav(); }
    });
    document.getElementById('word-next-question')?.addEventListener('click', () => {
        if (currentWordIndex < wordRecognizedQueue.length - 1) { currentWordIndex++; displayWordQuestion(currentWordIndex); updateWordQueueNav(); }
    });
}

function displayWordQuestion(index) {
    const wrapper = document.getElementById('word-form-wrapper');
    const q = wordRecognizedQueue[index];
    wrapper.innerHTML = `
        <div class="form-group"><label>题型</label>
            <select id="word-question-type">
                <option value="选择" ${q.type==='选择'?'selected':''}>选择题</option>
                <option value="填空" ${q.type==='填空'?'selected':''}>填空题</option>
                <option value="判断" ${q.type==='判断'?'selected':''}>判断题</option>
                <option value="简答" ${q.type==='简答'?'selected':''}>简答题</option>
                <option value="综合大题" ${q.type==='综合大题'?'selected':''}>综合大题</option>
            </select>
        </div>
        <div class="form-group"><label>题干</label><textarea id="word-stem" rows="4" style="width:100%;">${escapeHtml(q.stem)}</textarea></div>
        <div id="word-extra"></div>
        <div class="form-group"><label>答案</label><textarea id="word-answer" rows="2" style="width:100%;">${escapeHtml(q.answer || '')}</textarea></div>
        <div class="form-group"><label>解析</label><textarea id="word-analysis" rows="2" style="width:100%;">${escapeHtml(q.analysis || '')}</textarea></div>
        <button class="btn btn-primary" id="word-save-btn" style="width:100%;margin-top:8px;">保存到题库</button>
    `;
    if (q.type === '选择') {
        document.getElementById('word-extra').innerHTML = (q.options || ['','','','']).map((opt, i) => `
            <div style="display:flex;align-items:center;margin-bottom:4px;">
                <span>${'ABCD'[i]}.</span>
                <input type="text" class="word-option" data-index="${i}" value="${escapeHtml(opt)}" style="flex:1;">
            </div>
        `).join('');
    } else if (q.type === '综合大题') {
        document.getElementById('word-extra').innerHTML = (q.subQuestions || []).map((sub, i) => `
            <div style="border:1px solid var(--border);padding:8px;margin-bottom:8px;">
                <div>(${i+1})</div>
                <textarea class="word-sub-stem" data-index="${i}" rows="2" style="width:100%;">${escapeHtml(sub.stem||'')}</textarea>
                <input class="word-sub-answer" data-index="${i}" style="width:100%;" placeholder="答案" value="${escapeHtml(sub.answer||'')}">
                <textarea class="word-sub-analysis" data-index="${i}" rows="2" style="width:100%;" placeholder="解析">${escapeHtml(sub.analysis||'')}</textarea>
            </div>
        `).join('');
    }

    document.getElementById('word-save-btn').onclick = async () => {
        const type = document.getElementById('word-question-type').value;
        const stem = document.getElementById('word-stem').value.trim();
        if (!stem) return showToast('题干不能为空');
        let body = { stage: 'G', category: '试卷', question_type: type, content_latex: stem, knowledge_point: '', difficulty: 3 };
        if (type === '选择') {
            const opts = []; document.querySelectorAll('.word-option').forEach(inp => opts.push(inp.value));
            body.options_latex = JSON.stringify(opts.filter(o => o.trim()));
            body.answer_latex = document.getElementById('word-answer')?.value || '';
        } else if (type === '判断') {
            body.answer_latex = document.getElementById('word-answer')?.value || '';
        } else if (type === '填空' || type === '简答') {
            body.answer_latex = document.getElementById('word-answer')?.value || '';
        } else if (type === '综合大题') {
            const subs = [];
            document.querySelectorAll('.word-sub-stem').forEach((el, i) => { if(!subs[i]) subs[i]={}; subs[i].stem = el.value; });
            document.querySelectorAll('.word-sub-answer').forEach((el, i) => { if(!subs[i]) subs[i]={}; subs[i].answer = el.value; });
            document.querySelectorAll('.word-sub-analysis').forEach((el, i) => { if(!subs[i]) subs[i]={}; subs[i].analysis = el.value; });
            body.answer_latex = JSON.stringify(subs);
        }
        body.analysis_latex = document.getElementById('word-analysis')?.value || '';
        try {
            const res = await apiFetch('/questions/', { method: 'POST', body: JSON.stringify(body) });
            showToast('已保存: ' + res.id);
            wordRecognizedQueue.splice(index, 1);
            if (wordRecognizedQueue.length > 0) {
                currentWordIndex = Math.min(currentWordIndex, wordRecognizedQueue.length - 1);
                displayWordQuestion(currentWordIndex);
                updateWordQueueNav();
            } else {
                document.getElementById('word-form-wrapper').innerHTML = '<p style="padding:12px;color:var(--success);">全部保存完毕</p>';
                document.getElementById('word-queue-nav').style.display = 'none';
            }
        } catch (e) { showToast('保存失败: ' + e.message); }
    };
}

function updateWordQueueNav() {
    const nav = document.getElementById('word-queue-nav');
    const info = document.getElementById('word-queue-info');
    if (nav && info) {
        if (wordRecognizedQueue.length > 0) {
            nav.style.display = 'flex';
            info.textContent = `${currentWordIndex + 1}/${wordRecognizedQueue.length}`;
        } else {
            nav.style.display = 'none';
        }
    }
}