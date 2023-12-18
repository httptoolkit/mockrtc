/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    MockRTC,
    expect,
    delay
} from '../test-setup';

describe("MockRTC smoke test:", function () {

    const mockRTC = MockRTC.getRemote({ recordMessages: true });

    beforeEach(() => mockRTC.start());
    afterEach(() => mockRTC.stop());

    it("should pass the README example test", async () => {
        // Create a mock peer who sends 'Goodbye' after receiving its first message.
        const mockPeer = await mockRTC
            .buildPeer()
            .waitForNextMessage()
            .thenSend('Goodbye');

        // Create a data connection:
        const localConnection = new RTCPeerConnection();
        const dataChannel = localConnection.createDataChannel("dataChannel");

        const localOffer = await localConnection.createOffer();
        await localConnection.setLocalDescription(localOffer);

        // Get the remote details for the mock peer:
        const { answer } = await mockPeer.answerOffer(localOffer);
        await localConnection.setRemoteDescription(answer);

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
        expect(await mockPeer.getAllMessages()).to.deep.equal(['Hello']);
    });

    it("should pass the README proxy example", async () => {
        const mockPeer = await mockRTC.buildPeer()
            .waitForNextMessage() // Wait for and drop the first datachannel message
            .send('MockRTC injected message') // Send a message on every data channel
            .thenPassThrough(); // Then proxy everything else

        const localConn = new RTCPeerConnection();

        // The magic:
        MockRTC.hookWebRTCConnection(localConn, mockPeer);
        // ^ This redirects all connA's traffic via the mock peer, no matter who it connects to.

        // Normal WebRTC setup using real browser connections:
        const localOffer = await localConn.createOffer();
        const localDataChannel = localConn.createDataChannel("dataChannel");
        localConn.setLocalDescription(localOffer);

        const remoteConn = new RTCPeerConnection();
        remoteConn.setRemoteDescription(localOffer);
        const remoteAnswer = await remoteConn.createAnswer();
        remoteConn.setLocalDescription(remoteAnswer);
        localConn.setRemoteDescription(remoteAnswer);

        const log: string[] = [];

        localDataChannel.onopen = () => {
            localDataChannel.addEventListener('message', ({ data }) => log.push(`LOCAL: ${data}`));
            localDataChannel.send('local message 1');
            localDataChannel.send('local message 2');
        };

        remoteConn.addEventListener('datachannel', async ({ channel }) => {
            channel.addEventListener('message', ({ data }) => log.push(`REMOTE: ${data}`));
            await delay(10); // Delay to guarantee ordering - skipped in README but that's OK
            channel.send("remote message 1");
            channel.send("remote message 2");
        });

        await delay(500);

        expect(log).to.deep.equal([
            'LOCAL: MockRTC injected message',
            'REMOTE: local message 2',
            'LOCAL: remote message 1',
            'LOCAL: remote message 2'
        ]);
    });

});