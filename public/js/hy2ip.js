async function updateHy2ip() {
    const confirmation = document.getElementById("confirmation").value.trim();
    if (confirmation !== "更新") {
        document.getElementById("result").innerText = "输入错误，请输入“更新”";
        return;
    }

    try {
        const response = await fetch("/api/hy2ip", { method: "POST" });  // 访问 API
        const data = await response.json();
        document.getElementById("result").innerText = data.success ? "更新成功！" : "更新失败！";
    } catch (error) {
        document.getElementById("result").innerText = "请求失败";
    }
}