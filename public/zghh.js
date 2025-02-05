socket.on("nodesSummary", (data) => {
    const successfulNodes = document.getElementById("successfulNodes");
    const failedAccounts = document.getElementById("failedAccounts");

    successfulNodes.innerHTML = "<b>成功的节点:</b><br>";

    if (data.successfulNodes.length > 0) {
        data.successfulNodes.forEach(node => {
            successfulNodes.innerHTML += `<strong>${node.user}</strong>: <ul>` +
                (Array.isArray(node.nodeLinks) ? node.nodeLinks.map(link => `<li>${link}</li>`).join("") : "") +
                `</ul><br>`;
        });
    } else {
        successfulNodes.innerHTML += "没有找到成功的节点。<br>";
    }

    failedAccounts.innerHTML = "<b>失败的账号:</b><br>";
    if (data.failedAccounts.length > 0) {
        failedAccounts.innerHTML += data.failedAccounts.join("<br>");
    } else {
        failedAccounts.innerHTML += "没有失败的账号。<br>";
    }
});