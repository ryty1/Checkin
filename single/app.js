require('dotenv').config();
const express = require("express");
const { exec } = require("child_process");
const util = require('util');
const fs = require("fs");
const axios = require('axios');
const WebSocket = require('ws');
const path = require("path");
const app = express();

// 配置 GitHub 仓库和本地文件
const repoOwner = 'ryty1';  // GitHub 仓库所有者
const repoName = 'My-test';  // 仓库名称
const localTagFile = './localTag.txt';  // 本地标签文件路径
const localFolder = './local_files';  // 本地文件存储路径

const username = process.env.USER.toLowerCase(); // 获取当前用户名并转换为小写
const DOMAIN_DIR = path.join(process.env.HOME, "domains", `${username}.serv00.net`, "public_nodejs");
const scriptPath = path.join(process.env.HOME, "serv00-play", "singbox", "start.sh");
const configFilePath = path.join(__dirname, 'config.json');
const SINGBOX_CONFIG_PATH = path.join(process.env.HOME, "serv00-play", "singbox", "singbox.json");

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const Server = app.listen(3000, () => {
    const timestamp = new Date().toLocaleString();
    const startMsg = `${timestamp} 服务器已启动，监听端口 3000`;
    logMessage(startMsg);
    console.log(startMsg);
});
// **WebSocket 监听前端请求**
const wss = new WebSocket.Server({ Server });
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

function stopShellCommand() {
    const command = `cd ${process.env.HOME}/serv00-play/singbox/ && bash killsing-box.sh`;
    executeCommand(command, "killsing-box.sh", true);
}

function executeHy2ipScript(logMessages, callback) {

    const command = `cd ${process.env.HOME}/domains/${username}.serv00.net/public_nodejs/ && bash hy2ip.sh`;

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

app.use(express.urlencoded({ extended: true }));

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

app.get("/log", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "log.html"));
});

// **获取 GitHub 最新标签**
const getLatestTag = async () => {
    try {
        const url = `https://api.github.com/repos/${repoOwner}/${repoName}/tags`;
        const response = await axios.get(url);
        if (response.data.length === 0) {
            throw new Error('没有找到标签');
        }
        const latestTag = response.data[0].name; // 获取最新标签
        console.log("🔍 最新版本标签:", latestTag);
        return latestTag;
    } catch (error) {
        console.error("❌ 获取 GitHub 标签失败:", error.response ? error.response.data : error.message);
        return null;
    }
};

// **获取本地存储的标签**
const getLocalTag = () => {
    if (fs.existsSync(localTagFile)) {
        return fs.readFileSync(localTagFile, 'utf8').trim();
    }
    return null;
};

// **保存本地最新的标签**
const saveLocalTag = (tag) => fs.writeFileSync(localTagFile, tag, 'utf8');

// **获取指定标签下的文件列表**
const getFileList = async (tag) => {
    try {
        const url = `https://api.github.com/repos/${repoOwner}/${repoName}/git/trees/${tag}?recursive=1`;
        const response = await axios.get(url);
        return response.data.tree.filter(file => file.type === "blob" && file.path.startsWith("single/"));
    } catch (error) {
        console.error("❌ 获取文件列表失败:", error);
        return [];
    }
};

// **下载文件内容**
const getFileContent = async (tag, filePath) => {
    try {
        const url = `https://raw.githubusercontent.com/${repoOwner}/${repoName}/${tag}/${filePath}`;
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        console.error(`❌ 下载失败: ${filePath}`, error);
        return null;
    }
};

