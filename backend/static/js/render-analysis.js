// 分析模块渲染（修复：分析子功能在同一面板内切换，不消失）

async function renderSingleAnalysisModule(container) {
    container.innerHTML = `
        <div style="padding:20px; overflow-y:auto; height:100%;">
            <h3>单卷分析</h3>
            <div style="display:flex; gap:12px; margin-bottom:16px;">
                <select id="analysis-paper-select" style="min-width:250px;">
                    <option value="">请选择组卷</option>
                </select>
                <button class="btn btn-primary" id="analysis-run-btn">开始分析</button>
            </div>
            <div class="two-columns" style="display:flex; gap:20px;">
                <div class="card" style="flex:1; padding:16px;">
                    <h4>知识点分布</h4>
                    <canvas id="knowledge-chart" height="250"></canvas>
                </div>
                <div class="card" style="flex:1; padding:16px;">
                    <h4>题型占比</h4>
                    <canvas id="type-chart" height="250"></canvas>
                </div>
            </div>
            <div class="card" style="margin-top:20px; padding:16px;">
                <h4>难度分布</h4>
                <canvas id="difficulty-chart" height="80"></canvas>
                <p style="text-align:center; margin-top:8px;">平均难度：<strong id="diff-avg">--</strong></p>
            </div>
        </div>
    `;

    const select = document.getElementById('analysis-paper-select');
    const papers = await apiFetch('/papers/');
    papers.forEach(p => {
        select.innerHTML += `<option value="${p.id}">${escapeHtml(p.title)}</option>`;
    });

    document.getElementById('analysis-run-btn').addEventListener('click', async () => {
        const paperId = select.value;
        if (!paperId) return showToast('请选择组卷');
        try {
            const data = await apiFetch(`/analysis/single/${paperId}`);
            renderAnalysisCharts(data);
        } catch(e) { showToast('分析失败: '+e.message); }
    });
}

function renderAnalysisCharts(data) {
    renderPieChart('knowledge-chart', data.knowledge_distribution.map(i => ({name: i.name, count: i.count})));
    renderPieChart('type-chart', data.type_distribution.map(i => ({name: i.name, count: i.count})));
    document.getElementById('diff-avg').innerText = data.difficulty_avg;
}

function renderPieChart(canvasId, items) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    const existing = Chart.getChart(canvasId);
    if (existing) existing.destroy();
    new Chart(ctx, {
        type: 'pie',
        data: {
            labels: items.map(i => i.name),
            datasets: [{
                data: items.map(i => i.count),
                backgroundColor: ['#2563eb','#7c3aed','#db2777','#ea580c','#16a34a','#ca8a04','#0891b2','#4f46e5']
            }]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });
}

