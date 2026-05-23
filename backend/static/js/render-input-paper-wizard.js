function debounce(fn, delay) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// ========== 试卷向导全局状态 ==========
let paperWizard = {
  paperId: null,            // 试卷ID（新建时为null）
  title: '未命名试卷',
  stage: 'G',
  paperType: '试卷',        // 试卷/讲义/教辅/教材/错题本/每日一题
  sections: [],             // 结构数组，每项 { type, data, tempId? }
  currentEditIndex: null,   // 当前编辑的section索引
  showAnalysis: true,
  metaInfo: { examType: '期中', year: new Date().getFullYear(), grade: '高一', semester: '上学期' },
  originalPaperUrl: '',     // 原卷查看URL（可选）
};

let editingSectionData = null;   // 当前正在编辑的section的引用

// ========== 打开试卷向导 ==========
function openPaperWizard(paperType, paperStage, paperTitle) {
  // 创建试卷并获取ID
  apiFetch('/papers/', {
    method: 'POST',
    body: JSON.stringify({
      title: paperTitle,
      paper_type: paperType,
      stage: paperStage,
      answer_mode: 'teacher',
      meta_info: { status: 'editing' }
    })
  }).then(paper => {
    paperWizard.paperId = paper.id;
    paperWizard.title = paperTitle;
    paperWizard.stage = paperStage;
    paperWizard.paperType = paperType;
    paperWizard.sections = [];
    paperWizard.currentEditIndex = null;
    renderWizardFullUI();
  });
}

// ========== 渲染完整向导界面 ==========
function renderWizardFullUI() {
  const container = document.getElementById('work-panel');
  container.innerHTML = `
    <div style="display:flex;height:100%;">
      <!-- 左侧目录区 -->
      <div class="wiz-left" style="width:220px;border-right:1px solid var(--border);display:flex;flex-direction:column;background:var(--bg);">
        <div style="padding:8px;font-weight:500;border-bottom:1px solid var(--border);">📄 试卷结构</div>
        <div id="wiz-section-list" style="flex:1;overflow-y:auto;padding:8px;"></div>
        <div style="padding:8px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:4px;">
          <label style="font-size:12px;display:flex;align-items:center;gap:4px;">
            <input type="checkbox" id="wiz-show-analysis" ${paperWizard.showAnalysis ? 'checked' : ''}> 展现解析
          </label>
          <button class="btn btn-sm btn-primary" id="wiz-add-section-btn" style="width:100%;">+ 添加内容</button>
        </div>
      </div>
      
      <!-- 中间预览+编辑区 -->
      <div class="wiz-center" style="flex:1;display:flex;flex-direction:column;border-right:1px solid var(--border);">
        <div id="wiz-preview-editor" style="flex:1;overflow-y:auto;padding:16px;position:relative;">
          <div style="text-align:center;color:var(--text-secondary);padding-top:40px;">请从左侧选择或添加内容</div>
        </div>
        <div style="padding:8px;border-top:1px solid var(--border);display:flex;gap:8px;">
          <button class="btn btn-sm btn-primary" id="wiz-save-paper-btn">💾 保存试卷</button>
          <button class="btn btn-sm btn-outline" id="wiz-preview-export-btn">📄 预览导出</button>
          <button class="btn btn-sm btn-outline" id="wiz-back-edit-btn" style="margin-left:auto;">← 返回编辑</button>
        </div>
      </div>
      
      <!-- 右侧工具栏 -->
      <div class="wiz-right" style="width:280px;display:flex;flex-direction:column;background:var(--bg);">
        <div style="padding:8px;font-weight:500;border-bottom:1px solid var(--border);">⚙️ 快捷操作</div>
        <div style="padding:8px;display:flex;flex-direction:column;gap:6px;">
          <button class="btn btn-sm btn-outline" id="wiz-edit-info-btn">编辑信息</button>
          <button class="btn btn-sm btn-outline" id="wiz-set-scores-btn">设定分值</button>
          <button class="btn btn-sm btn-outline" id="wiz-ocr-search-btn">🔍 OCR搜题</button>
        </div>
        <div id="wiz-ocr-chat" style="display:none;flex-direction:column;flex:1;min-height:0;border-top:1px solid var(--border);"></div>
        <div style="flex:1;overflow-y:auto;padding:8px;font-size:13px;color:var(--text-secondary);" id="wiz-score-summary">
          总分：0 分<br>题目数：0
        </div>
      </div>
    </div>
  `;

  // 展现解析开关
  document.getElementById('wiz-show-analysis').addEventListener('change', (e) => {
    paperWizard.showAnalysis = e.target.checked;
    renderSectionList();
    renderPreviewWithHover();
  });

  // 新增：左侧添加按钮
  document.getElementById('wiz-add-section-btn').addEventListener('click', () => {
    const idx = paperWizard.sections.length; // 默认添加到末尾
    showInsertMenuAtBottom(idx);
  });

  // 返回编辑
  document.getElementById('wiz-back-edit-btn').addEventListener('click', () => {
    if (window._lastEditorState) {
      const { paperId, title, mode } = window._lastEditorState;
      if (typeof openPaperEditor === 'function') {
        openPaperEditor(paperId, title, mode);
      } else {
        switchMainTab('papers');
      }
    } else {
      switchMainTab('papers');
    }
  });

  // 保存试卷
  document.getElementById('wiz-save-paper-btn').addEventListener('click', saveFullPaper);
  // 预览导出
  document.getElementById('wiz-preview-export-btn').addEventListener('click', previewPaperExport);
  // 编辑信息
  document.getElementById('wiz-edit-info-btn').addEventListener('click', editMetaInfo);
  // 设定分值
  document.getElementById('wiz-set-scores-btn').addEventListener('click', showScoreEditor);
  // OCR搜题
  document.getElementById('wiz-ocr-search-btn').addEventListener('click', toggleOCRChat);

  renderSectionList();
  renderPreviewWithHover();
}

