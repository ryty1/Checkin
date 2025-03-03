const express = require("express");
const session = require("express-session");
const FileStore = require("session-file-store")(session);
const http = require("http");
const { exec } = require("child_process");
const socketIo = require("socket.io");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const cron = require("node-cron");
const TelegramBot = require("node-telegram-bot-api");
const bodyParser = require("body-parser");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = 3000;
const ACCOUNTS_FILE = path.join(__dirname, "accounts.json");
const SETTINGS_FILE = path.join(__dirname, "settings.json");
const PASSWORD_FILE = path.join(__dirname, "password.json");
const SESSION_DIR = path.join(__dirname, "sessions"); 
const SESSION_FILE = path.join(__dirname, "session_secret.json");
const otaScriptPath = path.join(__dirname, 'ota.sh');

app.use(express.json()); 
app.use(express.static(path.join(__dirname, "public")));

app.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
});

function getSessionSecret() {
    if (fs.existsSync(SESSION_FILE)) {
        return JSON.parse(fs.readFileSync(SESSION_FILE, "utf-8")).secret;
    } else {
        const secret = crypto.randomBytes(32).toString("hex");
        fs.writeFileSync(SESSION_FILE, JSON.stringify({ secret }), "utf-8");
        return secret;
    }
}

app.use(session({
    store: new FileStore({
        path: path.join(__dirname, "sessions"), 
        ttl: 60 * 60,  
        retries: 1,
        clearInterval: 3600 
    }),
    secret: getSessionSecret(), 
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true }
}));

app.use(bodyParser.urlencoded({ extended: true }));

function checkPassword(req, res, next) {
    if (!fs.existsSync(PASSWORD_FILE)) {
        return res.redirect("/setPassword");
    }
    next();
}

app.get("/checkSession", (req, res) => {
    if (req.session.authenticated) {
        res.status(200).json({ authenticated: true });
    } else {
        res.status(401).json({ authenticated: false });
    }
});

function isAuthenticated(req, res, next) {
    if (req.session.authenticated) {
        return next();
    }
    res.redirect("/login");  
}

app.get("/setPassword", (req, res) => {
    res.sendFile(path.join(__dirname, "protected", "set_password.html"));
});

app.post("/setPassword", (req, res) => {
    const { password } = req.body;
    if (!password) {
        return res.status(400).send("密码不能为空");
    }
    fs.writeFileSync(PASSWORD_FILE, JSON.stringify({ password }), "utf-8");
    res.redirect("/login");
});

const errorCache = new Map(); 

async function sendErrorToTG(user, status, message) {
    try {
        const settings = getNotificationSettings();
        if (!settings.telegramToken || !settings.telegramChatId) {
            console.log("❌ Telegram 设置不完整，无法发送通知");
            return;
        }

        const now = Date.now();
        const cacheKey = `${user}:${status}`; 
        const lastSentTime = errorCache.get(cacheKey);

        if (lastSentTime && now - lastSentTime < 30 * 60 * 1000) {
            console.log(`⏳ 30分钟内已发送过 ${user} 的状态 ${status}，跳过通知`);
            return;
        }

        errorCache.set(cacheKey, now); 

        const bot = new TelegramBot(settings.telegramToken, { polling: false });
        const nowStr = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });

        let statusMessage;
        if (status === 403) {
            statusMessage = "账号已封禁";
        } else if (status === 404) {
            statusMessage = "保活未安装";
        } else if (status >= 500 && status <= 599) {
            statusMessage = "服务器错误";
        } else {
            statusMessage = `访问异常`;
        }

        const formattedMessage = `
⚠️ *失败通知*
——————————————————
👤 账号: \`${user}\`
📶 状态: *${statusMessage}*
📝 详情: *${status}*•\`${message}\`
——————————————————
🕒 时间: \`${nowStr}\``

        await bot.sendMessage(settings.telegramChatId, formattedMessage, { parse_mode: "Markdown" });

        console.log(`✅ 已发送 Telegram 通知: ${user} - ${status}`);
    } catch (err) {
        console.error("❌ 发送 Telegram 通知失败:", err);
    }
}