// **保存文件**
const saveFile = (filePath, content) => {
    const localPath = path.join(localFolder, filePath.replace(/^single\//, "")); // 移除 single/ 目录
    fs.mkdirSync(path.dirname(localPath), { recursive: true }); // 创建文件夹
    fs.writeFileSync(localPath, content, 'utf8');
};

// **安装依赖**
const installDependencies = () => {
    return new Promise((resolve, reject) => {
        const installCommand = 'npm install dotenv basic-auth express';  // 修改为你的依赖列表
        exec(installCommand, (error, stdout, stderr) => {
            if (error || stderr) {
                reject(`❌ 安装依赖失败: ${error ? error.message : stderr}`);
            } else {
                console.log(`✅ 安装依赖完成: ${stdout}`);
                resolve();
            }
        });
    });
};


wss.on('connection', async (ws) => {
    console.log('✅ Client connected');

    const latestTag = await getLatestTag();
    const localTag = getLocalTag();

    // 连接时，发送 GitHub 最新版本 和 本地版本
    console.log('发送到前端的版本:', { latestTag, localTag });
    ws.send(JSON.stringify({ latestTag, localTag }));

    ws.on('message', async (message) => {
        const { tag } = JSON.parse(message);
        console.log("🔍 收到的标签:", tag);

        if (!tag) {
            ws.send(JSON.stringify({ progress: 100, message: "❌ 错误: 没有提供标签。" }));
            return;
        }

        if (tag === localTag) {
            ws.send(JSON.stringify({ progress: 100, message: "✅ 已是最新版本，无需更新。" }));
            return;
        }

        ws.send(JSON.stringify({ progress: 5, message: "🔍 获取文件列表..." }));

        try {
            // 安装依赖
            await installDependencies();
            ws.send(JSON.stringify({ progress: 10, message: "✅ 依赖已安装" }));

            const fileList = await getFileList(tag);
            if (!fileList.length) {
                ws.send(JSON.stringify({ progress: 100, message: "❌ 没有找到可更新的文件。" }));
                return;
            }

            let progress = 10;
            const step = Math.floor(90 / fileList.length);

            for (const file of fileList) {
                progress += step;
                ws.send(JSON.stringify({ progress, message: `📥 下载 ${file.path}...` }));

                const content = await getFileContent(tag, file.path);
                if (content) {
                    saveFile(file.path, content);
                    ws.send(JSON.stringify({ progress, message: `✅ 更新 ${file.path}` }));
                }
            }

            saveLocalTag(tag);
            ws.send(JSON.stringify({ progress: 100, message: "🎉 更新完成。" }));
        } catch (error) {
            ws.send(JSON.stringify({ progress: 100, message: "❌ 更新失败。" }));
            console.error(error);
        }
    });
});

// API 接口 - 获取版本标签
app.get('/api/tags', async (req, res) => {
    try {
        const latestTag = await getLatestTag();
        const localTag = getLocalTag();
        res.json({ latestTag, localTag });
    } catch (error) {
        res.status(500).json({ error: "获取版本标签失败" });
    }
});

// API 接口 - 执行更新
app.post('/api/update', async (req, res) => {
    try {
        const latestTag = await getLatestTag();
        const localTag = getLocalTag();

        if (latestTag === localTag) {
            return res.json({ message: "✅ 已是最新版本，无需更新。" });
        }

        // 启动 WebSocket 来执行更新过程
        const ws = new WebSocket('ws://localhost:3000');
        ws.onopen = () => {
            ws.send(JSON.stringify({ tag: latestTag }));
        };

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.progress === 100) {
                return res.json({ message: data.message });
            }
        };

        ws.onerror = (error) => {
            res.status(500).json({ message: "❌ WebSocket 错误" });
            console.error("WebSocket 错误:", error);
        };

    } catch (error) {
        res.status(500).json({ message: "❌ 更新失败" });
        console.error(error);
    }
});


app.get('/ota', (req, res) => {
    res.sendFile(path.join(__dirname, "public", "ota.html"));
});

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

function getConfigFile() {
    console.log('检查配置文件是否存在:', configFilePath);
    
    try {
        if (fs.existsSync(configFilePath)) {
            console.log('配置文件已存在，读取文件内容...');
            return JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
        } else {
            console.log('配置文件不存在，创建默认配置并写入...');
            const defaultConfig = {
                vmessname: "Argo-vmess",
                hy2name: "Hy2",
                HIDE_USERNAME: false 
            };
            fs.writeFileSync(configFilePath, JSON.stringify(defaultConfig));
            console.log('配置文件已创建:', configFilePath);
            
            writeDefaultConfigToScript(defaultConfig);
            return defaultConfig;
        }
    } catch (error) {
        console.error('读取配置文件时出错:', error);
        return null;
    }
}

function writeDefaultConfigToScript(config) {
    console.log('写入默认配置到脚本:', scriptPath);
    let scriptContent;

    try {
        scriptContent = fs.readFileSync(scriptPath, 'utf8');
    } catch (error) {
        console.error('读取脚本文件时出错:', error);
        return;
    }

    const exportListFuncPattern = /export_list\(\)\s*{\n([\s\S]*?)}/m;
    const match = scriptContent.match(exportListFuncPattern);

    if (match) {
        let exportListContent = match[1];

        if (!exportListContent.includes('custom_vmess')) {
            exportListContent = `  custom_vmess="${config.vmessname}"\n` + exportListContent;
        }
        if (!exportListContent.includes('custom_hy2')) {
            exportListContent = `  custom_hy2="${config.hy2name}"\n` + exportListContent;
        }

        scriptContent = scriptContent.replace(exportListFuncPattern, `export_list() {\n${exportListContent}}`);
    } else {
        console.log("没有找到 export_list() 函数，无法插入变量定义。");
    }

    scriptContent = scriptContent.replaceAll(/vmessname=".*?"/g, `vmessname="\$custom_vmess-\$host-\$user"`);
    scriptContent = scriptContent.replaceAll(/hy2name=".*?"/g, `hy2name="\$custom_hy2-\$host-\$user"`);

    if (config.HIDE_USERNAME) {
        scriptContent = scriptContent.replaceAll(/user=".*?"/g, `user="\$(whoami | tail -c 2 | head -c 1)"`);
    } else {
        scriptContent = scriptContent.replaceAll(/user=".*?"/g, `user="\$(whoami)"`);
    }

    scriptContent = scriptContent.replace(/\n{2,}/g, '\n').trim();

    try {
        fs.writeFileSync(scriptPath, scriptContent);
        console.log('脚本已更新:', scriptPath);
    } catch (error) {
        console.error('写入脚本文件时出错:', error);
    }
}