// ========== 左侧目录渲染 ==========
function renderSectionList() {
  const listDiv = document.getElementById('wiz-section-list');
  listDiv.innerHTML = paperWizard.sections.map((sec, i) => {
    let label = '';
    if (sec.type === 'title') {
      label = `<span style="font-weight:bold;">📌 ${escapeHtml(sec.data.content)}</span>`;
    } else if (sec.type === 'knowledge') {
      label = `<span style="color:var(--primary);">📚 ${escapeHtml(sec.data.question_type || '知识单元')} - ${escapeHtml(sec.data.content_latex || '')}</span>`;
    } else if (sec.type === 'question') {
      const q = sec.data;
      const preview = q ? (q.content_latex?.substring(0, 20) || '(空)') : '(未编辑)';
      label = `<span>题${i+1}. ${escapeHtml(preview)}</span>`;
    }
    return `<div class="wiz-section-item ${paperWizard.currentEditIndex === i ? 'active' : ''}" data-index="${i}" style="padding:4px 8px;cursor:pointer;border-bottom:1px solid var(--border);font-size:13px;">
      ${label}
    </div>`;
  }).join('');

  // 点击目录项
  listDiv.querySelectorAll('.wiz-section-item').forEach(el => {
    el.addEventListener('click', (e) => {
      const idx = parseInt(el.dataset.index);
      switchToSection(idx);
    });
  });

  // 更新右侧统计
  updateScoreSummary();
}

// ========== 中间预览区（含插入点和移动按钮） ==========
function renderPreviewWithHover() {
  const previewDiv = document.getElementById('wiz-preview-editor');
  let html = '';

  // 展示试卷基础信息
  html += `<div style="margin-bottom:12px;padding:8px;background:var(--surface);border-radius:8px;">
    <strong>${escapeHtml(paperWizard.title)}</strong> | 学段：${paperWizard.stage} | 类型：${paperWizard.paperType}
    <br>${paperWizard.metaInfo.examType} · ${paperWizard.metaInfo.year}年 · ${paperWizard.metaInfo.grade}${paperWizard.metaInfo.semester}
  </div>`;

  if (paperWizard.sections.length === 0) {
    html += '<div style="color:var(--text-secondary);text-align:center;">点击左侧「添加内容」开始构建试卷</div>';
    previewDiv.innerHTML = html;
    // 点击空白区域不做任何事
    return;
  }

  paperWizard.sections.forEach((sec, i) => {
    // 上方插入点
    html += `<div class="insert-point" data-index="${i}" data-position="before" style="text-align:center;opacity:0;cursor:pointer;padding:2px;transition:opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0">⬆️ 插入 ▾</div>`;

    if (sec.type === 'title') {
      html += `<div class="preview-block" data-index="${i}" style="font-weight:bold;padding:4px 0;cursor:pointer;">
        📌 ${escapeHtml(sec.data.content)}
        <span style="float:right;font-size:12px;color:var(--text-secondary);">[上移▲] [下移▼]</span>
      </div>`;
    } else if (sec.type === 'knowledge') {
      const ku = sec.data;
      html += `<div class="preview-block" data-index="${i}" style="border-left:3px solid var(--primary);padding-left:8px;margin:8px 0;cursor:pointer;">
        <strong>📚 ${escapeHtml(ku.question_type || '知识单元')}：</strong>${escapeHtml(ku.content_latex || '')}
        ${paperWizard.showAnalysis && ku.analysis_latex ? `<div style="font-size:12px;color:var(--text-secondary);">${escapeHtml(ku.analysis_latex)}</div>` : ''}
      </div>`;
    } else if (sec.type === 'question') {
      const q = sec.data;
      if (!q) {
        html += `<div class="preview-block" data-index="${i}" style="color:var(--text-secondary);cursor:pointer;">[未编辑题目]</div>`;
      } else {
        html += `<div class="preview-block" data-index="${i}" style="padding:6px 0;cursor:pointer;">
          <strong>${i+1}. (${q.question_type})</strong> ${escapeHtml(q.content_latex)}
          ${q.options_latex && q.question_type === '选择' ? `<div>选项：${JSON.parse(q.options_latex).join(' | ')}</div>` : ''}
          ${paperWizard.showAnalysis ? `<div style="font-size:12px;color:var(--text-secondary);">答案：${escapeHtml(q.answer_latex || '无')} | 解析：${escapeHtml(q.analysis_latex || '无')}</div>` : ''}
        </div>`;
      }
    }

    // 下方插入点
    html += `<div class="insert-point" data-index="${i}" data-position="after" style="text-align:center;opacity:0;cursor:pointer;padding:2px;transition:opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0">⬇️ 插入 ▾</div>`;
  });

  previewDiv.innerHTML = html;

  // 点击预览块 => 切换到编辑模式
  previewDiv.querySelectorAll('.preview-block').forEach(block => {
    block.addEventListener('click', (e) => {
      if (e.target.tagName === 'SPAN' && (e.target.innerText.includes('上移') || e.target.innerText.includes('下移'))) return;
      const idx = parseInt(block.dataset.index);
      switchToSection(idx);
    });
  });

  // 移动按钮
  previewDiv.querySelectorAll('.preview-block span').forEach(span => {
    if (span.innerText.includes('上移')) {
      span.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(span.parentElement.dataset.index);
        moveSectionUp(idx);
      });
    } else if (span.innerText.includes('下移')) {
      span.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(span.parentElement.dataset.index);
        moveSectionDown(idx);
      });
    }
  });

  // 插入点
  previewDiv.querySelectorAll('.insert-point').forEach(point => {
    point.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(point.dataset.index);
      const pos = point.dataset.position;
      showInsertMenu(e, idx, pos);
    });
  });

  // 点击空白区域返回预览（如果当前处于编辑模式）
  previewDiv.addEventListener('click', (e) => {
    // 如果点击的元素不是预览块也不是插入点，并且当前有编辑索引，则返回预览
    if (!e.target.closest('.preview-block') && !e.target.closest('.insert-point') && paperWizard.currentEditIndex !== null) {
      paperWizard.currentEditIndex = null;
      renderPreviewWithHover();
      renderSectionList();
    }
  });
}

