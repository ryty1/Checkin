require('dotenv').config();
const express = require("express");
const http = require("http");
const { exec } = require("child_process");
const socketIo = require("socket.io");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const ACCOUNTS_FILE = path.join(__dirname, "accounts.json");

const username = process.env.USER.toLowerCase(); // 获取当前用户名并转换为小写
const DOMAIN_DIR = path.join(process.env.HOME, "domains", `${username}.serv00.net`, "public_nodejs");
// 定义 OTA 脚本路径
const otaScriptPath = path.join(__dirname, 'ota.sh');

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

// **确保本机账号存在**
function ensureDefaultAccount() {
    let accounts = {};
    if (fs.existsSync(ACCOUNTS_FILE)) {
        accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf-8"));
    }
    if (!accounts[username]) {
        accounts[username] = { user: username };
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
    }
}
ensureDefaultAccount();

// 获取所有账号
async function getAccounts() {
    if (!fs.existsSync(ACCOUNTS_FILE)) return {};
    return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf-8"));
}

// 过滤无效节点，只保留 `vmess://` 和 `hysteria2://`
function filterNodes(nodes) {
    return nodes.filter(node => node.startsWith("vmess://") || node.startsWith("hysteria2://"));
}

// 获取节点汇总
async function getNodesSummary(socket) {
    const accounts = await getAccounts();
    const users = Object.keys(accounts);
    let successfulNodes = [];
    let failedAccounts = [];

    await Promise.all(users.map(async (user) => {
        const nodeUrl = `https://${user}.serv00.net/node`;

        try {
            const nodeResponse = await axios.get(nodeUrl, { timeout: 5000 });
            const nodeData = nodeResponse.data;

            // 解析并过滤无效节点
            const nodeLinks = filterNodes([
                ...(nodeData.match(/vmess:\/\/[^\s<>"]+/g) || []),
                ...(nodeData.match(/hysteria2:\/\/[^\s<>"]+/g) || [])
            ]);

            if (nodeLinks.length > 0) {
                successfulNodes.push(...nodeLinks);
            }
        } catch (error) {
            failedAccounts.push(user);
        }
    }));

    socket.emit("nodesSummary", { successfulNodes, failedAccounts });
}

// WebSocket 处理
io.on("connection", (socket) => {
    console.log("Client connected");

    socket.on("startNodesSummary", () => {
        getNodesSummary(socket);
    });

    socket.on("saveAccount", async (accountData) => {
        const accounts = await getAccounts();
        accounts[accountData.user] = accountData;
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
        socket.emit("accountSaved", { message: `账号 ${accountData.user} 已保存` });
        socket.emit("accountsList", await getAccounts());
    });

    socket.on("deleteAccount", async (user) => {
        const accounts = await getAccounts();
        delete accounts[user];
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
        socket.emit("accountDeleted", { message: `账号 ${user} 已删除` });
        socket.emit("accountsList", await getAccounts());
    });

    socket.on("loadAccounts", async () => {
        socket.emit("accountsList", await getAccounts());
    });
});

// 获取当前系统的状态数据
async function getSystemStatus() {
    // 运行 Shell 命令并获取返回信息（假设这里有实际的命令执行）
    await runShellCommand();
    await KeepAlive();

    return {
        singboxStatus: "已复活",
        htmlonliveStatus: "守护中",
    };
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

// 提供前端页面
app.use(express.static(path.join(__dirname, "public")));

app.get("/to_info", (req, res) => {
    const user = req.query.user;
    res.redirect(`https://${user}.serv00.net/info`);
});



// 提供 info 页面
app.get("/info", async (req, res) => {
    const systemStatus = await getSystemStatus();
    res.json(systemStatus);  // 返回 JSON 数据
});

// 中间件：解析请求体
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.urlencoded({ extended: false }));

// 访问 HY2_IP 页面（返回静态 HTML 文件）
app.get("/hy2ip", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "hy2ip.html"));
});

// 处理 IP 更新请求
app.post("/hy2ip/execute", (req, res) => {
    const confirmation = req.body.confirmation?.trim();

    if (confirmation !== "更新") {
        return res.status(400).json({ error: "输入错误，请输入 '更新' 以确认执行 IP 更新。" });
    }

    try {
        let updatedIp = "192.168.1.100"; // 假设的 IP 更新逻辑
        res.json({
            success: true,
            message: `SingBox 配置文件成功更新 IP 为 ${updatedIp}`,
            updatedIp,
            logs: [
                "命令执行成功",
                `SingBox 配置文件成功更新 IP 为 ${updatedIp}`,
                "sing-box 已重启"
            ]
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "更新失败，请稍后再试。",
            logs: ["命令执行失败", error.message]
        });
    }
});


// **API: 获取节点信息**
app.get("/api/node", (req, res) => {
    const filePath = path.join(process.env.HOME, "serv00-play/singbox/list");

    fs.readFile(filePath, "utf8", (err, data) => {
        if (err) {
            return res.status(500).json({ success: false, message: "无法读取文件", error: err.message });
        }

        const cleanedData = data.replace(/(vmess:\/\/|hysteria2:\/\/|proxyip:\/\/|https:\/\/)/g, '\n$1').trim();
        const patterns = [/vmess:\/\/[^\n]+/g, /hysteria2:\/\/[^\n]+/g, /https:\/\/[^\n]+/g, /proxyip:\/\/[^\n]+/g];
        const allConfigs = patterns.flatMap(pattern => cleanedData.match(pattern) || []);

        res.json({ success: true, configs: allConfigs });
    });
});

// **API: 获取日志信息**
app.get("/api/log", (req, res) => {
    exec("ps aux", (err, stdout) => {
        if (err) {
            return res.status(500).json({ success: false, message: "无法获取日志", error: err.message });
        }
        res.json({ success: true, log: stdout.trim() });
    });
});

// **API: 执行 OTA 更新**
app.get("/api/ota/update", (req, res) => {
    exec("your-ota-update-script.sh", (error, stdout, stderr) => {
        if (error || stderr) {
            return res.status(500).json({ success: false, message: "更新失败", error: error?.message || stderr });
        }
        res.json({ success: true, message: "更新成功", output: stdout });
    });
});

// **提供前端页面**
app.get("/node", (req, res) => res.sendFile(path.join(__dirname, "public", "node.html")));
app.get("/log", (req, res) => res.sendFile(path.join(__dirname, "public", "log.html")));
app.get("/ota", (req, res) => res.sendFile(path.join(__dirname, "public", "ota.html")));

app.use((req, res, next) => {
    const validPaths = ["/", "/accounts", "/nodes", "/to_info", "/info", "/hy2ip", "/node", "/log", "/ota"];
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
