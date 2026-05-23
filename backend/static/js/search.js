let searchModalEl = null;

function openSearch() {
    if (!searchModalEl) {
        searchModalEl = document.createElement('div');
        searchModalEl.id = 'search-modal';
        searchModalEl.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.4);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding-top:80px;';
        searchModalEl.innerHTML = `
            <div style="background:var(--surface);border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.3);width:600px;overflow:hidden;">
                <div style="display:flex;align-items:center;padding:12px 16px;border-bottom:1px solid var(--border);">
                    <i class="fas fa-search" style="color:var(--text-secondary);margin-right:8px;"></i>
                    <input id="search-input" style="flex:1;border:none;font-size:16px;outline:none;background:transparent;" placeholder="搜索题目或试卷...">
                    <button class="btn btn-sm" id="search-close-btn">✕</button>
                </div>
                <div id="search-results" style="max-height:400px;overflow-y:auto;padding:8px;"></div>
            </div>
        `;
        document.body.appendChild(searchModalEl);

        document.getElementById('search-close-btn').addEventListener('click', () => {
            searchModalEl.style.display = 'none';
        });
        searchModalEl.addEventListener('click', (e) => {
            if (e.target === searchModalEl) searchModalEl.style.display = 'none';
        });

        document.getElementById('search-input').addEventListener('input', debounce(async (e) => {
            const q = e.target.value.trim();
            if (!q) {
                document.getElementById('search-results').innerHTML = '';
                return;
            }
            try {
                const data = await apiFetch(`/search/?q=${encodeURIComponent(q)}&scope=all`);
                const resultsDiv = document.getElementById('search-results');
                let html = '';
                if (data.total_questions > 0) {
                    html += `<div style="font-weight:500;padding:8px 12px;color:var(--text-secondary);">题目 (${data.total_questions})</div>`;
                    data.questions.forEach(q => {
                        html += `<div class="list-item search-result-item" data-type="question" data-id="${q.id}">
                            <span style="font-family:monospace;color:var(--primary);">${escapeHtml(q.id)}</span>
                            <span>${q.question_type}</span>
                            <div style="font-size:12px;color:var(--text-secondary);">${escapeHtml(q.content_preview || '')}</div>
                        </div>`;
                    });
                }
                if (data.total_papers > 0) {
                    html += `<div style="font-weight:500;padding:8px 12px;color:var(--text-secondary);">试卷 (${data.total_papers})</div>`;
                    data.papers.forEach(p => {
                        html += `<div class="list-item search-result-item" data-type="paper" data-id="${p.id}">
                            <span>${escapeHtml(p.title)}</span>
                            <span class="status-badge">${p.paper_type}</span>
                        </div>`;
                    });
                }
                if (!html) html = '<div style="padding:20px;text-align:center;color:var(--text-secondary);">无结果</div>';
                resultsDiv.innerHTML = html;

                resultsDiv.querySelectorAll('.search-result-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const type = item.dataset.type;
                        const id = item.dataset.id;
                        searchModalEl.style.display = 'none';
                        if (type === 'question') {
                            switchMainTab('questions');
                            setTimeout(() => loadQuestionDetail(id), 500);
                        } else if (type === 'paper') {
                            switchMainTab('papers');
                            setTimeout(() => openPaperEditor(parseInt(id), '', 'teacher'), 500);
                        }
                    });
                });
            } catch(e) { console.error(e); }
        }, 300));
    }
    searchModalEl.style.display = 'flex';
    setTimeout(() => document.getElementById('search-input')?.focus(), 100);
}