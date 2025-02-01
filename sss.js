const fs = require('fs');
const path = require('path');
const axios = require('axios');
const express = require('express');
const app = express();

// **配置**
const LOCAL_VERSION_FILE = path.join(__dirname, 'version.txt');
const REMOTE_VERSION_URL = 'https://example.com/version.txt';  // 远程版本地址
const REMOTE_DIR_URL = 'https://example.com/files/';            // 远程文件目录
const DOMAIN_DIR = path.join(__dirname, 'domain');              // 本地文件目录
const EXCLUDED_FILES = ['README.md'];                           // 排除的远程文件
const EXCLUDED_DIRS = ['public', 'tmp'];                        // 排除的本地目录

// **获取本地版本号**
function getLocalVersion() {
    if (!fs.existsSync(LOCAL_VERSION_FILE)) return "0.0.0";
    return fs.readFileSync(LOCAL_VERSION_FILE, 'utf-8').trim();
}

// **获取远程版本号**
async function getRemoteVersion() {
    try {
        const response = await axios.get(`${REMOTE_VERSION_URL}?_=${Date.now()}`);
        return response.data.trim();
    } catch (error) {
        console.error(`❌ 获取远程版本号失败: ${error.message}`);
        return null;
    }
}

// **获取远程文件列表并排除指定文件**
async function getRemoteFileList() {
    try {
        const response = await axios.get(`${REMOTE_DIR_URL}file_list.txt?_=${Date.now()}`);
        const files = response.data.split("\n").map(file => file.trim()).filter(file => file);
        return files.filter(file => !EXCLUDED_FILES.includes(file) && file !== 'version.txt');  // 排除 version.txt 和排除的文件
    } catch (error) {
        console.error(`❌ 获取远程文件列表失败: ${error.message}`);
        return null;
    }
}

// **获取本地文件列表并排除指定的文件夹**
function getLocalFiles(dir) {
    let files = [];
    if (!fs.existsSync(dir)) return files;

    const items = fs.readdirSync(dir);
    for (const item of items) {
        const itemPath = path.join(dir, item);
        
        // **跳过指定的目录**
        if (EXCLUDED_DIRS.includes(item)) {
            console.log(`🟡 跳过文件夹: ${itemPath}`);
            continue;
        }

        if (fs.statSync(itemPath).isDirectory()) {
            files = files.concat(getLocalFiles(itemPath));
        } else {
            files.push(path.relative(DOMAIN_DIR, itemPath));
        }
    }
    return files;
}

// **下载远程文件**
async function downloadFile(fileName) {
    try {
        const response = await axios.get(`${REMOTE_DIR_URL}${fileName}?_=${Date.now()}`, { responseType: 'arraybuffer' });
        const filePath = path.join(DOMAIN_DIR, fileName);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, response.data);
        console.log(`✅ ${fileName} 下载成功`);
        return { file: fileName, success: true, message: `✅ ${fileName} 更新成功` };
    } catch (error) {
        console.error(`❌ 下载失败: ${fileName} - ${error.message}`);
        return { file: fileName, success: false, message: `❌ ${fileName} 下载失败` };
    }
}

// **检查并更新文件**
async function checkForUpdates() {
    console.log("🔍 开始检查更新...");

    const remoteVersion = await getRemoteVersion();
    if (!remoteVersion) return [{ file: "无", success: false, message: "❌ 无法获取远程版本号" }];

    const localVersion = getLocalVersion();
    console.log(`📌 本地版本: ${localVersion}, 远程版本: ${remoteVersion}`);

    // **版本号相同，跳过更新**
    if (localVersion === remoteVersion) {
        console.log("✅ 文件已是最新，无需更新");
        return [
            { file: "版本信息", success: true, message: `📌 本地版本: ${localVersion}` },
            { file: "版本信息", success: true, message: `📌 远程版本: ${remoteVersion}` }
        ];
    }

    console.log("🔄 版本号不同，开始更新...");
    const remoteFiles = await getRemoteFileList();
    if (!remoteFiles) return [{ file: "无", success: false, message: "❌ 无法获取远程文件列表" }];

    let results = [];
    for (const fileName of remoteFiles) {
        results.push(await downloadFile(fileName));  // 下载文件时输出简洁的结果
    }

    // **删除本地多余的文件**
    const localFiles = getLocalFiles(DOMAIN_DIR);
    for (const fileName of localFiles) {
        if (!remoteFiles.includes(fileName) && !EXCLUDED_FILES.includes(fileName)) {
            fs.unlinkSync(path.join(DOMAIN_DIR, fileName));  // 删除文件但不输出
            results.push({ file: fileName, success: true, message: `🗑️ ${fileName} 被删除（远程不存在）` });
        }
    }

    // **更新本地 `version.txt`**
    fs.writeFileSync(LOCAL_VERSION_FILE, remoteVersion);
    console.log(`📢 版本更新完成，新版本号: ${remoteVersion}`);
    
    // 返回更新结果并包含版本信息，排除 `version.txt`
    return [
        { file: "版本信息", success: true, message: `📌 本地版本: ${localVersion}` },
        { file: "版本信息", success: true, message: `📌 远程版本: ${remoteVersion}` },
        ...results.filter(result => result.file !== 'version.txt') // 排除 version.txt 更新结果
    ];
}

// **处理 `/update` 请求**
app.get('/update', async (req, res) => {
    try {
        console.log("🛠️ 正在检查更新...");
        const updateResults = await checkForUpdates();

        // **如果请求是 AJAX（fetch），返回 JSON**
        if (req.headers.accept && req.headers.accept.includes('application/json')) {
            return res.json(updateResults);
        }

        // **否则，返回 HTML**
        res.send(`
        <!DOCTYPE html>
        <html lang="zh-CN">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>文件更新检查</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    background-color: #f4f4f9;
                    margin: 0;
                    padding: 0;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                }
                .container {
                    width: 80%;
                    max-width: 800px;
                    padding: 20px;
                    background-color: #fff;
                    border-radius: 8px;
                    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
                }
                h1 {
                    text-align: center;
                    color: #333;
                }
                button {
                    display: block;
                    margin: 20px auto;
                    padding: 10px 20px;
                    background-color: #4CAF50;
                    color: white;
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 16px;
                    transition: background-color 0.3s;
                }
                button:hover {
                    background-color: #45a049;
                }
                #result {
                    margin-top: 20px;
                    font-size: 16px;
                }
                .result-item {
                    padding: 10px;
                    border-radius: 5px;
                    margin-bottom: 10px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .success {
                    background-color: #e7f9e7;
                    color: #4CAF50;
                }
                .failure {
                    background-color: #ffe6e6;
                    color: #f44336;
                }
                .info {
                    background-color: #e0f7fa;
                    color: #0288d1;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>文件更新检查</h1>
                <button onclick="checkForUpdates()">检查更新</button>
                <div id="result"></div>
            </div>

            <script>
                async function checkForUpdates() {
                    try {
                        const response = await fetch('/update', { headers: { 'Accept': 'application/json' } });
                        const data = await response