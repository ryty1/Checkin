require('dotenv').config();
const express = require("express");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));  // 提供静态文件

let logs = [];
let latestStartLog = "";

// 记录日志
function logMessage(message) {
    logs.push(message);
    if (logs.length > 5) logs.shift();
}

// 运行 Shell 命令
function executeCommand(command, actionName, isStartLog = false, callback) {
    exec(command, (err, stdout, stderr) => {
        if (err) return callback({ success: false, message: `${actionName} 执行失败: ${err.message}` });

        let output = stdout || stderr;
        logMessage(`${actionName} 执行成功: ${output}`);
        if (isStartLog) latestStartLog = output;
        callback({ success: true, output });
    });
}

// **定期运行 keepalive.sh**
function KeepAlive() {
    executeCommand(`cd ${process.env.HOME}/serv00-play/ && bash keepalive.sh`, "keepalive.sh", true, () => {});
}
setInterval(KeepAlive, 20000);

// **API: 获取 info 状态**
app.get("/api/info", (req, res) => {
    res.json({ status: "SingBox 已复活", guard: "HtmlOnLive 守护中" });
});

// **API: 执行 hy2ip.sh**
app.post("/api/hy2ip", (req, res) => {
    executeCommand(`cd ${process.env.HOME}/domains/${process.env.USER.toLowerCase()}.serv00.net/public_nodejs/ && bash hy2ip.sh`, "HY2_IP 更新", false, (result) => {
        res.json(result);
    });
});

// **API: 获取节点信息**
app.get("/api/node", (req, res) => {
    const filePath = path.join(process.env.HOME, "serv00-play/singbox/list");
    fs.readFile(filePath, "utf8", (err, data) => {
        if (err) return res.status(500).json({ success: false, message: "无法读取节点文件" });

        const nodes = data.match(/(vmess:\/\/|hysteria2:\/\/|proxyip:\/\/)[^\n]+/g) || [];
        res.json({ success: true, nodes });
    });
});

// **API: 获取日志信息**
app.get("/api/log", (req, res) => {
    exec("ps aux", (err, stdout) => {
        if (err) return res.json({ success: false, latestLog: logs[logs.length - 1] || "暂无日志", processes: "无法获取进程" });

        res.json({ success: true, latestLog: logs[logs.length - 1] || "暂无日志", processes: stdout });
    });
});

// **404 处理**
app.use((req, res) => {
    res.status(404).send("页面未找到");
});

// **启动服务器**
app.listen(3000, () => {
    const startMsg = `${new Date().toLocaleString()} 服务器已启动，监听端口 3000`;
    logMessage(startMsg);
    console.log(startMsg);
});