#!/bin/bash

# 用于绿色打印
green() {
    echo -e "\033[32m$1\033[0m"
}

# 用于红色打印
red() {
    echo -e "\033[31m$1\033[0m"
}

# 获取有效IP的函数
get_ip() {
    local hostname=$(hostname)
    local host_number=$(echo "$hostname" | awk -F'[s.]' '{print $2}')
    local hosts=("cache${host_number}.serv00.com" "web${host_number}.serv00.com" "$hostname")

    for host in "${hosts[@]}"; do
        local response=$(curl -s --max-time 10 "https://ss.serv0.us.kg/api/getip?host=$host")
        if [[ "$response" =~ "not found" ]]; then
            echo "未识别主机 ${host}！"
            continue
        fi

        local ip=$(echo "$response" | awk -F "|" '{print $1}')
        local status=$(echo "$response" | awk -F "|" '{print $2}')

        if [[ "$status" == "Accessible" ]]; then
            echo "$ip"
            return 0
        fi
    done

    echo ""  # 返回空字符串表示未找到有效IP
    return 1  # 返回错误代码
}

# 更新 config.json 配置文件
update_config_json() {
    local configFile="$1"
    local new_ip="$2"
    if [[ ! -f "$configFile" ]]; then
        red "配置文件 $configFile 不存在！"
        return 1
    fi
    jq --arg new_ip "$new_ip" '
        (.inbounds[] | select(.tag == "hysteria-in") | .listen) = $new_ip
    ' "$configFile" > temp.json && mv temp.json "$configFile"

    if [[ $? -eq 0 ]]; then
        green "SingBox 配置文件成功更新IP为 $new_ip"
    else
        red "更新配置文件失败！"
        return 1
    fi
}

# 更新 singbox.json 配置文件
update_singbox_json() {
    local configFile="$1"
    local new_ip="$2"
    if [[ ! -f "$configFile" ]]; then
        red "配置文件 $configFile 不存在！"
        return 1
    fi
    jq --arg new_ip "$new_ip" '
        .HY2IP = $new_ip
    ' "$configFile" > temp.json && mv temp.json "$configFile"

    if [[ $? -eq 0 ]]; then
        green "Config 配置文件成功更新IP为 $new_ip"
    else
        red "更新配置文件失败！"
        return 1
    fi
}

# 修改 IP 地址的主函数
changeHy2IP() {
    local configFile1="$HOME/serv00-play/singbox/config.json"
    local configFile2="$HOME/serv00-play/singbox/singbox.json"
    local hy2_ip=$(get_ip)

    # 打印获取到的IP
    echo "有效 IP: $hy2_ip"

    # 如果没有获取到有效 IP，退出函数
    if [[ -z "$hy2_ip" ]]; then
        red "没有可用 IP！"
        return 1  # 返回并退出，表示未找到有效IP，不做任何更新
    fi

    # 只有在找到有效IP时才更新配置文件
    update_config_json "$configFile1" "$hy2_ip"
    update_singbox_json "$configFile2" "$hy2_ip"
    
    # 重启 SingBox
    echo "正在重启 sing-box..."
    stopSingBox
    sleep 3
    startSingBox
}

# 停止 SingBox
stopSingBox() {
    cd ~/serv00-play/singbox/ && bash killsing-box.sh
}

# 启动 SingBox
startSingBox() {
    cd ~/serv00-play/singbox/ && bash start.sh
}

# 调用主函数
changeHy2IP