let recognizedQueue = [];
let currentQueueIndex = -1;

function addToQueue(questionData) {
    recognizedQueue.push(questionData);
    if (recognizedQueue.length === 1) loadQuestionFromQueue(0);
    updateQueueNav();
}

function updateQueueNav() {
    const nav = document.getElementById('queue-nav');
    const info = document.getElementById('queue-info');
    if (!nav || !info) return;
    if (recognizedQueue.length > 0) {
        nav.style.display = 'flex';
        info.textContent = `${currentQueueIndex + 1}/${recognizedQueue.length}`;
    } else nav.style.display = 'none';
}

async function loadQuestionFromQueue(index) {
    if (index < 0 || index >= recognizedQueue.length) return;
    currentQueueIndex = index;
    const q = recognizedQueue[index];
    document.getElementById('input-question-type').value = q.type;
    currentOptions = q.options || [''];
    currentSubQuestions = q.subQuestions || [];
    await renderForm();
    document.getElementById('stem-input').value = q.stem || '';
    if (q.type === '选择' && q.answer) document.getElementById('answer-select').value = q.answer;
    else if (q.type === '填空' && q.answer) document.getElementById('answer-input').value = q.answer;
    else if (q.type === '判断' && q.answer) document.getElementById('answer-select').value = q.answer;
    if (q.analysis) document.getElementById('analysis-input').value = q.analysis;
    if (q.knowledgePoint) {
        const sel = document.getElementById('knowledge-select');
        for (let i = 0; i < sel.options.length; i++) {
            if (sel.options[i].text.startsWith(q.knowledgePoint)) { sel.selectedIndex = i; break; }
        }
    }
    updatePreviewFromForm();
    updateQueueNav();
}