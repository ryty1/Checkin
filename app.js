require('dotenv').config();
const express = require("express");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const axios = require('axios');
const crypto = require('crypto');
const app = express();
const username = process.env.USER.toLowerCase(); // 获取当前用户名并转换为小写
const DOMAIN_DIR = '${process.env.HOME}/domains/${username}.serv00.net/public_nodejs';

// 远程文件目录的URL
const REMOTE_DIR_URL = 'https://raw.githubusercontent.com/ryty1/My-test/main/';

// 需要排除的文件名（例如 README 文件）
const EXCLUDED_FILES = ['README.md'];
app.use(express.json());
let logs = [];
let latestStartLog = "";
function logMessage(message) {
    logs.push(message);
    if (logs.length > 5) logs.shift();
}
function executeCommand(command, actionName, isStartLog = false, callback) {
    exec(command, (err, stdout, stderr) => {
        const timestamp = new Date().toLocaleString();
        if (err) {
            logMessage(`${actionName} 执行失败: ${err.message}`);
            if (callback) callback(err.message);
            return;
        }
        if (stderr) {
            logMessage(`${actionName} 执行标准错误输出: ${stderr}`);
        }
        const successMsg = `${actionName} 执行成功:\n${stdout}`;
        logMessage(successMsg);
        if (isStartLog) latestStartLog = successMsg;
        if (callback) callback(stdout);
    });
}
function runShellCommand() {
    const command = `cd ${process.env.HOME}/serv00-play/singbox/ && bash start.sh`;
    executeCommand(command, "start.sh", true);
}
function executeHy2ipScript(logMessages, callback) {

    const command = `cd ${process.env.HOME}/domains/${username}.serv00.net/public_nodejs/ && bash hy2ip.sh`;

    // 执行脚本并捕获输出
    exec(command, (error, stdout, stderr) => {
        callback(error, stdout, stderr);
    });
}
function KeepAlive() {
    const command = `cd ${process.env.HOME}/serv00-play/ && bash keepalive.sh`;
    executeCommand(command, "keepalive.sh", true);
}

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

setInterval(KeepAlive, 20000);
app.get("/info", (req, res) => {
    runShellCommand();
    KeepAlive();
    res.type("html").send(`
        <html>
        <head>
            <style>
                body {
                    margin: 0;
                    font-family: Arial, sans-serif;
                    background-color: #f4f4f4;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                }
                .content-container {
                    width: 100%;
                    max-width: 600px; /* 最大宽度为600px */
                    background-color: #fff;
                    padding: 20px;
                    border-radius: 8px;
                    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
                    box-sizing: border-box;
                    text-align: left; /* 保持文字左对齐 */
                }
                .dynamic-text {
                    font-size: 24px;
                    font-weight: bold;
                    margin-bottom: 20px;
                    line-height: 1.5;
                    text-align: center; /* 两行文本居中 */
                }
                @keyframes growShrink {
                    0% {
                        transform: scale(1);
                    }
                    50% {
                        transform: scale(1.2);
                    }
                    100% {
                        transform: scale(1);
                    }
                }
                .dynamic-text span {
                    display: inline-block;
                    animation: growShrink 1.2s infinite;
                    animation-delay: calc(0.1s * var(--char-index));
                }
                .button-container {
                    margin-top: 20px;
                    display: flex;
                    flex-wrap: wrap; /* 适配小屏，按钮会换行 */
                    gap: 10px;
                }
                button {
                    flex: 1;
                    min-width: 100px;
                    padding: 10px 15px;
                    font-size: 16px;
                    background-color: #007bff;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    transition: background-color 0.3s ease;
                }
                button:hover {
                    background-color: #0056b3;
                }
                @media (max-width: 600px) {
                    .dynamic-text {
                        font-size: 20px;
                    }
                    button {
                        font-size: 14px;
                    }
                }
            </style>
        </head>
        <body>
            <div class="content-container">
                <div class="dynamic-text">
                    ${"SingBox 已复活".split("").map((char, index) => 
                        `<span style="--char-index: ${index};">${char}</span>`).join("")}
                </div>
                <div class="dynamic-text">
                    ${"HtmlOnLive 守护中".split("").map((char, index) => 
                        `<span style="--char-index: ${index + 10};">${char}</span>`).join("")}
                </div>
                <div class="button-container">
                    <button onclick="window.location.href='/hy2ip'">换HY2_IP</button>
                    <button onclick="window.location.href='/node'">节点信息</button>
                    <button onclick="window.location.href='/log'">查看日志</button>
                    <button onclick="window.location.href='/update'">检查更新</button>
                </div>
            </div>
        </body>
        </html>
    `);
});

