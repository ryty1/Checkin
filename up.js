const fs = require('fs');
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');
const express = require("express");

const app = express();
app.use(express.json());

// 目标文件夹
const username = process.env.USER.toLowerCase();
const DOMAIN_DIR = path.join(process.env.HOME, "domains", `${username}.serv00.net`, "public_nodejs");

// 远程文件目录的 URL
const REMOTE_DIR_URL = 'https://raw.githubusercontent.com/ryty1/htmlalive/main/';

// **本地要排除的文件和目录**
const EXCLUDED_FILES = ['README.md']; 
const EXCLUDED_DIRS = ['public', 'tmp']; // **本地 `public` 和 `tmp` 目录不会被扫描**

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
        const response = await axios.get(REMOTE_DIR_URL + "file_list.txt"); // 远程仓库的文件列表
        return response.data.split("\n").map(file => file.trim()).filter(file => file);
    } catch (error) {
        console.error(`❌ 无法获取远程文件列表: ${error.message}`);
        return null; // 返回 null，表示 file_list.txt 不存在，防止误删
    }
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
                } else {
                    console.log(`🆕 ${fileName} 文件不存在，正在下载...`);
                    const response = await axios.get(remoteFileUrl);
                    fs.writeFileSync(filePath, response.data);
                    result.push({ file: fileName, success: true, message: `✅ ${fileName} 新文件下载成功` });
                    updated = true;
                }
            } catch (error) {
                console.error(`❌ 处理 ${fileName} 时出错: ${error.message}`);
                result.push({ file: fileName, success: false, message: `❌ 更新失败: ${error.message}` });
            }
        }
    }

    // **如果没有任何文件更新，添加 "所有文件均为最新" 提示**
    if (!updated) {
        result.push({ file: "无", success: true, message: "✅ 所有文件均为最新，无需更新" });
    }

    return result;
}

// **Express 路由**
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
        </head>
        <body>
            <h1>文件更新检查</h1>
            <button onclick="checkForUpdates()">检查更新</button>
            <div id="result"></div>
            <script>
                async function checkForUpdates() {
                    try {
                        const response = await fetch('/update', { headers: { 'Accept': 'application/json' } });
                        const data = await response.json();

                        let resultHtml = '<h3>更新结果</h3>';
                        data.forEach(update => {
                            resultHtml += \`<p>\${update.message}</p>\`;
                        });

                        document.getElementById('result').innerHTML = resultHtml;
                    } catch (error) {
                        document.getElementById('result').innerHTML = '<p>检查更新时出错</p>';
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

app.listen(3000, () => {
    console.log("✅ 服务器已启动，监听端口 3000");
});