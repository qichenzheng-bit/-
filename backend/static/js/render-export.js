async function renderExportSettingsModule(container) {
    container.innerHTML = `
        <div style="padding:20px; max-width:600px;">
            <h3>导出偏好设置</h3>
            <div class="card" style="padding:16px;">
                <div class="form-group">
                    <label>默认答案模式</label>
                    <select id="export-default-mode">
                        <option value="teacher">教师版（题目+答案+解析）</option>
                        <option value="student">学生版（仅题目）</option>
                        <option value="answer_only">纯答案版</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>默认模板</label>
                    <select id="export-default-template">
                        <option value="exam">标准试卷（自动匹配学段）</option>
                        <option value="elegantbook">ElegantBook 讲义</option>
                        <option value="tutorial">教辅模板</option>
                        <option value="textbook">教材模板</option>
                        <option value="mistake_book">错题本模板</option>
                        <option value="daily_card">每日一题卡片</option>
                        <option value="answer_sheet">独立答题卡</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>默认显示分值</label>
                    <select id="export-default-show-score">
                        <option value="true">显示</option>
                        <option value="false">不显示</option>
                    </select>
                </div>
                <button class="btn btn-primary" id="save-export-prefs">保存设置</button>
            </div>
        </div>
    `;

    // 加载已保存的偏好
    const prefs = JSON.parse(localStorage.getItem('mathpulse_export_prefs') || '{}');
    if (prefs.mode) document.getElementById('export-default-mode').value = prefs.mode;
    if (prefs.template) document.getElementById('export-default-template').value = prefs.template;
    if (prefs.showScore !== undefined) {
        document.getElementById('export-default-show-score').value = prefs.showScore ? 'true' : 'false';
    }

    document.getElementById('save-export-prefs').addEventListener('click', () => {
        const prefs = {
            mode: document.getElementById('export-default-mode').value,
            template: document.getElementById('export-default-template').value,
            showScore: document.getElementById('export-default-show-score').value === 'true'
        };
        localStorage.setItem('mathpulse_export_prefs', JSON.stringify(prefs));
        showToast('偏好已保存');
    });
}