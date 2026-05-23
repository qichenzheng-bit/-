// PDF 工作区：加载 PDF 页面图片，识别当前页，逐题编辑并入库
let pdfFile = null;
let pdfCurrentPage = 1;
let pdfTotalPages = 1;
let pdfZoom = 100;
let pdfRecognizedQueue = [];
let currentPdfIndex = -1;

async function openPDFWorkspace(file) {
    pdfFile = file;
    // 使用 PDF.js 获取页数
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    pdfTotalPages = pdf.numPages;
    pdfCurrentPage = 1;
    pdfZoom = 100;
    pdfRecognizedQueue = [];
    currentPdfIndex = -1;
    renderPDFWorkspace();
}

function renderPDFWorkspace() {
    const panel = document.getElementById('work-panel');
    panel.innerHTML = `
        <div style="display:flex;flex-direction:column;height:100%;">
            <div style="padding:8px;background:var(--surface);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px;">
                <strong>📄 PDF 识别</strong>
                <button class="btn btn-primary btn-sm" id="pdf-recognize-btn"><i class="fas fa-play"></i> 识别当前页</button>
                <span style="font-size:12px;color:var(--text-secondary);margin-left:auto;">点击识别整页题目</span>
            </div>
            <div class="two-columns" style="display:flex;flex:1;overflow:hidden;">
                <div style="flex:1;display:flex;flex-direction:column;background:#eee;">
                    <div style="padding:8px;background:var(--surface);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;">
                        <button class="btn btn-sm" id="pdf-prev-page">◀</button>
                        <span id="pdf-page-info">${pdfCurrentPage}/${pdfTotalPages}</span>
                        <button class="btn btn-sm" id="pdf-next-page">▶</button>
                        <span id="pdf-loading" style="font-size:12px;display:none;">加载中...</span>
                    </div>
                    <div style="flex:1;overflow:auto;display:flex;justify-content:center;padding:12px;">
                        <img id="pdf-page-image" src="" style="max-width:100%;height:auto;" />
                    </div>
                    <div style="padding:4px 8px;background:var(--surface);border-top:1px solid var(--border);display:flex;align-items:center;gap:6px;">
                        <button class="btn btn-sm" id="pdf-zoom-out">−</button>
                        <input type="range" id="pdf-zoom-slider" min="50" max="300" value="100" step="10" style="flex:1;">
                        <span id="pdf-zoom-label">100%</span>
                        <button class="btn btn-sm" id="pdf-zoom-in">+</button>
                    </div>
                </div>
                <div style="flex:1;display:flex;flex-direction:column;background:var(--surface);" id="pdf-form-wrapper">
                    <p style="padding:12px;color:var(--text-secondary);">识别结果将显示在此处</p>
                </div>
            </div>
            <div id="pdf-queue-nav" style="display:none;padding:4px 16px;background:var(--surface);border-top:1px solid var(--border);align-items:center;gap:8px;">
                <button class="btn btn-sm" id="pdf-prev-question">◀ 上一题</button>
                <span id="pdf-queue-info" style="font-size:12px;">0/0</span>
                <button class="btn btn-sm" id="pdf-next-question">下一题 ▶</button>
            </div>
        </div>
    `;

    loadPDFPageImage(pdfCurrentPage);
    bindPDFEvents();
}

async function loadPDFPageImage(pageNum) {
    const img = document.getElementById('pdf-page-image');
    const loading = document.getElementById('pdf-loading');
    if (!img || !pdfFile) return;
    loading.style.display = 'inline';
    const formData = new FormData();
    formData.append('file', pdfFile);
    formData.append('page', pageNum);
    formData.append('dpi', Math.round(200 * (pdfZoom / 100)));
    try {
        const res = await fetch(API_BASE + '/ocr/pdf-page-image', { method: 'POST', body: formData });
        if (!res.ok) throw new Error(await res.text());
        const blob = await res.blob();
        img.src = URL.createObjectURL(blob);
        document.getElementById('pdf-page-info').textContent = `${pageNum}/${pdfTotalPages}`;
    } catch (e) {
        console.error(e);
        showToast('PDF 页面加载失败');
    } finally {
        loading.style.display = 'none';
    }
}

