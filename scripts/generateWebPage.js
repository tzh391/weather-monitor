const fs = require('fs');
const path = require('path');

// 站点配置
const STATIONS = {
    '58367': { name: '徐家汇', color: 'rgb(255, 99, 132)' },
    '58361': { name: '闵行', color: 'rgb(54, 162, 235)' },
    '58362': { name: '宝山', color: 'rgb(75, 192, 192)' },
    '58363': { name: '长江口', color: 'rgb(153, 102, 255)' },
    '58365': { name: '嘉定', color: 'rgb(255, 159, 64)' },
    '58366': { name: '崇明', color: 'rgb(255, 205, 86)' },
    '58369': { name: '南汇', color: 'rgb(201, 203, 207)' },
    '58370': { name: '浦东', color: 'rgb(100, 181, 246)' },
    '58460': { name: '金山', color: 'rgb(239, 83, 80)' },
    '58461': { name: '青浦', color: 'rgb(171, 71, 188)' },
    '58462': { name: '松江', color: 'rgb(255, 112, 67)' },
    '58463': { name: '奉贤', color: 'rgb(38, 198, 218)' },
    '58474': { name: '小洋山', color: 'rgb(102, 187, 106)' }
};

const DATA_DIR = path.join(__dirname, '..', 'weather_data');
const OUTPUT_DIR = path.join(__dirname, '..', 'public');

// 读取CSV数据
function readCSVData(filePath) {
    if (!fs.existsSync(filePath)) {
        return [];
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split('\n');
    if (lines.length <= 1) return [];
    
    const header = lines[0].split(',');
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        const row = {};
        header.forEach((key, index) => {
            row[key] = values[index];
        });
        data.push(row);
    }
    
    return data;
}

// 获取最近N天的日期
function getRecentDates(days = 7) {
    const dates = [];
    const now = new Date();
    
    for (let i = 0; i < days; i++) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        dates.push(dateStr);
    }
    
    return dates;
}

// 收集所有可用数据
function collectAllData() {
    const recentDates = getRecentDates(7);
    const allData = {};
    
    recentDates.forEach(date => {
        Object.keys(STATIONS).forEach(stationId => {
            const filePath = path.join(DATA_DIR, `weather_${stationId}_${date}.csv`);
            const data = readCSVData(filePath);
            
            if (data.length > 0) {
                if (!allData[stationId]) {
                    allData[stationId] = [];
                }
                allData[stationId].push(...data);
            }
        });
    });
    
    return allData;
}

// 转换为JSON格式
function convertToJSON(allData) {
    const result = {
        update_time: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
        stations: STATIONS,
        data: {}
    };
    
    Object.entries(allData).forEach(([stationId, records]) => {
        result.data[stationId] = records.map(record => ({
            timestamp: record.timestamp,
            temperature: parseFloat(record.ct) || null,
            humidity: parseFloat(record.humidity) || null,
            wind_speed: parseFloat(record.wind_speed) || null,
            wind_dir: record.wind_dir || null,
            rainfall: parseFloat(record.rainfall) || null,
            pressure: parseFloat(record.vaporpressuser) || null,
            visibility: parseFloat(record.visibility) || null
        }));
    });
    
    return result;
}