async function renderCompareModule(container) {
    container.innerHTML = `
        <div style="padding:20px; overflow-y:auto; height:100%;">
            <h3>多卷对比</h3>
            <div style="display:flex; gap:12px; margin-bottom:16px; align-items:center;">
                <select id="compare-paper-select" style="min-width:250px;">
                    <option value="">请选择组卷</option>
                </select>
                <button class="btn btn-outline" id="compare-add-btn">加入对比</button>
                <button class="btn btn-primary" id="compare-run-btn">开始对比</button>
            </div>
            <div id="compare-list" style="margin-bottom:12px; display:flex; gap:8px; flex-wrap:wrap;"></div>
            <div class="card" style="padding:16px;">
                <h4>知识点分布对比</h4>
                <canvas id="compare-chart" height="300"></canvas>
            </div>
        </div>
    `;

    let selectedPapers = [];
    const select = document.getElementById('compare-paper-select');
    const papers = await apiFetch('/papers/');
    papers.forEach(p => select.innerHTML += `<option value="${p.id}">${escapeHtml(p.title)}</option>`);

    document.getElementById('compare-add-btn').addEventListener('click', () => {
        const id = parseInt(select.value);
        const name = select.options[select.selectedIndex]?.text;
        if (!id || selectedPapers.find(p => p.id === id)) return;
        selectedPapers.push({id, name});
        renderCompareList();
    });

    function renderCompareList() {
        const list = document.getElementById('compare-list');
        list.innerHTML = selectedPapers.map(p => `
            <span style="background:var(--primary-light); padding:4px 12px; border-radius:20px; display:flex; align-items:center; gap:8px;">
                ${escapeHtml(p.name)} <button class="btn btn-sm" data-remove="${p.id}" style="padding:0 6px;">×</button>
            </span>
        `).join('');
        list.querySelectorAll('[data-remove]').forEach(btn => {
            btn.addEventListener('click', () => {
                selectedPapers = selectedPapers.filter(p => p.id !== parseInt(btn.dataset.remove));
                renderCompareList();
            });
        });
    }

    document.getElementById('compare-run-btn').addEventListener('click', async () => {
        if (selectedPapers.length < 2) return showToast('请选择至少两份组卷');
        const ids = selectedPapers.map(p => p.id);
        try {
            const data = await apiFetch('/analysis/compare', { method:'POST', body: JSON.stringify(ids) });
            renderCompareChart(data);
        } catch(e) { showToast('对比失败: '+e.message); }
    });

    function renderCompareChart(data) {
        const ctx = document.getElementById('compare-chart');
        if (!ctx) return;
        const existing = Chart.getChart('compare-chart');
        if (existing) existing.destroy();
        const colors = ['#2563eb','#dc2626','#16a34a','#ea580c','#8b5cf6','#0891b2'];
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.labels,
                datasets: data.datasets.map((ds, i) => ({
                    label: ds.label,
                    data: ds.data,
                    backgroundColor: colors[i % colors.length]
                }))
            },
            options: { responsive: true, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }, plugins: { legend: { position: 'bottom' } } }
        });
    }
}

async function renderDashboardModule(container) {
    container.innerHTML = `
        <div style="padding:20px; overflow-y:auto; height:100%;">
            <h3>题库健康度仪表盘</h3>
            <div style="margin-bottom:16px; display:flex; gap:12px; align-items:center;">
                <select id="dashboard-stage-select">
                    <option value="">全部学段</option>
                    <option value="X">小学</option><option value="C">初中</option>
                    <option value="G">高中</option><option value="Z">专升本</option><option value="K">考研</option>
                </select>
                <button class="btn btn-primary" id="dashboard-refresh-btn">刷新</button>
                <span>总题量：<strong id="dashboard-total">0</strong></span>
            </div>
            <div class="two-columns" style="display:flex; gap:20px;">
                <div class="card" style="flex:1; padding:16px;">
                    <h4>题型分布</h4>
                    <canvas id="dashboard-type-chart" height="250"></canvas>
                </div>
                <div class="card" style="flex:1; padding:16px;">
                    <h4>难度分布</h4>
                    <canvas id="dashboard-difficulty-chart" height="250"></canvas>
                </div>
            </div>
            <div class="card" style="margin-top:20px; padding:16px;">
                <h4>知识点覆盖度</h4>
                <div id="knowledge-coverage-list" style="display:flex; flex-wrap:wrap; gap:8px;"></div>
            </div>
        </div>
    `;

    async function loadDashboard() {
        const stage = document.getElementById('dashboard-stage-select').value;
        const data = await apiFetch(`/analysis/dashboard?stage=${stage}`);
        document.getElementById('dashboard-total').innerText = data.total_questions;
        renderPieChart('dashboard-type-chart', data.type_distribution.map(i => ({name: i.name, count: i.count})));
        renderBarChart('dashboard-difficulty-chart', data.difficulty_distribution.map(i => ({label: `难度${i.difficulty}`, value: i.count})));
        const coverageDiv = document.getElementById('knowledge-coverage-list');
        coverageDiv.innerHTML = data.knowledge_coverage.map(i => `
            <span style="background:var(--primary-light); padding:4px 12px; border-radius:20px; font-size:13px;">
                ${escapeHtml(i.name)} <strong>${i.count}</strong>
            </span>
        `).join('');
    }

    function renderBarChart(canvasId, items) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        const existing = Chart.getChart(canvasId);
        if (existing) existing.destroy();
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: items.map(i => i.label),
                datasets: [{ data: items.map(i => i.value), backgroundColor: '#2563eb' }]
            },
            options: { responsive: true, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }, plugins: { legend: { display: false } } }
        });
    }

    document.getElementById('dashboard-refresh-btn').addEventListener('click', loadDashboard);
    loadDashboard();
}