app.get("/login", async (req, res) => {
    try {
        const accounts = await getAccounts(true);
        const users = Object.keys(accounts);

        const requests = users.map(user =>
            axios.get(`https://${user}.serv00.net/info`,{timeout:5000})
                .then(response => {
                    if (response.status === 200) {
                        console.log(`✅ ${user} 保活成功，状态码: ${response.status}`);
                    } else {
                        console.log(`❌ ${user} 保活失败，状态码: ${response.status}`);
                        sendErrorToTG(user, response.status, "响应状态异常");
                    }
                })
                .catch(err => {
                    if (err.response) {
                        // 服务器返回了一个 HTTP 错误
                        console.log(`❌ ${user} 保活失败，状态码: ${err.response.status}`);
                        sendErrorToTG(user, err.response.status, err.response.statusText);
                    } else {
                        // 其他网络错误
                        console.log(`❌ ${user} 保活失败: ${err.message}`);
                        sendErrorToTG(user, "请求失败", err.message);
                    }
                })
        );

        await Promise.all(requests);
        console.log("✅ 所有账号的进程保活已访问完成");
    } catch (error) {
        console.error("❌ 访问 /info 失败:", error);
        sendErrorToTG("系统", "全局错误", error.message);
    }

    res.sendFile(path.join(__dirname, "protected", "login.html"));
});

app.post("/login", (req, res) => {
    const { password } = req.body;
    if (!fs.existsSync(PASSWORD_FILE)) {
        return res.status(400).send("密码文件不存在，请先设置密码");
    }

    const savedPassword = JSON.parse(fs.readFileSync(PASSWORD_FILE, "utf-8")).password;
    if (password === savedPassword) {
        req.session.authenticated = true;
        res.redirect("/");
    } else {
        res.status(401).send("密码错误");
    }
});

app.get("/logout", (req, res) => {
    try {
        if (fs.existsSync(SESSION_DIR)) {
            fs.readdirSync(SESSION_DIR).forEach(file => {
                const filePath = path.join(SESSION_DIR, file);
                if (file.endsWith(".json")) { // 只删除 JSON 文件
                    fs.unlinkSync(filePath);
                    console.log("已删除 session 文件:", filePath);
                }
            });
        }
    } catch (error) {
        console.error("删除 session JSON 文件失败:", error);
    }

    res.redirect("/login"); 
});

const protectedRoutes = ["/", "/ota", "/accounts", "/nodes"];
protectedRoutes.forEach(route => {
    app.get(route, checkPassword, isAuthenticated, (req, res) => {
        res.sendFile(path.join(__dirname, "protected", route === "/" ? "index.html" : `${route.slice(1)}.html`));
    });
});

const MAIN_SERVER_USER = process.env.USER || process.env.USERNAME || "default_user"; 
async function getAccounts(excludeMainUser = true) {
    if (!fs.existsSync(ACCOUNTS_FILE)) return {};
    let accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf-8"));
    if (excludeMainUser) {
        delete accounts[MAIN_SERVER_USER];  
    }
    return accounts;
}

io.on("connection", (socket) => {
    console.log("Client connected");
    socket.on("startNodesSummary", () => {
        getNodesSummary(socket);
    });

    socket.on("loadAccounts", async () => {
        const accounts = await getAccounts(true);
        socket.emit("accountsList", accounts);
    });

    socket.on("saveAccount", async (accountData) => {
        const accounts = await getAccounts(false);
        accounts[accountData.user] = { 
            user: accountData.user, 
            season: accountData.season || ""  
        };
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
        socket.emit("accountsList", await getAccounts(true));
    });

    socket.on("deleteAccount", async (user) => {
        const accounts = await getAccounts(false);
        delete accounts[user];
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
        socket.emit("accountsList", await getAccounts(true));
    });

    socket.on("updateSeason", async (data) => {
        const accounts = await getAccounts(false);
        if (accounts[data.user]) {
            accounts[data.user].season = data.season; 
            fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
        }
        socket.emit("accountsList", await getAccounts(true));
    });
});
function filterNodes(nodes) {
    return nodes.filter(node => node.startsWith("vmess://") || node.startsWith("hysteria2://"));
}

