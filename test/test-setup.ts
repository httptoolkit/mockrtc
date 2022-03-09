export { expect } from "chai";

import * as MockRTC from "../src/main-browser";

export { MockRTC };

// When running continuous tests, where the admin server restarts, we have a race condition
// between server restart & test run. To fix that, here we wait 10s for the admin server to
// become accessible before we run any tests.
before(async function () {
    this.timeout(10000);
    let shownMessage = false;

    while (true) {
        try {
            const server = MockRTC.getRemote();
            await server.start();
            await server.stop();
            break;
        } catch (e: any) {
            if (!shownMessage) {
                shownMessage = true;
                if (!(e instanceof TypeError)) {
                    console.log("Could not connect to admin server");
                    throw e;
                } else {
                    console.log("Waiting for admin server to start...");
                }
            }
        }
    }
});