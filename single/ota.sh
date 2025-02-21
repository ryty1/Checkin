#!/bin/bash

USER_NAME=$(whoami)
DOMAIN_NAME="${USER_NAME,,}.serv00.net"
BASE_DIR="/home/$USER_NAME/domains/$DOMAIN_NAME"
NODEJS_DIR="$BASE_DIR/public_nodejs"

# 配置 GitHub 仓库和本地文件
REPO_OWNER="ryty1"       # GitHub 仓库所有者
REPO_NAME="My-test"      # 仓库名称
LOCAL_TAG_FILE="./localTag.txt"  # 本地标签文件路径
LOCAL_FOLDER="./local_files"     # 本地文件存储路径

# **获取 GitHub 最新标签**
get_latest_tag() {
    response=$(curl -s "https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/tags")
    latest_tag=$(echo "$response" | jq -r '.[0].name')
    echo "$latest_tag"
}

# **获取本地存储的标签**
get_local_tag() {
    if [[ -f "$LOCAL_TAG_FILE" ]]; then
        local_tag=$(cat "$LOCAL_TAG_FILE")
        echo "$local_tag"
    else
        echo ""
    fi
}

# **保存本地最新的标签**
save_local_tag() {
    echo "$1" > "$LOCAL_TAG_FILE"
}

# **获取指定标签下的文件列表**
get_file_list() {
    tag="$1"
    response=$(curl -s "https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/trees/${tag}?recursive=1")
    file_list=$(echo "$response" | jq -r '.tree[] | select(.type=="blob" and .path | startswith("single/")) | .path')
    echo "$file_list"
}

# **下载文件内容**
get_file_content() {
    tag="$1"
    file_path="$2"
    content=$(curl -s "https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${tag}/${file_path}")
    echo "$content"
}

# **保存文件**
save_file() {
    file_path="$1"
    content="$2"
    local_path="$LOCAL_FOLDER/$(echo "$file_path" | sed 's/^single\///')"
    mkdir -p "$(dirname "$local_path")"
    echo "$content" > "$local_path"
}

install_dependencies() {
    echo "🛠️ 正在安装依赖..."
    cd "$NODEJS_DIR" && npm init -y > /dev/null 2>&1
    npm install dotenv basic-auth express axios ws> /dev/null 2>&1
    echo "✅ 依赖安装完成"
}

# 获取 GitHub 最新标签和本地标签
latest_tag=$(get_latest_tag)
local_tag=$(get_local_tag)

echo "最新 GitHub 版本: $latest_tag"
echo "本地当前版本: $local_tag"

# 如果 GitHub 标签和本地标签一样，则不需要更新
if [[ "$latest_tag" == "$local_tag" ]]; then
    echo "✅ 已是最新版本，无需更新。"
    exit 0
fi

# 获取 GitHub 文件列表
file_list=$(get_file_list "$latest_tag")
if [[ -z "$file_list" ]]; then
    echo "❌ 没有找到可更新的文件。"
    exit 1
fi

# 安装依赖
install_dependencies

# 下载和更新文件
progress=10
step=$(echo "90 / $(echo "$file_list" | wc -l) " | bc)
for file_path in $file_list; do
    content=$(get_file_content "$latest_tag" "$file_path")
    if [[ -n "$content" ]]; then
        save_file "$file_path" "$content"
        progress=$(($progress + $step))
        echo "下载并更新文件: $file_path (进度: $progress%)"
    fi
done

# 保存最新的标签
save_local_tag "$latest_tag"
echo "🎉 更新完成。"