let currentTab = 'compose';

function renderTab() {
    const titleMap = {
        'knowledge-mgr': '题库管理',
        'input': '题目录入',
        'analysis': '智能分析',
        'compare': '多卷对比',
        'dashboard': '健康度仪表盘',
        'similar': '解题类比',
        'compose': '组卷输出',
        'export': '导出设置',
        'drawing': '绘图工具'
    };
    document.getElementById('page-title').innerText = titleMap[currentTab] || 'MathPulse';
    const container = document.getElementById('dynamic-panel');
    if (currentTab === 'knowledge-mgr') renderKnowledgeMgr(container);
    else if (currentTab === 'compose') renderComposeMgr(container);
    else if (currentTab === 'input') renderInputPanel(container);
    else if (currentTab === 'analysis') renderAnalysisMgr(container);
    else if (currentTab === 'compare') renderCompareMgr(container);
    else if (currentTab === 'dashboard') renderDashboard(container);
    else if (currentTab === 'similar') renderSimilarMgr(container);
    else if (currentTab === 'export') renderExportMgr(container);
    else if (currentTab === 'drawing') renderDrawingMgr(container);
    else renderComingSoon(container, titleMap[currentTab]);
}

function renderComingSoon(container, title) {
    container.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:#8f9bb3;">
        <i class="fas fa-tools" style="font-size:48px;"></i>
        <p style="margin-top:20px;">"${title}" 功能开发中，敬请期待！</p>
    </div>`;
}

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        if (item.classList.contains('disabled-nav')) {
            showToast('该模块正在开发中');
            return;
        }
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        currentTab = item.getAttribute('data-tab');
        renderTab();
    });
});