// 中间件：解析请求体
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get("/hy2ip", (req, res) => {
    res.send(`
        <html>
            <head>
                <title>HY2_IP 更新</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        margin: 0;
                        padding: 0;
                        background-color: #f4f4f4;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                    }
                    .container {
                        width: 100%;
                        max-width: 600px; /* 最大宽度为 600px */
                        background-color: #fff;
                        padding: 20px;
                        border-radius: 8px;
                        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
                        box-sizing: border-box;
                        text-align: left;
                    }
                    h1 {
                        font-size: 24px;
                        margin-bottom: 15px;
                    }
                    p {
                        font-size: 16px;
                        margin-bottom: 20px;
                        color: #555;
                        line-height: 1.5;
                    }
                    input[type="text"] {
                        width: 100%;
                        padding: 12px;
                        font-size: 14px;
                        border: 1px solid #ccc;
                        border-radius: 4px;
                        box-sizing: border-box;
                        margin-bottom: 15px;
                    }
                    button {
                        width: 100%;
                        padding: 12px;
                        font-size: 16px;
                        background-color: #007bff;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        transition: background-color 0.3s ease;
                    }
                    button:hover {
                        background-color: #0056b3;
                    }
                    @media (max-width: 600px) {
                        .container {
                            padding: 15px;
                        }
                        h1 {
                            font-size: 20px;
                        }
                        p {
                            font-size: 14px;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>HY2_IP 更新</h1>
                    <p>请输入“更新”以确认执行 IP 更新。</p>
                    <form action="/hy2ip/execute" method="POST">
                        <input type="text" name="confirmation" placeholder="更新">
                        <button type="submit">提交</button>
                    </form>
                    <p>【注】：不同 IP 如成功更换，原线路会失效，请复制新信息食用。</p>
                </div>
            </body>
        </html>
    `);
});