async function getNodesSummary(socket) {
    const accounts = await getAccounts(true);
    if (!accounts || Object.keys(accounts).length === 0) {
        console.log("⚠️ 未找到账号数据！");
        socket.emit("nodesSummary", { successfulNodes: { hysteria2: [], vmess: [] }, failedAccounts: [] });
        return;
    }

    const users = Object.keys(accounts); 
    let successfulNodes = { hysteria2: [], vmess: [] }; // hytseria2 放前，vmess 放后
    let failedAccounts = [];

    for (let i = 0; i < users.length; i++) {
        const userKey = users[i];  
        const user = accounts[userKey]?.user || userKey; 

        const nodeUrl = `https://${user}.serv00.net/node`;
        try {
            console.log(`请求节点数据: ${nodeUrl}`);
            const nodeResponse = await axios.get(nodeUrl, { timeout: 5000 });
            const nodeData = nodeResponse.data;

            const nodeLinks = filterNodes([
                ...(nodeData.match(/vmess:\/\/[^\s<>"]+/g) || []),
                ...(nodeData.match(/hysteria2:\/\/[^\s<>"]+/g) || [])
            ]);

            nodeLinks.forEach(link => {
                if (link.startsWith("hysteria2://")) {
                    successfulNodes.hysteria2.push(link);
                } else if (link.startsWith("vmess://")) {
                    successfulNodes.vmess.push(link);
                }
            });

            if (nodeLinks.length === 0) {
                console.log(`账号 ${user} 连接成功但无有效节点`);
                failedAccounts.push(user);
            }
        } catch (error) {
            console.log(`账号 ${user} 获取节点失败: ${error.message}`);
            failedAccounts.push(user);
        }
    }

    successfulNodes.hysteria2 = successfulNodes.hysteria2.sort((a, b) => {
        const userA = a.split('@')[0].split('//')[1];
        const userB = b.split('@')[0].split('//')[1];
        return users.indexOf(userA) - users.indexOf(userB);
    });

    successfulNodes.vmess = successfulNodes.vmess.sort((a, b) => {
        const userA = a.split('@')[0].split('//')[1];
        const userB = b.split('@')[0].split('//')[1];
        return users.indexOf(userA) - users.indexOf(userB);
    });

    console.log("成功的 hysteria2 节点:", successfulNodes.hysteria2);
    console.log("成功的 vmess 节点:", successfulNodes.vmess);
    console.log("失败的账号:", failedAccounts);

    socket.emit("nodesSummary", { successfulNodes, failedAccounts });
}

let cronJob = null; 

function getNotificationSettings() {
    if (!fs.existsSync(SETTINGS_FILE)) return {};
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
}

function saveNotificationSettings(settings) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

function getCronExpression(scheduleType, timeValue) {
    if (scheduleType === "interval") {
        const minutes = parseInt(timeValue, 10);
        if (isNaN(minutes) || minutes <= 0) return null;
        return `*/${minutes} * * * *`;
    } else if (scheduleType === "daily") {
        const [hour, minute] = timeValue.split(":").map(num => parseInt(num, 10));
        if (isNaN(hour) || isNaN(minute)) return null;
        return `${minute} ${hour} * * *`;
    } else if (scheduleType === "weekly") {
        const [day, time] = timeValue.split("-");
        const [hour, minute] = time.split(":").map(num => parseInt(num, 10));
        const weekDays = { "周日": 0, "周一": 1, "周二": 2, "周三": 3, "周四": 4, "周五": 5, "周六": 6 };
        if (!weekDays.hasOwnProperty(day) || isNaN(hour) || isNaN(minute)) return null;
        return `${minute} ${hour} * * ${weekDays[day]}`;
    }
    return null;
}

function resetCronJob() {
    if (cronJob) cronJob.stop(); 
    const settings = getNotificationSettings();
    if (!settings || !settings.scheduleType || !settings.timeValue) return;

    const cronExpression = getCronExpression(settings.scheduleType, settings.timeValue);
    if (!cronExpression) return console.error("无效的 cron 表达式");

    cronJob = cron.schedule(cronExpression, () => {
        console.log("⏰ 运行账号检测任务...");
        sendCheckResultsToTG();
    });
}

app.post("/setTelegramSettings", (req, res) => {
    const { telegramToken, telegramChatId } = req.body;
    if (!telegramToken || !telegramChatId) {
        return res.status(400).json({ message: "Telegram 配置不完整" });
    }
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ telegramToken, telegramChatId }, null, 2));
    res.json({ message: "Telegram 设置已更新" });
});
app.get("/getTelegramSettings", (req, res) => {
    if (!fs.existsSync(SETTINGS_FILE)) {
        return res.json({ telegramToken: "", telegramChatId: "" });
    }
    const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
    res.json(settings);
});

async function sendCheckResultsToTG() {
    try {
        const settings = getNotificationSettings();
        if (!settings.telegramToken || !settings.telegramChatId) {
            console.log("❌ Telegram 设置不完整，无法发送通知");
            return;
        }

        const bot = new TelegramBot(settings.telegramToken, { polling: false });
        const response = await axios.get(`https://${process.env.USER}.serv00.net/checkAccounts`);
        const data = response.data.results;

        if (!data || Object.keys(data).length === 0) {
            await bot.sendMessage(settings.telegramChatId, "📋 账号检测结果：没有账号需要检测", { parse_mode: "MarkdownV2" });
            return;
        }

        let results = [];
        let maxUserLength = 0;
        let maxSeasonLength = 0;

        const users = Object.keys(data);  

        users.forEach(user => {
            maxUserLength = Math.max(maxUserLength, user.length);
            maxSeasonLength = Math.max(maxSeasonLength, (data[user]?.season || "").length);
        });

        users.forEach((user, index) => {
            const paddedUser = user.padEnd(maxUserLength, " ");
            const season = (data[user]?.season || "--").padEnd(maxSeasonLength + 1, " ");
            const status = data[user]?.status || "未知状态";
            results.push(`${index + 1}. ${paddedUser} : ${season}- ${status}`);
        });

        const beijingTime = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
        let message = `📢 账号检测结果：\n\`\`\`\n${results.join("\n")}\n\`\`\`\n⏰ 北京时间：${beijingTime}`;
        await bot.sendMessage(settings.telegramChatId, message, { parse_mode: "MarkdownV2" });

    } catch (error) {
        console.error("❌ 发送 Telegram 失败:", error);
    }
}

app.get("/", isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, "protected", "index.html"));
});
app.get("/getMainUser", isAuthenticated, (req, res) => {
    res.json({ mainUser: MAIN_SERVER_USER });
});
app.get("/accounts", isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, "protected", "accounts.html"));
});
app.get("/nodes", isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, "protected", "nodes.html"));
});
app.get("/info", (req, res) => {
    const user = req.query.user;
    if (!user) return res.status(400).send("用户未指定");
    res.redirect(`https://${user}.serv00.net/info`);
});

