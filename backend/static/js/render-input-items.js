// 渲染选项列表
function renderOptions() {
    // ========== 新增：清洗所有选项的前缀 ==========
    for (let i = 0; i < currentOptions.length; i++) {
        if (currentOptions[i]) {
            currentOptions[i] = currentOptions[i].replace(/^\s*[A-Z]\s*\.\s*/, '');
        }
    }
    // =============================================

    const list = document.getElementById('options-list');
    if (!list) return;
    const labels = 'ABCDEFGHIJ';
    let html = '';
    currentOptions.forEach((opt, i) => {
        html += `<div style="display:flex; align-items:center; margin-bottom:4px;">
            <span style="min-width:24px;">${labels[i]}.</span>
            <input type="text" class="option-input" data-index="${i}" value="${escapeHtml(opt)}" style="flex:1; padding:4px 8px;" placeholder="选项内容">
            <button class="btn btn-danger" data-del-option="${i}" style="margin-left:4px;">×</button>
        </div>`;
    });
    list.innerHTML = html;

    list.querySelectorAll('.option-input').forEach(inp => {
        inp.addEventListener('input', (e) => {
            const idx = parseInt(e.target.dataset.index);
            let val = e.target.value;
            // 用户输入时也清洗
            val = val.replace(/^\s*[A-Z]\s*\.\s*/, '');
            currentOptions[idx] = val;
            updatePreviewFromForm();
        });
    });
    list.querySelectorAll('[data-del-option]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (currentOptions.length <= 1) return;
            const idx = parseInt(e.target.dataset.delOption);
            currentOptions.splice(idx, 1);
            renderOptions();
            updatePreviewFromForm();
        });
    });
}

// 渲染子题列表
function renderSubQuestions() {
    const list = document.getElementById('sub-questions-list');
    if (!list) return;
    let html = '';
    currentSubQuestions.forEach((sub, i) => {
        html += `<div style="border:1px solid #ddd; padding:8px; margin-bottom:8px; border-radius:6px;">
            <div style="font-weight:500; margin-bottom:4px;">(${i+1})</div>
            <textarea class="sub-stem" data-index="${i}" rows="2" style="width:100%; margin-bottom:4px;" placeholder="小题题干">${escapeHtml(sub.stem)}</textarea>
            <input type="text" class="sub-answer" data-index="${i}" style="width:100%; margin-bottom:4px;" placeholder="答案" value="${escapeHtml(sub.answer)}">
            <textarea class="sub-analysis" data-index="${i}" rows="2" style="width:100%;" placeholder="解析（可选）">${escapeHtml(sub.analysis)}</textarea>
            <button class="btn btn-danger" data-del-sub="${i}" style="margin-top:4px;">删除小题</button>
        </div>`;
    });
    list.innerHTML = html;

    list.querySelectorAll('.sub-stem, .sub-answer, .sub-analysis').forEach(el => {
        el.addEventListener('input', () => {
            const idx = parseInt(el.dataset.index);
            if (el.classList.contains('sub-stem')) currentSubQuestions[idx].stem = el.value;
            else if (el.classList.contains('sub-answer')) currentSubQuestions[idx].answer = el.value;
            else currentSubQuestions[idx].analysis = el.value;
            updatePreviewFromForm();
        });
    });
    list.querySelectorAll('[data-del-sub]').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.delSub);
            currentSubQuestions.splice(idx, 1);
            renderSubQuestions();
            updatePreviewFromForm();
        });
    });
}