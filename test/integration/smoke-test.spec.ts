import { expect } from "chai";

import * as MockRTC from "../../src/main-browser";

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
        } catch (e) {
            if (!shownMessage) {
                console.log("Waiting for admin server to start...");
                shownMessage = true;
            }
        }
    }
});

describe("MockRTC", function () {

    const mockRTC = MockRTC.getRemote();

    beforeEach(() => mockRTC.start());
    afterEach(() => mockRTC.stop());

    it("should pass the README example test", async () => {
        // Create a mock peer who sends 'Goodbye' after receiving its first message.
        const mockPeer = await mockRTC.buildPeer().waitForMessage().thenSend('Goodbye');

        // Create a data connection:
        const localConnection = new RTCPeerConnection();
        const dataChannel = localConnection.createDataChannel("dataChannel");

        const localOffer = await localConnection.createOffer();
        localConnection.setLocalDescription(localOffer);

        // Get the remote details for the mock peer:
        const mockAnswer = await mockPeer.getSessionDescription(localOffer);
        await localConnection.setRemoteDescription(mockAnswer.sessionDescription);

        // Once the connection is open, message the peer
        dataChannel.onopen = () => {
            dataChannel.send('Hello');
        };

        // // Wait for a response:
        const message = await new Promise((resolve) => {
            dataChannel.addEventListener('message', (event) => resolve(event.data));
        });
        expect(message).to.equal('Goodbye'); // <-- We get our mock response!
    });

});