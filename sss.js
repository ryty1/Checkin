// 递归获取目录下所有文件（排除本地 `public` 和 `tmp`）
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

// 获取远程仓库的文件列表
async function getRemoteFileList() {
    try {
        const response = await axios.get(REMOTE_DIR_URL + "file_list.txt"); // 远程仓库的文件列表
        return response.data.split("\n").map(file => file.trim()).filter(file => file);
    } catch (error) {
        console.error(`❌ 无法获取远程文件列表: ${error.message}`);
        return null; // 返回 null，表示 file_list.txt 不存在，防止误删
    }
}

// 获取远程文件的哈希值
async function getRemoteFileHash(url) {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        return crypto.createHash('sha256').update(response.data).digest('hex');
    } catch (error) {
        console.error(`❌ 获取远程文件哈希失败: ${error.message}`);
        throw error;
    }
}

// 获取本地文件的哈希值
function getFileHash(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', (data) => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', (err) => reject(err));
    });
}

// 检查并更新文件，同时删除本地多余文件
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