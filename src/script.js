const version = require("../package.json").version;
const Settings = require("./classes.js");


/* globals jQuery, $, waitForKeyElements */

(function() {
    'use strict';

    const settings = new Settings();
    
    // Get the path for the current window location
    var path = window.location.pathname;

    // Define the url params
    const urlParams = new URLSearchParams(window.location.search);

    // Path to the shopware API url the integration will use
    const shopwareApiUrl = "https://www.kampeerhalroden.nl";

    // Set whether or not this is a testing environment from storage variable
    var testingEnivronment = JSON.parse(GM_getValue("testingEnvironment", "false"));

    // Ensure localstorage does not get too large
    manageLocalStorage();

    // Modify the footer to display userscript information
    modifyFooter();

    if (settings.enabled) {
        // Switch based on the current page location with regular expression testing
        switch(true){
            case /bztrs\/packingportal\/CompleteReservations.*/.test(path):
                onCompleteReservationStep();
                break;

            case /bztrs\/packingportal\/Parcels.*/.test(path):
                onShipReservationStep();
                break;

            case /bztrs\/packingportal\/Reservations\/Index\/.*/.test(path):
                onVerifyReservationStep();
                break;

            case /bztrs\/packingportal\/AddParcels\/.*/.test(path):
                onAddParcels();
                break;

            case /bztrs\/packingportal\/AnnounceParcels.*/.test(path):
                proceedStep("#ReservationContainer > div.container.my-2 > div:nth-child(4) > div > button");
                break;

            case /bztrs\/packingportal.*/.test(path):
                onSelectReservationStep();
                break;
        }
    }

    // Create the options panel for modifying userscript settings
    createOptionsPanel();

    // Step 1: called on the home page where the user has to select a reservation
    function onSelectReservationStep() {
        addLastReservationButtons();
        silentLoadOnSearch();

        waitForKeyElements("#Productbarcode", (elements) => {
            elements[0].focus();
            elements[0].value = "";
        });
    }

    // Step 2: called on the second page where the user has to verify the products in the reservation
    function onVerifyReservationStep() {
        cacheProductList();

        // Skips the second step and sets all products to collected, we do not need the 2nd step anymore because of the loaded product list in step 3
        completeVerificationStep();
    }

    // Step 3: called on the third page where the user has to create the shipping parcel
    function onShipReservationStep() {
        // Click button to third step to finalize order processing when it is enabled
        if (urlParams.has("autoComplete")) {
            if (urlParams.get("autoComplete") != "false") {
                proceedStep("#ParcelsContainer > div > div:nth-child(4) > div > button:not(:disabled)");
            }
        }
        else {
            proceedStep("#ParcelsContainer > div > div:nth-child(4) > div > button:not(:disabled)");
        }

        // HACKY WORKAROUND to clear input after scan
        document.querySelector("#verifyProduct").addEventListener("click", clearInput("#productBarcode"), false);

        addProductList("Nodige Producten");
        editReservationDetails();
        createCommentBox();
        clearAllParcelItems();
        saveLastOpenReservation();
        autoFillParcel();
        
        onScanProductForParcel();
    }

    // Step 4: called on the fourth page with the completion status of the reservation
    function onCompleteReservationStep() {
        // Save current reservation as last completed.
        saveLastCompletedReservation();

        let completionSuccess = document.querySelector("#Reservation_Status").value == "ClosedByInvoiceSale" ? true : false;
        
        // Update mass complete status
        updateMassComplete(completionSuccess);

        // Click button to complete the process and go back to first step once it appears
        if (completionSuccess == true) {
            proceedStep("#ReservationContainer > div:nth-child(11) > div > button");
        }
    }

    // Called when the add parcels page is opened
    function onAddParcels() {
        addProductList("Producten", true);
    }

    // Modify the footer to display version information about the userscript
    function modifyFooter() {
        setTimeout(() => {
            let footerVersionText = document.querySelector("footer > div > div > div.col-auto.mr-auto.text-left > div");
            footerVersionText.insertAdjacentHTML("beforeend", `
                <div class="col ml-2">
                    <span>Nedfox Auto KHR ${version}</span>
                </div>`);

            footerVersionText.insertAdjacentHTML("beforeend", `
                <div class="col">
                    <button id="settingsButton" type="button" class="nav-link btn btn-link remove-padding">Instellingen</button>
                </div>`);

            let settingsButton = document.querySelector("[id=settingsButton]");
            settingsButton.onclick = function() {
                setOptionsPanelVisibility();
                console.log("Settings button clicked");
            }
        }, 0);
    }

    // Order the retrieved list of open orders and select the first one
    function processOrderSelection() {
        // Wait for the modal to exist before we start processing
        waitForKeyElements("#productReservationsModal", (modal) => {
            let reservations = [];

            let singleLineReservationsElement = modal[0].querySelector(".singleline-reservations");
            
            // Process all of the needed info for single line reservations
            if (singleLineReservationsElement) {
                for (let reservation of singleLineReservationsElement.children) {
                    
                    let reservationNumber = Array.from(reservation.querySelector(".col-4").children).find(child => /Reservering:.*/.test(child.innerText)).innerText.split(": ").pop();

                    reservations.push({
                        reservationNumber: reservationNumber,
                        type: "singleLine",
                        ref: reservation
                    });
                }
            }

            let validReservationsElement = modal[0].querySelector(".valid-reservations");
            
            // Process all of the needed info for multi line reservations
            if (validReservationsElement) {
                for (let reservation of validReservationsElement.children) {
                    
                    let reservationNumber = Array.from(reservation.querySelector(".col-4").children).find(child => /Reservering:.*/.test(child.innerText)).innerText.split(": ").pop();

                    reservations.push({
                        reservationNumber: reservationNumber,
                        type: "multiLine",
                        ref: reservation
                    });
                }
            }

            let singleLineReservations = reservations.filter((reservation) => reservation.type == "singleLine");

            let massCompleteThreshold = 3;
            let massCompleteMaximum = 50;

            // If the amount of single line orders is past the threshold, create the mass complete button
            if (singleLineReservations.length >= massCompleteThreshold) {
                var massCompleteButton = document.createElement("button");
                massCompleteButton.setAttribute("class", "btn btn-primary");
                massCompleteButton.setAttribute("style", "height:40px;");
                massCompleteButton.innerText = "Massa voltooien" + (singleLineReservations.length >= massCompleteMaximum ? ` (${massCompleteMaximum})` : "");

                massCompleteButton.onclick = function(){
                    startMassComplete(singleLineReservations.slice(0, massCompleteMaximum))
                    massCompleteButton.disabled = true;
                };

                modal[0].querySelector("div > div > div.modal-body > div > div > div:nth-child(3)").append(massCompleteButton);
            }
            
            // Open the first reservation in the array
            if (singleLineReservations.length < massCompleteThreshold) {
                reservations[0].ref.querySelector(".btn").click();
            }
        })
    }

    // Handles the initialization of the mass complete process
    function startMassComplete(reservations) {
        for(let reservation of reservations) {
            // Create element displaying status
            let status = document.createElement("div");
            status.setAttribute("id", "status_" + reservation.reservationNumber);
            status.innerText = "Bezig..."

            // Find the open button, open the window and remove the element
            let button = reservation.ref.querySelector("div > div.col-2 > div > button");
            button.setAttribute("target", "_blank");

            window.open(button.getAttribute("urlref"));

            button.after(status);
            button.remove();

            // Set the status to uncompleted
            reservation.status = 0;
        }
        
        window.focus();

        GM_setValue("NKHR_MassCompleteStatus", JSON.stringify(reservations))
        monitorMassComplete();
    }

    // Checks to see if any of the mass orders have been completed and sets the status element
    async function monitorMassComplete() {
        setInterval(function(){
            let status = JSON.parse(GM_getValue("NKHR_MassCompleteStatus", "[{}]"));

            for (let reservation of status) {
                let statusElement = document.querySelector("#status_" + reservation.reservationNumber);
                
                if (statusElement) {
                    switch(reservation.status){
                        case 1:
                            statusElement.innerText = "Voltooid";
                            break;

                        case 2:
                            statusElement.innerText = "Fout";
                            break;
                    }
                }
            }
        }, 200);
    }

    // Function that updates the mass complete status in storage
    function updateMassComplete(completionSuccess) {
        let reservationNumber = document.querySelector("#Reservation_ReservationNumber").value;

        // Get the status value and parse it
        var status = JSON.parse(GM_getValue("NKHR_MassCompleteStatus", "[{}]"));
        
        // Add the listener so the status value gets updated automatically
        GM_addValueChangeListener("NKHR_MassCompleteStatus", function(key, oldValue, newValue, remote) {
            status = JSON.parse(newValue);
        })

        // Check if the current order is tracked by masscomplete status
        if (status.find((reservation) => reservation.reservationNumber == reservationNumber)) {
            // Get the status again to be sure that we are working on the latest value
            status = JSON.parse(GM_getValue("NKHR_MassCompleteStatus", "[{}]"));
            
            // Set the status value for the current reservation
            status.find((reservation) => reservation.reservationNumber == reservationNumber).status = completionSuccess ? 1 : 2;

            // Write the value to storage
            GM_setValue("NKHR_MassCompleteStatus", JSON.stringify(status))

            // Close window if the reservation has been completed and is part of mass complete instance
            if (completionSuccess) {
                window.close();
            }
        }
    }

    // Automatically fill the parcels with the needed item if the current order is in masscomplete
    function autoFillParcel() {
        let reservationNumber = document.getElementById("Reservation_ReservationNumber").value;

        let status = JSON.parse(GM_getValue("NKHR_MassCompleteStatus", "[{}]"));

        waitForKeyElements("#productList", (productList) => {
            // Check if the current reservation is being tracked by masscomplete
            if (status.find((reservation) => reservation.reservationNumber == reservationNumber)) {
                let productItems = Array.from(productList[0].querySelector("div > div > table > tbody").children);
                
                // iterate over the product list
                for (let i = 1; i < productItems.length; i++) {
                    // Set the barcode input and click the button to scan
                    document.querySelector("#productBarcode").value = productItems[i].children[2].innerText;
                    document.querySelector("#verifyProduct").click();
                }
            }
        })
    }

    // Function that waits for element to exist and executes a click
    function proceedStep(selector){
        // disable the function for testing environment
        if (testingEnivronment == true || settings.proceed == false) return;

        waitForKeyElements(selector, elements =>
                           elements[0].click());
    }

    // Clear input form with a weird delay !!!HACKY WORKAROUND FOR CHROME/EDGE 142 BEHAVIOUR!!!
    function clearInput(selector){
        setTimeout(() => {
            waitForKeyElements(selector, elements => {
                           elements[0].value = ""});
        }, "0");
    }

    // Add product list in the 3rd step, this is useful for seeing which products need to be collected in the packages
    function addProductList(title, minimal){
        // Create empty div to load list content into
        var productList = document.createElement("div");
        productList.setAttribute("id", "productList");
        productList.setAttribute("style", "min-height:173px; overflow-y: auto; overflow-x: hidden;");
        document.querySelector("#ReservationOverview > div:nth-child(2) > div.col-9").prepend(productList);

        // Create title for content
        var productListTitle = document.createElement("h4");
        document.querySelector("#ReservationOverview > div:nth-child(2) > div.col-9").prepend(productListTitle);
        $(productListTitle).html(title);

        var reservationID = document.getElementById("ReservationId").value;

        // Load productlist content from previous step
        let cachedList = localStorage.getItem("NKHR_productList_" + reservationID);

        // Load productlist from cached data if it exists, otherwise AJAX load
        if (cachedList) {
            document.querySelector("#productList").innerHTML = cachedList;
            alterList(productList, minimal);
            console.log("Product list loaded from cache.")
        } else {
            $("#productList").load("https://retailvista.net/bztrs/packingportal/Reservations/Index/" + reservationID + " #ReservationContainer > div > div.container.my-2 > div", function(data){
                alterList(productList);
                console.log("Product list retrieved with request.")
            });
        }
    }

    // Manage the storage to prevent hitting the storage limit
    function manageLocalStorage() {
        // If local storage does not contain more than 1.25 million characters do nothing
        if (JSON.stringify(localStorage).length < 1250000) return;

        // Get all keys from local storage
        var keys = Object.keys(localStorage);

        // Filter keys for cached product lists
        var productLists = keys.filter(key => key.startsWith("NKHR_productList_"))

        // Clear every productlist from localstorage
        productLists.forEach((list) => {
            localStorage.removeItem(list);
        });
    }

    // Companion function to structure the list
    function alterList(productList, minimal){
        // Remove scan message
        if (minimal) {
            $("#productList > div > div > div").remove();
        } else {
            document.querySelector("#productList > div > div > div").setAttribute("style", "max-width:47.5%;")
        }

        // remove check symbol from list
        Array.from($("#productList > div > div > table > tbody").children()).forEach(function(item){
            //item.children[4].remove();
        });

        let list = productList.querySelector("div > div > table > tbody");
        list.children[0].children[3].innerText = "Nodig aantal";
        for (let i = 1; i < list.children.length; i++) {
            list.children[i].children[3].innerText = list.children[i].children[3].innerText.split("van ").pop();
        }

        if (minimal) {
            for (let i = 0; i< list.children.length; i++) {
                list.children[i].children[4].remove();
                list.children[i].children[3].remove();
            }
        }

        if (!minimal && settings.enableAddButtons) {
            let heading = document.createElement("th");
            heading.innerText = "Actie";
            list.children[0].append(heading);
            for (let i = 1; i < list.children.length; i++) {
                let element = document.createElement("td");
                
                let button = document.createElement("button");
                button.setAttribute("class", "btn btn-primary");
                button.innerHTML = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20,400,0,0&icon_names=add" /><span class="material-symbols-outlined"> add </span>';
                button.setAttribute("style", "width:26px; height:26px; display: flex; justify-content: center; align-items: center;");
                button.setAttribute("type", "button");
                button.addEventListener("click", function(){
                    document.querySelector("input[id=productBarcode]").value = list.children[i].children[2].children[0].innerText;
                    document.querySelector("button[id=verifyProduct]").click();
                });
                
                element.append(button);
                list.children[i].append(element);
            }
        }
    }

    function onScanProductForParcel() {
        const collectedHTML = '<span class="text-success"><span class="material-icons">done</span></span>';
        const uncollectedHTML = '<span class="text-warning"><span class="material-icons">close</span></span>';

        let observer = new MutationObserver(() => {
            let products = Array.from(document.querySelector("#productList > div > div > table > tbody").children);

            for(let i = 1; i < products.length; i++) {
                // Find neccessary attributes
                let barcode = products[i].children[2].innerText;
                let barcodeInput = document.querySelector("input[value='" + barcode + "'][id^='VerificationReservationRows']:not([id='productBarcode']):not([verified='true'])");
                barcodeInput.setAttribute("verified", "true");

                let inputId = barcodeInput.id.split("VerificationReservationRows_").pop().split("__ProductMainBarcode").shift();

                // Get the required and verified amounts neccesary for the product
                let verifiedAmount = parseInt(document.querySelector("input[id=VerificationReservationRows_" + inputId + "__VerifiedQuantity]").value);
                let requiredAmount = parseInt(document.querySelector("input[id=VerificationReservationRows_" + inputId + "__ProductQuantity]").value);

                // Change the icon based on the state
                products[i].children[4].children[0].innerHTML = verifiedAmount >= requiredAmount ? collectedHTML : uncollectedHTML;
                products[i].querySelector("button").disabled = verifiedAmount >= requiredAmount ? true : false;
            }
        });

        const observerOptions = {
            childList: true,
            subtree: true,
        };

        observer.observe(document.querySelector("#ParcelsContainer"), observerOptions);
    }

    // Cache the product list from the verification step
    function cacheProductList() {
        let reservationID = document.getElementById("ReservationId");
        let productList = document.querySelector("#ReservationContainer > div > div.container.my-2 > div");

        // Cache the product list for the next page in the packing process
        if (reservationID && productList) {
            localStorage.setItem("NKHR_productList_" + reservationID.value, productList.outerHTML);
            console.log("Cached product list.");
        }
    }

    // Skip second step, set product values correctly and instantly forward page.
    function completeVerificationStep(){
        // Cache the product list for use in the third step
        cacheProductList();

        // Replace button with enabled variant
        $("#ReservationContainer > div > div:nth-child(5) > div").html('<div class="col-3"><button type="submit" class="btn btn-primary " formaction="/bztrs/packingportal/Reservations/Update">Volgende&nbsp;<span class="material-icons">chevron_right</span></button></div>');

        // Loop through all products and set collected variables to true so the package fires correctly
        for(let i = 0; i < 200; i++){
            let collected = document.querySelector("#ReservationRowsNotInCarriers_" + i + "__Collected");

            if(collected){
                collected.value = true;
            }
            else {
                break;
            }
        }

        // Click the button to continue step
        $("#ReservationContainer > div > div:nth-child(5) > div > div > button").click();
    }

    async function silentLoadOnSearch() {
        // Create empty dummy element to load data into
        document.body.innerHTML += "<div id='dummyLoader' style='display:none;'></div>";
        let loadElement = document.getElementById("dummyLoader");
        console.log("Silent Load: created dummy element");

        // Intercept the submit event and prevent it from sending
        $('#frmReservations').on('submit', function(e) {
            e.preventDefault();
            $('body').addClass('busy');
            
            console.log("Silent Load: intercepted submit")

            // Fire our own search request and load the data into the dummy element
            let formData = $(this).serialize();
            reservationSearchRequest(formData).then(async (searchResponse) => {
                // On success load the response into the dummy element
                loadElement.innerHTML = searchResponse;
                console.log("Silent Load: loaded response into dummy")

                let responseState = evaluateSearchResponse(loadElement);

                // In case the response is an alert, display the message and stop loading
                if (responseState.isAlert) {
                    $('body').removeClass('busy');

                    // Load the messages from the loaded page if any exist
                    document.querySelector("#messages").parentElement.innerHTML = document.querySelector("#alert").parentElement.parentElement.innerHTML;
                    
                    // Select and empty the barcode
                    document.querySelector("#Productbarcode").focus();
                    document.querySelector("#Productbarcode").value = "";

                    console.log("Silent Load: loaded the alert message")
                    return;
                }

                // When the response is a reservation selection modal, handle this and load a reservation
                if (responseState.isProductSelection) {
                    await handleSelectionModal().then((selectedProductData) => {
                        loadElement.innerHTML = selectedProductData;
                        console.log("Silent Load: loaded selected product from selection modal")

                        responseState = evaluateSearchResponse(loadElement);
                    });
                }

                // In case the loaded reservation is unfinished, finish the run and load again
                if (responseState.isUnfinished) {
                    await handleUnfinishedRun().then((finishedRunData) => {
                        loadElement.innerHTML = finishedRunData;
                        console.log("Silent Load: loaded finished run response");
                    });
                }

                completeVerificationStep();
            });
        });
    }

    // Request that retrieves reservations from sumbitted data
    async function reservationSearchRequest(formData) {
        return new Promise((resolve, reject) => {
            $.ajax({
                url : "/bztrs/packingportal/Reservations/Search",
                type: "GET",
                data: formData,
                success: function (data) {
                    resolve(data);
                }
            });
        });
    }

    // Evaluate the state of the given response
    function evaluateSearchResponse(element) {
        let isUnfinished = element.querySelector("[id=unfinishedOrderPickingRunsModal]") ? true : false;
        let isAlert = element.querySelector("#alert") && !isUnfinished;
        let isProductSelection = element.querySelector("#productReservationsModal");
        
        return { isAlert, isUnfinished, isProductSelection };
    }

    // Handle product selection modal, pick the first product if needed
    async function handleSelectionModal() {
        return new Promise((resolve, reject) => {
            let modalContainer = document.querySelector("[id=modalContainer]");
            if (!modalContainer){
                modalContainer = document.createElement("div");
                modalContainer.setAttribute("id", "modalContainer")
                document.querySelector("body > div.vh-100.d-flex.flex-column.position-relative.retailvista-packing-ui > div > div").append(modalContainer);
                console.log(modalContainer);
            }

            // Check if the response contains a product list modal
            let dummyLoader = document.querySelector("[id=dummyLoader]");
            let loadedModal = dummyLoader.querySelector("#productReservationsModal");
            if (loadedModal) {
                $('body').removeClass('busy');

                console.log(loadedModal);
                // Move the modal and make it show to the user
                modalContainer.innerHTML = loadedModal.outerHTML;
                loadedModal.remove();
                $('#productReservationsModal').modal('show');

                // Loop that replaces all the buttons with ones that also silently load the 3rd step, skipping the 2nd
                let openButtons = loadedModal.querySelectorAll("a.btn-primary")
                for (let button of openButtons) {
                    let url = button.href;

                    // Creating the new button
                    let newButton = document.createElement("button");
                    newButton.setAttribute("class", "btn btn-primary");
                    newButton.innerHTML = button.innerHTML;
                    newButton.onclick = function() {
                        $.ajax({
                            url : url,
                            type: "GET",
                            success: function (data) {
                                resolve(data);
                                $('body').addClass('busy');
                            },
                            error: function (jXHR, textStatus, errorThrown) {
                                alert(errorThrown);
                            }
                        });
                    }

                    newButton.setAttribute("urlref", url)

                    // Remove the old button
                    button.parentElement.append(newButton);
                    button.remove();
                }

                // Run logic that automatically proceeds modal
                processOrderSelection();
            }
        })
    }

    // Send http request that sets the orderpickingrun state to finished
    async function handleUnfinishedRun() {
        return new Promise((resolve, reject) => {
            let finishRunUrl = document.querySelector("[id=unfinishedOrderPickingRunsModal]").querySelector(".btn").href;

            $.ajax({
                url : finishRunUrl,
                type: "GET",
                success: function (data) {
                    resolve(data)
                }
            })
        })
    }

    // Clear all parcel items from the parcels
    function clearAllParcelItems() {
        // Get all delete buttons for parcel items and start iterating through them
        var removeButtons = Array.from(document.querySelectorAll('#button-addon2'));

        // Iterate through found remove buttons from the last with a delay, without this delay the removal fails
        if (removeButtons.length > 0) {
            for (let i = 0; i < removeButtons.length; i++) {
                setTimeout(() => {
                    // format the onclick event to usable data
                    let parcelInfo = removeButtons.pop().onclick.toString().split('(').pop().split(')').shift().split(',');

                    // Get the amount and active controls for the parcel item
                    var amountControl = document.querySelector('#Items_' + parcelInfo[1] + '__Items_' + parcelInfo[2] + '__Amount');
                    var activeControl = document.querySelector('#Items_' + parcelInfo[1] + '__Items_' + parcelInfo[2] + '__Active');

                    // Set the controls to 0 and active, this makes the update remove the parcel items
                    amountControl.value = 0;
                    activeControl.value = 'True';

                    // Call the page native function to update the parcel item
                    location.href = "javascript:void(update());";
                }, i * 250);  
            }
        }
    }

    // Turn the ordernumber in the reservation details into a link that opens the order
    function editReservationDetails(){
        var returnButton = document.querySelector("#ReservationOverview > div:nth-child(1) > div > a");
        returnButton.setAttribute('href', '/bztrs/packingportal');
        returnButton.innerHTML = '<span class="material-icons">chevron_left</span>&nbsp;Nieuwe zoekopdracht';
    }

    // Creates the shopware comment box
    function createCommentBox(){
        var orderNumber = document.querySelector("#ReservationSummary\\ mb-2 > div:nth-child(3)").innerHTML.split(' ')[2];

        // Return and do not create the comment box if the number length does not match shopware
        if (orderNumber.length != 6) return;

        // Create the comment box dialog
        var commentBox = document.createElement("div");
        commentBox.setAttribute("id", "commentBox");
        commentBox.setAttribute("style", "margin-top: 20px;")

        var commentTextLabel = document.createElement("label");
        commentTextLabel.setAttribute("for", "commentTextArea");
        commentTextLabel.setAttribute("class", "row mb-2");
        commentTextLabel.setAttribute("style", "font-weight: bold;")
        commentTextLabel.innerText = "Shopware Notitie:";
        commentBox.appendChild(commentTextLabel);

        var commentTextArea = document.createElement("textarea");
        commentTextArea.setAttribute("name", "commentTextArea")
        commentTextArea.setAttribute("id", "commentTextArea");
        commentTextArea.setAttribute("class", "row mb2 form-control");
        commentTextArea.setAttribute("style", "height: 150px;width: 100%;-webkit-box-sizing: border-box; font-size:20px; color:black; /* Safari/Chrome, other WebKit */-moz-box-sizing: border-box;    /* Firefox, other Gecko */box-sizing: border-box; ");
        commentTextArea.disabled = true;
        commentBox.appendChild(commentTextArea);

        var commentSaveButton = document.createElement("button");
        commentSaveButton.setAttribute("id", "commentSaveButton");
        commentSaveButton.setAttribute("type", "button");
        commentSaveButton.setAttribute("class", "btn btn-primary row mb2");
        commentSaveButton.setAttribute("style", "width:100px; margin-top:10px;");
        commentSaveButton.innerText = "Opslaan";
        commentSaveButton.disabled = true;
        commentBox.appendChild(commentSaveButton);

        var openShopwareButton = document.createElement("button");
        openShopwareButton.setAttribute("id", "openShopwareButton");
        openShopwareButton.setAttribute("type", "button");
        openShopwareButton.setAttribute("class", "btn btn-primary row mb2");
        openShopwareButton.setAttribute("style", "width:100px; margin-top:10px; margin-left:20px;");
        openShopwareButton.innerText = "Open";
        openShopwareButton.disabled = true;
        commentBox.appendChild(openShopwareButton);

        document.querySelector("#ReservationOverview > div:nth-child(2) > div.col-3").insertBefore(commentBox, document.querySelector("#ReservationSummary\\ mb-2").nextSibling);

        // Initialize shopware integration, this authenticates us and retrieves a valid token
        shopwareInitialize().then(async (token) => {
            // Get the order data from ordernumber
            var orderData = await shopwareGetOrderData(token, orderNumber)

            // Update the text box with the current customer comment data
            commentTextArea.value = orderData.data[0].customerComment;

            // enable comment box dialog
            openShopwareButton.disabled = false;
            commentSaveButton.disabled = false;
            commentTextArea.disabled = false;

            var clickTimeout;
            // Create onclick function that will update the customer comment in shopware
            commentSaveButton.onclick = () => {
                // Change the data object with value from text box
                orderData.data[0].customerComment = commentTextArea.value

                // Send info to server
                var updateData = shopwareUpdateOrderComment(token, orderData.data[0])

                // clear timeout if one is already running
                if (clickTimeout != undefined ) { clearTimeout(clickTimeout) }

                // change comment box state to reflect save in progress
                commentSaveButton.innerHTML = "Opgeslagen!";
                commentTextArea.disabled = true;

                // reset comment box
                clickTimeout = setTimeout(function() {
                    commentSaveButton.innerHTML = "Opslaan";
                    commentTextArea.disabled = false;
                }, 2000);
            };

            // Set onclick for open button to open shopware order
            openShopwareButton.onclick = () => {
                window.open("https://www.kampeerhalroden.nl/admin#/sw/order/detail/" + orderData.data[0].id + "/general", "_blank").focus();
            }
        });
    }

    // Add button to search portal to open last completed reservation, this makes it easy to add new packages to an order that was just completed.
    function addLastReservationButtons(){
        var lastCompletedReservationDetails = JSON.parse(localStorage.getItem("NKHR_LastCompletedReservationDetails"));

        // Test if we have a saved last saved reservation and create the button if we do
        if (lastCompletedReservationDetails)
        {
            // Setup the button element with proper text, attributes and url
            var lastCompletedButton = document.createElement("a");
            lastCompletedButton.setAttribute("class", "btn btn-primary btn-block");
            lastCompletedButton.setAttribute("id", "lastCompletedButton");
            lastCompletedButton.setAttribute("href", "https://retailvista.net/bztrs/packingportal/AddParcels/Search?ReservationNumber=" + lastCompletedReservationDetails.number);
            lastCompletedButton.innerText = "Laatst voltooide reservering";

            // Insert the button after the reservation search button
            document.querySelector("#frmAddParcels > div.form-group.pt-3").insertBefore(lastCompletedButton, $('#frmAddParcels > div.form-group.pt-3 > button').nextSibling);
        }

        var lastOpenReservationDetails = JSON.parse(localStorage.getItem("NKHR_LastOpenReservationDetails"))

        // Test if we have a saved last saved reservation and create the button if we do
        if (lastOpenReservationDetails != null)
        {
            // Return and do not create the button if it is the same as last completed
            if (lastOpenReservationDetails && lastCompletedReservationDetails && lastOpenReservationDetails.number == lastCompletedReservationDetails.number ) { return; }

            // Setup the button element with proper text, attributes and url
            var lastOpenButton = document.createElement("a");
            lastOpenButton.setAttribute("class", "btn btn-primary btn-block");
            lastOpenButton.setAttribute("id", "lastCompletedButton");
            lastOpenButton.setAttribute("href", "https://retailvista.net/bztrs/packingportal/Parcels?reservationId=" + lastOpenReservationDetails.id + "&allowCashOnDelivery=False&autoComplete=false");
            lastOpenButton.innerText = "Laatst geopende reservering";

            // Insert the button after the reservation search button
            document.querySelector("#frmReservations > div.form-group.pt-3").insertBefore(lastOpenButton, $('#frmAddParcels > div.form-group.pt-3 > button').nextSibling);
        }
    }

    // This function saves the currently open reservation to local storage as the last open reservation
    function saveLastOpenReservation(){
        var reservationNumber = document.querySelector("#Reservation_ReservationNumber").value;
        var reservationID = document.querySelector("#VerificationReservationRows_0__ReservationId").value;

        var reservationDetails = { id: reservationID, number: reservationNumber };

        localStorage.setItem("NKHR_LastOpenReservationDetails", JSON.stringify(reservationDetails));
    }

        // This function saves the currently open reservation to local storage as the last completed reservation
    function saveLastCompletedReservation(){
        var reservationNumber = document.querySelector("#Reservation_ReservationNumber").value;
        var reservationID = window.location.href.split('reservationId=').pop().split('&').shift();

        var reservationDetails = { id: reservationID, number: reservationNumber };

        localStorage.setItem("NKHR_LastCompletedReservationDetails", JSON.stringify(reservationDetails));
    }

    function setOptionsPanelVisibility(visible) {
        let panel = document.querySelector("#optionsPanel");
        
        if (visible == undefined) {
            visible = panel.style.display == "none" ? true : false;
        }
        
        if (visible) {
            panel.style.display = "block";
        } else {
            panel.style.display = "none";
        }
    }

    function createOptionsPanel() {
        let panelElement = document.createElement("div");
        panelElement.setAttribute("id", "optionsPanel")

        let style = `
            display:none;
            width:250px;
            min-height:200px;
            background-color:#eff6f3;
            position:absolute;
            right:0px;
            bottom: 0px;
            transform:translate(0, -50%);
            border-style:solid;
            border-width:1px;
            border-color:#3e5f42;
            z-index:1000;
        `;

        panelElement.setAttribute("style", style);
        document.body.append(panelElement);

        panelElement.innerHTML += `
            <h5 class="text-center" style="margin-top:10px;">Script Instellingen</h5>
        `;

        panelElement.innerHTML += `
            <input type="checkbox" id="checkboxEnabled" name="checkboxEnabled" style="margin-left:10px; vertical-align: middle;">
            <label for="checkboxEnabled" style="margin-left:10px;">Script inschakelen</label>
        `;

        panelElement.innerHTML += `
            <br>
            <input type="checkbox" id="checkboxProceed" name="checkboxProceed" style="margin-left:10px; vertical-align: middle;">
            <label for="checkboxProceed" style="margin-left:10px;">Automatisch doorgaan</label>
        `;

        panelElement.innerHTML += `
            <br>
            <input type="checkbox" id="checkboxAddButtons" name="checkboxAddButtons" style="margin-left:10px; vertical-align: middle;">
            <label for="checkboxAddButtons" style="margin-left:10px;">Toevoeg knoppen</label>
        `;

        let checkboxEnabled = document.querySelector("[id=checkboxEnabled]");

        if (settings.enabled) { checkboxEnabled.setAttribute("checked", ""); }
        checkboxEnabled.addEventListener('change', (event) => { settings.enabled = event.target.checked; });

        let checkboxProceed = document.querySelector("[id=checkboxProceed]");

        if (settings.proceed) { checkboxProceed.setAttribute("checked", ""); }
        checkboxProceed.addEventListener('change', (event) => { settings.proceed = event.target.checked; });

        let checkboxAddButtons = document.querySelector("[id=checkboxAddButtons]");

        if (settings.enableAddButtons) { checkboxAddButtons.setAttribute("checked", ""); }
        checkboxAddButtons.addEventListener('change', (event) => { settings.enableAddButtons = event.target.checked; });

        console.log(settings.proceed)
    }

    /********************************************
     *                                          *
     *          SHOPWARE INTEGRATION            *
     *                                          *
     ********************************************/

    // This function initializes the shopware integration
    async function shopwareInitialize() {
        var token;

        // Check if token exists locally
        var storageToken = localStorage.getItem("NKHR_ShopwareToken");
        if (typeof storageToken !== 'undefined' && storageToken !== null) {
            // Parse the local storage item if it exists
            token = JSON.parse(storageToken);

            console.log("Retrieving token from storage...");
        }
        else {
            // If no token exists in local storage retrieve a new one
            let login = await shopwareLoginDialog();

            token = await shopwareGetToken(login.username, login.password);
        }

        var version;

        try {
            version = await shopwareGetVersion(token);
        } catch(err) {
            // If it throws unauthorized error try refreshing the token
            if (err.responseJSON.errors[0].status == 401 && err.responseJSON.errors[0].code == 9) {
                try {
                    token = await shopwareRefreshToken(token);
                } catch {
                    // get a new token if refresing fails
                    let login = await shopwareLoginDialog();

                    token = await shopwareGetToken(login.username, login.password);
                }
            }
            else {
                // try getting a new token if the error is not recognized
                let login = await shopwareLoginDialog();

                token = await shopwareGetToken(login.username, login.password);
            }

            version = await shopwareGetVersion(token);
        }

        console.log(version);

        console.log("Shopware integration initialized");

        return token;
    }

    // Function that sends a request for a new token with the given credentials
    async function shopwareGetToken(username, password) {
        // Request a new token if it doesn't exist locally

        const settings = {
            async: true,
            crossDomain: true,
            url: shopwareApiUrl + "/api/oauth/token",
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            processData: false,
            data: JSON.stringify({
                client_id: "administration",
                grant_type: "password",
                scopes: "write",
                username: username,
                password: password
            })
        };

        console.log("Retrieving shopware token...");

        var token = await $.ajax(settings);

        // Save the token to local storage
        localStorage.setItem("NKHR_ShopwareToken", JSON.stringify(token));

        return token;
    }

    // Function that refreshes the given token
    async function shopwareRefreshToken(token) {
        const settings = {
            async: true,
            crossDomain: true,
            url: shopwareApiUrl + '/api/oauth/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            processData: false,
            data: JSON.stringify({
                grant_type: "refresh_token",
                client_id: "administration",
                refresh_token: token.refresh_token
            })
        };

        console.log("Refreshing shopware token...");

        var newToken = await $.ajax(settings);

        // Save the token to local storage
        localStorage.setItem("NKHR_ShopwareToken", JSON.stringify(newToken));

        return newToken;
    }

    // Function that retrieves the shopware API version
    async function shopwareGetVersion(token) {
        const settings = {
            async: true,
            crossDomain: true,
            url: shopwareApiUrl + '/api/_info/version',
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                Authorization: 'Bearer ' + token.access_token
            }
        };

        console.log("Getting shopware version...");

        return $.ajax(settings);
    }

    // Function that retrieves the order data for a given ordernumber
    async function shopwareGetOrderData(token, orderNumber) {
        const settings = {
            async: true,
            crossDomain: true,
            url: shopwareApiUrl + '/api/search/order',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                Authorization: 'Bearer ' + token.access_token
            },
            processData: false,
            // Create filter settings for ordernumber
            data: JSON.stringify({
                filter: [
                    {
                        type: "contains",
                        field: "orderNumber",
                        value: orderNumber
                    }
                ]
            })
        };

        console.log("Retrieving order data for order with number (" + orderNumber + ").");

        return $.ajax(settings);
    }

    // Function that updates order customer comment
    async function shopwareUpdateOrderComment(token, data){
        const settings = {
            async: true,
            crossDomain: true,
            url: shopwareApiUrl + '/api/order/' + data.id,
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/vnd.api+json, application/json',
                Authorization: 'Bearer ' + token.access_token
            },
            // Filter out the rest of the data and send only the customer comment
            data: JSON.stringify({
                customerComment: data.customerComment
            })
        };

        console.log("Updating shopware order customer comment...");

        return $.ajax(settings);
    }

    // Create a login dialog to retrieve shopware login credentials
    async function shopwareLoginDialog() {
        //--- Use jQuery to add the form in a "popup" dialog.
        $("body").append ( `
            <div id="shopwarePopupContainer">
            <center><h3>Shopware Login</h3></center>
                <form>
                <label for="sw_username">Username: </label><br>
                    <input type="text" id="sw_username" value=""><br>
                    <label for="sw_password">Password: </label><br>
                    <input type="text" id="sw_password" value=""><br>

                    <center><button id="shopwareLoginButton" type="button">Login</button></center>
                </form>
            </div>
        `);

        $("#shopwareLoginButton").click ( function () {
            $("#gmPopupContainer").hide ();
        } );

        GM_addStyle (`
            #shopwarePopupContainer {
                position:               fixed;
                align-self:             center;
                top:                    25px;
                padding:                2em;
                background:             #eff6f3;
                border:                 1px solid black;
                border-radius:          1ex;
                z-index:                777;
            }
            #shopwarePopupContainer button{
                cursor:                 pointer;
                margin:                 1em 1em 0;
                border:                 1px outset buttonface;

            }
        `);

        return new Promise((resolve, reject) => {
            $("#shopwareLoginButton").click ( function () {
                let username = document.querySelector("#sw_username").value;
                let password = document.querySelector("#sw_password").value;

                $("#shopwarePopupContainer").hide();
                resolve({
                    username: username,
                    password: password
                });
            });
        });
    }
})();