// 行首数字编号去除
function stripNumberPrefix(line) {
    return line.replace(/^\s*\d+\s*\.?\s*/, '').trim();
}

// 题型检测（判断题优先）
function determineTypeFromOCR(text) {
    const lines = text.split(/\r?\n/).map(stripNumberPrefix).filter(l => l.trim());
    if (lines.length === 0) return '填空';

    // 判断题：任意行是“正确”或“错误”独立词
    if (lines.some(l => /^\s*(正确|错误)\s*$/.test(l))) return '判断';

    // 选择题：统计 A/B/C/D 选项行（排除选项内容为“正确/错误”的行）
    const choicePattern = /^\s*[A-D]\s*[\.\、\)]\s+(.*)/;
    const choiceLines = lines.filter(l => {
        const m = l.match(choicePattern);
        if (!m) return false;
        const content = m[1].trim();
        return !/^(正确|错误)$/.test(content);
    });
    if (choiceLines.length >= 2) return '选择';

    // 综合大题
    const subPattern = /^\s*\(\d+\)/;
    if (lines.filter(l => subPattern.test(l)).length >= 2) return '综合大题';

    // 填空题特征
    if (/\\underline|\_{3,}/.test(text)) return '填空';

    return '填空';
}

// 清洗题干（去除选项行、子题行、噪声行）
function cleanStem(text) {
    let lines = text.split(/\r?\n/).map(stripNumberPrefix).filter(l => l.trim());
    const subPattern = /^\s*\(\d+\)/;
    const choicePattern = /^\s*[A-D]\s*[\.\、\)]\s+\S/;
    const noisePattern = /(答案|解析|分析|故选|综上|因此|所以|故|注|LaTeX代码)/;

    const cleanedLines = [];
    for (const line of lines) {
        // 跳过纯判断词行
        if (/^\s*(正确|错误|对|错)\s*$/.test(line)) continue;
        if (noisePattern.test(line)) continue;
        if (subPattern.test(line)) continue;
        if (choicePattern.test(line)) break; // 遇到第一个选项行就停止
        cleanedLines.push(line);
    }

    let cleaned = cleanedLines.join(' ').replace(/\s+/g, ' ').trim();
    cleaned = cleaned.replace(/^[\s]*例\s*\d+[\s\.\、]*/i, '');
    cleaned = cleaned.replace(/^[\s]*\d+[\.\、\s]+/, '');
    if (cleaned.length > 500) cleaned = cleaned.substring(0, 500);
    return cleaned;
}

// 提取选项（去重，只保留 A/B/C/D 各一次）
function extractOptions(text) {
    const lines = text.split(/\r?\n/).map(stripNumberPrefix).filter(l => l.trim());
    const options = {};
    const regex = /^\s*([A-D])\s*[\.\、\)]\s+(.*)/;
    for (const line of lines) {
        const match = line.match(regex);
        if (match) {
            const label = match[1];
            if (!options[label]) {
                let content = match[2].trim();
                content = content.replace(/^[A-D]\s*[\.\、\)]\s*/, '');
                options[label] = content;
            }
        }
    }
    return ['A','B','C','D'].filter(l => options[l]).map(label => ({ label, text: options[label] }));
}

// 提取综合大题子题（去重排序）
function extractSubQuestions(text) {
    const lines = text.split(/\r?\n/).map(stripNumberPrefix).filter(l => l.trim());
    const subMap = new Map();
    const regex = /^\s*\((\d+)\)\s*(.*)/;
    for (const line of lines) {
        const match = line.match(regex);
        if (match) {
            const index = parseInt(match[1]);
            if (!subMap.has(index)) {
                let stem = match[2].trim();
                stem = stem.replace(/^[A-D]\s*[\.\、\)]\s*/, '');
                subMap.set(index, { index, stem, answer: '', analysis: '' });
            }
        }
    }
    return Array.from(subMap.entries()).sort((a,b)=>a[0]-b[0]).map(([_, sub]) => sub);
}

// 提取判断题答案
function extractJudgeAnswer(text) {
    const m = text.match(/(正确|错误)/);
    return m ? m[1] : '';
}