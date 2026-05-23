// 自定义标签管理

async function renderTagsManager(container) {
    container.innerHTML = `
        <div style="padding:20px; max-width:600px;">
            <h3>标签管理</h3>
            <p style="color:var(--text-secondary); margin-bottom:16px;">创建和管理自定义标签，用于多维度分类题目。</p>
            <div style="display:flex; gap:8px; margin-bottom:16px;">
                <input type="text" id="new-tag-name" placeholder="新标签名称" style="flex:1;">
                <button class="btn btn-primary" id="create-tag-btn">创建</button>
            </div>
            <div id="tags-list"></div>
        </div>
    `;

    const loadTags = async () => {
        // 从题库中收集所有已有标签
        const data = await apiFetch('/questions/?page=1&page_size=1000');
        const allTags = new Set();
        data.items.forEach(q => {
            if (q.tags && Array.isArray(q.tags)) {
                q.tags.forEach(t => allTags.add(t));
            }
        });
        const tagsList = Array.from(allTags).sort();
        const listDiv = document.getElementById('tags-list');
        listDiv.innerHTML = tagsList.map(tag => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid var(--border);">
                <span>${escapeHtml(tag)}</span>
                <button class="btn btn-sm btn-danger" data-tag="${escapeHtml(tag)}">删除</button>
            </div>
        `).join('');
        listDiv.querySelectorAll('.btn-danger').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm(`确认删除标签"${btn.dataset.tag}"？将从所有题目中移除。`)) return;
                // 批量移除标签（需要后端支持，此处简单遍历）
                // 实际应调用批量更新接口，这里简化
                const allQuestions = await apiFetch('/questions/?page_size=1000');
                for (const q of allQuestions.items) {
                    if (q.tags && q.tags.includes(btn.dataset.tag)) {
                        const newTags = q.tags.filter(t => t !== btn.dataset.tag);
                        await apiFetch(`/questions/batch`, {
                            method: 'PUT',
                            body: JSON.stringify({ question_ids: [q.id], tags: newTags })
                        });
                    }
                }
                showToast('标签已删除');
                loadTags();
            });
        });
    };

    document.getElementById('create-tag-btn').addEventListener('click', async () => {
        const name = document.getElementById('new-tag-name').value.trim();
        if (!name) return showToast('请输入标签名');
        // 标签创建不单独存储，在题目中首次使用时即创建。
        // 这里可提示用户标签将在为题目打标时出现。
        showToast('标签已创建（在题目编辑中可使用）');
        document.getElementById('new-tag-name').value = '';
        loadTags();
    });

    loadTags();
}

// 在需要的地方调用 renderTagsManager