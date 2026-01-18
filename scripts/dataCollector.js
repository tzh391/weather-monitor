const http = require('http');
const fs = require('fs');
const path = require('path');

// 配置
const API_URL = 'ztq.soweather.com';
const API_PORT = 8096;
const API_PATH = '/ztq_sh_jc/service.do';

// 站点配置 - 13个站点
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

// 数据存储目录 - 相对于项目根目录
const DATA_DIR = path.join(process.cwd(), 'weather_data');

// 确保目录存在
function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        console.log(`📁 创建数据目录: ${DATA_DIR}`);
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    
    // 验证目录是否可写
    try {
        const testFile = path.join(DATA_DIR, '.test');
        fs.writeFileSync(testFile, 'test', 'utf8');
        fs.unlinkSync(testFile);
        console.log(`✅ 数据目录可写: ${DATA_DIR}`);
    } catch (error) {
        console.error(`❌ 数据目录不可写: ${error.message}`);
        throw error;
    }
}

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
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// 获取当前日期的文件名（东八区）
function getDataFileName(stationId) {
    const now = new Date();
    const beijingTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    const year = beijingTime.getUTCFullYear();
    const month = String(beijingTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(beijingTime.getUTCDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    return path.join(DATA_DIR, `weather_${stationId}_${dateStr}.csv`);
}

// 确保CSV文件存在并有表头
function ensureCSVFile(filePath) {
    if (!fs.existsSync(filePath)) {
        const header = 'timestamp,temperature,humidity,wind_speed,wind_dir,rainfall,pressure,visibility\n';
        fs.writeFileSync(filePath, header, 'utf8');
        console.log(`📄 创建新文件: ${filePath}`);
        
        // 验证文件已创建
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            console.log(`✅ 文件验证成功，大小: ${content.length} 字节`);
        } else {
            console.error(`❌ 文件创建失败: ${filePath}`);
        }
        return true;
    }
    return false;
}

// 发送GET请求获取气象数据
function fetchWeatherData(stationId) {
    return new Promise((resolve, reject) => {
        const API_PARAMS = {
            "b": {
                "fycx_sstq": {
                    "stationid": stationId
                }
            }
        };
        
        const queryString = 'p=' + encodeURIComponent(JSON.stringify(API_PARAMS));
        const url = `${API_PATH}?${queryString}`;
        
        const options = {
            hostname: API_URL,
            port: API_PORT,
            path: url,
            method: 'GET',
            headers: {
                'User-Agent': 'GitHub Actions Weather Collector',
                'Accept': 'application/json'
            },
            timeout: 15000
        };

        const req = http.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    resolve(jsonData);
                } catch (error) {
                    reject(new Error(`JSON解析错误: ${error.message}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('请求超时'));
        });

        req.end();
    });
}

// 保存数据到CSV
function saveDataToCSV(weatherData, stationId) {
    const filePath = getDataFileName(stationId);
    console.log(`📝 准备写入文件: ${filePath}`);
    
    const isNewFile = ensureCSVFile(filePath);

    if (weatherData.h && weatherData.h.is !== 0) {
        console.error(`❌ [${STATIONS[stationId].name}] API错误: ${weatherData.h.error}`);
        return false;
    }

    if (!weatherData.b || !weatherData.b.fycx_sstq) {
        console.error(`❌ [${STATIONS[stationId].name}] 数据格式错误`);
        return false;
    }

    const data = weatherData.b.fycx_sstq;
    const timestamp = getBeijingTime();

    // CSV格式：timestamp,temperature,humidity,wind_speed,wind_dir,rainfall,pressure,visibility
    const row = [
        timestamp,
        data.ct || '',
        data.humidity || '',
        data.wind_speed || '',
        data.wind_dir || '',
        data.rainfall || '',
        data.vaporpressuser || '',
        data.visibility || ''
    ].join(',') + '\n';

    try {
        // 写入前检查文件状态
        const statsBefore = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
        console.log(`📊 写入前文件大小: ${statsBefore ? statsBefore.size : 0} 字节`);
        
        fs.appendFileSync(filePath, row, 'utf8');
        
        // 写入后验证
        const statsAfter = fs.statSync(filePath);
        console.log(`📊 写入后文件大小: ${statsAfter.size} 字节`);
        
        // 读取最后一行验证
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.trim().split('\n');
        const lastLine = lines[lines.length - 1];
        
        const emoji = isNewFile ? '🆕' : '✅';
        console.log(`${emoji} [${STATIONS[stationId].name}] ${timestamp}`);
        console.log(`   🌡️  ${data.ct}°C | 💧 ${data.humidity}% | 🌬️  ${data.wind_speed} m/s ${data.wind_dir || ''} | 🌧️  ${data.rainfall || 0} mm`);
        console.log(`   📄 文件: ${path.basename(filePath)} (${lines.length} 行)`);
        console.log(`   📝 最后一行: ${lastLine.substring(0, 80)}...`);
        
        return true;
    } catch (error) {
        console.error(`❌ [${STATIONS[stationId].name}] 写入文件失败: ${error.message}`);
        console.error(`   错误堆栈: ${error.stack}`);
        return false;
    }
}

// 执行数据采集（所有站点）
async function collectData() {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🌤️  上海气象数据采集 - ${getBeijingTime()}`);
    console.log(`${'='.repeat(70)}\n`);
    
    // 确保数据目录存在
    ensureDataDir();
    
    const stationIds = Object.keys(STATIONS);
    let successCount = 0;
    let failedStations = [];
    
    for (const stationId of stationIds) {
        try {
            console.log(`\n🔄 正在采集 [${STATIONS[stationId].name}] ...`);
            const weatherData = await fetchWeatherData(stationId);
            
            if (saveDataToCSV(weatherData, stationId)) {
                successCount++;
            } else {
                failedStations.push(STATIONS[stationId].name);
            }
            
            // 每个请求之间延迟1秒
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
            console.error(`❌ [${STATIONS[stationId].name}] ${error.message}`);
            failedStations.push(STATIONS[stationId].name);
        }
    }
    
    console.log(`\n${'='.repeat(70)}`);
    console.log(`📊 采集结果: ${successCount}/${stationIds.length} 个站点成功`);
    if (failedStations.length > 0) {
        console.log(`⚠️  失败站点: ${failedStations.join(', ')}`);
    }
    console.log(`📁 数据保存于: ${DATA_DIR}`);
    
    // 列出生成的文件
    try {
        const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.csv'));
        console.log(`📄 CSV 文件数: ${files.length}`);
        files.forEach(f => {
            const filePath = path.join(DATA_DIR, f);
            const stats = fs.statSync(filePath);
            const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n').length;
            console.log(`   - ${f} (${stats.size} 字节, ${lines} 行)`);
        });
    } catch (error) {
        console.error(`❌ 列出文件失败: ${error.message}`);
    }
    
    console.log(`${'='.repeat(70)}\n`);
    
    // 返回状态码
    return successCount > 0 ? 0 : 1;
}

// 主函数
async function main() {
    console.log('\n' + '='.repeat(70));
    console.log('          🌤️  上海气象数据采集系统  🌤️');
    console.log('='.repeat(70));
    console.log(`📁 数据目录: ${DATA_DIR}`);
    console.log(`🌐 API: http://${API_URL}:${API_PORT}${API_PATH}`);
    console.log(`📊 监测站点: ${Object.keys(STATIONS).length}个`);
    console.log(`🕐 时区: 东八区 (UTC+8)`);
    console.log(`🖥️  运行环境: ${process.platform} ${process.arch}`);
    console.log(`🔧 Node.js: ${process.version}`);
    console.log(`📂 工作目录: ${process.cwd()}`);
    console.log('='.repeat(70) + '\n');
    
    try {
        const exitCode = await collectData();
        
        // 最后验证
        console.log('\n🔍 最终验证:');
        console.log(`数据目录存在: ${fs.existsSync(DATA_DIR)}`);
        if (fs.existsSync(DATA_DIR)) {
            const files = fs.readdirSync(DATA_DIR);
            console.log(`文件总数: ${files.length}`);
        }
        
        process.exit(exitCode);
    } catch (error) {
        console.error('❌ 程序执行错误:', error);
        console.error('错误堆栈:', error.stack);
        process.exit(1);
    }
}

// 只在直接运行时执行（不是被 require 时）
if (require.main === module) {
    main();
}

module.exports = { collectData, STATIONS, DATA_DIR };
