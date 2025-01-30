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
 * 计算文件哈希值
 */
async function getFileHash(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', (data) => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', (err) => reject(err));
    });
}

/**
 * 获取远程文件的哈希值
 */
async function getRemoteFileHash(url) {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' }); // 防止乱码
        const hash = crypto.createHash('sha256');
        hash.update(response.data);
        return hash.digest('hex');
    } catch (error) {
        console.error(`❌ 远程文件获取失败: ${url}`);
        throw error;
    }
}

/**
 * 检查并更新文件
 */
async function checkForUpdates() {
    if (!fs.existsSync(DOMAIN_DIR)) {
        console.error(`❌ 目录不存在: ${DOMAIN_DIR}`);
        return [];
    }

    const localFiles = getFilesInDirectory(DOMAIN_DIR);
    let result = [];

    for (let filePath of localFiles) {
        const fileName = path.basename(filePath);

        // **跳过排除的文件**
        if (EXCLUDED_FILES.includes(fileName)) {
            console.log(`🟡 ${fileName} 被排除`);
            continue;
        }

        const remoteFileUrl = REMOTE_DIR_URL + fileName;

        try {
            const remoteHash = await getRemoteFileHash(remoteFileUrl);
            if (fs.existsSync(filePath)) {
                const localHash = await getFileHash(filePath);
                if (localHash !== remoteHash) {
                    console.log(`🔄 ${fileName} 需要更新`);
                    const response = await axios.get(remoteFileUrl);
                    fs.writeFileSync(filePath, response.data);
                    result.push({ file: fileName, success: true, message: `${fileName} 更新成功` });
                } else {
                    result.push({ file: fileName, success: true, message: `${fileName} 无需更新` });
                }
            } else {
                console.log(`🆕 ${fileName} 文件不存在，正在下载...`);
                const response = await axios.get(remoteFileUrl);
                fs.writeFileSync(filePath, response.data);
                result.push({ file: fileName, success: true, message: `${fileName} 下载成功` });
            }
        } catch (error) {
            console.error(`❌ 处理 ${fileName} 时出错: ${error.message}`);
            result.push({ file: fileName, success: false, message: `更新失败: ${error.message}` });
        }
    }

    return result;
}

// **Express 路由**
app.get('/update', async (req, res) => {
    try {
        console.log("🛠️ 正在检查更新...");
        const updateResults = await checkForUpdates();

        // **返回网页（格式不变）**
        res.send(`
        <!DOCTYPE html>
        <html lang="zh-CN">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>文件更新检查</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; background-color: #f4f4f9; color: #333; }
                h1 { text-align: center; }
                .container { max-width: 600px; margin: 0 auto; text-align: center; }
                button { padding: 10px 20px; font-size: 16px; background-color: #4CAF50; color: white; border: none; cursor: pointer; border-radius: 5px; transition: background-color 0.3s; }
                button:hover { background-color: #45a049; }
                .result { margin-top: 20px; padding: 10px; border: 1px solid #ddd; border-radius: 5px; background-color: #fff; text-align: left; }
                .success { color: green; }
                .error { color: red; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>文件更新检查</h1>
                <button onclick="checkForUpdates()">检查更新</button>
                <div id="result" class="result" style="display: none;"></div>
            </div>
            <script>
                async function checkForUpdates() {
                    const resultDiv = document.getElementById('result');
                    resultDiv.style.display = 'none';

                    try {
                        const response = await fetch('/update');
                        const data = await response.json();

                        resultDiv.style.display = 'block';
                        let resultHtml = '<h3>更新结果</h3>';

                        data.forEach(update => {
                            if (update.success) {
                                resultHtml += \`<p class="success">\${update.message}</p>\`;
                            } else {
                                resultHtml += \`<p class="error">\${update.message}</p>\`;
                            }
                        });

                        resultDiv.innerHTML = resultHtml;
                    } catch (error) {
                        resultDiv.style.display = 'block';
                        resultDiv.innerHTML = \`<p class="error">检查更新时出错: \${error.message}</p>\`;
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