// ========== 插入菜单 ==========
function showInsertMenu(event, index, position) {
  const menu = document.createElement('div');
  menu.style.cssText = 'position:fixed;z-index:10000;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:8px;min-width:160px;';
  menu.style.left = event.clientX + 'px';
  menu.style.top = event.clientY + 'px';
  menu.innerHTML = `
    <div class="menu-item" data-action="title">📌 插入标题</div>
    <div class="menu-item" data-action="knowledge">📚 插入知识单元</div>
    <div class="menu-item" data-action="question">📝 插入题目</div>
  `;
  document.body.appendChild(menu);

  menu.querySelectorAll('.menu-item').forEach(item => {
    item.style.cssText = 'padding:6px 8px;cursor:pointer;';
    item.addEventListener('mouseenter', (e) => e.target.style.background = 'var(--bg)');
    item.addEventListener('mouseleave', (e) => e.target.style.background = '');
    item.addEventListener('click', () => {
      const action = item.dataset.action;
      const insertIndex = position === 'before' ? index : index + 1;
      if (action === 'title') {
        const title = prompt('请输入标题文本');
        if (title) insertSectionAt(insertIndex, 'title', { content: title });
      } else if (action === 'knowledge') {
        openKnowledgePickerForWizard(insertIndex);
      } else if (action === 'question') {
        insertSectionAt(insertIndex, 'question', null);
        switchToSection(insertIndex);
      }
      document.body.removeChild(menu);
    });
  });

  // 点击其他区域关闭菜单
  setTimeout(() => {
    window.addEventListener('click', function closeMenu(e) {
      if (!menu.contains(e.target)) {
        document.body.removeChild(menu);
        window.removeEventListener('click', closeMenu);
      }
    });
  }, 0);
}

// ========== 知识单元选择器（向导专用） ==========
function openKnowledgePickerForWizard(insertIndex) {
  // 弹窗内容：左侧知识点树 + 右侧列表
  const modalHtml = `
    <div style="display:flex;height:60vh;min-width:700px;">
      <!-- 左侧知识点树 -->
      <div style="width:240px;border-right:1px solid var(--border);display:flex;flex-direction:column;">
        <div style="padding:8px;font-weight:500;border-bottom:1px solid var(--border);">知识点</div>
        <div id="wiz-ku-tree" style="flex:1;overflow-y:auto;padding:8px;"></div>
        <div style="padding:6px;border-top:1px solid var(--border);">
          <button class="btn btn-sm btn-success" id="wiz-ku-tree-new-btn" style="width:100%;">+ 新建知识点</button>
        </div>
      </div>
      <!-- 右侧列表 -->
      <div style="flex:1;display:flex;flex-direction:column;padding:8px;">
        <div style="display:flex;gap:8px;margin-bottom:8px;">
          <select id="wiz-ku-type-filter" style="width:110px;">
            <option value="">全部类型</option>
            <option value="定义">定义</option><option value="定理">定理</option>
            <option value="引理">引理</option><option value="推论">推论</option>
            <option value="命题">命题</option><option value="公理">公理</option>
            <option value="性质">性质</option><option value="注释">注释</option>
            <option value="评注">评注</option><option value="结论">结论</option>
          </select>
          <input type="text" id="wiz-ku-keyword" placeholder="搜索标题" style="flex:1;">
          <button class="btn btn-sm btn-primary" id="wiz-ku-search-btn">搜索</button>
        </div>
        <div id="wiz-ku-list" style="flex:1;overflow-y:auto;"></div>
      </div>
    </div>
  `;

  showModal('选择知识单元', {
    type: 'custom',
    html: modalHtml,
    onOpen: async (overlay) => {
      // 当前选中的知识点ID（树节点）
      let selectedKpId = null;
      const treeContainer = overlay.querySelector('#wiz-ku-tree');
      const listContainer = overlay.querySelector('#wiz-ku-list');

      // 加载知识点树（知识单元类型）
      async function loadTree() {
        const tree = await apiFetch('/knowledge-points/tree?question_type=定义,定理,引理,推论,命题,公理,性质,注释,评注,结论');
        // 渲染树（使用通用 renderTreeHtml，但需要事件绑定）
        treeContainer.innerHTML = renderTreeHtml(tree, 0, 'wiz-ku-tree');
        // 绑定事件
        treeContainer.querySelectorAll('.tree-item').forEach(item => {
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
          item.addEventListener('click', () => {
            const id = item.dataset.id;
            selectedKpId = id;
            treeContainer.querySelectorAll('.tree-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            loadKnowledgeUnitList();
          });
        });
      }

      // 加载知识单元列表（根据筛选）
      async function loadKnowledgeUnitList() {
        const type = overlay.querySelector('#wiz-ku-type-filter').value;
        const keyword = overlay.querySelector('#wiz-ku-keyword').value.trim();
        let url = '/questions/?';
        const params = [];
        if (type) params.push('question_type=' + encodeURIComponent(type));
        else params.push('question_type=' + encodeURIComponent('定义,定理,引理,推论,命题,公理,性质,注释,评注,结论'));
        if (keyword) params.push('keyword=' + encodeURIComponent(keyword));
        if (selectedKpId) {
          if (selectedKpId !== '__all__') {
            const kp = await apiFetch(`/knowledge-points/${selectedKpId}`);
            if (kp) params.push('knowledge_point_path=' + encodeURIComponent(kp.path));
          }
        }
        url += params.join('&');
        const data = await apiFetch(url);
        const items = data.items || [];
        listContainer.innerHTML = items.map(q => `
          <div class="ku-item" style="display:flex;justify-content:space-between;align-items:center;padding:6px;border-bottom:1px solid var(--border);">
            <div>
              <span style="font-family:monospace;color:var(--primary);">${escapeHtml(q.id)}</span>
              <span style="margin-left:8px;">${escapeHtml(q.question_type)}</span>
              <div style="font-size:12px;color:var(--text-secondary);">${escapeHtml(q.content_preview?.substring(0,30) || '')}</div>
            </div>
            <button class="btn btn-sm btn-primary select-ku-btn" data-qid="${q.id}">选择</button>
          </div>
        `).join('') || '<div style="padding:16px;color:var(--text-secondary);">无结果</div>';

        listContainer.querySelectorAll('.select-ku-btn').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const qid = btn.dataset.qid;
            const fullData = await apiFetch(`/questions/${qid}`);
            insertSectionAt(insertIndex, 'knowledge', fullData);
            document.querySelector('.modal-overlay')?.remove();
          });
        });
      }

      // 搜索按钮事件
      overlay.querySelector('#wiz-ku-search-btn').addEventListener('click', loadKnowledgeUnitList);
      overlay.querySelector('#wiz-ku-type-filter').addEventListener('change', loadKnowledgeUnitList);
      overlay.querySelector('#wiz-ku-keyword').addEventListener('input', debounce(loadKnowledgeUnitList, 400));

      // 新建知识点按钮
      overlay.querySelector('#wiz-ku-tree-new-btn').addEventListener('click', async () => {
        const name = await modalPrompt('新建知识点', '请输入知识点名称：', { placeholder: '例如：函数' });
        if (!name) return;
        try {
          await apiFetch('/knowledge-points/', { method:'POST', body: JSON.stringify({ name, stage:'G', level_type:'point', parent_id:null }) });
          showToast('知识点已创建');
          // 刷新树
          await loadTree();
          // 触发全局更新（使题库知识图谱刷新）
          window.dispatchEvent(new CustomEvent('knowledge-points-updated'));
        } catch (e) { showToast('创建失败'); }
      });

      // 初始化：加载树和默认列表
      await loadTree();
      await loadKnowledgeUnitList();
    }
  });
}