// 生成主页HTML
function generateIndexHTML() {
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>上海气象数据实时监测</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
        }
        
        .header {
            background: white;
            border-radius: 12px;
            padding: 30px;
            margin-bottom: 20px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        
        h1 {
            color: #333;
            font-size: 32px;
            margin-bottom: 10px;
            text-align: center;
        }
        
        .update-time {
            text-align: center;
            color: #666;
            font-size: 14px;
            margin-top: 10px;
        }
        
        .loading {
            text-align: center;
            padding: 50px;
            background: white;
            border-radius: 12px;
            color: #666;
        }
        
        .error {
            background: #fee;
            border: 2px solid #fcc;
            color: #c33;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }
        
        .station-card {
            background: white;
            border-radius: 8px;
            padding: 15px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            border-top: 4px solid #667eea;
        }
        
        .station-card h3 {
            margin-bottom: 12px;
            color: #333;
            font-size: 16px;
            border-bottom: 2px solid;
            padding-bottom: 8px;
        }
        
        .stat-row {
            display: flex;
            justify-content: space-between;
            padding: 6px 0;
            border-bottom: 1px solid #f0f0f0;
            font-size: 13px;
        }
        
        .stat-row:last-child {
            border-bottom: none;
        }
        
        .stat-label {
            color: #666;
            font-weight: 500;
        }
        
        .stat-value {
            color: #333;
            font-weight: 600;
        }
        
        .chart-container {
            background: white;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 20px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        
        .chart-wrapper {
            position: relative;
            height: 400px;
            margin-top: 15px;
        }
        
        .section-title {
            color: #333;
            font-size: 20px;
            margin-bottom: 15px;
            padding-left: 12px;
            border-left: 4px solid #667eea;
        }
        
        .tab-container {
            display: flex;
            gap: 10px;
            margin-bottom: 15px;
            flex-wrap: wrap;
        }
        
        .tab-button {
            padding: 10px 20px;
            border: 2px solid #667eea;
            background: white;
            color: #667eea;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            transition: all 0.3s;
        }
        
        .tab-button:hover {
            background: #f0f0f0;
        }
        
        .tab-button.active {
            background: #667eea;
            color: white;
        }
        
        @media (max-width: 768px) {
            h1 {
                font-size: 24px;
            }
            
            .stats-grid {
                grid-template-columns: 1fr;
            }
            
            .chart-wrapper {
                height: 300px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🌤️ 上海气象数据实时监测系统</h1>
            <div class="update-time" id="updateTime">加载中...</div>
        </div>
        
        <div id="error-container"></div>
        
        <div id="stats-container" class="stats-grid"></div>
        
        <div class="chart-container">
            <div class="section-title">数据可视化</div>
            <div class="tab-container">
                <button class="tab-button active" onclick="switchChart('pressure')">气压</button>
                <button class="tab-button" onclick="switchChart('temperature')">温度</button>
                <button class="tab-button" onclick="switchChart('humidity')">湿度</button>
                <button class="tab-button" onclick="switchChart('wind')">风速</button>
                <button class="tab-button" onclick="switchChart('rainfall')">降雨</button>
                <button class="tab-button" onclick="switchChart('visibility')">能见度</button>
            </div>
            <div class="chart-wrapper">
                <canvas id="mainChart"></canvas>
            </div>
        </div>
    </div>

    <script src="app.js"></script>
</body>
</html>`;

    fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), html, 'utf8');
}

// 生成app.js
function generateAppJS() {
    const js = `
let currentChart = null;
let weatherData = null;

// 自定义 tooltip
const getOrCreateTooltip = (chart) => {
    let tooltipEl = chart.canvas.parentNode.querySelector('div.chartjs-tooltip');
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.className = 'chartjs-tooltip';
        tooltipEl.style.cssText = 'background:rgba(0,0,0,0.8);border-radius:3px;color:white;opacity:1;pointer-events:none;position:absolute;transform:translate(-50%,0);transition:all .1s ease;padding:8px;font-size:12px;min-width:120px;max-width:200px;z-index:1000';
        
        const table = document.createElement('table');
        table.style.margin = '0px';
        table.style.width = '100%';
        tooltipEl.appendChild(table);
        chart.canvas.parentNode.appendChild(tooltipEl);
    }
    return tooltipEl;
};

const externalTooltipHandler = (context) => {
    const {chart, tooltip} = context;
    const tooltipEl = getOrCreateTooltip(chart);

    if (tooltip.opacity === 0) {
        tooltipEl.style.opacity = 0;
        return;
    }

    if (tooltip.body) {
        const titleLines = tooltip.title || [];
        const dataPoints = tooltip.dataPoints.map(item => ({
            label: item.dataset.label,
            value: item.parsed.y,
            color: item.dataset.borderColor
        })).sort((a, b) => {
            if (a.value === null) return 1;
            if (b.value === null) return -1;
            return b.value - a.value;
        });

        const tableHead = document.createElement('thead');
        titleLines.forEach(title => {
            const tr = document.createElement('tr');
            tr.style.borderWidth = 0;
            const th = document.createElement('th');
            th.style.cssText = 'border-width:0;padding-bottom:4px;text-align:left';
            th.appendChild(document.createTextNode(title));
            tr.appendChild(th);
            tableHead.appendChild(tr);
        });

        const tableBody = document.createElement('tbody');
        dataPoints.forEach(point => {
            const tr = document.createElement('tr');
            tr.style.cssText = 'background-color:inherit;border-width:0';
            const td = document.createElement('td');
            td.style.cssText = 'border-width:0;padding-top:2px;padding-bottom:2px;white-space:nowrap';

            const colorBox = document.createElement('span');
            colorBox.style.cssText = \`background:\${point.color};border:2px solid \${point.color};margin-right:6px;height:10px;width:10px;display:inline-block\`;
            
            const text = document.createTextNode(
                point.label + ': ' + 
                (point.value !== null && point.value !== undefined ? point.value.toFixed(1) : '--')
            );

            td.appendChild(colorBox);
            td.appendChild(text);
            tr.appendChild(td);
            tableBody.appendChild(tr);
        });

        const tableRoot = tooltipEl.querySelector('table');
        while (tableRoot.firstChild) {
            tableRoot.firstChild.remove();
        }
        tableRoot.appendChild(tableHead);
        tableRoot.appendChild(tableBody);
    }

    const {offsetLeft: positionX, offsetTop: positionY} = chart.canvas;
    tooltipEl.style.opacity = 1;
    
    const tooltipWidth = tooltipEl.offsetWidth;
    const chartWidth = chart.width;
    let leftPos = positionX + tooltip.caretX;
    
    if (tooltip.caretX + tooltipWidth / 2 > chartWidth) {
        tooltipEl.style.transform = 'translate(-100%, 0)';
    } else if (tooltip.caretX - tooltipWidth / 2 < 0) {
        tooltipEl.style.transform = 'translate(0, 0)';
    } else {
        tooltipEl.style.transform = 'translate(-50%, 0)';
    }
    
    tooltipEl.style.left = leftPos + 'px';
    tooltipEl.style.top = positionY + tooltip.caretY + 'px';
};

// 加载数据
async function loadData() {
    try {
        const response = await fetch('data/weather_data.json?t=' + Date.now());
        if (!response.ok) throw new Error('数据加载失败');
        
        weatherData = await response.json();
        document.getElementById('updateTime').textContent = 
            \`最后更新: \${weatherData.update_time}\`;
        
        renderStats();
        switchChart('pressure');
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('error-container').innerHTML = 
            \`<div class="error">数据加载失败: \${error.message}</div>\`;
    }
}

// 渲染统计卡片
function renderStats() {
    const container = document.getElementById('stats-container');
    let html = '';
    
    Object.entries(weatherData.stations).forEach(([stationId, info]) => {
        const data = weatherData.data[stationId] || [];
        if (data.length === 0) {
            html += \`<div class="station-card">
                <h3 style="border-color:\${info.color}">\${info.name}</h3>
                <p style="text-align:center;color:#999;font-size:12px">暂无数据</p>
            </div>\`;
            return;
        }
        
        const latest = data[data.length - 1];
        html += \`<div class="station-card">
            <h3 style="border-color:\${info.color}">\${info.name}</h3>
            <div class="stat-row">
                <span class="stat-label">温度</span>
                <span class="stat-value">\${latest.temperature?.toFixed(1) || '--'} °C</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">湿度</span>
                <span class="stat-value">\${latest.humidity?.toFixed(0) || '--'} %</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">气压</span>
                <span class="stat-value">\${latest.pressure?.toFixed(1) || '--'} hPa</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">风速</span>
                <span class="stat-value">\${latest.wind_speed?.toFixed(1) || '--'} m/s</span>
            </div>
        </div>\`;
    });
    
    container.innerHTML = html;
}

// 切换图表
function switchChart(type) {
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    const fieldMap = {
        'pressure': { field: 'pressure', label: '气压 (hPa)' },
        'temperature': { field: 'temperature', label: '温度 (°C)' },
        'humidity': { field: 'humidity', label: '湿度 (%)' },
        'wind': { field: 'wind_speed', label: '风速 (m/s)' },
        'rainfall': { field: 'rainfall', label: '降雨量 (mm)' },
        'visibility': { field: 'visibility', label: '能见度 (m)' }
    };
    
    const config = fieldMap[type];
    renderChart(config.field, config.label);
}

// 渲染图表
function renderChart(field, label) {
    if (currentChart) {
        currentChart.destroy();
    }
    
    const datasets = [];
    Object.entries(weatherData.stations).forEach(([stationId, info]) => {
        const data = weatherData.data[stationId] || [];
        if (data.length === 0) return;
        
        datasets.push({
            label: info.name,
            data: data.map(d => ({
                x: d.timestamp,
                y: d[field]
            })),
            borderColor: info.color,
            backgroundColor: info.color.replace('rgb', 'rgba').replace(')', ', 0.1)'),
            tension: 0.4,
            fill: false,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4
        });
    });
    
    const ctx = document.getElementById('mainChart').getContext('2d');
    currentChart = new Chart(ctx, {
        type: 'line',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        boxWidth: 12,
                        padding: 8,
                        font: { size: 11 }
                    }
                },
                tooltip: {
                    enabled: false,
                    external: externalTooltipHandler
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'hour',
                        displayFormats: {
                            hour: 'HH:mm'
                        }
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: label
                    }
                }
            }
        }
    });
}

// 初始化
window.addEventListener('load', loadData);
setInterval(loadData, 5 * 60 * 1000); // 每5分钟刷新
`;

    fs.writeFileSync(path.join(OUTPUT_DIR, 'app.js'), js, 'utf8');
}

// 主函数
function main() {
    console.log('开始生成网页...');
    
    // 确保输出目录存在
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    
    const dataOutputDir = path.join(OUTPUT_DIR, 'data');
    if (!fs.existsSync(dataOutputDir)) {
        fs.mkdirSync(dataOutputDir, { recursive: true });
    }
    
    // 收集数据
    console.log('收集数据...');
    const allData = collectAllData();
    
    // 转换并保存JSON
    console.log('生成JSON数据...');
    const jsonData = convertToJSON(allData);
    fs.writeFileSync(
        path.join(dataOutputDir, 'weather_data.json'),
        JSON.stringify(jsonData, null, 2),
        'utf8'
    );
    
    // 生成HTML和JS
    console.log('生成网页文件...');
    generateIndexHTML();
    generateAppJS();
    
    console.log('✅ 网页生成完成！');
    console.log(`📁 输出目录: ${OUTPUT_DIR}`);
    console.log(`📊 数据点数: ${Object.values(allData).reduce((sum, arr) => sum + arr.length, 0)}`);
}

main();