async function renderSimilarMgr(container) {
    container.innerHTML = `
        <div style="padding:20px; overflow-y:auto; height:100%;">
            <h3>解题结构类比</h3>
            <div style="display:flex; gap:12px; margin-bottom:16px;">
                <select id="similar-paper-select" style="min-width:250px;">
                    <option value="">请选择组卷</option>
                </select>
                <button class="btn btn-primary" id="similar-run-btn">开始分析</button>
                <span id="similar-status" style="color:var(--text-secondary);"></span>
            </div>
            <div id="similar-result" class="card" style="padding:16px; min-height:200px;">
                选择组卷后点击分析
            </div>
        </div>
    `;

    const select = document.getElementById('similar-paper-select');
    const papers = await apiFetch('/papers/');
    papers.forEach(p => select.innerHTML += `<option value="${p.id}">${escapeHtml(p.title)}</option>`);

    document.getElementById('similar-run-btn').addEventListener('click', async () => {
        const paperId = select.value;
        if (!paperId) return showToast('请选择组卷');
        const status = document.getElementById('similar-status');
        const result = document.getElementById('similar-result');
        status.textContent = '分析中...';
        result.innerHTML = '<div style="text-align:center; padding:40px;">AI 正在分析...</div>';
        try {
            const data = await apiFetch(`/analysis/similar/${paperId}`);
            if (data.error) {
                result.innerHTML = `<div style="color:var(--danger);">${data.error}</div>`;
                status.textContent = '';
                return;
            }
            renderSimilarResult(data);
            status.textContent = '分析完成';
        } catch(e) {
            result.innerHTML = `<div style="color:var(--danger);">失败: ${e.message}</div>`;
            status.textContent = '';
        }
    });
}

function renderSimilarResult(data) {
    const resultDiv = document.getElementById('similar-result');
    if (!resultDiv) return;
    const pairs = data.pairs || [];
    const analysis = data.analysis || {};
    if (pairs.length === 0) {
        resultDiv.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-secondary);">未发现解题结构相似的题目对</div>';
        return;
    }
    let stepsHtml = '';
    if (Object.keys(analysis).length > 0) {
        stepsHtml = '<h4 style="margin-top:20px;">各题目解题步骤</h4>';
        for (const [id, steps] of Object.entries(analysis)) {
            stepsHtml += `<div style="margin-bottom:12px; padding:12px; background:#f8fafc; border-radius:8px;">
                <strong>${escapeHtml(id)}</strong>
                <ol style="margin:8px 0 0 20px;">${steps.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ol>
            </div>`;
        }
    }
    resultDiv.innerHTML = `
        <h4>相似题目对（共 ${pairs.length} 组）</h4>
        <table style="width:100%; border-collapse:collapse; margin-top:12px;">
            <thead>
                <tr style="background:#f5f7fa;">
                    <th style="padding:8px; text-align:left;">题目A</th>
                    <th style="padding:8px; text-align:left;">题目B</th>
                    <th style="padding:8px; text-align:center;">相似度</th>
                    <th style="padding:8px; text-align:left;">相似原因</th>
                </tr>
            </thead>
            <tbody>
                ${pairs.map(p => `
                    <tr style="border-bottom:1px solid #edf2f7;">
                        <td style="padding:8px;">
                            <span style="color:#2c7da0; font-family:monospace;">${escapeHtml(p.question1)}</span>
                            <span style="font-size:12px; color:#8f9bb3;">(${escapeHtml(p.knowledge1 || '')})</span>
                        </td>
                        <td style="padding:8px;">
                            <span style="color:#2c7da0; font-family:monospace;">${escapeHtml(p.question2)}</span>
                            <span style="font-size:12px; color:#8f9bb3;">(${escapeHtml(p.knowledge2 || '')})</span>
                        </td>
                        <td style="padding:8px; text-align:center;">
                            <span style="background:${p.similarity >= 80 ? '#e6f7e6' : '#fff3e0'}; padding:4px 8px; border-radius:12px; font-weight:bold;">${p.similarity}%</span>
                        </td>
                        <td style="padding:8px; font-size:13px;">${escapeHtml(p.reason || '')}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        ${stepsHtml}
    `;
}