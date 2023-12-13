/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    MockRTC,
    delay,
    expect,
    waitForChannelClose
} from '../test-setup';

describe("Send steps", function () {

    const mockRTC = MockRTC.getRemote();

    beforeEach(() => mockRTC.start());
    afterEach(() => mockRTC.stop());

    it("should be able to send a message on all data channels", async () => {
        const mockPeer = await mockRTC.buildPeer()
            .waitForChannel('dataChannel1')
            .waitForChannel('dataChannel2')
            .thenSend('Hello and goodbye');

        const localConnection = new RTCPeerConnection();
        const dataChannel1 = localConnection.createDataChannel("dataChannel1");
        const dataChannel2 = localConnection.createDataChannel("dataChannel2");

        const localOffer = await localConnection.createOffer();
        await localConnection.setLocalDescription(localOffer);
        const { answer } = await mockPeer.answerOffer(localOffer);
        await localConnection.setRemoteDescription(answer);

        // Wait for a response:
        let messages: Array<string> = [];
        dataChannel1.addEventListener('message', (event) => messages.push("1: " + event.data));
        dataChannel2.addEventListener('message', (event) => messages.push("2: " + event.data));

        await waitForChannelClose(dataChannel1);
        await delay(1);

        expect(messages.sort()).to.deep.equal([
            '1: Hello and goodbye',
            '2: Hello and goodbye',
        ]);
    });

    it("should be able to send a message on specific named data channels", async () => {
        // Create a mock peer who sends 'Goodbye' after receiving its first message.
        const mockPeer = await mockRTC.buildPeer()
            .waitForChannel('dataChannel1')
            .waitForChannel('dataChannel2')
            .thenSend('dataChannel2', 'Hello and goodbye');

        const localConnection = new RTCPeerConnection();
        const dataChannel1 = localConnection.createDataChannel("dataChannel1");
        const dataChannel2 = localConnection.createDataChannel("dataChannel2");

        const localOffer = await localConnection.createOffer();
        await localConnection.setLocalDescription(localOffer);
        const { answer } = await mockPeer.answerOffer(localOffer);
        await localConnection.setRemoteDescription(answer);

        // Wait for a response:
        let messages: Array<any> = [];
        dataChannel1.addEventListener('message', (event) => messages.push("1: " + event.data));
        dataChannel2.addEventListener('message', (event) => messages.push("2: " + event.data));

        await waitForChannelClose(dataChannel1);
        await delay(1);

        // We only see a 2nd channel message:
        expect(messages).to.deep.equal([
            '2: Hello and goodbye',
        ]);
    });

    it("should be able to create a new data channel, and send a message there", async () => {
        const mockPeer = await mockRTC.buildPeer()
            .createDataChannel('new-channel')
            .thenSend('Hello from new channel');

        const localConnection = new RTCPeerConnection();

        const messagePromise = new Promise((resolve) => {
            localConnection.addEventListener('datachannel', ({ channel }) => {
                expect(channel.label).to.equal('new-channel');
                channel.addEventListener('message', ({ data }) => resolve(data));
            });
        });

        const { offer, setAnswer } = await mockPeer.createOffer();
        await localConnection.setRemoteDescription(offer);
        const localAnswer = await localConnection.createAnswer();
        await localConnection.setLocalDescription(localAnswer);
        await setAnswer(localAnswer);

        // Wait for a response:
        const message = await messagePromise;
        expect(message).to.equal('Hello from new channel');
    });

    it("should be able to send a Buffer-based message", async () => {
        const mockPeer = await mockRTC.buildPeer()
            .waitForChannel('dataChannel1')
            .thenSend(Buffer.from('Hello from buffer'));

        const localConnection = new RTCPeerConnection();
        const dataChannel1 = localConnection.createDataChannel("dataChannel1");

        const localOffer = await localConnection.createOffer();
        await localConnection.setLocalDescription(localOffer);
        const { answer } = await mockPeer.answerOffer(localOffer);
        await localConnection.setRemoteDescription(answer);

        // Wait for a response:
        let messages: Array<Buffer> = [];
        dataChannel1.addEventListener('message', (event) => {
            messages.push(Buffer.from(event.data)); // ArrayBuffer -> node Buffer
        });

        await waitForChannelClose(dataChannel1);
        await delay(1);

        expect(messages.map(m => m.toString('utf8'))).to.deep.equal([
            'Hello from buffer'
        ]);
    });

});