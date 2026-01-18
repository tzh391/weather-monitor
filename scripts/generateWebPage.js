const fs = require('fs');
const path = require('path');

// 配置
const DATA_DIR = path.join(process.cwd(), 'weather_data');
const OUTPUT_DIR = path.join(process.cwd(), 'public');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'weather_data.json');

// 站点配置（与 dataCollector.js 保持一致）
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

// 获取东八区时间字符串
function getBeijingTime() {
    const now = new Date();
    const beijingTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    const year = beijingTime.getUTCFullYear();
    const month = String(beijingTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(beijingTime.getUTCDate()).padStart(2, '0');
    const hours = String(beijingTime.getUTCHours()).padStart(2, '0');
    const minutes = String(beijingTime.getUTCMinutes()).padStart(2, '0');
    const seconds = String(beijingTime.getUTCSeconds()).padStart(2, '0');
    
    return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}

// 解析 CSV 文件
function parseCSV(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.trim().split('\n');
        
        if (lines.length <= 1) {
            console.log(`⚠️  文件为空或只有表头: ${path.basename(filePath)}`);
            return [];
        }

        // 跳过表头
        const dataLines = lines.slice(1);
        
        // CSV格式：timestamp,temperature,humidity,wind_speed,wind_dir,rainfall,pressure,visibility
        const data = dataLines.map(line => {
            const parts = line.split(',');
            
            return {
                timestamp: parts[0] || null,
                temperature: parts[1] ? parseFloat(parts[1]) : null,
                humidity: parts[2] ? parseInt(parts[2]) : null,
                wind_speed: parts[3] ? parseFloat(parts[3]) : null,
                wind_dir: parts[4] || null,
                rainfall: parts[5] ? parseFloat(parts[5]) : null,
                pressure: parts[6] ? parseFloat(parts[6]) : null,
                visibility: parts[7] ? parseInt(parts[7]) : null
            };
        }).filter(item => item.timestamp); // 过滤掉无效数据

        return data;
    } catch (error) {
        console.error(`❌ 解析文件失败 ${filePath}: ${error.message}`);
        return [];
    }
}

// 读取所有站点的最新数据
function readAllStationData(hoursToKeep = 24) {
    const allData = {};
    const cutoffTime = Date.now() - (hoursToKeep * 60 * 60 * 1000);

    if (!fs.existsSync(DATA_DIR)) {
        console.error(`❌ 数据目录不存在: ${DATA_DIR}`);
        return allData;
    }

    // 获取所有 CSV 文件
    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.csv'));
    
    console.log(`📂 找到 ${files.length} 个数据文件\n`);

    // 按站点组织数据
    files.forEach(filename => {
        // 从文件名提取站点 ID: weather_58367_2026-01-18.csv
        const match = filename.match(/weather_(\d+)_/);
        if (!match) {
            console.log(`⚠️  跳过无效文件名: ${filename}`);
            return;
        }

        const stationId = match[1];
        if (!STATIONS[stationId]) {
            console.log(`⚠️  未知站点 ID: ${stationId}`);
            return;
        }

        const filePath = path.join(DATA_DIR, filename);
        const data = parseCSV(filePath);

        if (data.length === 0) {
            console.log(`⚠️  [${STATIONS[stationId].name}] 无有效数据`);
            return;
        }

        // 过滤最近 N 小时的数据
        const recentData = data.filter(item => {
            try {
                const timestamp = new Date(item.timestamp.replace(' ', 'T') + '+08:00');
                return timestamp.getTime() > cutoffTime;
            } catch (e) {
                return false;
            }
        });

        if (!allData[stationId]) {
            allData[stationId] = [];
        }

        allData[stationId].push(...recentData);
        
        console.log(`✅ [${STATIONS[stationId].name}] 加载 ${data.length} 条记录 (最近 ${hoursToKeep}h: ${recentData.length} 条)`);
    });

    // 对每个站点的数据按时间排序
    Object.keys(allData).forEach(stationId => {
        allData[stationId].sort((a, b) => {
            const timeA = new Date(a.timestamp.replace(' ', 'T') + '+08:00');
            const timeB = new Date(b.timestamp.replace(' ', 'T') + '+08:00');
            return timeA - timeB;
        });
    });

    return allData;
}