app.get("/checkAccountsPage", isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, "public", "check_accounts.html"));
});

const statusMessages = {
    200: "账号正常",
    301: "账号未注册",
    302: "账号正常",
    403: "账号已封禁",
    404: "账号正常",
    500: "服务器错误",
    502: "网关错误",
    503: "VPS不可用",
    504: "网关超时", 
};

app.get("/checkAccounts", async (req, res) => {
    try {
        const accounts = await getAccounts();
        const users = Object.keys(accounts); 

        if (users.length === 0) {
            return res.json({ status: "success", results: {} });
        }

        let results = {};
        const promises = users.map(async (username) => {
            const apiUrl = `https://${username}.serv00.net`;

            try {
                const response = await axios.get(apiUrl, { 
                    maxRedirects: 0, 
                    timeout: 5000 
                });
                const status = response.status;
                const message = statusMessages[status] || "未知状态"; 
                results[username] = {
                    status: message,
                    season: accounts[username]?.season || "--" 
                };
            } catch (error) {
                let status = "检测失败";

                if (error.response) {
                    status = error.response.status;
                } else if (error.code === 'ECONNABORTED') {
                    status = "请求超时";
                }

                results[username] = {
                    status: statusMessages[status] || "未知状态",
                    season: accounts[username]?.season || "--"
                };
            }
        });

        await Promise.all(promises);

        let orderedResults = {};
        users.forEach(user => {
            orderedResults[user] = results[user];
        });

        res.json({ status: "success", results: orderedResults });

    } catch (error) {
        console.error("批量账号检测错误:", error);
        res.status(500).json({ status: "error", message: "检测失败，请稍后再试" });
    }
});

app.get("/getNotificationSettings", (req, res) => {
    res.json(getNotificationSettings());
});

app.post("/setNotificationSettings", (req, res) => {
    const { telegramToken, telegramChatId, scheduleType, timeValue } = req.body;
    
    if (!telegramToken || !telegramChatId || !scheduleType || !timeValue) {
        return res.status(400).json({ message: "所有字段都是必填项" });
    }

    if (!getCronExpression(scheduleType, timeValue)) {
        return res.status(400).json({ message: "时间格式不正确，请检查输入" });
    }

    const settings = { telegramToken, telegramChatId, scheduleType, timeValue };
    saveNotificationSettings(settings);

    resetCronJob();

    res.json({ message: "✅ 设置已保存并生效" });
});

resetCronJob();

app.get("/notificationSettings", isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, "public", "notification_settings.html"));
});

app.get('/ota/update', isAuthenticated, (req, res) => {
    const downloadScriptCommand = 'curl -Ls https://raw.githubusercontent.com/ryty1/serv00-save-me/refs/heads/main/server/ota.sh -o /tmp/ota.sh';

    exec(downloadScriptCommand, (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ 下载脚本错误: ${error.message}`);
            return res.status(500).json({ success: false, message: error.message });
        }
        if (stderr) {
            console.error(`❌ 下载脚本错误输出: ${stderr}`);
            return res.status(500).json({ success: false, message: stderr });
        }

        const executeScriptCommand = 'bash /tmp/ota.sh';

        exec(executeScriptCommand, (error, stdout, stderr) => {
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
            
            res.json({ success: true, output: stdout });
        });
    });
});

app.get('/ota', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, "protected", "ota.html"));
});

cron.schedule("0 */12 * * *", () => {
    const logFile = path.join(process.env.HOME, "domains", `${username}.serv00.net`, "logs", "error.log");
    if (fs.existsSync(logFile)) {
        fs.truncateSync(logFile, 0);  // 清空文件内容
        console.log("✅ 日志文件已清空:", new Date().toLocaleString());
    }
});

server.listen(PORT, () => {
    console.log(`🚀 服务己启动，监听端口: ${PORT}`);
});