successfulNodes.innerHTML += `<strong>${node.user}</strong>: <ul>` +
    (node.nodeLinks ? node.nodeLinks.map(link => `<li>${link}</li>`).join("") : "") +
    `</ul><br>`;