function bindPDFEvents() {
    let pageChanging = false;
    const goToPage = async (newPage) => {
        if (pageChanging || newPage < 1 || newPage > pdfTotalPages) return;
        pageChanging = true;
        pdfCurrentPage = newPage;
        await loadPDFPageImage(pdfCurrentPage);
        pageChanging = false;
    };

    document.getElementById('pdf-prev-page').onclick = () => goToPage(pdfCurrentPage - 1);
    document.getElementById('pdf-next-page').onclick = () => goToPage(pdfCurrentPage + 1);

    // 缩放
    const zoomSlider = document.getElementById('pdf-zoom-slider');
    const zoomLabel = document.getElementById('pdf-zoom-label');
    document.getElementById('pdf-zoom-in').onclick = () => {
        pdfZoom = Math.min(300, pdfZoom + 25);
        zoomSlider.value = pdfZoom;
        zoomLabel.textContent = pdfZoom + '%';
        loadPDFPageImage(pdfCurrentPage);
    };
    document.getElementById('pdf-zoom-out').onclick = () => {
        pdfZoom = Math.max(50, pdfZoom - 25);
        zoomSlider.value = pdfZoom;
        zoomLabel.textContent = pdfZoom + '%';
        loadPDFPageImage(pdfCurrentPage);
    };
    zoomSlider.oninput = () => { pdfZoom = parseInt(zoomSlider.value); zoomLabel.textContent = pdfZoom + '%'; };
    zoomSlider.onchange = () => loadPDFPageImage(pdfCurrentPage);

    // 识别当前页按钮
    document.getElementById('pdf-recognize-btn').onclick = async () => {
        if (!pdfFile) return;
        const btn = document.getElementById('pdf-recognize-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 识别中...';
        try {
            const formData = new FormData();
            formData.append('file', pdfFile);
            formData.append('page', pdfCurrentPage);
            // 调用整页识别接口
            const res = await fetch(API_BASE + '/ocr/recognize-pdf-page?mode=ai', { method: 'POST', body: formData });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            const latex = data.latex || '';
            // 智能分题
            const splitRes = await apiFetch('/ocr/split-text', { method: 'POST', body: JSON.stringify({ text: latex }) });
            const blocks = splitRes.questions || [];
            // 将每个块转换为题目数据加入队列
            pdfRecognizedQueue = blocks.map(block => {
                const raw = block.raw_text || block.latex || '';
                const detectedType = determineTypeFromOCR(raw);
                const q = { type: detectedType, stem: '', options: [], answer: '', analysis: '', subQuestions: [] };
                const lines = raw.split('\n').filter(l => l.trim());
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
                return q;
            });
            if (pdfRecognizedQueue.length > 0) {
                currentPdfIndex = 0;
                displayPdfQuestion(currentPdfIndex);
                updatePdfQueueNav();
            } else {
                document.getElementById('pdf-form-wrapper').innerHTML = '<p style="padding:12px;">未识别到题目</p>';
            }
        } catch (err) {
            showToast('识别失败: ' + err.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-play"></i> 识别当前页';
        }
    };

    // 题目导航
    document.getElementById('pdf-prev-question')?.addEventListener('click', () => {
        if (currentPdfIndex > 0) {
            currentPdfIndex--;
            displayPdfQuestion(currentPdfIndex);
            updatePdfQueueNav();
        }
    });
    document.getElementById('pdf-next-question')?.addEventListener('click', () => {
        if (currentPdfIndex < pdfRecognizedQueue.length - 1) {
            currentPdfIndex++;
            displayPdfQuestion(currentPdfIndex);
            updatePdfQueueNav();
        }
    });
}

function displayPdfQuestion(index) {
    const wrapper = document.getElementById('pdf-form-wrapper');
    const q = pdfRecognizedQueue[index];
    wrapper.innerHTML = `
        <div style="padding:12px;">
            <div class="form-group"><label>题型</label>
                <select id="pdf-question-type">
                    <option value="选择" ${q.type==='选择'?'selected':''}>选择题</option>
                    <option value="填空" ${q.type==='填空'?'selected':''}>填空题</option>
                    <option value="判断" ${q.type==='判断'?'selected':''}>判断题</option>
                    <option value="简答" ${q.type==='简答'?'selected':''}>简答题</option>
                    <option value="综合大题" ${q.type==='综合大题'?'selected':''}>综合大题</option>
                </select>
            </div>
            <div class="form-group"><label>题干</label><textarea id="pdf-stem" rows="4" style="width:100%;">${escapeHtml(q.stem)}</textarea></div>
            <div id="pdf-extra"></div>
            <div class="form-group"><label>答案</label><textarea id="pdf-answer" rows="2" style="width:100%;">${escapeHtml(q.answer || '')}</textarea></div>
            <div class="form-group"><label>解析</label><textarea id="pdf-analysis" rows="2" style="width:100%;">${escapeHtml(q.analysis || '')}</textarea></div>
            <button class="btn btn-primary" id="pdf-save-btn" style="width:100%;margin-top:8px;">保存到题库</button>
        </div>
    `;
    // 动态渲染选项或子题
    if (q.type === '选择') {
        document.getElementById('pdf-extra').innerHTML = (q.options || ['','','','']).map((opt, i) => `
            <div style="display:flex;align-items:center;margin-bottom:4px;">
                <span style="min-width:24px;">${'ABCD'[i]}.</span>
                <input type="text" class="pdf-option" data-index="${i}" value="${escapeHtml(opt)}" style="flex:1;">
            </div>
        `).join('');
    } else if (q.type === '综合大题') {
        document.getElementById('pdf-extra').innerHTML = (q.subQuestions || []).map((sub, i) => `
            <div style="border:1px solid var(--border);padding:8px;margin-bottom:8px;">
                <div>(${i+1})</div>
                <textarea class="pdf-sub-stem" data-index="${i}" rows="2" style="width:100%;">${escapeHtml(sub.stem||'')}</textarea>
                <input class="pdf-sub-answer" data-index="${i}" style="width:100%;" placeholder="答案" value="${escapeHtml(sub.answer||'')}">
                <textarea class="pdf-sub-analysis" data-index="${i}" rows="2" style="width:100%;" placeholder="解析">${escapeHtml(sub.analysis||'')}</textarea>
            </div>
        `).join('');
    }

    // 保存按钮事件
    document.getElementById('pdf-save-btn').onclick = async () => {
        const type = document.getElementById('pdf-question-type').value;
        const stem = document.getElementById('pdf-stem').value.trim();
        if (!stem) return showToast('题干不能为空');
        let body = {
            stage: 'G', category: '试卷', question_type: type,
            content_latex: stem, knowledge_point: '', difficulty: 3
        };
        if (type === '选择') {
            const opts = [];
            document.querySelectorAll('.pdf-option').forEach(inp => opts.push(inp.value));
            body.options_latex = JSON.stringify(opts.filter(o => o.trim()));
            body.answer_latex = document.getElementById('pdf-answer')?.value || '';
        } else if (type === '判断') {
            body.answer_latex = document.getElementById('pdf-answer')?.value || '';
        } else if (type === '填空' || type === '简答') {
            body.answer_latex = document.getElementById('pdf-answer')?.value || '';
        } else if (type === '综合大题') {
            const subs = [];
            document.querySelectorAll('.pdf-sub-stem').forEach((el, i) => {
                if (!subs[i]) subs[i] = {};
                subs[i].stem = el.value;
            });
            document.querySelectorAll('.pdf-sub-answer').forEach((el, i) => {
                if (!subs[i]) subs[i] = {};
                subs[i].answer = el.value;
            });
            document.querySelectorAll('.pdf-sub-analysis').forEach((el, i) => {
                if (!subs[i]) subs[i] = {};
                subs[i].analysis = el.value;
            });
            body.answer_latex = JSON.stringify(subs);
        }
        body.analysis_latex = document.getElementById('pdf-analysis')?.value || '';

        try {
            const res = await apiFetch('/questions/', { method: 'POST', body: JSON.stringify(body) });
            showToast('题目已保存: ' + res.id);
            // 从队列中移除已保存的题目
            pdfRecognizedQueue.splice(index, 1);
            if (pdfRecognizedQueue.length > 0) {
                currentPdfIndex = Math.min(currentPdfIndex, pdfRecognizedQueue.length - 1);
                displayPdfQuestion(currentPdfIndex);
                updatePdfQueueNav();
            } else {
                document.getElementById('pdf-form-wrapper').innerHTML = '<p style="padding:12px;color:var(--success);">所有题目已保存</p>';
                document.getElementById('pdf-queue-nav').style.display = 'none';
            }
        } catch (e) { showToast('保存失败: ' + e.message); }
    };
}

function updatePdfQueueNav() {
    const nav = document.getElementById('pdf-queue-nav');
    const info = document.getElementById('pdf-queue-info');
    if (nav && info) {
        if (pdfRecognizedQueue.length > 0) {
            nav.style.display = 'flex';
            info.textContent = `${currentPdfIndex + 1}/${pdfRecognizedQueue.length}`;
        } else {
            nav.style.display = 'none';
        }
    }
}