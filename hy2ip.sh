#!/bin/bash
green() {
    echo -e "\033[32m$1\033[0m"
}
red() {
    echo -e "\033[31m$1\033[0m"
}
get_ip() {
    local hostname=$(hostname)
    local host_number=$(echo "$hostname" | awk -F'[s.]' '{print $2}')
    local hosts=("cache${host_number}.serv00.com" "web${host_number}.serv00.com" "$hostname")

    for host in "${hosts[@]}"; do
        local response=$(curl -s --max-time 10 "https://ss.botai.us.kg/api/getip?host=$host")
        if [[ "$response" =~ "not found" ]]; then
            echo "未识别主机 ${host}！"
            continue
        fi

        local ip=$(echo "$response" | awk -F "|" '{print $1}')
        local status=$(echo "$response" | awk -F "|" '{print $2}')

        if [[ "$status" == "Accessible" ]]; then
            echo "$ip"
            return
        fi
    done

    red "未找到可用的 IP！"
    return 1
}
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
changeHy2IP() {
    local configFile1="$HOME/serv00-play/singbox/config.json"
    local configFile2="$HOME/serv00-play/singbox/singbox.json"
    local hy2_ip=$(get_ip)

    if [[ -z "$hy2_ip" ]]; then
        red "获取可用 IP 失败！"
        return 1
    fi
    update_config_json "$configFile1" "$hy2_ip"
    update_singbox_json "$configFile2" "$hy2_ip"
    echo "正在重启 sing-box..."
    stopSingBox
    sleep 3
    startSingBox
}
stopSingBox() {
    cd ~/serv00-play/singbox/ && bash killsing-box.sh
}
startSingBox() {
    cd ~/serv00-play/singbox/ && bash start.sh
}
changeHy2IP
