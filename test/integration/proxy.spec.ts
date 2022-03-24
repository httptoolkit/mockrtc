/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    MockRTC,
    expect,
    waitForChannelOpen,
    waitForChannelClose
} from '../test-setup';

describe("When proxying WebRTC traffic", () => {

    const mockRTC = MockRTC.getRemote();

    beforeEach(() => mockRTC.start());
    afterEach(() => mockRTC.stop());

    function hookWebRTCPeer(conn: RTCPeerConnection, mockPeer: MockRTC.MockRTCPeer) {
        // Anything that creates signalling data (createOffer/createAnswer) needs to be hooked to
        // return the params for the external mock peer.
        // Anything that sets params needs to be hooked to send to & set those params on the external
        // mock peer, create new params, signal those to the local mock peer.

        const _createOffer = conn.createOffer.bind(conn);
        const _createAnswer = conn.createAnswer.bind(conn);
        const _setLocalDescription = conn.setLocalDescription.bind(conn);
        const _setRemoteDescription = conn.setRemoteDescription.bind(conn);

        let externalOffers: {
            [sdp: string]: MockRTC.MockRTCExternalOfferParams
        } = {};
        let selectedExternalOffer: MockRTC.MockRTCExternalOfferParams | undefined;

        let externalAnswers: {
            [sdp: string]: MockRTC.MockRTCExternalAnswerParams
        } = {};
        let selectedExternalAnswer: MockRTC.MockRTCExternalAnswerParams | undefined;

        let mockOffer: MockRTC.MockRTCOfferParams | undefined;

        let internalAnswer: Promise<RTCSessionDescriptionInit> | undefined;
        let remoteOffer: RTCSessionDescriptionInit | undefined;

        conn.addEventListener('connectionstatechange', async () => {
            if (conn.connectionState === 'connected') {
                const controlChannel = conn.createDataChannel(MockRTC.MOCKRTC_CONTROL_CHANNEL);
                await new Promise<void>((resolve) => controlChannel.onopen = () => resolve());
                controlChannel.send(JSON.stringify({
                    type: 'attach-external',
                    id: selectedExternalOffer
                        ? selectedExternalOffer.id
                        : selectedExternalAnswer!.id
                }));
            }
        });

        conn.createOffer = (async () => {
            const externalOfferParams = await mockPeer.createExternalOffer();
            const externalOffer = externalOfferParams.offer;
            externalOffers[externalOffer.sdp!] = externalOfferParams;
            return externalOffer;
        }) as any;

        conn.createAnswer = (async () => {
            const externalAnswerParams = await mockPeer.answerExternalOffer(remoteOffer!);
            const externalAnswer = externalAnswerParams.answer;
            externalAnswers[externalAnswer.sdp!] = externalAnswerParams;
            return externalAnswer;
        }) as any;

        conn.setLocalDescription = (async (localDescription: RTCSessionDescriptionInit) => {
            // When we set an offer or answer locally, it must be the external offer/answer we've
            // generated to send to the other peer. We swap it back for a real equivalent that will
            // connect us to the mock peer instead:
            if (localDescription.type === 'offer') {
                selectedExternalOffer = externalOffers[localDescription.sdp!];
                const realOffer = _createOffer();
                // Start mock answer generation async, so it's ready/waitable in
                // setRemoteDescription if it's not complete by then.
                internalAnswer = realOffer.then((offer) => mockPeer.answerOffer(offer));
                await _setLocalDescription(await realOffer);
            } else {
                selectedExternalAnswer = externalAnswers[localDescription.sdp!];
                const realAnswer = await _createAnswer();
                mockOffer!.setAnswer(realAnswer);
                await _setLocalDescription(realAnswer);
            }
        }) as any;

        conn.setRemoteDescription = (async (remoteDescription: RTCSessionDescriptionInit) => {
            if (remoteDescription.type === 'offer') {
                // We have an offer! Remember it, so we can createAnswer shortly.
                remoteOffer = remoteDescription;
                mockOffer = await mockPeer.createOffer();
                await _setRemoteDescription(mockOffer.offer);
            } else {
                // We have an answer - we must've sent an offer, complete & use that.
                await selectedExternalOffer!.setAnswer(remoteDescription);
                await _setRemoteDescription(await internalAnswer!);
            }
        }) as any;
    }

    it("should be able to transparently forward messages to a configured peer", async () => {
        const remotePeer = new RTCPeerConnection();
        const remotelyReceivedMessages: Array<string | Buffer> = [];

        remotePeer.addEventListener('datachannel', ({ channel }) => {
            channel.addEventListener('message', ({ data }) => remotelyReceivedMessages.push(data));
            channel.send("remote message 1");
            channel.send("remote message 2");
            channel.send("remote message 3");
            setTimeout(() => channel.close(), 100);
        });

        const mockPeer = await mockRTC.buildPeer()
            .waitForMessage()
            .send('Injected message')
            .thenForwardTo(remotePeer);

        // Create a data connection:
        const localPeer = new RTCPeerConnection();

        const dataChannel = localPeer.createDataChannel("dataChannel");
        const locallyReceivedMessages: Array<string | Buffer> = [];
        dataChannel.addEventListener('message', ({ data }) => locallyReceivedMessages.push(data));

        const localOffer = await localPeer.createOffer();
        localPeer.setLocalDescription(localOffer);

        // Get the remote details for the mock peer:
        const mockAnswer = await mockPeer.answerOffer(localOffer);
        await localPeer.setRemoteDescription(mockAnswer);

        await waitForChannelOpen(dataChannel);

        dataChannel.send('local message 1');
        dataChannel.send('local message 2');
        dataChannel.send('local message 3');

        await waitForChannelClose(dataChannel);

        expect(locallyReceivedMessages).to.deep.equal([
            'Injected message', // Injected by thenSend step
            'remote message 1',
            'remote message 2',
            'remote message 3'
        ]);

        expect(remotelyReceivedMessages).to.deep.equal([
            // First message is captured by waitForMessage step
            'local message 2',
            'local message 3'
        ]);
    });

    it("should be able to transparently forward messages to dynamically provided peer sending offer", async () => {
        const remoteConn = new RTCPeerConnection();
        const remotelyReceivedMessages: Array<string | Buffer> = [];

        remoteConn.addEventListener('datachannel', ({ channel }) => {
            channel.addEventListener('message', ({ data }) => remotelyReceivedMessages.push(data));
            channel.send("remote message 1");
            channel.send("remote message 2");
            channel.send("remote message 3");
            setTimeout(() => channel.close(), 100);
        });

        const mockPeer = await mockRTC.buildPeer()
            .waitForMessage()
            .send('Injected message')
            .thenForwardDynamically();

        // Create a local data connection:
        const localConn = new RTCPeerConnection();
        hookWebRTCPeer(localConn, mockPeer); // Automatically redirect traffic via mockPeer

        const dataChannel = localConn.createDataChannel("dataChannel");
        const locallyReceivedMessages: Array<string | Buffer> = [];
        dataChannel.addEventListener('message', ({ data }) => locallyReceivedMessages.push(data));

        // Create a local offer (which will be hooked automatically):
        const localOffer = await localConn.createOffer();
        localConn.setLocalDescription(localOffer);

        // v-- Normally happens remotely, via signalling ---
        remoteConn.setRemoteDescription(localOffer);
        const remoteAnswer = await remoteConn.createAnswer();
        remoteConn.setLocalDescription(remoteAnswer);
        // ^-- Normally happens remotely, via signalling ---

        // Accept the real remote answer, and start communicating:
        localConn.setRemoteDescription(remoteAnswer);

        await new Promise<void>((resolve) => dataChannel.onopen = () => resolve());

        dataChannel.send('local message 1');
        dataChannel.send('local message 2');
        dataChannel.send('local message 3');

        await new Promise((resolve) => dataChannel.addEventListener('close', resolve));

        expect(locallyReceivedMessages).to.deep.equal([
            'Injected message', // Injected by thenSend step
            'remote message 1',
            'remote message 2',
            'remote message 3'
        ]);

        expect(remotelyReceivedMessages).to.deep.equal([
            // First message is captured by waitForMessage step
            'local message 2',
            'local message 3'
        ]);
    });

    it("should be able to transparently forward messages to dynamically provided peer receiving answer", async () => {
        const remoteConn = new RTCPeerConnection();
        remoteConn.createDataChannel("empty-channel"); // We need to create at least one channel/track to get an offer
        const remotelyReceivedMessages: Array<string | Buffer> = [];

        remoteConn.addEventListener('datachannel', ({ channel }) => {
            channel.addEventListener('message', ({ data }) => remotelyReceivedMessages.push(data));
            channel.send("remote message 1");
            channel.send("remote message 2");
            channel.send("remote message 3");
            setTimeout(() => channel.close(), 100);
        });

        const mockPeer = await mockRTC.buildPeer()
            .waitForMessage()
            .send('Injected message')
            .thenForwardDynamically();

        // Remote connection starts first, sending us a real offer:
        const remoteOffer = await remoteConn.createOffer();
        remoteConn.setLocalDescription(remoteOffer);

        // Create a local data connection:
        const localConn = new RTCPeerConnection();
        hookWebRTCPeer(localConn, mockPeer); // Automatically redirect traffic via mockPeer

        const dataChannel = localConn.createDataChannel("dataChannel");
        const channelOpenPromise = new Promise<void>((resolve) => dataChannel.onopen = () => resolve());
        const locallyReceivedMessages: Array<string | Buffer> = [];
        dataChannel.addEventListener('message', ({ data }) => locallyReceivedMessages.push(data));

        // Receive the remote offer, use that locally to create an answer (this is all hooked):
        await localConn.setRemoteDescription(remoteOffer);
        const localAnswer = await localConn.createAnswer();
        localConn.setLocalDescription(localAnswer);

        // Signal the answer back to the real unhooked remote connection:
        await remoteConn.setRemoteDescription(localAnswer);

        await channelOpenPromise;

        dataChannel.send('local message 1');
        dataChannel.send('local message 2');
        dataChannel.send('local message 3');

        await new Promise((resolve) => dataChannel.addEventListener('close', resolve));

        expect(locallyReceivedMessages).to.deep.equal([
            'Injected message', // Injected by thenSend step
            'remote message 1',
            'remote message 2',
            'remote message 3'
        ]);

        expect(remotelyReceivedMessages).to.deep.equal([
            // First message is captured by waitForMessage step
            'local message 2',
            'local message 3'
        ]);
    });

    it("should be able to transparently forward messages when hooking both ends of a connection", async () => {
        const mockPeer = await mockRTC.buildPeer()
            .waitForMessage()
            .send('Injected message')
            .thenForwardDynamically();

        const remoteConn = new RTCPeerConnection();
        hookWebRTCPeer(remoteConn, mockPeer); // Automatically redirect traffic via mockPeer

        const remotelyReceivedMessages: Array<string | Buffer> = [];

        // Like localChannel, We have to create an outgoing channel for the wait & send step.
        remoteConn.createDataChannel("remote-channel").onopen = function () {
            this.addEventListener('message', ({ data }) => remotelyReceivedMessages.push(data));
            this.send('remote message 1'); // Required on an outgoing channel to pass waitForMessage
        };

        // Remote listens for local's channel, sends replies, and closes
        remoteConn.addEventListener('datachannel', ({ channel }) => {
            channel.addEventListener('message', ({ data }) => remotelyReceivedMessages.push(data));
            channel.send("remote message 2");
            channel.send("remote message 3");
            channel.send("remote message 4");
            setTimeout(() => channel.close(), 500);
        });

        // Remote connection starts first, sending a hooked offer:
        const remoteOffer = await remoteConn.createOffer();
        remoteConn.setLocalDescription(remoteOffer);

        // We create a local data connection too:
        const localConn = new RTCPeerConnection();
        hookWebRTCPeer(localConn, mockPeer); // Automatically redirect traffic via mockPeer

        const dataChannel = localConn.createDataChannel("localDataChannel");
        const channelOpenPromise = new Promise<void>((resolve) => dataChannel.onopen = () => resolve());
        const locallyReceivedMessages: Array<string | Buffer> = [];
        dataChannel.addEventListener('message', ({ data }) => locallyReceivedMessages.push(data));

        // Receive the remote offer, use that locally to create an answer (all hooked):
        await localConn.setRemoteDescription(remoteOffer);
        const localAnswer = await localConn.createAnswer();
        localConn.setLocalDescription(localAnswer);

        // Signal the answer back to the remote connection, which hooks this too:
        await remoteConn.setRemoteDescription(localAnswer);

        await channelOpenPromise;

        dataChannel.send('local message 1');
        dataChannel.send('local message 2');
        dataChannel.send('local message 3');

        await new Promise((resolve) => dataChannel.addEventListener('close', resolve));

        expect(locallyReceivedMessages).to.deep.equal([
            'Injected message', // Injected by send step
            'remote message 2',
            'remote message 3',
            'remote message 4'
        ]);

        expect(remotelyReceivedMessages).to.deep.equal([
            'Injected message', // Injected by send step here too! Both peers are hooked
            // Local message is eaten by waitForMessage
            'local message 2',
            'local message 3'
        ]);
    });

});