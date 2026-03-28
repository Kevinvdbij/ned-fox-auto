module.exports = class Settings {
    #isEnabled;
    #isProceeding;

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

    save() {
        let saveData = {
            enabled: this.#isEnabled,
            proceed: this.#isProceeding
        }

        GM_setValue("NKHR_Settings", JSON.stringify(saveData))
    }

    load() {
        let defaultSettings = {
            enabled: true,
            proceed: true
        }

        let loadData = JSON.parse(GM_getValue("NKHR_Settings", JSON.stringify(defaultSettings)));

        this.#isEnabled = loadData.enabled;
        this.#isProceeding = loadData.proceed;

        console.log(loadData);
    }
}