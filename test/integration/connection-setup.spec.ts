/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect } from 'chai';
import * as SDP from 'sdp-transform';
import { MockRTC, waitForState } from '../test-setup';

describe("When connecting, MockRTC", function () {

    const mockRTC = MockRTC.getRemote();

    beforeEach(() => mockRTC.start());
    afterEach(() => mockRTC.stop());

    it("should be able create an offer and accept an answer", async () => {
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

    it("should be able to answer a real local offer", async () => {
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

    it("should be able to renegotiate after a mock offer was accepted", async () => {
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
        await localConnection.setRemoteDescription(updatedAnswer);

        const updatedDescription = localConnection.currentLocalDescription;
        const updatedMedia = SDP.parse(updatedDescription!.sdp).media;
        expect(updatedMedia.map(m => m.type)).to.include('audio');
    });

    it("should be able to renegotiate after answering a local offer", async () => {
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

        const updatedDescription = localConnection.currentLocalDescription;
        const updatedMedia = SDP.parse(updatedDescription!.sdp).media;
        expect(updatedMedia.map(m => m.type)).to.include('audio');
    });

    it("should be able to create a mock offer that mirrors an existing SDP", async () => {
        const mockPeer = await mockRTC.buildPeer().waitForMessage().thenSend('Goodbye');

        const rawSdpToMirror = await (async () => {
            // Wrapped in a function for clarity that this is separate, just for SDP setup:
            const demoConn = new RTCPeerConnection();
            demoConn.createDataChannel('demo'); // Must come first due to libdatachannel bug
            await demoConn.createOffer();
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const tracks = stream.getTracks();
            demoConn.addTrack(tracks[0]);
            return (await demoConn.createOffer({ offerToReceiveVideo: true })).sdp!;
        })();
        const originalSdp = SDP.parse(rawSdpToMirror);

        const { offer, setAnswer } = await mockPeer.createOffer({ mirrorSdp: rawSdpToMirror });

        const localConnection = new RTCPeerConnection();
        await localConnection.setRemoteDescription(offer);
        const localAnswer = await localConnection.createAnswer();
        await localConnection.setLocalDescription(localAnswer);
        await setAnswer(localAnswer);

        // Wait until the connection opens successfully:
        await waitForState(localConnection, 'connected');

        // The remote description we accepted should match the originally mirrored SDP:
        const remoteDescription = localConnection.currentRemoteDescription;
        const remoteMedia = SDP.parse(remoteDescription!.sdp).media;
        expect(remoteMedia.map(m => [
            m.mid, m.type, m.protocol, m.direction
        ])).to.deep.equal([
            [0, 'application', 'UDP/DTLS/SCTP', undefined], // Id changed due to libdatachannel limitations
            [1, 'audio', 'UDP/TLS/RTP/SAVPF', 'sendrecv'],
            [2, 'video', 'UDP/TLS/RTP/SAVPF', 'recvonly']
        ]);

        // Check each individual media field. These are the fields that will be passed through when
        // proxying (i.e. they're not linked to a specific peer, unlike the fingerprint etc).
        ['video', 'audio'].forEach((media) => {
            const originalAudio = originalSdp.media.find(({ type }) => type === media)!;
            const remoteAgreedAudio = remoteMedia.find(({ type }) => type === media)!;
            ([
                'msid',
                'protocol',
                'ext',
                'payloads',
                'ssrcs',
                'ssrcGroups',
                'rtp',
                'fmtp',
                'rtcp',
                'rtcpFb'
            ] as const).forEach((field) => {
                expect(remoteAgreedAudio[field]).to.deep.equal(originalAudio[field],
                    `Failed to mirror ${media} ${field}`
                );
            });
        });

        // The local description is the locally-generated answer, so flips the media direction:
        const localDescription = localConnection.currentLocalDescription;
        const localMedia = SDP.parse(localDescription!.sdp).media;
        expect(localMedia.map(m => [
            m.mid, m.type, m.protocol, m.direction
        ])).to.deep.equal([
            [0, 'application', 'UDP/DTLS/SCTP', undefined],
            [1, 'audio', 'UDP/TLS/RTP/SAVPF', 'recvonly'], // Only receive - no local audio to send
            [2, 'video', 'UDP/TLS/RTP/SAVPF', 'inactive'] // Inactive - no video to send & remote is recvonly
        ]);
    });

});