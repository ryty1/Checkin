const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const DOMAIN_DIR = '/path/to/your/domain/directory';  // 替换为你自己的本地目录
const REMOTE_DIR_URL = 'https://raw.githubusercontent.com/ryty1/My-test/main/'; // 远程仓库 URL
const EXCLUDED_DIRS = ['public', 'tmp'];  // 排除的目录
const EXCLUDED_FILES = ['file1.txt', 'file2.sh'];  // 排除的文件
const REMOTE_FILE_LIST_URL = 'https://raw.githubusercontent.com/ryty1/My-test/main/file_list.txt'; // 远程 file_list.txt 文件 URL

/**
 * 递归获取目录下所有文件（排除本地 `public` 和 `tmp`）
 */
function getFilesInDirectory(dir) {
    const files = [];
    if (!fs.existsSync(dir)) return files; // 目录不存在，直接返回空数组
    const items = fs.readdirSync(dir);
    for (let item of items) {
        const itemPath = path.join(dir, item);

        // **本地排除 `public` 和 `tmp` 目录**
        if (EXCLUDED_DIRS.includes(item)) {
            console.log(`🟡 本地目录被跳过: ${itemPath}`);
            continue;
        }

        if (fs.statSync(itemPath).isDirectory()) {
            files.push(...getFilesInDirectory(itemPath));  // 递归获取子目录文件
        } else {
            files.push(itemPath);
        }
    }
    return files;
}

/**
 * 获取远程仓库的文件列表
 */
async function getRemoteFileList() {
    try {
        const response = await axios.get(REMOTE_FILE_LIST_URL);
        return response.data.split('\n').map(file => file.trim()).filter(file => file); // 解析文件列表
    } catch (error) {
        console.error(`❌ 无法获取远程文件列表: ${error.message}`);
        return null; // 返回 null，表示 file_list.txt 不存在，防止误删
    }
}

/**
 * 获取远程文件的哈希值
 */
async function getRemoteFileHash(url) {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        return crypto.createHash('sha256').update(response.data).digest('hex');
    } catch (error) {
        console.error(`❌ 获取远程文件哈希失败: ${error.message}`);
        throw error;
    }
}

/**
 * 获取本地文件的哈希值
 */
function getFileHash(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', (data) => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', (err) => reject(err));
    });
}

/**
 * 检查并更新文件，同时删除本地多余文件
 */
async function checkForUpdates() {
    if (!fs.existsSync(DOMAIN_DIR)) {
        console.error(`❌ 目录不存在: ${DOMAIN_DIR}`);
        return [];
    }

    const localFiles = getFilesInDirectory(DOMAIN_DIR);
    const remoteFiles = await getRemoteFileList(); // 获取远程文件列表
    let result = [];
    let updated = false; // 记录是否有文件更新

    // **如果 `file_list.txt` 获取失败，不执行删除，避免误删**
    if (remoteFiles === null) {
        console.warn(`⚠️ 远程 file_list.txt 未找到，跳过删除本地多余文件`);
    } else {
        console.log("📂 远程文件列表:", remoteFiles);  // 调试输出远程文件列表

        // **检查本地文件**
        for (let filePath of localFiles) {
            const fileName = path.basename(filePath);

            // **跳过排除的文件**
            if (EXCLUDED_FILES.includes(fileName)) {
                console.log(`🟡 ${fileName} 被排除`);
                continue;
            }

            // **如果本地文件不在远程文件列表中，删除它**
            if (!remoteFiles.includes(fileName)) {
                console.log(`🗑️ 本地文件 ${fileName} 不在远程仓库，删除中...`);
                fs.unlinkSync(filePath);
                result.push({ file: fileName, success: true, message: `🗑️ ${fileName} 已删除（远程不存在）` });
                updated = true;
                continue;
            }

            // **正常文件更新检查**
            const remoteFileUrl = REMOTE_DIR_URL + fileName;
            try {
                const remoteHash = await getRemoteFileHash(remoteFileUrl);
                if (fs.existsSync(filePath)) {
                    const localHash = await getFileHash(filePath);

                    if (localHash !== remoteHash) {
                        console.log(`🔄 ${fileName} 需要更新`);
                        const response = await axios.get(remoteFileUrl);
                        fs.writeFileSync(filePath, response.data);
                        result.push({ file: fileName, success: true, message: `✅ ${fileName} 更新成功` });
                        updated = true;
                    } else {
                        result.push({ file: fileName, success: true, message: `✅ ${fileName} 已是最新版本` });
                    }
                }
            } catch (error) {
                console.error(`❌ 处理 ${fileName} 时出错: ${error.message}`);
                result.push({ file: fileName, success: false, message: `❌ 更新失败: ${error.message}` });
            }
        }

        // **处理新增文件**
        for (let remoteFile of remoteFiles) {
            const remoteFilePath = path.join(DOMAIN_DIR, remoteFile);

            // 如果远程文件不存在于本地，则下载
            if (!localFiles.includes(remoteFile)) {
                console.log(`🆕 新文件 ${remoteFile}，正在下载...`);
                const remoteFileUrl = REMOTE_DIR_URL + remoteFile;
                const response = await axios.get(remoteFileUrl);
                fs.writeFileSync(remoteFilePath, response.data);
                result.push({ file: remoteFile, success: true, message: `✅ ${remoteFile} 新文件下载成功` });
                updated = true;
            }
        }
    }

    // **如果没有任何文件更新，添加 "所有文件均为最新" 提示**
    if (!updated) {
        result.push({ file: "无", success: true, message: "✅ 所有文件均为最新，无需更新" });
    }

    return result;
}

/**
 * 路由：更新检查
 */
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
                                if (update.message.includes('删除')) {
                                    className += ' failure';
                                } else {
                                    className += ' success';
                                }
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
       