const fs = require('fs');
const path = require('path');
const axios = require('axios');
const express = require('express');
const app = express();

const username = process.env.USER.toLowerCase();
const DOMAIN_DIR = path.join(process.env.HOME, "domains", `${username}.serv00.net`, "public_nodejs");
const LOCAL_VERSION_FILE = path.join(DOMAIN_DIR, "version.txt");
const REMOTE_VERSION_URL = 'https://raw.githubusercontent.com/ryty1/serv00-save-me/main/version.txt';
const REMOTE_DIR_URL = 'https://raw.githubusercontent.com/ryty1/serv00-save-me/main/';

// **本地要跳过的文件 & 文件夹**
const EXCLUDED_FILES = ['README.md', 'config.json']; // 这些文件不会被删除
const EXCLUDED_DIRS = ['logs', 'backup', 'cache']; // 这些文件夹不会被扫描或删除

// **获取本地版本号**
function getLocalVersion() {
    if (!fs.existsSync(LOCAL_VERSION_FILE)) return "0.0.0";
    return fs.readFileSync(LOCAL_VERSION_FILE, 'utf-8').trim();
}

// **获取远程版本号**
async function getRemoteVersion() {
    try {
        const response = await axios.get(`${REMOTE_VERSION_URL}?_=${Date.now()}`);
        return response.data.trim();
    } catch (error) {
        console.error(`❌ 获取远程版本号失败: ${error.message}`);
        return null;
    }
}

// **获取远程 `file_list.txt`**
async function getRemoteFileList() {
    try {
        const response = await axios.get(`${REMOTE_DIR_URL}file_list.txt?_=${Date.now()}`);
        return response.data.split("\n").map(file => file.trim()).filter(file => file);
    } catch (error) {
        console.error(`❌ 获取远程文件列表失败: ${error.message}`);
        return null;
    }
}

// **获取本地文件列表**
function getLocalFiles(dir) {
    let files = [];
    if (!fs.existsSync(dir)) return files;

    const items = fs.readdirSync(dir);
    for (const item of items) {
        const itemPath = path.join(dir, item);
        
        // **跳过指定的目录**
        if (EXCLUDED_DIRS.includes(item)) {
            console.log(`🟡 跳过文件夹: ${itemPath}`);
            continue;
        }

        if (fs.statSync(itemPath).isDirectory()) {
            files = files.concat(getLocalFiles(itemPath));
        } else {
            files.push(path.relative(DOMAIN_DIR, itemPath));
        }
    }
    return files;
}

// **下载远程文件**
async function downloadFile(fileName) {
    try {
        const response = await axios.get(`${REMOTE_DIR_URL}${fileName}?_=${Date.now()}`, { responseType: 'arraybuffer' });
        const filePath = path.join(DOMAIN_DIR, fileName);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, response.data);
        console.log(`✅ ${fileName} 下载成功`);
        return { file: fileName, success: true, message: `✅ ${fileName} 更新成功` };
    } catch (error) {
        console.error(`❌ 下载失败: ${fileName} - ${error.message}`);
        return { file: fileName, success: false, message: `❌ ${fileName} 下载失败` };
    }
}

// **检查并更新文件**
async function checkForUpdates() {
    console.log("🔍 开始检查更新...");

    const remoteVersion = await getRemoteVersion();
    if (!remoteVersion) return [{ file: "无", success: false, message: "❌ 无法获取远程版本号" }];

    const localVersion = getLocalVersion();
    console.log(`📌 本地版本: ${localVersion}, 远程版本: ${remoteVersion}`);

    if (localVersion === remoteVersion) {
        console.log("✅ 文件已是最新，无需更新");
        return [{ file: "无", success: true, message: "✅ 所有文件已是最新" }];
    }

    console.log("🔄 版本号不同，开始更新...");
    const remoteFiles = await getRemoteFileList();
    if (!remoteFiles) return [{ file: "无", success: false, message: "❌ 无法获取远程文件列表" }];

    let results = [];
    for (const fileName of remoteFiles) {
        results.push(await downloadFile(fileName));
    }

    // **删除本地多余的文件**
    const localFiles = getLocalFiles(DOMAIN_DIR);
    for (const fileName of localFiles) {
        if (!remoteFiles.includes(fileName) && !EXCLUDED_FILES.includes(fileName)) {
            fs.unlinkSync(path.join(DOMAIN_DIR, fileName));
            console.log(`🗑️ 删除多余文件: ${fileName}`);
            results.push({ file: fileName, success: true, message: `🗑️ ${fileName} 被删除（远程不存在）` });
        }
    }

    // **更新本地 `version.txt`**
    fs.writeFileSync(LOCAL_VERSION_FILE, remoteVersion);
    console.log(`📢 版本更新完成，新版本号: ${remoteVersion}`);
    return results;
}

// **处理 `/update` 请求**
app.get('/update', async (req, res) => {
    try {
        const updateResults = await checkForUpdates();
        res.json(updateResults);
    } catch (error) {
        res.status(500).json({ success: false, message: '更新过程中发生错误', error });
    }
});

// **启动服务器**
app.listen(3000, () => {
    console.log(`🚀 服务器运行在 http://localhost:3000`);
});