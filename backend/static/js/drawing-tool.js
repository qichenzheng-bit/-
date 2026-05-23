let drawingBoard = null;
let drawingElements = [];
let currentMode = 'select';
let polygonPoints = [];
let tempLinePoints = [];

function initDrawingBoard() {
    const box = document.getElementById('jxgbox-main');
    if (!box) return;
    if (drawingBoard) { try { JXG.JSXGraph.freeBoard(drawingBoard); } catch(e) {} }
    drawingBoard = JXG.JSXGraph.initBoard('jxgbox-main', {
        boundingbox: [-8, 6, 8, -6],
        axis: true,
        showCopyright: false,
        zoom: { wheel: true, needShift: false },
        pan: { enabled: true, needTwoFingers: true }
    });
    drawingElements = [];
    polygonPoints = [];
    tempLinePoints = [];
    currentMode = 'select';

    drawingBoard.on('down', function(e) {
        const coords = drawingBoard.getUsrCoordsOfMouse(e);
        const x = coords[0], y = coords[1];

        if (currentMode === 'point') {
            const p = drawingBoard.create('point', [x, y], { size: 4, name: `(${x.toFixed(1)},${y.toFixed(1)})`, color: 'red' });
            drawingElements.push(p);
            return;
        }

        if (currentMode === 'polygon') {
            polygonPoints.push([x, y]);
            const temp = drawingBoard.create('point', [x, y], { size: 3, color: 'blue', name: '' });
            drawingElements.push(temp);
            if (polygonPoints.length >= 3) {
                const last = drawingElements.pop();
                if (last && last.elType === 'polygon') drawingBoard.removeObject(last);
                const preview = drawingBoard.create('polygon', polygonPoints, { fillColor: '#89c2d9', fillOpacity: 0.3, strokeWidth: 1 });
                drawingElements.push(preview);
            }
            return;
        }

        if (['line', 'segment', 'ray', 'circle', 'ellipse'].includes(currentMode)) {
            tempLinePoints.push([x, y]);
            const tempPoint = drawingBoard.create('point', [x, y], { size: 3, color: 'green', name: '' });
            drawingElements.push(tempPoint);
            if (tempLinePoints.length === 2) {
                const [p1, p2] = tempLinePoints;
                let newObj;
                switch (currentMode) {
                    case 'line': newObj = drawingBoard.create('line', [p1, p2], { strokeWidth: 2, color: 'blue' }); break;
                    case 'segment': newObj = drawingBoard.create('segment', [p1, p2], { strokeWidth: 2 }); break;
                    case 'ray': newObj = drawingBoard.create('line', [p1, p2], { straightFirst: true, straightLast: false, strokeWidth: 2, color: 'purple' }); break;
                    case 'circle': const r = Math.sqrt((p2[0]-p1[0])**2 + (p2[1]-p1[1])**2); newObj = drawingBoard.create('circle', [p1, r], { strokeWidth: 2, color: 'green' }); break;
                    case 'ellipse': const a = Math.abs(p2[0] - p1[0]); const b = Math.abs(p2[1] - p1[1]); newObj = drawingBoard.create('ellipse', [p1, [p1[0]+a, p1[1]], [p1[0], p1[1]+b]], { strokeWidth: 2, color: 'orange' }); break;
                }
                if (newObj) drawingElements.push(newObj);
                drawingElements.slice(-2).forEach(o => drawingBoard.removeObject(o));
                drawingElements = drawingElements.slice(0, -2);
                tempLinePoints = [];
            }
        }
    });
}

function finishPolygon() {
    if (polygonPoints.length >= 3) {
        drawingElements.forEach(el => { if (el.elType === 'point' && el.visProp.size === 3) try { drawingBoard.removeObject(el); } catch(e) {} });
        drawingElements = drawingElements.filter(el => !(el.elType === 'point' && el.visProp.size === 3));
        const poly = drawingElements.find(el => el.elType === 'polygon');
        if (poly) { drawingBoard.removeObject(poly); drawingElements = drawingElements.filter(el => el !== poly); }
        const finalPoly = drawingBoard.create('polygon', polygonPoints, { fillColor: '#89c2d9', fillOpacity: 0.3, strokeWidth: 1.5 });
        drawingElements.push(finalPoly);
        polygonPoints = [];
        showToast('多边形已创建');
    }
}

