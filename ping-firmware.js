//░░░░░░░░░░░░░░░░░░░
//░ non user-settable
//░░░░░░░░░░░░░░░░░░░
const rangesCache = getCacheFromLocalStorage() || {};
const startTime = performance.now() - (rangesCache.elapsedTime || 0);

//░░░░░░░░░░░░░░░░░░░
//░ user-settable
//░░░░░░░░░░░░░░░░░░░
const rangeStart = 0x10000; // 0x10000
const rangeEnd = 0xfffff; // 0xfffff
const modelID = "rd03";
const fwVersion = "1.0.92";
const chineseModel = true; // international otherwise
const totalWorkers = 500;
const workerSpawnInterval = 100; // ms (0 sec)
const minPostInterval = 3000; // ms (3 sec)
const requestsPerBatch = 10000; // requests made before restart

//░░░░░░░░░░░░░░░░░░░
//░ non user-settable
//░░░░░░░░░░░░░░░░░░░
let activeWorkers = totalWorkers;
let requestsMade = rangesCache.requestsMade || 0;
let rejectedRequests = rangesCache.rejectedRequests || 0;
let requestsThreshold = requestsMade + requestsPerBatch;
let terminateWorkers = false;
const totalHashes = rangeEnd - rangeStart + 1;
const hashesPerWorker = totalHashes / totalWorkers | 0;

registerServiceWorker();
let handle = spawnWorkers();

function spawnWorkers() {
    populateHtmlPage();
    console.log("Spawning", totalWorkers, "workers");
    // range default init - the very first start
    let workerStartRange = rangeStart;
    let workerEndRange = rangeStart - 1;
    let currentWorkerId = 1;
    
    setTimeout(async function perWorkerSequence() {
        const worker = {
            id: currentWorkerId,
            startRange: null,
            endRange: null,
            initialEndRange: null,
            terminateWorker: function(url, responseStatus) {
                terminateWorkers = true;
                populateHtmlPage(url);
                console.log(url);
                console.log(`${responseStatus}: Worker ${this.id} [${this.startRange.toString(16)}-${this.endRange.toString(16)}] succeeded`);
                console.log(`Total requests: ${requestsMade}`);
                console.log(`Total time taken: ${getElapsedTime()} mins`);
                deleteLocalStorageCache();
            },
            logFinished: function(workerEndRange) {
                if (!terminateWorkers && (this.startRange <= workerEndRange)) {
                    rangesCache[this.id].endRange = workerEndRange;
                    // console.log(`Worker ${this.id} finished | Requests: ${this.initialEndRange - workerEndRange}`);
                    --activeWorkers;
                    if (activeWorkers === 0) {
                        console.log("The workers batch finished");
                        console.log(`Total requests: ${requestsMade}`);
                        console.log(`Total time taken: ${getElapsedTime()} mins`);
                        cacheDataToLocalStorage();
                        restartWorkers();
                    }
                } else if (!terminateWorkers) {
                    --activeWorkers;
                    if (activeWorkers === 0) {
                        populateHtmlPage("Not Found");
                        console.log(`The hashes search finished. Firmware ${fwVersion} not found.`);
                        console.log(`Total hashes: ${totalHashes}`);
                        console.log(`Total requests: ${requestsMade}`);
                        console.log(`Total time taken: ${getElapsedTime()} mins`);
                        deleteLocalStorageCache();
                    }
                }
            }
        };

        // for every worker
        if ((!localStorage.getItem("rangesCache")) && (currentWorkerId <= totalWorkers)) {
            // set worker range
            if (currentWorkerId === totalWorkers) { // last worker
                worker.startRange = workerStartRange = workerEndRange + 1;
                worker.endRange = workerEndRange = rangeEnd;
                worker.initialEndRange = worker.endRange;
            } else {
                worker.startRange = workerStartRange = workerEndRange + 1;
                worker.endRange = workerEndRange = workerStartRange + hashesPerWorker - 1;
                worker.initialEndRange = worker.endRange;
            }
            
            rangesCache[worker.id] = {
                startRange: worker.startRange,
                endRange: worker.endRange,
                initialEndRange: worker.endRange
            };

            queryFirmware(workerStartRange, workerEndRange, worker);
            ++currentWorkerId;
            setTimeout(perWorkerSequence, workerSpawnInterval);
        // restart case and cached start
        } else if (currentWorkerId <= totalWorkers) {
            worker.startRange = workerStartRange = rangesCache[currentWorkerId].startRange;
            worker.endRange = workerEndRange = rangesCache[currentWorkerId].endRange;
            worker.initialEndRange = rangesCache[currentWorkerId].initialEndRange;

            queryFirmware(workerStartRange, workerEndRange, worker);
            ++currentWorkerId;
            setTimeout(perWorkerSequence, workerSpawnInterval);
        }
    }, workerSpawnInterval);
}

