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

    it("should be able to send a message on all data channels", async () => {
        const mockPeer = await mockRTC.buildPeer()
            .thenEcho();

        const localConnection = new RTCPeerConnection();
        const dataChannel1 = localConnection.createDataChannel("dataChannel1");

        const localOffer = await localConnection.createOffer();
        await localConnection.setLocalDescription(localOffer);
        const { answer } = await mockPeer.answerOffer(localOffer);
        await localConnection.setRemoteDescription(answer);

        let messages: Array<any> = [];
        dataChannel1.addEventListener('message', (event) => messages.push("1: " + event.data));

        await waitForChannelOpen(dataChannel1);
        dataChannel1.send('Test message 1');

        const dataChannel2 = localConnection.createDataChannel("dataChannel2");
        dataChannel2.addEventListener('message', (event) => messages.push("2: " + event.data));
        await waitForChannelOpen(dataChannel2);
        await delay(10); // Delay to guarantee ordering
        dataChannel2.send('Test message 2');

        await delay(10); // Delay to guarantee ordering
        dataChannel1.send('Test message 3');

        await delay(50); // Delay to guarantee delivery

        expect(messages).to.deep.equal([
            '1: Test message 1',
            '2: Test message 2',
            '1: Test message 3',
        ]);
    });

});