function setMode(mode) {
    currentMode = mode;
    polygonPoints = [];
    tempLinePoints = [];
    document.querySelectorAll('.drawing-tool-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`drawing-tool-${mode}`);
    if (activeBtn) activeBtn.classList.add('active');
    const tips = { point: '点击画布放置点', line: '点击两点确定直线', segment: '点击两点确定线段', ray: '点击起点再点击方向点', circle: '点击圆心再点击一点确定半径', ellipse: '点击中心再点击一点确定半轴', polygon: '依次点击顶点，然后点击“完成多边形”', select: '默认选择/拖拽模式' };
    if (tips[mode]) showToast(tips[mode]);
}

function addFunctionGraph() {
    const expr = prompt('函数表达式 (如 sin(x), x^2):', 'x^2');
    if (!expr) return;
    const min = parseFloat(prompt('区间下限:', '-5'));
    const max = parseFloat(prompt('区间上限:', '5'));
    if (isNaN(min) || isNaN(max)) return;
    try {
        const f = drawingBoard.create('functiongraph', [expr, min, max], { strokeWidth: 2, color: 'red' });
        drawingElements.push(f);
    } catch(e) { showToast('表达式错误'); }
}

function addParametric() {
    const xFunc = prompt('x(t) 表达式 (如 cos(t)):', 'cos(t)');
    if (!xFunc) return;
    const yFunc = prompt('y(t) 表达式 (如 sin(t)):', 'sin(t)');
    if (!yFunc) return;
    const tMin = parseFloat(prompt('t 下限:', '0'));
    const tMax = parseFloat(prompt('t 上限:', '2*Math.PI'));
    if (isNaN(tMin) || isNaN(tMax)) return;
    try {
        const curve = drawingBoard.create('curve', [(t) => eval(`(${xFunc.replace(/t/g, `(${t})`)})`), (t) => eval(`(${yFunc.replace(/t/g, `(${t})`)})`), tMin, tMax], { strokeWidth: 2, color: 'purple' });
        drawingElements.push(curve);
    } catch(e) { showToast('表达式错误'); }
}

function addBarChart() {
    const dataStr = prompt('输入数据 (逗号分隔):', '2,5,3,7');
    if (!dataStr) return;
    const data = dataStr.split(',').map(Number);
    if (data.some(isNaN)) { showToast('输入无效'); return; }
    clearAll();
    const width = 0.6;
    data.forEach((val, i) => {
        const rect = drawingBoard.create('polygon', [[i - width/2, 0], [i + width/2, 0], [i + width/2, val], [i - width/2, val]], { fillColor: '#2563eb', fillOpacity: 0.7 });
        drawingElements.push(rect);
    });
    drawingBoard.setBoundingBox([-0.5, Math.max(...data)+1, data.length, -1], true);
}

function addPieChart() {
    const dataStr = prompt('各部分数值 (逗号分隔):', '3,5,2');
    if (!dataStr) return;
    const data = dataStr.split(',').map(Number);
    if (data.some(isNaN)) return;
    const sum = data.reduce((a,b)=>a+b,0);
    let startAngle = 0;
    const colors = ['#2563eb','#dc2626','#16a34a','#ea580c','#8b5cf6'];
    data.forEach((val, i) => {
        const angle = (val / sum) * Math.PI * 2;
        const sector = drawingBoard.create('sector', [[0,0],[Math.cos(startAngle), Math.sin(startAngle)],[Math.cos(startAngle+angle), Math.sin(startAngle+angle)]], { fillColor: colors[i % colors.length], fillOpacity: 0.8, strokeWidth: 1 });
        drawingElements.push(sector);
        startAngle += angle;
    });
}

function addCube() {
    clearAll();
    const pts = [[-1,-0.5],[1,-0.5],[1,0.5],[-1,0.5],[-1,1.5],[1,1.5],[1,2.5],[-1,2.5]];
    const edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
    edges.forEach(p => {
        const seg = drawingBoard.create('segment', [pts[p[0]], pts[p[1]]], { strokeWidth: 1.5 });
        drawingElements.push(seg);
    });
    drawingBoard.setBoundingBox([-2, 3, 2, -1]);
}

function clearAll() {
    if (!drawingBoard) return;
    drawingElements.forEach(el => { try { drawingBoard.removeObject(el); } catch(e) {} });
    drawingElements = [];
    polygonPoints = [];
    tempLinePoints = [];
}

function exportSVG() {
    if (!drawingBoard) return;
    const svg = drawingBoard.renderer.svgRoot;
    const svgData = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mathpulse-drawing.svg';
    a.click();
    URL.revokeObjectURL(url);
}

function exportPNG() {
    if (!drawingBoard) return;
    const svg = drawingBoard.renderer.svgRoot;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
        canvas.width = img.width * 2;
        canvas.height = img.height * 2;
        ctx.scale(2, 2);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        canvas.toBlob((b) => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(b);
            a.download = 'mathpulse-drawing.png';
            a.click();
        }, 'image/png');
    };
    img.src = url;
}

async function importImageForAI() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        try {
            showToast('AI 识别中...');
            const res = await fetch(API_BASE + '/ocr/recognize', { method: 'POST', body: formData });
            const data = await res.json();
            const latex = data.latex || '';
            if (latex.includes('x')) {
                const match = latex.match(/[a-z]\^?\d*/g);
                if (match) {
                    try {
                        const f = drawingBoard.create('functiongraph', [match[0], -5, 5], { strokeWidth: 2, color: 'red' });
                        drawingElements.push(f);
                        showToast('已绘制识别出的函数');
                    } catch(e) { showToast('绘制失败'); }
                }
            } else { showToast('未识别到函数表达式'); }
        } catch(err) { showToast('AI 识别失败'); }
    };
    input.click();
}

async function importExcel() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const reader = new FileReader();
            reader.onload = function(e) {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
                const numericData = rows.map(r => parseFloat(r[0])).filter(v => !isNaN(v));
                if (numericData.length === 0) { showToast('未找到数值数据'); return; }
                clearAll();
                const width = 0.6;
                numericData.forEach((val, i) => {
                    const rect = drawingBoard.create('polygon', [[i - width/2, 0], [i + width/2, 0], [i + width/2, val], [i - width/2, val]], { fillColor: '#2563eb', fillOpacity: 0.7 });
                    drawingElements.push(rect);
                });
                drawingBoard.setBoundingBox([-0.5, Math.max(...numericData)+1, numericData.length, -1], true);
            };
            reader.readAsArrayBuffer(file);
        } catch(err) { showToast('Excel 读取失败'); }
    };
    input.click();
}