async function queryFirmware(workerStartRange, workerEndRange, worker) {
    if (!terminateWorkers &&
        (workerStartRange <= workerEndRange) &&
        (requestsMade < requestsThreshold)) {
        try {
            const md5Hash = workerEndRange.toString(16);
            const url = chineseModel
            ? `https://cdn.cnbj1.fds.api.mi-img.com/xiaoqiang/rom/${modelID}/miwifi_${modelID}_firmware_${md5Hash}_${fwVersion}.bin`
            : `https://cdn.cnbj1.fds.api.mi-img.com/xiaoqiang/rom/${modelID}/miwifi_${modelID}_firmware_${md5Hash}_${fwVersion}_INT.bin`
            const response = await fetch(url, {});
            --workerEndRange;
            ++requestsMade;

            // case when service worker not active - HTTP 404 reach here
            // case when service worker active - HTTP 202 and HTTP 404 reach here
            if (response.status === 200) {
                worker.terminateWorker(url, response.status);
            } else {
                setTimeout(queryFirmware, minPostInterval, workerStartRange, workerEndRange, worker);
            }
        } catch (error) { // on fetch promise rejected
            ++rejectedRequests;
            worker.logFinished(workerEndRange);
        }
    } else {
        worker.logFinished(workerEndRange);
    }
}

function getElapsedTime() {
    return ((performance.now() - startTime) / 1000 / 60).toFixed(1);
}

function populateHtmlPage(url) {
        document.querySelector("#model").innerText = modelID;
        document.querySelector("#target-fw").innerText = fwVersion;
        document.querySelector("#total-hashes").innerText = totalHashes;
        document.querySelector("#total-workers").innerText = totalWorkers;
        document.querySelector("#hashes-per-worker").innerText = hashesPerWorker;
        document.querySelector("#total-requests").innerText = requestsMade;
        document.querySelector("#total-time-taken").innerText = `${getElapsedTime()} mins`;
        document.querySelector("#rejected-requests").innerText = rejectedRequests;
        document.querySelector("#fw-url").innerText = url || "none";
        if (url) {
            document.querySelector("#finished").innerText = "Finished";
        }
}

function restartWorkers() {
    console.log(`Restarting workers and releasing memory`);
    activeWorkers = totalWorkers;
    requestsThreshold = requestsMade + requestsPerBatch;
    
    ("serviceWorker" in navigator)
    ? handle = spawnWorkers()
    : window.location.reload()
}

function cacheDataToLocalStorage() {
    rangesCache.requestsMade = requestsMade;
    rangesCache.rejectedRequests = rejectedRequests;
    rangesCache.elapsedTime = performance.now() - startTime;

    localStorage.setItem("rangesCache", JSON.stringify(rangesCache));
}

function getCacheFromLocalStorage() {
    if (localStorage.length) {
        let data = JSON.parse(localStorage.getItem("rangesCache"));
        return data;
    }
    return null;
}

function deleteLocalStorageCache() {
    localStorage.removeItem("rangesCache");
}

function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("sw.js")
            .then(registration => {
                console.log("SW registered: ", registration.scope);
            })
            .catch(error => {
                console.error("SW registration failed: ", error);
            });
    }
}