// ========== 插入section ==========
function insertSectionAt(index, type, data) {
  paperWizard.sections.splice(index, 0, { type, data });
  renderSectionList();
  renderPreviewWithHover();
  paperWizard.currentEditIndex = index;
}

// ========== 上移/下移 ==========
function moveSectionUp(index) {
  if (index <= 0) return;
  [paperWizard.sections[index-1], paperWizard.sections[index]] = [paperWizard.sections[index], paperWizard.sections[index-1]];
  if (paperWizard.currentEditIndex === index) paperWizard.currentEditIndex = index - 1;
  else if (paperWizard.currentEditIndex === index - 1) paperWizard.currentEditIndex = index;
  renderSectionList();
  renderPreviewWithHover();
}

function moveSectionDown(index) {
  if (index >= paperWizard.sections.length - 1) return;
  [paperWizard.sections[index], paperWizard.sections[index+1]] = [paperWizard.sections[index+1], paperWizard.sections[index]];
  if (paperWizard.currentEditIndex === index) paperWizard.currentEditIndex = index + 1;
  else if (paperWizard.currentEditIndex === index + 1) paperWizard.currentEditIndex = index;
  renderSectionList();
  renderPreviewWithHover();
}

// ========== 切换编辑区 ==========
function switchToSection(index) {
  paperWizard.currentEditIndex = index;
  const sec = paperWizard.sections[index];
  const editorDiv = document.getElementById('wiz-preview-editor');
  
  if (sec.type === 'title') {
    renderTitleEditor(editorDiv, index);
  } else if (sec.type === 'knowledge') {
    renderKnowledgeEditor(editorDiv, index);
  } else if (sec.type === 'question') {
    renderQuestionEditor(editorDiv, index);
  }
  renderSectionList(); // 更新左侧高亮
}

// ========== 标题编辑器 ==========
function renderTitleEditor(container, index) {
  const sec = paperWizard.sections[index];
  container.innerHTML = `
    <h3>编辑标题</h3>
    <textarea id="edit-title-text" style="width:100%;" rows="2">${escapeHtml(sec.data.content || '')}</textarea>
    <button class="btn btn-sm btn-primary" id="save-title-btn">保存</button>
  `;
  document.getElementById('save-title-btn').addEventListener('click', () => {
    sec.data.content = document.getElementById('edit-title-text').value;
    renderSectionList();
    renderPreviewWithHover();
  });
}

