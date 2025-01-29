require('dotenv').config();
const express = require("express");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const username = process.env.USER.toLowerCase(); // 获取当前用户名并转换为小写
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(path.join(__dirname, 'public_nodejs')));
let logs = [];
let latestStartLog = "";

// 记录日志
function logMessage(message) {
    logs.push(message);
    if (logs.length > 5) logs.shift();
}

// 执行 Shell 命令
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

// 执行 start.sh
function runShellCommand() {
    const command = `cd ${process.env.HOME}/serv00-play/singbox/ && bash start.sh`;
    executeCommand(command, "start.sh", true);
}

// 执行 HY2IP 更新
function executeHy2ipScript(callback) {
    const command = `cd ${process.env.HOME}/domains/${username}.serv00.net/public_nodejs/ && bash hy2ip.sh`;
    
    exec(command, (error, stdout, stderr) => {
        callback(error, stdout, stderr);
    });
}

// 执行 keepalive.sh（定时任务）
function KeepAlive() {
    const command = `cd ${process.env.HOME}/serv00-play/ && bash keepalive.sh`;
    executeCommand(command, "keepalive.sh", true);
}
setInterval(KeepAlive, 20000);

// API: 获取状态信息
app.get("/api/info", (req, res) => {
    runShellCommand();
    KeepAlive();
        const data = {
        message: "SingBox 已复活",
        status: "HtmlOnLive 守护中"
    };
    res.json(data);
});



app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// HY2_IP 页面
app.get("/hy2ip", (req, res) => {
    res.sendFile(__dirname + "/public/hy2ip.html");  // 假设将 HTML 文件放在 public 文件夹下
});

// 执行 IP 更新
app.post("/hy2ip/execute", (req, res) => {
    const confirmation = req.body.confirmation?.trim();

    if (confirmation !== "更新") {
        return res.status(400).json({
            success: false,
            message: "输入错误！请输入“更新”以确认。"
        });
    }

    try {
        let logMessages = [];

        executeHy2ipScript(logMessages, (error, stdout, stderr) => {
            if (error) {
                logMessages.push(`Error: ${error.message}`);
                return res.status(500).json({ success: false, message: "执行失败", logs: logMessages });
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
                logMessages.push(`成功更新 IP: ${updatedIp}`);
                res.json({
                    success: true,
                    updatedIp: updatedIp,
                    logs: logMessages
                });
            } else {
                logMessages.push("未能获取更新的 IP");
                res.status(500).json({ success: false, message: "未能获取更新的 IP", logs: logMessages });
            }
        });
    } catch (error) {
        let logMessages = [];
        logMessages.push("Error executing hy2ip.sh script:", error.message);

        res.status(500).json({ success: false, message: error.message, logs: logMessages });
    }
});


// API: 获取节点信息
app.get("/api/node", (req, res) => {
    const filePath = path.join(process.env.HOME, "serv00-play/singbox/list");
    fs.readFile(filePath, "utf8", (err, data) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        
        const cleanedData = data.replace(/(vmess:\/\/|hysteria2:\/\/|proxyip:\/\/)/g, '\n$1').trim();
        const allConfigs = cleanedData.split("\n").filter(line => line);
        
        res.json({ success: true, nodes: allConfigs });
    });
});

// API: 获取日志
app.get("/api/log", (req, res) => {
    exec("ps aux", (err, stdout) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, logs: stdout.split("\n") });
    });
});

// 启动服务器
app.listen(3000, () => {
    const timestamp = new Date().toLocaleString();
    const startMsg = `${timestamp} 服务器已启动，监听端口 3000`;
    logMessage(startMsg);
    console.log(startMsg);
});