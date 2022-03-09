# MockRTC [![Build Status](https://github.com/httptoolkit/mockrtc/workflows/CI/badge.svg)](https://github.com/httptoolkit/mockrtc/actions) [![Available on NPM](https://img.shields.io/npm/v/mockrtc.svg)](https://npmjs.com/package/mockrtc)

> _Part of [HTTP Toolkit](https://httptoolkit.tech): powerful tools for building, testing & debugging HTTP(S)_

MockRTC lets you intercept, assert on and mock WebRTC peers. This makes it possible to:

* Build automated tests for WebRTC traffic.
* Capture and inspect traffic between real WebRTC peers for debugging.
* Create WebRTC proxy peers to automate message transformation, monitoring or logging.

## Get Started

```bash
npm install --save-dev mockrtc
```

## Get Testing

Let's write an automated test with MockRTC. To test WebRTC-based code, you will typically need to:

* Start a MockRTC mock server
* Define rules that match and mock the traffic you're interested in
* Create a WebRTC connection to a mock peer, by either:
    * Using MockRTC's ICE candidates directly.
    * Installing the MockRTC browser extension (WIP), which can capture and redirect _all_ WebRTC traffic regardless of the session configuration used.

A simple example of that, running as a test in a browser, using the built-in WebRTC APIs, might look like this:

```typescript
import * as MockRTC from 'mockrtc'
const mockRTC = MockRTC.getRemote({ recordMessages: true });

describe("MockRTC", () => {
    // Start & stop your mock server between tests
    beforeEach(() => mockRTC.start());
    afterEach(() => mockRTC.stop());

    it("lets you mock behaviour and assert on RTC interactions", async () => {
        // Create a mock peer who sends 'Goodbye' after receiving its first message.
        const mockPeer = await mockRTC.buildPeer().waitForMessage().thenSend('Goodbye');

        // Create a data connection:
        const localConnection = new RTCPeerConnection();
        const dataChannel = localConnection.createDataChannel("dataChannel");

        const localOffer = await localConnection.createOffer();
        await localConnection.setLocalDescription(localOffer);

        // Get the remote details for the mock peer:
        const mockAnswer = await mockPeer.answerOffer(localOffer);
        await localConnection.setRemoteDescription(mockAnswer);

        // Once the connection is open, message the peer
        dataChannel.onopen = () => {
            dataChannel.send('Hello');
        };

        // Wait for a response:
        const message = await new Promise((resolve) => {
            dataChannel.addEventListener('message', (event) => resolve(event.data));
        });
        expect(message).to.equal('Goodbye'); // <-- We get our mock response!

        // Assert on the messages the mock peer received:
        expect(mockPeer.getAllMessages()).to.deep.equal(['Hello']);
    });
});
```