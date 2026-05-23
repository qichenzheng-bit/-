function renderDrawingModule(container) {
    container.innerHTML = `
        <div style="display:flex; height:100%;">
            <div style="width:220px; background:var(--surface); border-right:1px solid var(--border); overflow-y:auto; padding:10px;">
                <h4>绘图工具</h4>
                <div class="tool-group"><div class="group-title" onclick="toggleGroup(this)">📌 基础图形</div>
                    <div class="group-items">
                        <button class="drawing-tool-btn" id="drawing-tool-point" onclick="setMode('point')">📍 点</button>
                        <button class="drawing-tool-btn" id="drawing-tool-line" onclick="setMode('line')">📏 直线</button>
                        <button class="drawing-tool-btn" id="drawing-tool-segment" onclick="setMode('segment')">📐 线段</button>
                        <button class="drawing-tool-btn" id="drawing-tool-ray" onclick="setMode('ray')">➡️ 射线</button>
                        <button class="drawing-tool-btn" id="drawing-tool-circle" onclick="setMode('circle')">⭕ 圆</button>
                        <button class="drawing-tool-btn" id="drawing-tool-ellipse" onclick="setMode('ellipse')">🥚 椭圆</button>
                        <button class="drawing-tool-btn" id="drawing-tool-polygon" onclick="setMode('polygon')">🔷 多边形</button>
                        <button onclick="finishPolygon()">✅ 完成多边形</button>
                    </div>
                </div>
                <div class="tool-group"><div class="group-title" onclick="toggleGroup(this)">📈 函数与曲线</div>
                    <div class="group-items" style="display:none">
                        <button onclick="addFunctionGraph()">📉 函数图像</button>
                        <button onclick="addParametric()">🌀 参数曲线</button>
                    </div>
                </div>
                <div class="tool-group"><div class="group-title" onclick="toggleGroup(this)">📊 统计图表</div>
                    <div class="group-items" style="display:none">
                        <button onclick="addBarChart()">📊 柱状图</button>
                        <button onclick="addPieChart()">🥧 饼图</button>
                        <button onclick="importExcel()">📥 导入Excel生成</button>
                    </div>
                </div>
                <div class="tool-group"><div class="group-title" onclick="toggleGroup(this)">🧊 立体几何</div>
                    <div class="group-items" style="display:none">
                        <button onclick="addCube()">📦 正方体</button>
                    </div>
                </div>
                <div class="tool-group"><div class="group-title" onclick="toggleGroup(this)">🤖 AI 识别</div>
                    <div class="group-items" style="display:none">
                        <button onclick="importImageForAI()">🖼️ 上传图片识别</button>
                    </div>
                </div>
                <hr>
                <button class="btn btn-primary" style="width:100%;" onclick="exportSVG()">保存为 SVG</button>
                <button class="btn btn-outline" style="width:100%; margin-top:4px;" onclick="exportPNG()">保存为 PNG</button>
                <button class="btn btn-danger" style="width:100%; margin-top:4px;" onclick="clearAll()">清空画布</button>
            </div>
            <div style="flex:1; display:flex; flex-direction:column;">
                <div id="jxgbox-main" style="flex:1; border-bottom:1px solid var(--border);"></div>
            </div>
        </div>
    `;
    initDrawingBoard();
    setMode('select');
}

function toggleGroup(el) {
    const items = el.nextElementSibling;
    if (items) items.style.display = items.style.display === 'none' ? 'flex' : 'none';
}