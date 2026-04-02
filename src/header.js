const package = require("../package.json");

module.exports = {
    name: "NedFoxAutoKHR",
    namespace: "NedFoxAutoKHR",
    description: "Auto-Proceed Nedfox steps in the packing portal",
    author: package.author,
    version: package.version,
    license: "MIT",
    match: [
        "https://retailvista.net/bztrs/*",
    ],
    icon: "https://www.kampeerhalroden.nl/media/e9/9d/08/1703346720/favicon.ico",
    grant: [
        "GM_xmlhttpRequest",
        "GM_addStyle",
        "GM_addValueChangeListener",
        "GM_setValue",
        "GM_getValue",
        "window.focus",
        "window.close",
    ],
    connect: "connect",
    downloadURL: "https://update.greasyfork.org/scripts/555697/NedFox%20Auto%20KHR.user.js",
    updateURL: "https://update.greasyfork.org/scripts/555697/NedFox%20Auto%20KHR.meta.js",
}