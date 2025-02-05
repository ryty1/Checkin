require('dotenv').config();
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const { exec } = require("child_process");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = 3000;
const ACCOUNTS_FILE = path.join(__dirname, "accounts.json");

let logs = [];
let latestStartLog = "";

// 获取本机账号
const MAIN_SERVER_USER = process.env.USER ? process.env.USER.toLowerCase() : "default_user";

// **确保本机账号存在**
function ensureDefaultAccount() {
    let accounts = {};
    if (fs.existsSync(ACCOUNTS_FILE)) {
        accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf-8"));
    }
    if (!accounts[MAIN_SERVER_USER]) {
        accounts[MAIN_SERVER_USER] = { user: MAIN_SERVER_USER };
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
            const nodeLinks = filterNodes([...(nodeData.match(/vmess:\/\/[^\s<>"]+/g) || []), ...(nodeData.match(/hysteria2:\/\/[^\s<>"]+/g) || [])]);

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

// 提供前端页面
app.use(express.static(path.join(__dirname, "public")));

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
                    width: 100vw;
                    padding: 0;
                    overflow: hidden;
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
                    font-size: max(25px, 4vw);
                    font-weight: bold;
                    margin-bottom: 20px;
                    line-height: 1.3;
                    text-align: center;
                    white-space: nowrap;
                }

                @keyframes growShrink {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.15); }
                    100% { transform: scale(1); }
                }

                .dynamic-text span {
                    display: inline-block;
                    animation: growShrink 1s infinite;
                    animation-delay: calc(0.08s * var(--char-index));
                }

                .button-container {
                    margin-top: 30px;
                    display: flex;
                    flex-wrap: wrap;
                    gap: 10px;
                    justify-content: space-between;
                    width: 100%;
                    box-sizing: border-box;
                }

                button {
                    padding: 12px 25px;
                    font-size: 20px;
                    background-color: #4CAF50;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    transition: background-color 0.3s ease, transform 0.1s;
                    width: 45%;
                    min-width: 150px;
                    box-sizing: border-box;
                }

                button:hover {
                    background-color: #45a049;
                    transform: scale(1.05);
                }

                @media (max-width: 600px) {
                    .dynamic-text {
                        font-size: max(18px, 5vw);
                    }

                    .button-container {
                        flex-direction: row;
                        width: 100%;
                    }

                    button {
                        font-size: 16px;
                        width: 45%;
                        min-width: 120px;
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
                    <button onclick="window.location.href='/ota'">检查更新</button>
                </div>
            </div>
        </body>
        </html>
    `);
});

// WebSocket 处理
app.use((req, res, next) => {
    const validPaths = ["/info"];
    if (validPaths.includes(req.path)) {
        return next();
    }
    res.status(404).send("页面未找到");
});

server.listen(PORT, () => {
    const timestamp = new Date().toLocaleString();
    const startMsg = `${timestamp} 服务器已启动，监听端口 ${PORT}`;
    logMessage(startMsg);
    console.log(startMsg);
});
