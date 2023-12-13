/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    MockRTC,
    expect,
    delay,
    waitForChannelOpen
} from '../test-setup';

describe("Echo steps", function () {

    const mockRTC = MockRTC.getRemote();

    beforeEach(() => mockRTC.start());
    afterEach(() => mockRTC.stop());

    it("should be able to echo messages across multiple data channels", async () => {
        const mockPeer = await mockRTC.buildPeer()
            .thenEcho();

        const localConnection = new RTCPeerConnection();
        const dataChannel1 = localConnection.createDataChannel("dataChannel1");

        const localOffer = await localConnection.createOffer();
        await localConnection.setLocalDescription(localOffer);
        const { answer } = await mockPeer.answerOffer(localOffer);
        await localConnection.setRemoteDescription(answer);

        let messages: Array<string> = [];
        dataChannel1.addEventListener('message', (event) => messages.push("1: " + event.data));

        await waitForChannelOpen(dataChannel1);
        dataChannel1.send('Test message 1');
        dataChannel1.send('Test message 2');

        const dataChannel2 = localConnection.createDataChannel("dataChannel2");
        dataChannel2.addEventListener('message', (event) => messages.push("2: " + event.data));
        await waitForChannelOpen(dataChannel2);

        await delay(50); // Delay to guarantee ordering
        dataChannel2.send('Test message 3');

        await delay(50); // Delay to guarantee delivery

        expect(messages).to.deep.equal([
            '1: Test message 1',
            '1: Test message 2',
            '2: Test message 3',
        ]);
    });

    it("should be able to echo media", async () => {
        const mockPeer = await mockRTC.buildPeer()
            .thenEcho();

        // Create a connection to send & receive video:
        const localConn = new RTCPeerConnection();
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        localConn.addTrack(stream.getTracks()[0], stream);

        // Turn incoming tracks into readable streams of frames:
        const mediaStreamPromise = new Promise<ReadableStream<VideoFrame>>((resolve) => {
            localConn.addEventListener('track', ({ track }) => {
                const streamProcessor = new MediaStreamTrackProcessor({
                    track: track as MediaStreamVideoTrack
                });
                resolve(streamProcessor.readable);
            });
        });

        // Complete the connection with the mock peer:
        const localOffer = await localConn.createOffer({ offerToReceiveVideo: true });
        await localConn.setLocalDescription(localOffer);
        const { answer } = await mockPeer.answerOffer(localOffer);
        await localConn.setRemoteDescription(answer);

        // Check we receive the expected echoed video:
        const localMedia = await mediaStreamPromise;
        const { value: localFrame } = await localMedia!.getReader().read();
        expect(localFrame!.displayHeight).to.be.greaterThanOrEqual(240);
        expect(localFrame!.displayWidth).to.be.greaterThanOrEqual(320);
    });

});