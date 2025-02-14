require('dotenv').config();
const express = require("express");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const app = express();

const username = process.env.USER.toLowerCase(); // 获取当前用户名并转换为小写
const DOMAIN_DIR = path.join(process.env.HOME, "domains", `${username}.serv00.net`, "public_nodejs");

// 允许静态文件访问
app.use(express.static(path.join(__dirname, 'public')));

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
setInterval(KeepAlive, 20000);

app.get("/info", (req, res) => {
    runShellCommand();
    KeepAlive();
    res.sendFile(path.join(__dirname, "public", "info.html"));
});

// 中间件：解析请求体
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get("/hy2ip", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "hy2ip.html"));
});

app.post("/hy2ip/execute", (req, res) => {
    const confirmation = req.body.confirmation?.trim();

    if (confirmation !== "更新") {
        return res.json({ success: false, errorMessage: "输入错误！请返回并输入“更新”以确认。" });
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
                updatedIp = updatedIp.replace(/\x1B\[[0-9;]*m/g, "");

                if (updatedIp && updatedIp !== "未找到可用的 IP！") {
                    logMessages.push("命令执行成功");
                    logMessages.push(`SingBox 配置文件成功更新IP为 ${updatedIp}`);
                    logMessages.push(`Config 配置文件成功更新IP为 ${updatedIp}`);
                    logMessages.push("sing-box 已重启");
                    res.json({ success: true, ip: updatedIp, logs: logMessages });
                } else {
                    logMessages.push("命令执行成功");
                    logMessages.push("没有找到有效 IP");
                    res.json({ success: false, errorMessage: "没有找到有效的 IP", logs: logMessages });
                }
            }
        });
    } catch (error) {
        let logMessages = ["命令执行成功", "没有找到有效 IP"];
        res.json({ success: false, errorMessage: "命令执行失败", logs: logMessages });
    }
});

// 提供静态文件
app.get("/node", (req, res) => {
    const filePath = path.join(process.env.HOME, "serv00-play/singbox/list");
    
    fs.readFile(filePath, "utf8", (err, data) => {
        if (err) {
            res.type("html").send(`<pre>无法读取文件: ${err.message}</pre>`);
            return;
        }

        const cleanedData = data
            .replace(/(vmess:\/\/|hysteria2:\/\/|proxyip:\/\/|https:\/\/)/g, '\n$1')
            .trim();

        const vmessPattern = /vmess:\/\/[^\n]+/g;
        const hysteriaPattern = /hysteria2:\/\/[^\n]+/g;
        const httpsPattern = /https:\/\/[^\n]+/g;
        const proxyipPattern = /proxyip:\/\/[^\n]+/g;

        const vmessConfigs = cleanedData.match(vmessPattern) || [];
        const hysteriaConfigs = cleanedData.match(hysteriaPattern) || [];
        const httpsConfigs = cleanedData.match(httpsPattern) || [];
        const proxyipConfigs = cleanedData.match(proxyipPattern) || [];
        const allConfigs = [...vmessConfigs, ...hysteriaConfigs, ...httpsConfigs, ...proxyipConfigs];

        // 返回节点信息接口
        app.get("/api/node", (req, res) => {
            res.json({ configs: allConfigs });
        });

        // 提供静态页面
        res.sendFile(path.join(__dirname, "public", "node.html"));
    });
});

// 日志和进程详情接口
app.get("/api/log", (req, res) => {
    const command = "ps aux"; 

    exec(command, (err, stdout, stderr) => {
        if (err) {
            return res.json({
                error: true,
                message: `执行错误: ${err.message}`,
                logs: "暂无日志",
                processOutput: ""
            });
        }

        const processOutput = stdout.trim(); 
        const latestLog = logs[logs.length - 1] || "暂无日志";
        
        res.json({
            error: false,
            message: "成功获取数据",
            logs: latestLog,
            processOutput: processOutput
        });
    });
});

// 提供静态页面
app.get("/log", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "log.html"));
});


// **执行 OTA 更新**
app.get('/ota/update', (req, res) => {
  const downloadScriptCommand = 'curl -Ls https://raw.githubusercontent.com/ryty1/My-test/refs/heads/main/single/ota.sh -o /tmp/ota.sh';

    // 执行下载命令
    exec(downloadScriptCommand, (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ 下载脚本错误: ${error.message}`);
            return res.status(500).json({ success: false, message: error.message });
        }
        if (stderr) {
            console.error(`❌ 下载脚本错误输出: ${stderr}`);
            return res.status(500).json({ success: false, message: stderr });
        }

        // 执行下载的脚本
        const executeScriptCommand = 'bash /tmp/ota.sh';

        exec(executeScriptCommand, (error, stdout, stderr) => {
            // 删除临时文件
            exec('rm -f /tmp/ota.sh', (err) => {
                if (err) {
                    console.error(`❌ 删除临时文件失败: ${err.message}`);
                } else {
                    console.log('✅ 临时文件已删除');
                }
            });

            if (error) {
                console.error(`❌ 执行脚本错误: ${error.message}`);
                return res.status(500).json({ success: false, message: error.message });
            }
            if (stderr) {
                console.error(`❌ 脚本错误输出: ${stderr}`);
                return res.status(500).json({ success: false, message: stderr });
            }
            
            // 返回脚本执行的结果
            res.json({ success: true, output: stdout });
        });
    });
});

// **前端页面 `/ota`**
app.get('/ota', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>OTA 更新</title>
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
                width: 90%;  /* 容器宽度增大 */
                max-width: 800px;
                padding: 20px;
                background-color: #fff;
                border-radius: 8px;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
            }
            h1 {
                text-align: center;
                color: #333;
                font-size: 18px;
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
                font-size: 15px;
                transition: background-color 0.3s;
            }
            button:hover {
                background-color: #45a049;
            }
            #result {
                margin-top: 20px;
                font-size: 12px;
                word-wrap: break-word;
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

            /* Media queries for responsiveness */
            @media (max-width: 768px) {
                .container {
                    width: 95%;  /* On smaller screens, container becomes wider */
                    padding: 15px;
                }
                h1 {
                    font-size: 16px;  /* Smaller font size for mobile */
                }
                button {
                    font-size: 14px;  /* Smaller button text */
                }
                #result {
                    font-size: 11px;  /* Smaller text in result */
                }
            }

            @media (max-width: 480px) {
                h1 {
                    font-size: 14px;  /* Even smaller font size on very small screens */
                }
                button {
                    font-size: 12px;  /* Smaller button text */
                }
                #result {
                    font-size: 10px;  /* Smaller text in result */
                }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>OTA 更新</h1>
            <button onclick="checkForUpdates()">检查更新</button>
            <div id="result"></div>
        </div>

        <script>
            async function checkForUpdates() {
                try {
                    const response = await fetch('/ota/update');
                    const data = await response.json();

                    if (data.success) {
                        const resultHtml = \`
                            <h3>更新结果</h3>
                            <pre>\${data.output}</pre>
                        \`;
                        document.getElementById('result').innerHTML = resultHtml;
                    } else {
                        document.getElementById('result').innerHTML = '<p class="failure">更新时发生错误</p>';
                    }
                } catch (error) {
                    document.getElementById('result').innerHTML = '<p class="failure">请求失败</p>';
                }
            }
        </script>
    </body>
    </html>
    `);
});

app.use((req, res, next) => {
    const validPaths = ["/info", "/hy2ip", "/node", "/log", "/ota"];
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