// 生成 JSON 数据
function generateJSON() {
    console.log('\n' + '='.repeat(70));
    console.log('          📊 生成气象数据 JSON 文件');
    console.log('='.repeat(70) + '\n');

    // 确保输出目录存在
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        console.log(`📁 创建输出目录: ${OUTPUT_DIR}\n`);
    }

    // 读取所有站点数据（保留最近 24 小时）
    const allData = readAllStationData(24);

    // 构建输出 JSON
    const output = {
        update_time: getBeijingTime(),
        stations: {},
        data: {}
    };

    // 填充站点信息和数据
    Object.keys(STATIONS).forEach(stationId => {
        output.stations[stationId] = {
            name: STATIONS[stationId].name,
            color: STATIONS[stationId].color
        };

        output.data[stationId] = allData[stationId] || [];
    });

    // 写入 JSON 文件
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');

    console.log(`\n${'='.repeat(70)}`);
    console.log(`✅ JSON 文件已生成: ${OUTPUT_FILE}`);
    
    // 统计信息
    const totalRecords = Object.values(output.data).reduce((sum, arr) => sum + arr.length, 0);
    const stationsWithData = Object.values(output.data).filter(arr => arr.length > 0).length;
    
    console.log(`📊 总记录数: ${totalRecords}`);
    console.log(`🗺️  有数据的站点: ${stationsWithData}/${Object.keys(STATIONS).length}`);
    console.log(`🕐 更新时间: ${output.update_time}`);
    console.log(`${'='.repeat(70)}\n`);

    return output;
}

