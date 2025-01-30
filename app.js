require('dotenv').config();
const express = require("express");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const axios = require('axios');
const crypto = require('crypto');
const app = express();

const username = process.env.USER.toLowerCase(); // 获取当前用户名并转换为小写
const DOMAIN_DIR = path.join(process.env.HOME, "domains", `${username}.serv00.net`, "public_nodejs");

const REMOTE_DIR_URL = 'https://raw.githubusercontent.com/ryty1/My-test/main/';

// 需要排除的文件名（例如 README 文件）
const EXCLUDED_FILES = ['README.md'];
const EXCLUDED_DIRS = ['public', 'tmp']; // **本地 `public` 和 `tmp` 目录不会被扫描**

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

                    // 打印调试信息，确保哈希比对正确
                    console.log(`🔍 检查 ${fileName}`);
                    console.log(`🔢 远程哈希: ${remoteHash}`);
                    console.log(`🔢 本地哈希: ${localHash}`);

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

setInterval(KeepAlive, 20000);
app.get("/info", (req, res) => {
    runShellCommand();
    KeepAlive();
    res.type("html").send(`
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
            <title>系统状态</title>
            <style>
                body {
                    margin: 0;
                    font-family: Arial, sans-serif;
                    background-color: #f4f4f4;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    width: 100vw; /* 确保满屏 */
                    padding: 0;
                    overflow: hidden; /* 防止多余滚动 */
                }

                .content-container {
                    width: 95%;
                    max-width: 900px;
                    background-color: #fff;
                    padding: 20px;
                    border-radius: 8px;
                    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
                    box-sizing: border-box;
                    text-align: center;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                }

                .dynamic-text {
                    font-size: max(20px, 4vw); /* 文字更大 */
                    font-weight: bold;
                    margin-bottom: 20px;
                    line-height: 1.3;
                    text-align: center;
                    white-space: nowrap;
                }

                @keyframes growShrink {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.15); } /* 增强放大效果 */
                    100% { transform: scale(1); }
                }

                .dynamic-text span {
                    display: inline-block;
                    animation: growShrink 1s infinite; /* 动画更快 */
                    animation-delay: calc(0.08s * var(--char-index));
                }

                .button-container {
                    margin-top: 30px;
                    display: flex;
                    flex-wrap: wrap;
                    gap: 10px;
                    justify-content: center;
                    width: 100%;
                }

                button {
                    padding: 12px 25px;
                    font-size: 20px;
                    background-color: #007bff;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    transition: background-color 0.3s ease, transform 0.1s;
                    width: 48%;
                    min-width: 120px;
                    box-sizing: border-box;
                }

                button:hover {
                    background-color: #0056b3;
                    transform: scale(1.05);
                }

                @media (max-width: 600px) {
                    .dynamic-text {
                        font-size: max(18px, 5vw);
                    }

                    .button-container {
                        flex-direction: column;
                        width: 100%;
                    }

                    button {
                        font-size: 18px;
                        width: 100%;
                    }

                    .content-container {
                        padding: 15px;
                    }
                }
            </style>
        </head>
        <body>
            <div class="content-container">
                <div class="dynamic-text">
                    ${"SingBox 已 复 活".split("").map((char, index) => 
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
                <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
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
                        width: 100vw;
                        overflow: hidden;
                    }
                    .container {
                        width: 95%;
                        max-width: 600px;
                        background-color: #fff;
                        padding: 20px;
                        border-radius: 8px;
                        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
                        box-sizing: border-box;
                        text-align: center;
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
                        font-size: 16px;
                        border: 1px solid #ccc;
                        border-radius: 4px;
                        box-sizing: border-box;
                        margin-bottom: 15px;
                        text-align: center;
                        transition: 0.3s;
                    }
                    input[type="text"]:focus {
                        border-color: #007bff;
                        outline: none;
                        box-shadow: 0 0 8px rgba(0, 123, 255, 0.5);
                    }
                    button {
                        width: 100%;
                        padding: 12px;
                        font-size: 18px;
                        background-color: #007bff;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        transition: 0.3s;
                    }
                    button:hover {
                        background-color: #0056b3;
                        transform: scale(1.05);
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
                    <p>请输入 <b>更新</b> 以确认执行 IP 更新。</p>
                    <form action="/hy2ip/execute" method="POST">
                        <input type="text" name="confirmation" placeholder="更新">
                        <button type="submit">提交</button>
                    </form>
                    <p>⚠️ 更新后原线路会失效，请复制新信息使用。</p>
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
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <title>HY2_IP 更新失败</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            background-color: #f4f4f4;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            height: 100vh;
                            margin: 0;
                            padding: 0 10px;
                        }
                        .container {
                            width: 90%;
                            max-width: 600px;
                            background-color: #fff;
                            padding: 20px;
                            border-radius: 8px;
                            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
                            text-align: center;
                        }
                        h1 {
                            font-size: 22px;
                            margin-bottom: 15px;
                        }
                        p {
                            font-size: 16px;
                            color: red;
                        }
                        a {
                            color: #007bff;
                            text-decoration: none;
                        }
                        a:hover {
                            text-decoration: underline;
                        }
                        @media (max-width: 600px) {
                            .container {
                                padding: 15px;
                            }
                            h1 {
                                font-size: 20px;
                            }
                        }
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
                // 去掉 ANSI 颜色码
                if (updatedIp) {
                    updatedIp = updatedIp.replace(/\x1B\[[0-9;]*m/g, "");
                }

                if (updatedIp && updatedIp !== "未找到可用的 IP！") {
                    logMessages.push("命令执行成功");
                    logMessages.push(`SingBox 配置文件成功更新IP为 ${updatedIp}`);
                    logMessages.push(`Config 配置文件成功更新IP为 ${updatedIp}`);
                    logMessages.push("sing-box 已重启");
                    res.send(generateHtml("HY2_IP 更新", updatedIp, logMessages));
                } else {
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
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>${title}</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        background-color: #f4f4f4;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                        margin: 0;
                        padding: 0 10px;
                    }
                    .container {
                        width: 90%;
                        max-width: 800px;
                        background-color: #fff;
                        padding: 20px;
                        border-radius: 8px;
                        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
                        text-align: left;
                    }
                    h1 {
                        font-size: 24px;
                        margin-bottom: 20px;
                        text-align: left;
                    }
                    p {
                        font-size: 16px;
                    }
                    .scrollable {
                        max-height: 300px;
                        overflow-y: auto;
                        border: 1px solid #ccc;
                        padding: 10px;
                        background-color: #f9f9f9;
                        border-radius: 4px;
                    }
                    .ip {
                        font-weight: bold;
                        color: ${ipColor};
                    }
                    @media (max-width: 600px) {
                        .container {
                            padding: 15px;
                        }
                        h1 {
                            font-size: 22px;
                        }
                        .scrollable {
                            max-height: 200px;
                        }
                    }
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
                <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
                <title>节点信息</title>
                <style>
                    body {
                        margin: 0;
                        padding: 0;
                        font-family: Arial, sans-serif;
                        background-color: #f4f4f4;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                        padding: 10px;
                    }
                    .content-container {
                        width: 90%;
                        max-width: 600px;
                        background-color: #fff;
                        padding: 15px;
                        border-radius: 8px;
                        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
                        text-align: left;
                        box-sizing: border-box;
                    }
                    h3 {
                        font-size: 20px;
                        margin-bottom: 10px;
                        text-align: center;
                    }
                    .config-box {
                        max-height: 65vh;
                        overflow-y: auto;
                        border: 1px solid #ccc;
                        padding: 8px;
                        background-color: #f9f9f9;
                        box-shadow: inset 0 2px 5px rgba(0, 0, 0, 0.1);
                        border-radius: 5px;
                        white-space: pre-wrap;
                        word-break: break-word;
                        font-size: 14px;
                    }
                    .copy-btn {
                        display: block;
                        width: 100%;
                        padding: 12px;
                        font-size: 16px;
                        background-color: #007bff;
                        color: white;
                        border: none;
                        border-radius: 5px;
                        cursor: pointer;
                        text-align: center;
                        margin-top: 15px;
                        transition: background-color 0.3s;
                    }
                    .copy-btn:hover {
                        background-color: #0056b3;
                    }
                    @media (max-width: 600px) {
                        .content-container {
                            padding: 12px;
                        }
                        .config-box {
                            font-size: 13px;
                        }
                        .copy-btn {
                            font-size: 15px;
                            padding: 10px;
                        }
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
                    <button class="copy-btn" onclick="copyToClipboard()">一键复制</button>
                </div>

                <script>
                    function copyToClipboard() {
                        const element = document.getElementById("configBox");
                        let text = Array.from(element.children)
                            .map(child => child.textContent.trim())
                            .join("\\n");

                        navigator.clipboard.writeText(text).then(() => {
                            alert("已复制到剪贴板！");
                        }).catch(() => {
                            alert("复制失败，请手动复制！");
                        });
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
                    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
                    <title>日志与进程详情</title>
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
                            width: 95%; /* 让内容接近屏幕边缘 */
                            max-width: 1200px; /* 避免大屏过宽 */
                            background-color: #fff;
                            padding: 15px;
                            border-radius: 8px;
                            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
                            text-align: left;
                            box-sizing: border-box;
                            min-height: 95vh; /* 适配 16:9，减少上下留白 */
                            display: flex;
                            flex-direction: column;
                            justify-content: center;
                        }

                        /* 最近日志部分 */
                        pre.log {
                            margin-bottom: 15px;
                            white-space: pre-wrap; /* 自动换行 */
                            word-wrap: break-word;
                            overflow-wrap: break-word;
                            border: 1px solid #ccc;
                            padding: 10px;
                            background-color: #f9f9f9;
                            box-shadow: inset 0 2px 5px rgba(0, 0, 0, 0.1);
                            border-radius: 5px;
                        }

                        /* 进程详情部分 */
                        .scrollable {
                            max-height: 60vh;
                            overflow-x: auto;
                            white-space: nowrap;
                            border: 1px solid #ccc;
                            padding: 10px;
                            background-color: #f9f9f9;
                            box-shadow: inset 0 2px 5px rgba(0, 0, 0, 0.1);
                            border-radius: 5px;
                        }

                        pre {
                            margin: 0;
                        }

                        @media (max-width: 600px) {
                            .container {
                                width: 98%; /* 在手机上更贴边 */
                                min-height: 98vh; /* 贴合屏幕 */
                            }
                            .scrollable {
                                max-height: 50vh;
                            }
                        }

                        @media (min-width: 1200px) {
                            .container {
                                max-width: 1000px; /* 避免超宽屏幕内容过散 */
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
