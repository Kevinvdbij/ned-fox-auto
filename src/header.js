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
        "file:///C:/Users/Kevin/OneDrive%20-%20Webshop/Backoffice/Tampermonkey/*"
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
    require: [
        "https://update.greasyfork.org/scripts/383527/701631/Wait_for_key_elements.js"
    ],
    downloadURL: "https://update.greasyfork.org/scripts/555697/NedFox%20Auto%20KHR.user.js",
    updateURL: "https://update.greasyfork.org/scripts/555697/NedFox%20Auto%20KHR.meta.js",
}