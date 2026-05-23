let activeTabId = 'input';
let darkMode = localStorage.getItem('darkMode') === 'true';

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    const token = getToken();
    if (!token && window.location.pathname !== '/static/login.html') {
        window.location.href = '/static/login.html';
        return;
    }
    if (!token) return;
    applyTheme();
    renderAppShell();
    renderRibbon();
    bindGlobalShortcuts();
    initCommandPalette();
    switchMainTab('input');
}

function applyTheme() { document.body.classList.toggle('dark', darkMode); }
function toggleDarkMode() { darkMode = !darkMode; localStorage.setItem('darkMode', darkMode); applyTheme(); }

function renderAppShell() {
    document.getElementById('app-root').innerHTML = `
        <div class="ribbon" id="ribbon"></div>
        <div class="main-area">
            <div class="sidebar" id="sidebar" style="display:none;"></div>
            <div class="content" id="content-area">
                <div class="tabs" id="work-tabs"></div>
                <div id="work-panel" style="flex:1; overflow:auto;"></div>
            </div>
            <div class="preview-panel" id="preview-panel" style="display:none;"></div>
        </div>
        <div class="statusbar">
            <span id="status-user">已登录</span>
            <span style="margin-left:auto;" id="status-info">就绪</span>
        </div>
        <div id="command-palette" style="display:none; position:fixed; top:30%; left:50%; transform:translate(-50%,-50%); width:500px; z-index:10000; background:var(--surface); border:1px solid var(--border); border-radius:12px; overflow:hidden;">
            <input id="command-input" style="width:100%; padding:14px; border:none; font-size:16px; outline:none;" placeholder="输入命令...">
            <div id="command-list" style="max-height:300px; overflow-y:auto;"></div>
        </div>
    `;
}

function renderRibbon() {
    const tabs = [
        { id:'input', label:'📝 录入', children:[
            { label:'手动录入', icon:'fa-pen', action:()=>switchMainTab('input') },
            { label:'试卷向导', icon:'fa-file-alt', action:()=>{
                switchMainTab('input');
                showModal('试卷向导', {
                    type:'form',
                    html: `
                        <div class="form-group"><label>类型</label><select id="wiz-type"><option value="试卷">试卷</option><option value="讲义">讲义</option><option value="教辅">教辅</option><option value="教材">教材</option><option value="错题本">错题本</option><option value="每日一题">每日一题</option></select></div>
                        <div class="form-group"><label>学段</label><select id="wiz-stage"><option value="X">小学</option><option value="C">初中</option><option value="G" selected>高中</option><option value="Z">专升本</option><option value="K">考研</option></select></div>
                        <div class="form-group"><label>标题</label><input id="wiz-title" style="width:100%;" placeholder="试卷标题"></div>
                    `,
                    onConfirm: (overlay) => {
                        const type = document.getElementById('wiz-type').value;
                        const stage = document.getElementById('wiz-stage').value;
                        const title = document.getElementById('wiz-title').value.trim();
                        if (!title) { showToast('请输入标题'); return false; }
                        openPaperWizard(type, stage, title);
                    }
                });
            }},
        ]},
        { id:'questions', label:'🗂️ 题库', children:[
            { label:'全部题目', icon:'fa-list', action:()=>switchMainTab('questions') },
            { label:'知识树', icon:'fa-sitemap', action:()=>switchMainTab('knowledge-tree') },
            { label:'知识点库', icon:'fa-book', action:()=>switchMainTab('knowledge-library') },
        ]},
        { id:'papers', label:'📄 组卷', children:[
            { label:'试卷列表', icon:'fa-folder', action:()=>switchMainTab('papers') },
        ]},
        { id:'analysis', label:'📊 分析', children:[
            { label:'单卷分析', icon:'fa-chart-pie', action:()=>switchMainTab('analysis') },
            { label:'多卷对比', icon:'fa-balance-scale', action:()=>switchMainTab('compare') },
            { label:'仪表盘', icon:'fa-tachometer-alt', action:()=>switchMainTab('dashboard') },
            { label:'解题类比', icon:'fa-project-diagram', action:()=>switchMainTab('similar') },
        ]},
        { id:'settings', label:'⚙️', children:[
            { label:'导出偏好', icon:'fa-sliders-h', action:()=>switchMainTab('export-settings') },
            { label:'全局搜索', icon:'fa-search', action:()=>openSearch() },
            { label: darkMode?'🌞 亮色':'🌙 暗色', icon:'', action:()=>{ toggleDarkMode(); renderRibbon(); } },
            { label:'登出', icon:'fa-sign-out-alt', action: logout },
        ]},
    ];

    let html = tabs.map(t => `<div class="ribbon-tab ${t.id===activeTabId?'active':''}" data-tab="${t.id}">${t.label}</div>`).join('');
    html += `<div class="ribbon-group" id="ribbon-actions"></div>`;
    html += `<div style="margin-left:auto; display:flex; align-items:center; padding-right:12px;">
        <button class="ribbon-btn" title="退出登录" onclick="logout()" style="flex-direction:row; gap:6px;">
            <i class="fas fa-sign-out-alt"></i> 退出
        </button>
    </div>`;
    document.getElementById('ribbon').innerHTML = html;

    document.querySelectorAll('.ribbon-tab').forEach(el => {
        el.addEventListener('click', ()=>{
            const tab = tabs.find(t=>t.id===el.dataset.tab);
            if(tab && tab.children.length>0) tab.children[0].action();
        });
    });
    const active = tabs.find(t=>t.id===activeTabId);
    const actions = document.getElementById('ribbon-actions');
    if(active && active.children){
        actions.innerHTML = active.children.map(c => `<button class="ribbon-btn" title="${c.label}"><i class="fas ${c.icon}"></i>${c.label}</button>`).join('');
        actions.querySelectorAll('button').forEach((btn,i)=> btn.addEventListener('click', active.children[i].action));
    }
}