// 生成简单的 HTML 页面
function generateHTML(jsonData) {
    const htmlPath = path.join(OUTPUT_DIR, 'index.html');
    
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>上海气象监测站 - 实时数据</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
            background: white;
            border-radius: 20px;
            padding: 30px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        h1 {
            text-align: center;
            color: #333;
            margin-bottom: 10px;
            font-size: 2.5em;
        }
        .update-time {
            text-align: center;
            color: #666;
            margin-bottom: 30px;
            font-size: 0.9em;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
            border-radius: 15px;
            color: white;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        }
        .stat-card h3 {
            font-size: 0.9em;
            opacity: 0.9;
            margin-bottom: 10px;
        }
        .stat-card .value {
            font-size: 2em;
            font-weight: bold;
        }
        .chart-container {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 15px;
            margin-bottom: 20px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.05);
        }
        .chart-container h2 {
            color: #333;
            margin-bottom: 15px;
            font-size: 1.3em;
        }
        canvas {
            max-height: 400px;
        }
        .station-list {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 15px;
            margin-top: 20px;
        }
        .station-item {
            padding: 15px;
            background: white;
            border-radius: 10px;
            border-left: 4px solid;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .station-item h4 {
            margin-bottom: 8px;
            color: #333;
        }
        .station-item .latest {
            font-size: 0.85em;
            color: #666;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🌤️ 上海气象监测站</h1>
        <div class="update-time">最后更新: ${jsonData.update_time}</div>
        
        <div class="stats-grid" id="statsGrid"></div>
        
        <div class="chart-container">
            <h2>📈 温度趋势</h2>
            <canvas id="tempChart"></canvas>
        </div>
        
        <div class="chart-container">
            <h2>💧 湿度趋势</h2>
            <canvas id="humidityChart"></canvas>
        </div>
        
        <div class="chart-container">
            <h2>🌬️ 风速趋势</h2>
            <canvas id="windChart"></canvas>
        </div>
        
        <div class="station-list" id="stationList"></div>
    </div>

    <script>
        const weatherData = ${JSON.stringify(jsonData)};
        
        // 显示统计卡片
        function displayStats() {
            const statsGrid = document.getElementById('statsGrid');
            const allTemps = [];
            const allHumidity = [];
            const allWindSpeed = [];
            
            Object.values(weatherData.data).forEach(stationData => {
                if (stationData.length > 0) {
                    const latest = stationData[stationData.length - 1];
                    if (latest.temperature) allTemps.push(latest.temperature);
                    if (latest.humidity) allHumidity.push(latest.humidity);
                    if (latest.wind_speed) allWindSpeed.push(latest.wind_speed);
                }
            });
            
            const avgTemp = allTemps.length ? (allTemps.reduce((a,b) => a+b) / allTemps.length).toFixed(1) : 'N/A';
            const avgHumidity = allHumidity.length ? (allHumidity.reduce((a,b) => a+b) / allHumidity.length).toFixed(0) : 'N/A';
            const avgWind = allWindSpeed.length ? (allWindSpeed.reduce((a,b) => a+b) / allWindSpeed.length).toFixed(1) : 'N/A';
            
            statsGrid.innerHTML = \`
                <div class="stat-card">
                    <h3>平均温度</h3>
                    <div class="value">\${avgTemp}°C</div>
                </div>
                <div class="stat-card">
                    <h3>平均湿度</h3>
                    <div class="value">\${avgHumidity}%</div>
                </div>
                <div class="stat-card">
                    <h3>平均风速</h3>
                    <div class="value">\${avgWind} m/s</div>
                </div>
                <div class="stat-card">
                    <h3>监测站点</h3>
                    <div class="value">\${Object.keys(weatherData.stations).length}</div>
                </div>
            \`;
        }
        
        // 创建图表
        function createChart(canvasId, label, dataKey) {
            const ctx = document.getElementById(canvasId).getContext('2d');
            const datasets = [];
            
            Object.keys(weatherData.data).forEach(stationId => {
                const stationData = weatherData.data[stationId];
                if (stationData.length === 0) return;
                
                const data = stationData.map(d => ({
                    x: d.timestamp,
                    y: d[dataKey]
                })).filter(d => d.y !== null);
                
                if (data.length > 0) {
                    datasets.push({
                        label: weatherData.stations[stationId].name,
                        data: data,
                        borderColor: weatherData.stations[stationId].color,
                        backgroundColor: weatherData.stations[stationId].color + '20',
                        tension: 0.4,
                        fill: false
                    });
                }
            });
            
            new Chart(ctx, {
                type: 'line',
                data: { datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    scales: {
                        x: {
                            type: 'time',
                            time: { unit: 'hour' },
                            title: { display: true, text: '时间' }
                        },
                        y: {
                            title: { display: true, text: label }
                        }
                    },
                    plugins: {
                        legend: { display: true, position: 'top' },
                        tooltip: { mode: 'index', intersect: false }
                    }
                }
            });
        }
        
        // 显示站点列表
        function displayStations() {
            const stationList = document.getElementById('stationList');
            let html = '';
            
            Object.keys(weatherData.stations).forEach(stationId => {
                const station = weatherData.stations[stationId];
                const data = weatherData.data[stationId];
                const latest = data.length > 0 ? data[data.length - 1] : null;
                
                html += \`
                    <div class="station-item" style="border-left-color: \${station.color}">
                        <h4>\${station.name}</h4>
                        \${latest ? \`
                            <div class="latest">
                                🌡️ \${latest.temperature}°C<br>
                                💧 \${latest.humidity}%<br>
                                🌬️ \${latest.wind_speed} m/s \${latest.wind_dir || ''}
                            </div>
                        \` : '<div class="latest">暂无数据</div>'}
                    </div>
                \`;
            });
            
            stationList.innerHTML = html;
        }
        
        // 初始化
        displayStats();
        createChart('tempChart', '温度 (°C)', 'temperature');
        createChart('humidityChart', '湿度 (%)', 'humidity');
        createChart('windChart', '风速 (m/s)', 'wind_speed');
        displayStations();
    </script>
</body>
</html>`;

    fs.writeFileSync(htmlPath, html, 'utf8');
    console.log(`✅ HTML 页面已生成: ${htmlPath}\n`);
}

// 主函数
function main() {
    try {
        const jsonData = generateJSON();
        generateHTML(jsonData);
        console.log('🎉 所有文件生成完成！\n');
    } catch (error) {
        console.error('❌ 生成失败:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { generateJSON, generateHTML };
