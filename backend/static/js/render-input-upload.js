let imagePendingFiles = [];

function initImageUpload() {
    const pasteHandler = (e) => {
        const items = e.clipboardData?.items;
        if(!items) return;
        for(const item of items){
            if(item.type.startsWith('image/')){
                e.preventDefault();
                handleImageFile(item.getAsFile());
                break;
            }
        }
    };
    document.addEventListener('paste', pasteHandler);
    const uploadArea = document.getElementById('image-upload-area');
    if(uploadArea){
        uploadArea.addEventListener('dragover', e=>e.preventDefault());
        uploadArea.addEventListener('drop', e=>{
            e.preventDefault();
            if(e.dataTransfer.files.length>0) handleImageFile(e.dataTransfer.files[0]);
        });
    }
}

async function handleImageFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    const modeSelect = document.getElementById('ocr-mode-select');
    const mode = modeSelect ? modeSelect.value : 'ai';
    const endpoint = `/ocr/recognize?mode=${mode}`;
    try {
        const res = await fetch(API_BASE + endpoint, { method:'POST', body: formData });
        const data = await res.json();
        const latex = data.latex || '';
        const el = lastFocusedInput || document.getElementById('stem-input');
        if(el) {
            const start = el.selectionStart || 0;
            el.value = el.value.substring(0, start) + latex + el.value.substring(el.selectionEnd);
            el.focus();
            el.dispatchEvent(new Event('input'));
        }
        showToast('识别完成');
    } catch(e) { showToast('识别失败: '+e.message); }
}