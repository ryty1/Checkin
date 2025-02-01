const fs = require('fs');
const path = require('path');
const axios = require('axios');
const express = require('express');
const app = express();

const username = process.env.USER.toLowerCase();
const DOMAIN_DIR = path.join(process.env.HOME, "domains", `${username}.serv00.net`, "public_nodejs");
const LOCAL_VERSION_FILE = path.join(DOMAIN_DIR, "version.txt");
const REMOTE_VERSION_URL = 'https://raw.githubusercontent.com/ryty1/serv00-save-me/main/version.txt';
const REMOTE_DIR_URL = 'https://raw.githubusercontent.com/ryty1/serv00-save-me/main/';

// **本地要跳过的文件 & 文件夹**
const EXCLUDED_FILES = ['README.md', 'config.json']; // 这些文件不会被删除
const EXCLUDED_DIRS = ['logs', 'backup', 'cache']; // 这些文件夹不会被扫描或删除

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

// **获取远程 `file_list.txt`**
async function getRemoteFileList() {
    try {
        const response = await axios.get(`${REMOTE_DIR_URL}file_list.txt?_=${Date.now()}`);
        return response.data.split("\n").map(file => file.trim()).filter(file => file);
    } catch (error) {
        console.error(`❌ 获取远程文件列表失败: ${error.message}`);
        return null;
    }
}

// **获取本地文件列表**
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

    if (localVersion === remoteVersion) {
        console.log("✅ 文件已是最新，无需更新");
        return [{ file: "无", success: true, message: "✅ 所有文件已是最新" }];
    }

    console.log("🔄 版本号不同，开始更新...");
    const remoteFiles = await getRemoteFileList();
    if (!remoteFiles) return [{ file: "无", success: false, message: "❌ 无法获取远程文件列表" }];

    let results = [];
    for (const fileName of remoteFiles) {
        results.push(await downloadFile(fileName));
    }

    // **删除本地多余的文件**
    const localFiles = getLocalFiles(DOMAIN_DIR);
    for (const fileName of localFiles) {
        if (!remoteFiles.includes(fileName) && !EXCLUDED_FILES.includes(fileName)) {
            fs.unlinkSync(path.join(DOMAIN_DIR, fileName));
            console.log(`🗑️ 删除多余文件: ${fileName}`);
            results.push({ file: fileName, success: true, message: `🗑️ ${fileName} 被删除（远程不存在）` });
        }
    }

    // **更新本地 `version.txt`**
    fs.writeFileSync(LOCAL_VERSION_FILE, remoteVersion);
    console.log(`📢 版本更新完成，新版本号: ${remoteVersion}`);
    return results;
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
                        const data = await response.json();
                        let resultHtml = '<h3>更新结果</h3>';

                        // 遍历并生成结果项
                        data.forEach(update => {
                            let className = 'result-item';
                            if (update.success) {
                                className += ' success';
                            } else {
                                className += ' failure';
                            }
                            resultHtml += \`
                            <div class="\${className}">
                                <span>\${update.message}</span>
                            </div>\`;
                        });

                        document.getElementById('result').innerHTML = resultHtml;
                    } catch (error) {
                        document.getElementById('result').innerHTML = '<p class="failure">检查更新时出错</p>';
                    }
                }
            </script>
        </body>
        </html>
        `);
    } catch (error) {
        res.status(500).json({ success: false, message: '更新过程中发生错误', error });
    }
});

// **启动服务器**
app.listen(3000, () => {
    console.log(`🚀 服务器运行在 http://localhost:3000`);
});