// ========== 知识单元编辑器 ==========
function renderKnowledgeEditor(container, index) {
  const sec = paperWizard.sections[index];
  const ku = sec.data;
  container.innerHTML = `
    <h3>编辑知识单元</h3>
    <div class="form-group"><label>类型</label>
      <select id="ku-edit-type">${['定义','定理','引理','推论','命题','公理','性质','注释','评注','结论'].map(t => `<option value="${t}" ${ku.question_type===t?'selected':''}>${t}</option>`).join('')}</select>
    </div>
    <div class="form-group"><label>标题</label><textarea id="ku-edit-title" style="width:100%;" rows="1">${escapeHtml(ku.content_latex || '')}</textarea></div>
    <div class="form-group"><label>内容</label><textarea id="ku-edit-content" style="width:100%;" rows="4">${escapeHtml(ku.analysis_latex || '')}</textarea></div>
    <div class="form-group"><label>知识点</label>
      <div id="ku-edit-kp-picker">
        <input type="text" id="ku-edit-kp-input" placeholder="搜索知识点" value="${escapeHtml(ku.knowledge_point || '')}" style="width:100%;">
        <div id="ku-edit-kp-suggestions" style="border:1px solid var(--border);max-height:150px;overflow-y:auto;display:none;"></div>
        <input type="hidden" id="ku-edit-kp-id" value="${ku.knowledge_point_id || ''}">
      </div>
    </div>
    <button class="btn btn-sm btn-primary" id="save-ku-btn">保存</button>
  `;

  // 简化的知识点自动补全（与录入界面类似，但不复用了，直接内联）
  document.getElementById('ku-edit-kp-input').addEventListener('input', debounce(async (e) => {
    const kw = e.target.value.trim();
    if (!kw) return document.getElementById('ku-edit-kp-suggestions').style.display = 'none';
    const tree = await apiFetch('/knowledge-points/tree');
    const results = [];
    function search(nodes) {
      nodes.forEach(n => {
        if (n.name.includes(kw)) results.push(n);
        if (n.children) search(n.children);
      });
    }
    search(tree);
    const sugg = document.getElementById('ku-edit-kp-suggestions');
    sugg.innerHTML = results.map(n => `<div data-id="${n.id}" data-name="${n.name}" style="padding:4px;cursor:pointer;">${escapeHtml(n.name)}</div>`).join('');
    sugg.style.display = 'block';
    sugg.querySelectorAll('div').forEach(d => d.addEventListener('click', () => {
      document.getElementById('ku-edit-kp-input').value = d.dataset.name;
      document.getElementById('ku-edit-kp-id').value = d.dataset.id;
      sugg.style.display = 'none';
    }));
  }, 300));

  document.getElementById('save-ku-btn').addEventListener('click', () => {
    ku.question_type = document.getElementById('ku-edit-type').value;
    ku.content_latex = document.getElementById('ku-edit-title').value;
    ku.analysis_latex = document.getElementById('ku-edit-content').value;
    ku.knowledge_point = document.getElementById('ku-edit-kp-input').value;
    ku.knowledge_point_id = document.getElementById('ku-edit-kp-id').value || null;
    renderSectionList();
    renderPreviewWithHover();
    showToast('知识单元已更新');
  });
}
function saveQuestionFromEditor(baseData) {
  // baseData 已经包含了题干、解析、知识点等，还需补充答案数据
  const type = baseData.question_type || document.getElementById('q-edit-type')?.value;
  const fullData = { ...baseData };
  
  if (type === '选择') {
    const opts = [];
    document.querySelectorAll('.q-option').forEach(inp => opts.push(inp.value.trim()));
    fullData.options_latex = JSON.stringify(opts);
    fullData.answer_latex = document.getElementById('q-answer-select')?.value || '';
  } else if (type === '判断') {
    fullData.answer_latex = document.getElementById('q-answer-select')?.value || '';
  } else if (type === '填空' || type === '简答') {
    fullData.answer_latex = document.getElementById('q-answer-input')?.value || '';
  } else if (type === '综合大题') {
    const subs = [];
    document.querySelectorAll('.q-sub-stem').forEach((el, i) => {
      subs.push({
        stem: el.value,
        answer: document.querySelector(`.q-sub-answer[data-index="${i}"]`)?.value || '',
        analysis: document.querySelector(`.q-sub-analysis[data-index="${i}"]`)?.value || ''
      });
    });
    fullData.answer_latex = JSON.stringify(subs);
  }
  
  return fullData;
}
// ========== 题目编辑器（复用录入界面类似逻辑） ==========
function renderQuestionEditor(container, index) {
  const sec = paperWizard.sections[index];
  let q = sec.data || {};
  container.innerHTML = `
    <h3>编辑题目</h3>
    <div class="form-group"><label>题型</label>
      <select id="q-edit-type">
        ${['选择','填空','判断','简答','综合大题'].map(t => `<option value="${t}" ${q.question_type===t?'selected':''}>${t}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label>题型名称（可选）</label><input id="q-edit-label" value="${escapeHtml(q.type_label || '')}" style="width:100%;" placeholder="如：填空题、句型转换"></div>
    <div class="form-group"><label>题干</label><textarea id="q-edit-stem" rows="3" style="width:100%;">${escapeHtml(q.content_latex || '')}</textarea></div>
    <div id="q-extra-fields"></div>
    <div id="q-answer-area"></div>
    <div class="form-group"><label>解析</label><textarea id="q-edit-analysis" rows="2" style="width:100%;">${escapeHtml(q.analysis_latex || '')}</textarea></div>
    <div class="form-group"><label>知识点</label>
      <div id="q-edit-kp-picker">
        <input type="text" id="q-edit-kp-input" placeholder="搜索知识点" value="${escapeHtml(q.knowledge_point || '')}" style="width:100%;">
        <div id="q-edit-kp-suggestions" style="border:1px solid var(--border);max-height:150px;overflow-y:auto;display:none;"></div>
        <input type="hidden" id="q-edit-kp-id" value="${q.knowledge_point_id || ''}">
      </div>
    </div>
    <button class="btn btn-sm btn-primary" id="save-q-btn">保存题目</button>
  `;

  // 绑定题型变化
  document.getElementById('q-edit-type').addEventListener('change', (e) => {
    renderQuestionExtraFields(e.target.value, q);
  });

  // 初始化额外字段
  renderQuestionExtraFields(q.question_type || '选择', q);

    // 知识点自动补全（完整版）
  const kpInput = document.getElementById('q-edit-kp-input');
  const kpSuggest = document.getElementById('q-edit-kp-suggestions');
  kpInput.addEventListener('input', debounce(async () => {
    const keyword = kpInput.value.trim();
    if (!keyword) { kpSuggest.style.display = 'none'; return; }
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
        kpSuggest.innerHTML = results.map(n => `<div data-id="${n.id}" data-name="${escapeHtml(n.name)}" style="padding:4px;cursor:pointer;">${escapeHtml(n.name)}</div>`).join('');
        kpSuggest.style.display = 'block';
        kpSuggest.querySelectorAll('div').forEach(d => {
          d.addEventListener('click', () => {
            kpInput.value = d.dataset.name;
            document.getElementById('q-edit-kp-id').value = d.dataset.id;
            kpSuggest.style.display = 'none';
          });
        });
      } else {
        kpSuggest.innerHTML = '<div style="padding:4px;">无匹配</div>';
        kpSuggest.style.display = 'block';
      }
    } catch(e) {}
  }, 300));
  if (window._qKpDocClick) {
    document.removeEventListener('click', window._qKpDocClick);
}
window._qKpDocClick = function(e) {
    const picker = document.getElementById('q-edit-kp-picker');
    const sugg = document.getElementById('q-edit-kp-suggestions');
    if (picker && !picker.contains(e.target) && sugg) {
        sugg.style.display = 'none';
    }
};
document.addEventListener('click', window._qKpDocClick);
  

  // 保存
  document.getElementById('save-q-btn').addEventListener('click', () => {
    const newData = {
      question_type: document.getElementById('q-edit-type').value,
      type_label: document.getElementById('q-edit-label').value,
      content_latex: document.getElementById('q-edit-stem').value,
      analysis_latex: document.getElementById('q-edit-analysis').value,
      knowledge_point: document.getElementById('q-edit-kp-input').value,
      knowledge_point_id: document.getElementById('q-edit-kp-id').value || null,
    };
    // 使用 saveQuestionFromEditor 补全答案数据
    const fullData = saveQuestionFromEditor(newData);
    paperWizard.sections[index].data = fullData;
    renderSectionList();
    renderPreviewWithHover();
    showToast('题目已保存');
});

}

function renderQuestionExtraFields(type, existingData) {
    const extraDiv = document.getElementById('q-extra-fields');
    const answerDiv = document.getElementById('q-answer-area');
    extraDiv.innerHTML = '';
    answerDiv.innerHTML = '';

    if (type === '选择') {
        const options = existingData?.options_latex ? JSON.parse(existingData.options_latex) : ['', '', '', ''];
        extraDiv.innerHTML = options.map((opt, i) => `
            <div style="display:flex;align-items:center;margin-bottom:4px;">
                <span>${'ABCD'[i]}.</span>
                <input type="text" class="q-option" data-index="${i}" value="${escapeHtml(opt)}" style="flex:1;margin-left:4px;">
            </div>
        `).join('');
        answerDiv.innerHTML = `<label>答案</label><select id="q-answer-select">
            <option value="">请选择</option>${'ABCD'.split('').map(l => `<option>${l}</option>`).join('')}
        </select>`;
        if (existingData?.answer_latex) {
            document.getElementById('q-answer-select').value = existingData.answer_latex;
        }
    } else if (type === '判断') {
        answerDiv.innerHTML = `<label>答案</label><select id="q-answer-select">
            <option value="">请选择</option><option>正确</option><option>错误</option>
        </select>`;
        if (existingData?.answer_latex) {
            document.getElementById('q-answer-select').value = existingData.answer_latex;
        }
    } else if (type === '填空' || type === '简答') {
        answerDiv.innerHTML = `<label>答案</label><textarea id="q-answer-input" rows="2" style="width:100%;">${escapeHtml(existingData?.answer_latex || '')}</textarea>`;
    } else if (type === '综合大题') {
        const subs = existingData?.answer_latex ? JSON.parse(existingData.answer_latex) : [];
        let subsHtml = '';
        subs.forEach((sub, i) => {
            subsHtml += `<div style="border:1px solid var(--border);padding:8px;margin-bottom:8px;">
                <div>(${i+1})</div>
                <textarea class="q-sub-stem" data-index="${i}" rows="2" style="width:100%;">${escapeHtml(sub.stem||'')}</textarea>
                <input class="q-sub-answer" data-index="${i}" style="width:100%;" placeholder="答案" value="${escapeHtml(sub.answer||'')}">
                <textarea class="q-sub-analysis" data-index="${i}" rows="2" style="width:100%;" placeholder="解析">${escapeHtml(sub.analysis||'')}</textarea>
            </div>`;
        });
        extraDiv.innerHTML = subsHtml;
    }
}

// ========== 自动保存 ==========
// 在切换section或点击保存按钮时已执行，无需额外自动保存

// ========== OCR搜题（只显示>75%重复） ==========
async function showOCRSearch() {
  // 创建文件选择
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append('file', file);
    // 调用OCR
    const res = await fetch(`${API_BASE}/ocr/recognize`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') },
      body: formData
    });
    const { latex } = await res.json();
    if (!latex) return showToast('识别失败');
    
    // 查重
    const dupData = await apiFetch(`/questions/check-duplicate?content=${encodeURIComponent(latex)}`);
    const threshold = 75;
    const similar = (dupData.similar_questions || []).filter(q => q.similarity >= threshold);
    if (similar.length === 0) {
      showToast('无相似题目');
      return;
    }
    
    // 显示结果列表（右侧面板）
    const panel = document.getElementById('wiz-score-summary'); // 临时借用右侧区域
    panel.style.display = 'block';
    panel.innerHTML = `<strong>相似题目（重复率>75%）</strong><br>` +
      similar.map(q => `
        <div class="dup-item" style="border:1px solid var(--border);border-radius:6px;padding:6px;margin:6px 0;display:flex;justify-content:space-between;align-items:center;">
          <span style="cursor:pointer;" class="dup-preview" data-qid="${q.id}">${q.id}: ${escapeHtml(q.content?.substring(0,20))} (${q.similarity}%)</span>
          <div>
            <button class="btn btn-sm btn-primary add-dup-btn" data-qid="${q.id}">添加</button>
            <button class="btn btn-sm btn-outline edit-dup-btn" data-qid="${q.id}">编辑</button>
          </div>
        </div>
      `).join('');
    
    // 悬停预览
    panel.querySelectorAll('.dup-preview').forEach(el => {
      el.addEventListener('mouseenter', async (e) => {
        const qid = el.dataset.qid;
        const detail = await apiFetch(`/questions/${qid}`);
        showTooltip(e, `<div style="max-width:300px;"><strong>${escapeHtml(detail.question_type)}</strong><br>${escapeHtml(detail.content_latex?.substring(0,100))}<br>答案：${escapeHtml(detail.answer_latex)}</div>`);
      });
      el.addEventListener('mouseleave', hideTooltip);
    });
    
    // 添加按钮
    panel.querySelectorAll('.add-dup-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const qid = btn.dataset.qid;
        const full = await apiFetch(`/questions/${qid}`);
        // 添加到试卷末尾
        paperWizard.sections.push({ type: 'question', data: full });
        renderSectionList();
        renderPreviewWithHover();
        showToast('已添加题目');
      });
    });
    
    // 编辑按钮：添加到试卷并打开编辑
    panel.querySelectorAll('.edit-dup-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const qid = btn.dataset.qid;
        const full = await apiFetch(`/questions/${qid}`);
        const newIndex = paperWizard.sections.length;
        paperWizard.sections.push({ type: 'question', data: full });
        renderSectionList();
        renderPreviewWithHover();
        switchToSection(newIndex);
        showToast('已添加并打开编辑');
      });
    });
  };
  input.click();
}

// ========== 批量分值设定 ==========
async function showScoreEditor() {
  const questions = paperWizard.sections.filter(s => s.type === 'question');
  if (questions.length === 0) return showToast('没有题目');
  let html = '<div style="max-height:400px;overflow-y:auto;">';
  questions.forEach((sec, idx) => {
    const q = sec.data || {};
    html += `<div style="display:flex;align-items:center;margin:4px 0;"><span style="width:50px;">题${idx+1}</span>
      <input type="number" class="score-input" data-index="${idx}" value="${q.score || 10}" min="0.5" max="100" step="0.5" style="width:80px;"></div>`;
  });
  html += '</div>';
  await showModal('设定分值', {
    type: 'form',
    html,
    onConfirm: () => {
      document.querySelectorAll('.score-input').forEach(inp => {
        const idx = parseInt(inp.dataset.index);
        const sec = paperWizard.sections.filter(s => s.type === 'question')[idx];
        if (sec) sec.data.score = parseFloat(inp.value);
      });
      renderSectionList();
      renderPreviewWithHover();
      updateScoreSummary();
    }
  });
}

// ========== 编辑试卷信息 ==========
async function editMetaInfo() {
  const formHtml = `
    <div class="form-group"><label>试卷名称</label><input id="meta-title" value="${escapeHtml(paperWizard.title)}" style="width:100%;"></div>
    <div class="form-group"><label>试卷类型</label>
      <select id="meta-paper-type">
        ${['试卷','讲义','教辅','教材','错题本','每日一题'].map(t => `<option value="${t}" ${paperWizard.paperType===t?'selected':''}>${t}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label>学段</label><select id="meta-stage">${['X','C','G','Z','K'].map(s => `<option value="${s}" ${paperWizard.stage===s?'selected':''}>${s}</option>`).join('')}</select></div>
    <div class="form-group"><label>考试类型</label><input id="meta-exam" value="${escapeHtml(paperWizard.metaInfo.examType || '')}"></div>
    <div class="form-group"><label>年份</label><input id="meta-year" type="number" value="${paperWizard.metaInfo.year || ''}"></div>
    <div class="form-group"><label>年级</label><input id="meta-grade" value="${escapeHtml(paperWizard.metaInfo.grade || '')}"></div>
    <div class="form-group"><label>学期</label><input id="meta-semester" value="${escapeHtml(paperWizard.metaInfo.semester || '')}"></div>
    <div class="form-group"><label>适用范围</label><input id="meta-scope" value="${escapeHtml(paperWizard.metaInfo.scope || '')}"></div>
  `;
  await showModal('编辑试卷信息', {
    type: 'form',
    html: formHtml,
    onConfirm: () => {
      paperWizard.title = document.getElementById('meta-title').value;
      paperWizard.paperType = document.getElementById('meta-paper-type').value;
      paperWizard.stage = document.getElementById('meta-stage').value;
      paperWizard.metaInfo.examType = document.getElementById('meta-exam').value;
      paperWizard.metaInfo.year = document.getElementById('meta-year').value;
      paperWizard.metaInfo.grade = document.getElementById('meta-grade').value;
      paperWizard.metaInfo.semester = document.getElementById('meta-semester').value;
      paperWizard.metaInfo.scope = document.getElementById('meta-scope').value;
      renderPreviewWithHover();
    }
  });
}

// ========== 保存试卷（最终入库） ==========
async function saveFullPaper() {
  try {
    const meta = { ...paperWizard.metaInfo, origin: paperWizard.origin || 'manual', status: 'completed' };
    await apiFetch(`/papers/${paperWizard.paperId}`, {
      method: 'PUT',
      body: JSON.stringify({
        title: paperWizard.title,
        meta_info: meta,
        answer_mode: 'teacher'
      })
    });
    
    for (const sec of paperWizard.sections) {
      if (sec.type === 'title') {
        await apiFetch(`/papers/${paperWizard.paperId}/questions`, {
          method: 'POST',
          body: JSON.stringify({ is_text: 1, text_content: sec.data.content, sort_order: paperWizard.sections.indexOf(sec) + 1 })
        });
      } else if (sec.type === 'knowledge') {
        let kuData = sec.data;
        if (!kuData.id) {
          kuData.source = paperWizard.title;
          const newKu = await apiFetch('/questions/', { method: 'POST', body: JSON.stringify(kuData) });
          kuData.id = newKu.id;
        }
        await apiFetch(`/papers/${paperWizard.paperId}/questions`, {
          method: 'POST',
          body: JSON.stringify({
            question_id: kuData.id,
            score: 0,
            sort_order: paperWizard.sections.indexOf(sec) + 1,
            is_knowledge_block: 1
          })
        });
      } else if (sec.type === 'question') {
        let qData = sec.data;
        if (!qData.content_latex) continue;
        if (!qData.id) {
          qData.source = paperWizard.title;
          const newQ = await apiFetch('/questions/', { method: 'POST', body: JSON.stringify(qData) });
          qData.id = newQ.id;
        }
        await apiFetch(`/papers/${paperWizard.paperId}/questions`, {
          method: 'POST',
          body: JSON.stringify({ question_id: qData.id, score: qData.score || 10, sort_order: paperWizard.sections.indexOf(sec) + 1 })
        });
      }
    }
    
    showToast('试卷保存成功！');
    switchMainTab('papers');
  } catch(e) {
    showToast('保存失败: ' + e.message);
  }
}

// ========== 预览导出 ==========
async function previewPaperExport() {
  try {
    const res = await fetch(`/papers/${paperWizard.paperId}/export/pdf?mode=teacher`, {
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url);
  } catch(e) { showToast('预览失败'); }
}

// ========== 辅助函数：统计分数、悬停提示等 ==========
function updateScoreSummary() {
  const questions = paperWizard.sections.filter(s => s.type === 'question' && s.data?.score);
  const total = questions.reduce((sum, sec) => sum + (sec.data.score || 0), 0);
  const summary = document.getElementById('wiz-score-summary');
  if (summary) summary.innerHTML = `总分：${total} 分<br>题目数：${questions.length}`;
}

// tooltip 简单实现
let tooltipEl = null;
function showTooltip(event, content) {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.style.cssText = 'position:fixed;z-index:99999;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px;max-width:350px;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,0.2);pointer-events:none;';
    document.body.appendChild(tooltipEl);
  }
  tooltipEl.innerHTML = content;
  tooltipEl.style.left = event.clientX + 10 + 'px';
  tooltipEl.style.top = event.clientY + 10 + 'px';
  tooltipEl.style.display = 'block';
}
function hideTooltip() {
  if (tooltipEl) tooltipEl.style.display = 'none';
}

// 确保全局可访问
window.insertKnowledgePointToPaper = (kpId, kpName, description) => {
  paperWizard.sections.push({ type: 'title', data: { content: `知识点：${kpName}\n${description}` } });
  renderSectionList();
  renderPreviewWithHover();
};
// 从组卷编辑器进入核对模式
function openPaperWizardForReview() {
    // paperWizard 已经由 collectCartData 填充好了 sections 和 paperId、title 等
    // 渲染三栏界面（与新建向导类似，但顶部标题区分）
    renderWizardFullUI();
    // 修改保存按钮文字为“确认导出”，并调整行为
    const saveBtn = document.getElementById('wiz-save-paper-btn');
    if (saveBtn) {
        saveBtn.innerText = '📤 确认导出';
        saveBtn.onclick = () => {
            // 核对模式下，直接导出当前试卷（不再重复保存题目，题目已在组卷编辑器中保存）
            previewPaperExport();
        };
    }
    // 可添加一个“返回组卷”按钮
    const previewBtn = document.getElementById('wiz-preview-export-btn');
    if (previewBtn) {
        previewBtn.innerText = '📄 导出 PDF';
        previewBtn.onclick = previewPaperExport;
    }
    // 显示当前组卷标题
    const titleEl = document.querySelector('.wiz-center .preview-block:first-child strong');
    if (titleEl) titleEl.innerText = paperWizard.title;
}
function showInsertMenuAtBottom(index) {
  const menu = document.createElement('div');
  menu.style.cssText = 'position:fixed;z-index:10000;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:8px;min-width:160px;';
  menu.style.left = '50%';
  menu.style.top = '50%';
  menu.style.transform = 'translate(-50%, -50%)';
  menu.innerHTML = `
    <div class="menu-item" data-action="title">📌 插入标题</div>
    <div class="menu-item" data-action="knowledge">📚 插入知识单元</div>
    <div class="menu-item" data-action="question">📝 插入题目</div>
  `;
  document.body.appendChild(menu);

  menu.querySelectorAll('.menu-item').forEach(item => {
    item.style.cssText = 'padding:6px 8px;cursor:pointer;';
    item.addEventListener('mouseenter', (e) => e.target.style.background = 'var(--bg)');
    item.addEventListener('mouseleave', (e) => e.target.style.background = '');
    item.addEventListener('click', () => {
      const action = item.dataset.action;
      if (action === 'title') {
        const title = prompt('请输入标题文本');
        if (title) insertSectionAt(index, 'title', { content: title });
      } else if (action === 'knowledge') {
        openKnowledgePickerForWizard(index);
      } else if (action === 'question') {
        insertSectionAt(index, 'question', null);
        switchToSection(index);
      }
      document.body.removeChild(menu);
    });
  });

  setTimeout(() => {
    window.addEventListener('click', function closeMenu(e) {
      if (!menu.contains(e.target)) {
        document.body.removeChild(menu);
        window.removeEventListener('click', closeMenu);
      }
    });
  }, 0);
}
function toggleOCRChat() {
  const chatDiv = document.getElementById('wiz-ocr-chat');
  if (chatDiv.style.display === 'flex') {
    chatDiv.style.display = 'none';
    return;
  }
  chatDiv.style.display = 'flex';
  chatDiv.innerHTML = `
    <div style="padding:8px;font-weight:500;border-bottom:1px solid var(--border);">🔍 OCR 搜题</div>
    <div id="ocr-chat-messages" style="flex:1;overflow-y:auto;padding:8px;font-size:13px;">
      <div style="color:var(--text-secondary);">上传图片或粘贴/拖拽图片到下方，自动识别并查重</div>
    </div>
    <div style="border-top:1px solid var(--border);padding:8px;">
      <div id="ocr-drop-zone" style="border:1px dashed var(--border);border-radius:8px;padding:12px;text-align:center;color:var(--text-secondary);cursor:pointer;background:var(--bg);">
        <i class="fas fa-cloud-upload-alt"></i> 点击上传、粘贴或拖拽图片到此处
        <input type="file" id="ocr-file-input" accept="image/*" style="display:none;" multiple>
      </div>
    </div>
  `;

  const fileInput = document.getElementById('ocr-file-input');
  const dropZone = document.getElementById('ocr-drop-zone');

  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleOCRFileSelect);

  // 粘贴事件
  dropZone.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (items) {
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          processOCRImage(file);
          break;
        }
      }
    }
  });

  // 拖拽事件
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--primary)'; });
  dropZone.addEventListener('dragleave', (e) => { dropZone.style.borderColor = 'var(--border)'; });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--border)';
    const files = e.dataTransfer.files;
    if (files.length > 0) processOCRImage(files[0]);
  });

  function handleOCRFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) processOCRImage(files[0]);
    fileInput.value = '';
  }

  async function processOCRImage(file) {
    const messages = document.getElementById('ocr-chat-messages');
    messages.innerHTML += `<div style="margin:4px 0;"><i class="fas fa-spinner fa-spin"></i> 识别中...</div>`;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${API_BASE}/ocr/recognize`, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') },
        body: formData
      });
      const { latex } = await res.json();
      if (!latex) {
        messages.innerHTML += `<div style="color:var(--danger);">识别失败</div>`;
        return;
      }
      // 查重
      const dupData = await apiFetch(`/questions/check-duplicate?content=${encodeURIComponent(latex)}`);
      const threshold = 75;
      const similar = (dupData.similar_questions || []).filter(q => q.similarity >= threshold);
      messages.innerHTML = `<div style="margin:4px 0;">识别结果：${escapeHtml(latex.substring(0, 50))}...</div>`;
      if (similar.length === 0) {
        messages.innerHTML += `<div style="color:var(--text-secondary);">未发现相似题目</div>`;
      } else {
        messages.innerHTML += `<div><strong>相似题目（>75%）：</strong></div>`;
        similar.forEach(q => {
          const div = document.createElement('div');
          div.style.cssText = 'border:1px solid var(--border);border-radius:6px;padding:6px;margin:4px 0;display:flex;justify-content:space-between;align-items:center;';
          div.innerHTML = `
            <span class="dup-preview" data-qid="${q.id}" style="cursor:pointer;">${q.id}: ${escapeHtml(q.content?.substring(0,20))} (${q.similarity}%)</span>
            <div>
              <button class="btn btn-sm btn-primary add-dup-btn" data-qid="${q.id}">添加</button>
              <button class="btn btn-sm btn-outline edit-dup-btn" data-qid="${q.id}">编辑</button>
            </div>
          `;
          messages.appendChild(div);
          // 悬停预览
          div.querySelector('.dup-preview').addEventListener('mouseenter', async (e) => {
            const detail = await apiFetch(`/questions/${q.id}`);
            showTooltip(e, `<div style="max-width:300px;"><strong>${escapeHtml(detail.question_type)}</strong><br>${escapeHtml(detail.content_latex?.substring(0,100))}<br>答案：${escapeHtml(detail.answer_latex)}</div>`);
          });
          div.querySelector('.dup-preview').addEventListener('mouseleave', hideTooltip);
          div.querySelector('.add-dup-btn').addEventListener('click', async () => {
            const full = await apiFetch(`/questions/${q.id}`);
            paperWizard.sections.push({ type: 'question', data: full });
            renderSectionList();
            renderPreviewWithHover();
            showToast('已添加题目');
          });
          div.querySelector('.edit-dup-btn').addEventListener('click', async () => {
            const full = await apiFetch(`/questions/${q.id}`);
            const newIndex = paperWizard.sections.length;
            paperWizard.sections.push({ type: 'question', data: full });
            renderSectionList();
            renderPreviewWithHover();
            switchToSection(newIndex);
            showToast('已添加并打开编辑');
          });
        });
      }
    } catch (e) {
      messages.innerHTML += `<div style="color:var(--danger);">处理失败: ${e.message}</div>`;
    }
  }
}