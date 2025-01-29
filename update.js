const fs = require('fs');
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');

// 目标文件夹
const username = process.env.USER.toLowerCase(); // 获取当前用户名并转换为小写
const DOMAIN_DIR = '${process.env.HOME}/domains/${username}.serv00.net/public_nodejs';

// 远程文件目录的URL
const REMOTE_DIR_URL = 'https://raw.githubusercontent.com/ryty1/htmlalive/main/';

// 需要排除的文件名（例如 README 文件）
const EXCLUDED_FILES = ['README.md'];

// 获取目录下所有文件的路径
function getFilesInDirectory(dir) {
    const files = [];
    const items = fs.readdirSync(dir);
    for (let item of items) {
        const itemPath = path.join(dir, item);
        if (fs.statSync(itemPath).isDirectory()) {
            files.push(...getFilesInDirectory(itemPath));  // 递归获取子目录中的文件
        } else {
            files.push(itemPath);
        }
    }
    return files;
}

// 获取文件的哈希值
async function getFileHash(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', (data) => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', (err) => reject(err));
    });
}

// 获取远程文件的哈希值
async function getRemoteFileHash(url) {
    try {
        const response = await axios.get(url);
        const hash = crypto.createHash('sha256');
        hash.update(response.data);
        return hash.digest('hex');
    } catch (error) {
        console.error(`获取文件失败: ${url}`);
        throw error;
    }
}

// 检查目录是否有更新
async function checkForUpdates() {
    const localFiles = getFilesInDirectory(DOMAIN_DIR);  // 获取本地所有文件
    let result = [];

    for (let filePath of localFiles) {
        const fileName = path.basename(filePath);
        
        // 如果文件名在排除列表中，则跳过
        if (EXCLUDED_FILES.includes(fileName)) {
            console.log(`${fileName} 被排除在更新之外`);
            continue;
        }

        const remoteFileUrl = REMOTE_DIR_URL + fileName;

        try {
            // 检查远程文件的哈希值
            const remoteHash = await getRemoteFileHash(remoteFileUrl);
            // 检查本地文件的哈希值
            if (fs.existsSync(filePath)) {
                const localHash = await getFileHash(filePath);
                if (localHash !== remoteHash) {
                    // 文件内容有变化，进行更新
                    console.log(`${fileName} 文件有更新，开始下载...`);
                    const response = await axios.get(remoteFileUrl);
                    fs.writeFileSync(filePath, response.data);
                    result.push({ file: fileName, success: true, message: `${fileName} 更新成功` });
                } else {
                    result.push({ file: fileName, success: true, message: `${fileName} 无需更新` });
                }
            } else {
                // 文件不存在，下载并创建
                console.log(`${fileName} 文件不存在，开始下载...`);
                const response = await axios.get(remoteFileUrl);
                fs.writeFileSync(filePath, response.data);
                result.push({ file: fileName, success: true, message: `${fileName} 新文件下载成功` });
            }
        } catch (error) {
            console.error(`处理文件 ${fileName} 时出错: ${error.message}`);
            result.push({ file: fileName, success: false, message: `更新失败: ${error.message}` });
        }
    }

    return result;
}

// 更新处理路由
app.get('/update', async (req, res) => {
    try {
        console.log("开始检查文件更新...");

        // 检查并更新文件
        const updateResults = await checkForUpdates();

        // 返回前端页面和更新结果
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

app.use((req, res, next) => {
    const validPaths = ["/update"];
    if (validPaths.includes(req.path)) {
        return next();
    }
    res.status(404).send("页面未找到");
});
app.listen(3000, () => {
    const timestamp = new Date().toLocaleString();
    const startMsg = `${timestamp} 服务器已启动，监听端口 3000`;
    logMessage(startMsg);
    console.log(startMsg);
});