function switchMainTab(tabId) {
    // 离开录入时保存状态
    if (activeTabId === 'input' && typeof window.saveInputState === 'function') {
        window.saveInputState();
    }
    activeTabId = tabId;
    renderRibbon();
    document.getElementById('sidebar').style.display = 'none';
    document.getElementById('preview-panel').style.display = 'none';
    const panel = document.getElementById('work-panel');
    const funcMap = {
        'input': renderInputModule,
        'questions': renderQuestionListModule,
        'knowledge-tree': renderKnowledgeTreeModule,
        'knowledge-library': renderKnowledgeLibrary,
        'papers': renderPaperListModule,
        'analysis': renderSingleAnalysisModule,
        'compare': renderCompareModule,
        'dashboard': renderDashboardModule,
        'similar': renderSimilarMgr,
        'export-settings': renderExportSettingsModule,
    };
    if(funcMap[tabId]) funcMap[tabId](panel);
    else panel.innerHTML = '<div style="padding:40px;text-align:center;">功能开发中</div>';
}

function bindGlobalShortcuts() {
    document.addEventListener('keydown', (e)=>{
        if(e.ctrlKey && e.key==='k'){ e.preventDefault(); openCommandPalette(); }
        if(e.ctrlKey && e.key==='s'){ e.preventDefault(); }
    });
}

function initCommandPalette() {
    const palette = document.getElementById('command-palette');
    const input = document.getElementById('command-input');
    const list = document.getElementById('command-list');
    const cmds = [
        {name:'录入题目', action:()=>switchMainTab('input')},
        {name:'题库管理', action:()=>switchMainTab('questions')},
        {name:'组卷列表', action:()=>switchMainTab('papers')},
        {name:'试卷分析', action:()=>switchMainTab('analysis')},
        {name:'切换主题', action:()=>{toggleDarkMode(); renderRibbon();}},
        {name:'登出', action: logout},
    ];
    window.openCommandPalette = function() {
        palette.style.display = 'block';
        input.value = '';
        renderCmdList(cmds);
        input.focus();
    };
    function renderCmdList(c) {
        list.innerHTML = c.map(cmd => `<div class="list-item" style="padding:10px;">${cmd.name}</div>`).join('');
        list.querySelectorAll('.list-item').forEach((el,i)=> el.addEventListener('click', ()=>{ c[i].action(); palette.style.display='none'; }));
    }
    input.addEventListener('input', ()=>{
        const q = input.value.toLowerCase();
        renderCmdList(cmds.filter(c=>c.name.toLowerCase().includes(q)));
    });
    input.addEventListener('keydown', (e)=>{ if(e.key==='Escape') palette.style.display='none'; });
    document.addEventListener('click', (e)=>{ if(!palette.contains(e.target)) palette.style.display='none'; });
}

function logout() { removeToken(); window.location.href='/static/login.html'; }