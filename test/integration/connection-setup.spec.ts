/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import { MockRTC, waitForState } from '../test-setup';

describe("When connecting, MockRTC", function () {

    const mockRTC = MockRTC.getRemote();

    beforeEach(() => mockRTC.start());
    afterEach(() => mockRTC.stop());

    it("should be able to offer and accept an answer", async () => {
        const mockPeer = await mockRTC.buildPeer().waitForMessage().thenSend('Goodbye');

        const localConnection = new RTCPeerConnection();

        const { offer, setAnswer } = await mockPeer.createOffer();
        await localConnection.setRemoteDescription(offer);

        const localAnswer = await localConnection.createAnswer();
        await localConnection.setLocalDescription(localAnswer);
        await setAnswer(localAnswer);

        // Wait until the connection opens successfully:
        await waitForState(localConnection, 'connected');
    });

    it("should be able to answer an offer", async () => {
        const mockPeer = await mockRTC.buildPeer().waitForMessage().thenSend('Goodbye');

        const localConnection = new RTCPeerConnection();
        localConnection.createDataChannel("dataChannel");

        const localOffer = await localConnection.createOffer();
        await localConnection.setLocalDescription(localOffer);

        const { answer } = await mockPeer.answerOffer(localOffer);
        await localConnection.setRemoteDescription(answer);

        // Wait until the connection opens successfully:
        await waitForState(localConnection, 'connected');
    });

    it("should be able to renegotiate after accepting a mock offer", async () => {
        const mockPeer = await mockRTC.buildPeer().waitForMessage().thenSend('Goodbye');

        const localConnection = new RTCPeerConnection();

        const { offer, setAnswer } = await mockPeer.createOffer();
        await localConnection.setRemoteDescription(offer);

        const localAnswer = await localConnection.createAnswer();
        await localConnection.setLocalDescription(localAnswer);
        const session = await setAnswer(localAnswer);

        // Wait until the connection opens successfully:
        await waitForState(localConnection, 'connected');

        // Renegotiate:
        const updatedOffer = await localConnection.createOffer({ offerToReceiveAudio: true });
        localConnection.setLocalDescription(updatedOffer);

        const updatedAnswer = await session.answerOffer(updatedOffer);
        // Workaround for https://github.com/paullouisageneau/libdatachannel/issues/584
        updatedAnswer.sdp = updatedAnswer.sdp?.replace('setup:active', 'setup:passive');
        await localConnection.setRemoteDescription(updatedAnswer);
    });

    it("should be able to renegotiate after accepting a mock answer", async () => {
        const mockPeer = await mockRTC.buildPeer().waitForMessage().thenSend('Goodbye');

        const localConnection = new RTCPeerConnection();
        localConnection.createDataChannel("dataChannel");

        const localOffer = await localConnection.createOffer();
        await localConnection.setLocalDescription(localOffer);
        const { answer, session } = await mockPeer.answerOffer(localOffer);
        await localConnection.setRemoteDescription(answer);

        // Wait until the connection opens successfully:
        await waitForState(localConnection, 'connected');

        // Renegotiate:
        const updatedOffer = await localConnection.createOffer({ offerToReceiveAudio: true });
        localConnection.setLocalDescription(updatedOffer);
        const updatedAnswer = await session.answerOffer(updatedOffer);
        await localConnection.setRemoteDescription(updatedAnswer);
    });

});