async function updateConfigFile(config) {
    console.log('更新配置文件:', configFilePath);
    try {
        fs.writeFileSync(configFilePath, JSON.stringify(config));
        console.log('配置文件更新成功');
    } catch (error) {
        console.error('更新配置文件时出错:', error);
        return;
    }

    console.log('更新脚本内容:', scriptPath);
    let scriptContent;

    try {
        scriptContent = fs.readFileSync(scriptPath, 'utf8');
    } catch (error) {
        console.error('读取脚本文件时出错:', error);
        return;
    }

    scriptContent = scriptContent.replaceAll(/custom_vmess=".*?"/g, `custom_vmess="${config.vmessname}"`);
    scriptContent = scriptContent.replaceAll(/custom_hy2=".*?"/g, `custom_hy2="${config.hy2name}"`);
    scriptContent = scriptContent.replaceAll(/vmessname=".*?"/g, `vmessname="\$custom_vmess-\$host-\$user"`);
    scriptContent = scriptContent.replaceAll(/hy2name=".*?"/g, `hy2name="\$custom_hy2-\$host-\$user"`);

    if (config.HIDE_USERNAME) {
        scriptContent = scriptContent.replaceAll(/user=".*?"/g, `user="\$(whoami | tail -c 2 | head -c 1)"`);
    } else {
        scriptContent = scriptContent.replaceAll(/user=".*?"/g, `user="\$(whoami)"`);
    }

    scriptContent = scriptContent.replace(/\n{2,}/g, '\n').trim();

    try {
        fs.writeFileSync(scriptPath, scriptContent);
        console.log('脚本更新成功:', scriptPath);
    } catch (error) {
        console.error('写入脚本文件时出错:', error);
        return;
    }
    stopShellCommand();
    setTimeout(() => {
        runShellCommand();
    }, 3000); 
}

app.get('/api/get-config', (req, res) => {
    const config = getConfigFile();
    res.json(config);
});

app.post('/api/update-config', (req, res) => {
    const { vmessname, hy2name, HIDE_USERNAME } = req.body;
    const newConfig = { vmessname, hy2name, HIDE_USERNAME };

    updateConfigFile(newConfig);

    res.json({ success: true });
});

app.get('/newset', (req, res) => {
    res.sendFile(path.join(__dirname, "public", 'newset.html'));
});

app.get('/getGoodDomain', (req, res) => {
  fs.readFile(SINGBOX_CONFIG_PATH, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({ error: '读取配置文件失败' });
    }

    try {
      const config = JSON.parse(data);
      res.json({ GOOD_DOMAIN: config.GOOD_DOMAIN });
    } catch (parseError) {
      return res.status(500).json({ error: '解析 JSON 失败' });
    }
  });
});

app.post('/updateGoodDomain', async (req, res) => {
  const { GOOD_DOMAIN } = req.body;

  if (!GOOD_DOMAIN) {
    return res.status(400).json({ success: false, error: '缺少 GOOD_DOMAIN 参数' });
  }

  try {
    const data = fs.readFileSync(SINGBOX_CONFIG_PATH, 'utf8');
    const config = JSON.parse(data);

    config.GOOD_DOMAIN = GOOD_DOMAIN;

    fs.writeFileSync(SINGBOX_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    console.log(`优选域名 已更新为: ${GOOD_DOMAIN}`);

    stopShellCommand();
    setTimeout(() => {
        runShellCommand();
    }, 3000); 

    res.json({ success: true, message: `优选域名 更新为: ${GOOD_DOMAIN} 并已重启singbox` });

  } catch (err) {
    console.error('更新失败:', err);
    res.status(500).json({ success: false, error: '更新失败，请稍后再试' });
  }
});

app.get("/goodomains", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "goodomains.html"));
});

app.use((req, res, next) => {
    const validPaths = ["/info", "/hy2ip", "/node", "/log", "/newset", "/goodomains", "/ota"];
    if (validPaths.includes(req.path)) {
        return next();
    }
    res.status(404).send("页面未找到");
});