app.post("/hy2ip/execute", (req, res) => {
    const confirmation = req.body.confirmation?.trim();

    if (confirmation !== "更新") {
        return res.send(`
            <html>
                <head>
                    <title>HY2_IP 更新失败</title>
                    <style>
                        body { font-family: Arial, sans-serif; background-color: #f4f4f4; display: flex; justify-content: center; align-items: center; height: 100vh; }
                        .container { width: 100%; max-width: 800px; background-color: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1); text-align: left; }
                        h1 { font-size: 24px; margin-bottom: 20px; }
                        p { font-size: 16px; color: red; }
                        a { color: #007bff; text-decoration: none; }
                        a:hover { text-decoration: underline; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>更新失败</h1>
                        <p>输入错误！请返回并输入“更新”以确认。</p>
                        <a href="/hy2ip">返回</a>
                    </div>
                </body>
            </html>
        `);
    }

    try {
        let logMessages = [];

        executeHy2ipScript(logMessages, (error, stdout, stderr) => {
            let updatedIp = "";

            if (stdout) {
                let outputMessages = stdout.split("\n");
                outputMessages.forEach(line => {
                    if (line.includes("SingBox 配置文件成功更新IP为")) {
                        updatedIp = line.split("SingBox 配置文件成功更新IP为")[1].trim();
                    }
                    if (line.includes("Config 配置文件成功更新IP为")) {
                        updatedIp = line.split("Config 配置文件成功更新IP为")[1].trim();
                    }
                });
                // 去掉任何可能的 ANSI 颜色码
            if (updatedIp) {
                updatedIp = updatedIp.replace(/\x1B\[[0-9;]*m/g, "");  // 移除颜色控制字符
            }

            if (updatedIp && updatedIp !== "未找到可用的 IP！") {
                logMessages.push("命令执行成功");
                logMessages.push(`SingBox 配置文件成功更新IP为 ${updatedIp}`);
                logMessages.push(`Config 配置文件成功更新IP为 ${updatedIp}`);
                logMessages.push("sing-box 已重启");
                res.send(generateHtml("HY2_IP 更新", updatedIp, logMessages));
            } else {
                // 无论 error 是否存在，都统一显示 "命令执行成功"
                logMessages.push("命令执行成功");
                logMessages.push("没有找到有效 IP");
                res.send(generateHtml("HY2_IP 更新", "无", logMessages, true));
            }
        }
    });
    } catch (error) {
        let logMessages = ["命令执行成功", "没有找到有效 IP"];
        res.send(generateHtml("HY2_IP 更新", "无", logMessages, true));
    }
});

// 生成 HTML 页面
function generateHtml(title, ip, logs, isError = false) {
    let ipColor = isError ? "red" : "black";
    let htmlLogs = logs.map(msg => `<p>${msg}</p>`).join("");

    return `
        <html>
            <head>
                <title>${title}</title>
                <style>
                    body { font-family: Arial, sans-serif; background-color: #f4f4f4; display: flex; justify-content: center; align-items: center; height: 100vh; }
                    .container { width: 100%; max-width: 800px; background-color: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1); text-align: left; }
                    h1 { font-size: 24px; margin-bottom: 20px; }
                    p { font-size: 16px; }
                    .scrollable { max-height: 300px; overflow-y: auto; border: 1px solid #ccc; padding: 10px; background-color: #f9f9f9; border-radius: 4px; }
                    .ip { font-weight: bold; color: ${ipColor}; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>${title}</h1>
                    <p><strong>有效 IP：</strong> <span class="ip">${ip}</span></p>
                    <div>
                        <h2>日志:</h2>
                        <div class="scrollable">
                            ${htmlLogs}
                        </div>
                    </div>
                </div>
            </body>
        </html>
    `;
}

app.get("/node", (req, res) => {
    const filePath = path.join(process.env.HOME, "serv00-play/singbox/list");
    fs.readFile(filePath, "utf8", (err, data) => {
        if (err) {
            res.type("html").send(`<pre>无法读取文件: ${err.message}</pre>`);
            return;
        }

        const cleanedData = data
            .replace(/(vmess:\/\/|hysteria2:\/\/|proxyip:\/\/)/g, '\n$1')
            .trim();

        const vmessPattern = /vmess:\/\/[^\n]+/g;
        const hysteriaPattern = /hysteria2:\/\/[^\n]+/g;
        const proxyipPattern = /proxyip:\/\/[^\n]+/g;
        const vmessConfigs = cleanedData.match(vmessPattern) || [];
        const hysteriaConfigs = cleanedData.match(hysteriaPattern) || [];
        const proxyipConfigs = cleanedData.match(proxyipPattern) || [];
        const allConfigs = [...vmessConfigs, ...hysteriaConfigs, ...proxyipConfigs];

        let htmlContent = `
            <html>
            <head>
                <style>
                    body {
                        margin: 0;
                        padding: 0;
                        font-family: Arial, sans-serif;
                        background-color: #f4f4f4;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                    }
                    .content-container {
                        width: 90%;
                        max-width: 600px;
                        background-color: #fff;
                        padding: 20px;
                        border-radius: 8px;
                        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
                        text-align: left;
                        box-sizing: border-box;
                    }
                    h3 {
                        font-size: 20px;
                        margin-bottom: 10px;
                    }
                    .config-box {
                        max-height: 60vh;
                        overflow-y: auto;
                        border: 1px solid #ccc;
                        padding: 10px;
                        background-color: #f9f9f9;
                        box-shadow: inset 0 2px 5px rgba(0, 0, 0, 0.1);
                        border-radius: 5px;
                        white-space: pre-wrap;
                        word-break: break-word;
                    }
                    .copy-btn {
                        display: block;
                        width: 100%;
                        padding: 10px;
                        font-size: 16px;
                        background-color: #007bff;
                        color: white;
                        border: none;
                        border-radius: 5px;
                        cursor: pointer;
                        text-align: center;
                        margin-top: 20px;
                        transition: background-color 0.3s;
                    }
                    .copy-btn:hover {
                        background-color: #0056b3;
                    }
                </style>
            </head>
            <body>
                <div class="content-container">
                    <h3>节点信息</h3>
                    <div class="config-box" id="configBox">
        `;

        allConfigs.forEach((config) => {
            htmlContent += `<div>${config.trim()}</div>`; // 去掉首尾空格
        });

        htmlContent += `
                    </div>
                    <button class="copy-btn" onclick="copyToClipboard('#configBox')">一键复制</button>
                </div>

                <script>
                    function copyToClipboard(id) {
                        const element = document.querySelector(id);
                        let text = "";

                        // 遍历每一行内容，去除首尾空格并拼接
                        Array.from(element.children).forEach(child => {
                            text += child.textContent.trim() + "\\n";
                        });

                        // 创建临时文本框进行复制
                        const textarea = document.createElement('textarea');
                        textarea.value = text.trim(); // 去除整体的多余空行
                        document.body.appendChild(textarea);
                        textarea.select();
                        const success = document.execCommand('copy');
                        document.body.removeChild(textarea);

                        if (success) {
                            alert('已复制到剪贴板！');
                        } else {
                            alert('复制失败，请手动复制！');
                        }
                    }
                </script>
            </body>
            </html>
        `;
        res.type("html").send(htmlContent);
    });
});

app.get("/log", (req, res) => {
    const command = "ps aux"; 
    exec(command, (err, stdout, stderr) => {
        if (err) {
            return res.type("html").send(`
                <pre><b>最近日志:</b>\n${logs[logs.length - 1] || "暂无日志"}</pre>
                <pre><b>进程详情:</b>\n执行错误: ${err.message}</pre>
            `);
        }
        const processOutput = stdout.trim(); 
        const latestLog = logs[logs.length - 1] || "暂无日志";
        res.type("html").send(`
            <html>
                <head>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            margin: 0;
                            padding: 0;
                            background-color: #f4f4f4;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            height: 100vh;
                        }

                        .container {
                            width: 90%;
                            max-width: 1000px;
                            background-color: #fff;
                            padding: 20px;
                            border-radius: 8px;
                            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
                            text-align: left;
                            box-sizing: border-box;
                        }

                        /* 最近日志部分 */
                        pre.log {
                            margin-bottom: 20px;
                            white-space: pre-wrap;  /* 自动换行 */
                            word-wrap: break-word;  /* 防止超出容器宽度 */
                            overflow-wrap: break-word; /* 确保长单词不会溢出 */
                            border: 1px solid #ccc;
                            padding: 10px;
                            background-color: #f9f9f9;
                            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
                            border-radius: 5px;
                        }

                        /* 进程详情部分 */
                        .scrollable {
                            max-height: 60vh; /* 设置进程详情框高 */
                            overflow-x: auto; /* 横向滚动 */
                            white-space: nowrap; /* 禁止换行 */
                            border: 1px solid #ccc;
                            padding: 10px;
                            background-color: #f9f9f9;
                            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
                            border-radius: 5px;
                        }

                        pre {
                            margin: 0; /* 防止 pre 标签内的内容左右溢出 */
                        }

                        @media (max-width: 600px) {
                            .container {
                                width: 95%;
                            }
                            .scrollable {
                                max-height: 50vh; /* 手机屏幕时进程详情高度调整为50% */
                            }
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <pre class="log"><b>最近日志:</b>\n${latestLog}</pre>
                        <div class="scrollable">
                            <pre><b>进程详情:</b>\n${processOutput}</pre>
                        </div>
                    </div>
                </body>
            </html>
        `);
    });
});
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
    const validPaths = ["/info", "/hy2ip", "/node", "/log", "/update"];
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
