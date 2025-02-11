#!/bin/bash

USER_NAME=$(whoami)
DOMAIN_NAME="${USER_NAME,,}.serv00.net"
BASE_DIR="/home/$USER_NAME/domains/$DOMAIN_NAME"
NODEJS_DIR="$BASE_DIR/public_nodejs"
LOCAL_FILE_LIST="$NODEJS_DIR/file_list.txt"
LOCAL_VERSION_FILE="$NODEJS_DIR/version.txt"

REMOTE_DIR_URL="https://raw.githubusercontent.com/ryty1/My-test/main/single/"
TIMESTAMP="?t=$(date +%s)"
REMOTE_FILE_LIST_URL="${REMOTE_DIR_URL}file_list.txt${TIMESTAMP}"
REMOTE_VERSION_URL="${REMOTE_DIR_URL}version.txt${TIMESTAMP}"

get_remote_version() {
    curl -s "$REMOTE_VERSION_URL" | tr -d '\r'
}

get_local_version() {
    if [ ! -f "$LOCAL_VERSION_FILE" ]; then
        echo "0.0.0"  
    else
        cat "$LOCAL_VERSION_FILE" | tr -d '\r'
    fi
}

get_remote_file_list() {
    curl -s "$REMOTE_FILE_LIST_URL"
}

get_local_file_list() {
    cat "$LOCAL_FILE_LIST"
}

download_file() {
    local file_path="$1"
    local full_path="$NODEJS_DIR/$file_path"

    curl -sL --fail -o "$full_path" "${REMOTE_DIR_URL}${file_path}${TIMESTAMP}" && \
    echo "✅ ${file_path} 更新完成" || \
    echo "❌ 下载失败: ${file_path}"
}

delete_local_file() {
    local file_path="$1"
    rm -f "$NODEJS_DIR/$file_path"
    echo "❌ ${file_path} 已删除"
}

update_local_file_list() {
    local new_file_list=$1
    echo "$new_file_list" > "$LOCAL_FILE_LIST"
}

is_remote_version_higher() {
    local remote_version=$1
    local local_version=$2

    if [[ "$remote_version" > "$local_version" ]]; then
        return 0  
    else
        return 1  
    fi
}

install_dependencies() {
    echo "🛠️ 正在安装依赖..."
    cd "$NODEJS_DIR" && npm init -y > /dev/null 2>&1
    npm install dotenv basic-auth express > /dev/null 2>&1
    echo "✅ 依赖安装完成"
}

sync_files() {
    local files_updated=false

    remote_files=$(get_remote_file_list)
    local_files=$(get_local_file_list)

    for file in $remote_files; do
        download_file "$file"
        files_updated=true
    done

    for file in $local_files; do
        if ! echo "$remote_files" | grep -q "^$file$"; then
            delete_local_file "$file"
            files_updated=true
        fi
    done

    update_local_file_list "$remote_files"

    if $files_updated; then
        return 0  
    else
        return 1  
    fi
}

display_versions() {
    local remote_version=$(get_remote_version)
    local local_version=$(get_local_version)

    echo "📌 当前版本: $local_version  |  📌 最新版本: $remote_version"
}

check_version_and_sync() {
    local remote_version=$(get_remote_version)
    local local_version=$(get_local_version)

    display_versions

    if is_remote_version_higher "$remote_version" "$local_version"; then
        echo "🔄 发现新版本，开始安装依赖并同步文件..."
        install_dependencies
        if sync_files; then
            echo "$remote_version" > "$LOCAL_VERSION_FILE"
            echo "📢 版本更新完成，新版本号: $remote_version"
        else
            echo "❌ 文件同步失败，未更新任何文件。"
        fi
    else
        echo "❌ 当前已是最新版本，无需更新。"
    fi
}

check_version_and_sync