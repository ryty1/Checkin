require('dotenv').config();
const express = require("express");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const app = express();
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
    const username = process.env.USER.toLowerCase(); // 获取当前用户名并转换为小写

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
                        <input type="text" name="confirmation" placeholder="请输入 更新">
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

    // 验证用户输入是否为“更新”
    if (confirmation !== "更新") {
        return res.send(`
            <html>
                <head>
                    <title>HY2_IP 更新失败</title>
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
                            max-width: 800px;
                            background-color: #fff;
                            padding: 20px;
                            margin: 0 10px;
                            border-radius: 8px;
                            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
                            text-align: left;
                        }
                        h1 {
                            font-size: 24px;
                            margin-bottom: 20px;
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

    // 输入正确时执行脚本
    try {
        let logMessages = []; // 收集日志信息

        executeHy2ipScript(logMessages, (error, stdout, stderr) => {
            if (error) {
                logMessages.push(`Error: ${error.message}`);
                return res.status(500).json({ success: false, message: "hy2ip.sh 执行失败", logs: logMessages });
            }

            if (stderr) logMessages.push(`stderr: ${stderr}`);

            let outputMessages = stdout.split("\n");
            let updatedIp = "";

            outputMessages.forEach(line => {
                if (line.includes("SingBox 配置文件成功更新IP为")) {
                    updatedIp = line.split("SingBox 配置文件成功更新IP为")[1].trim();
                }
                if (line.includes("Config 配置文件成功更新IP为")) {
                    updatedIp = line.split("Config 配置文件成功更新IP为")[1].trim();
                }
            });

            if (updatedIp) {
                logMessages.push("命令执行成功");
                logMessages.push(`SingBox 配置文件成功更新IP为 ${updatedIp}`);
                logMessages.push(`Config 配置文件成功更新IP为 ${updatedIp}`);
                logMessages.push("sing-box 已重启");

                let htmlLogs = logMessages.map(msg => `<p>${msg}</p>`).join("");

                res.send(`
                    <html>
                        <head>
                            <title>HY2_IP 更新结果</title>
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
                                    max-width: 800px;
                                    background-color: #fff;
                                    padding: 20px;
                                    margin: 0 10px;
                                    border-radius: 8px;
                                    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
                                    text-align: left;
                                }
                                h1 {
                                    font-size: 24px;
                                    margin-bottom: 20px;
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
                            </style>
                        </head>
                        <body>
                            <div class="container">
                                <h1>IP 更新结果</h1>
                                <p><strong>有效IP：</strong> ${updatedIp}</p>
                                <div>
                                    <h2>日志:</h2>
                                    <div class="scrollable">
                                        ${htmlLogs}
                                    </div>
                                </div>
                            </div>
                        </body>
                    </html>
                `);
            } else {
                logMessages.push("未能获取更新的 IP");
                res.status(500).json({
                    success: false,
                    message: "未能获取更新的 IP",
                    logs: logMessages
                });
            }
        });
    } catch (error) {
        let logMessages = [];
        logMessages.push("Error executing hy2ip.sh script:", error.message);

        res.status(500).json({ success: false, message: error.message, logs: logMessages });
    }
});
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
    const command = "ps -A"; 
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

app.use((req, res, next) => {
    const validPaths = ["/info", "/hy2ip", "/node", "/log"];
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