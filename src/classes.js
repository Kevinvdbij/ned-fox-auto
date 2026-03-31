module.exports = class Settings {
    #isEnabled;
    #isProceeding;
    #enableAddButtons;

    constructor() {
        this.load();
    }

    get enabled() {
        return this.#isEnabled;
    }

    set enabled(val) {
        this.#isEnabled = val;
        this.save();
        location.reload();
    }

    get proceed() {
        return this.#isProceeding;
    }

    set proceed(val) {
        this.#isProceeding = val;
        this.save();
    }

    get enableAddButtons() {
        return this.#enableAddButtons;
    }

    set enableAddButtons(val) {
        this.#enableAddButtons = val;
        this.save();
    }

    save() {
        let saveData = {
            enabled: this.#isEnabled,
            proceed: this.#isProceeding,
            addButtons: this.#enableAddButtons
        }

        GM_setValue("NKHR_Settings", JSON.stringify(saveData))

        console.log(saveData);
    }

    load() {
        let defaultSettings = {
            enabled: true,
            proceed: true,
            addButtons: false
        }

        let loadData = JSON.parse(GM_getValue("NKHR_Settings", JSON.stringify(defaultSettings)));

        this.#isEnabled = loadData.enabled != undefined ? loadData.enabled : defaultSettings.enabled;
        this.#isProceeding = loadData.proceed != undefined ? loadData.proceed : defaultSettings.proceed;
        this.#enableAddButtons = loadData.addButtons != undefined ? loadData.addButtons : defaultSettings.addButtons;

        console.log(loadData);
    }
}