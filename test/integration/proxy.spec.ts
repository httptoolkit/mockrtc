/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Sdp from 'sdp-transform';

import {
    MockRTC,
    expect,
    waitForChannelOpen,
    waitForChannelClose,
    waitForState
} from '../test-setup';

describe("When proxying WebRTC traffic", () => {

    const mockRTC = MockRTC.getRemote();

    beforeEach(() => mockRTC.start());
    afterEach(() => mockRTC.stop());

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
        const { answer } = await mockPeer.answerOffer(localOffer);
        await localPeer.setRemoteDescription(answer);

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
        MockRTC.hookWebRTCPeer(localConn, mockPeer); // Automatically redirect traffic via mockPeer

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
        MockRTC.hookWebRTCPeer(localConn, mockPeer); // Automatically redirect traffic via mockPeer

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
        MockRTC.hookWebRTCPeer(remoteConn, mockPeer); // Automatically redirect traffic via mockPeer

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
            setTimeout(() => channel.close(), 100);
        });

        // Remote connection starts first, sending a hooked offer:
        const remoteOffer = await remoteConn.createOffer();
        remoteConn.setLocalDescription(remoteOffer);

        // We create a local data connection too:
        const localConn = new RTCPeerConnection();
        MockRTC.hookWebRTCPeer(localConn, mockPeer); // Automatically redirect traffic via mockPeer

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

    function setupPerfectNegotiation(
        peer: RTCPeerConnection,
        polite: boolean,
        signaler: { send: (msg: any) => void, onmessage: (msg: any) => void }
    ) {
        // Example almost verbatim from https://w3c.github.io/webrtc-pc/#perfect-negotiation-example

        // keep track of some negotiation state to prevent races and errors
        let makingOffer = false;
        let ignoreOffer = false;
        let isSettingRemoteAnswerPending = false;

        // send any ice candidates to the other peer
        peer.onicecandidate = ({candidate}) => signaler.send({candidate});

        // let the "negotiationneeded" event trigger offer generation
        peer.onnegotiationneeded = async () => {
            try {
                makingOffer = true;
                await peer.setLocalDescription();
                signaler.send({description: peer.localDescription});
            } catch (err) {
                console.error('onnegotiationneeded', err);
            } finally {
                makingOffer = false;
            }
        };

        signaler.onmessage = async ({description, candidate}) => {
            try {
                if (description) {
                    // An offer may come in while we are busy processing SRD(answer).
                    // In this case, we will be in "stable" by the time the offer is processed
                    // so it is safe to chain it on our Operations Chain now.
                    const readyForOffer = !makingOffer &&
                        (peer.signalingState == "stable" || isSettingRemoteAnswerPending);
                    const offerCollision = description.type == "offer" && !readyForOffer;

                    ignoreOffer = !polite && offerCollision;
                    if (ignoreOffer) {
                        return;
                    }
                    isSettingRemoteAnswerPending = description.type == "answer";
                    await peer.setRemoteDescription(description); // SRD rolls back as needed
                    isSettingRemoteAnswerPending = false;
                    if (description.type == "offer") {
                        await peer.setLocalDescription();
                        signaler.send({description: peer.localDescription});
                    }
                } else if (candidate) {
                    try {
                        await peer.addIceCandidate(candidate);
                    } catch (err) {
                        if (!ignoreOffer) throw err; // Suppress ignored offer's candidates
                    }
                }
            } catch (err) {
                console.error('onmessage error', err);
            }
        }
    }

    it("should be able to transparently forward messages when hooking both ends of a perfect negotiation", async () => {
        const mockPeer = await mockRTC.buildPeer()
            .sleep(100)
            .send('Injected message')
            .thenForwardDynamically();

        // Two hooked peers:
        const remoteConn = new RTCPeerConnection();
        MockRTC.hookWebRTCPeer(remoteConn, mockPeer);
        const localConn = new RTCPeerConnection();
        MockRTC.hookWebRTCPeer(localConn, mockPeer);

        // A fake synchronous signalling channel:
        const signaler1 = { send: (msg: any) => signaler2.onmessage(msg), onmessage: (msg: any) => {} };
        const signaler2 = { send: (msg: any) => signaler1.onmessage(msg), onmessage: (msg: any) => {} };

        // Do perfect negotiation in parallel to connect our two peers:
        setupPerfectNegotiation(remoteConn, true, signaler1); // Polite
        setupPerfectNegotiation(localConn, false, signaler2); // Impolite

        const remotelyReceivedMessages: Array<string | Buffer> = [];

        // Remote listens for local's channel, sends replies, and closes
        remoteConn.addEventListener('datachannel', ({ channel }) => {
            channel.addEventListener('message', ({ data }) => remotelyReceivedMessages.push(data));
            channel.send("remote message 2");
            channel.send("remote message 3");
            channel.send("remote message 4");
            setTimeout(() => channel.close(), 100);
        });

        const dataChannel = localConn.createDataChannel("localDataChannel");
        const channelOpenPromise = new Promise<void>((resolve) => dataChannel.onopen = () => resolve());
        const locallyReceivedMessages: Array<string | Buffer> = [];
        dataChannel.addEventListener('message', ({ data }) => locallyReceivedMessages.push(data));

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
            'local message 1',
            'local message 2',
            'local message 3'
        ]);
    });

    it("should be able to transparently forward offered media through a hooked connection", async () => {
        const mockPeer = await mockRTC.buildPeer()
            .thenForwardDynamically();

        const stream = await navigator.mediaDevices.getUserMedia({ video: true });

        // One real peer:
        const remoteConn = new RTCPeerConnection();

        // One hooked peer:
        const localConn = new RTCPeerConnection();
        MockRTC.hookWebRTCPeer(localConn, mockPeer);

        // Both connections offer to send media:
        remoteConn.addTrack(stream.getTracks()[0], stream);
        localConn.addTrack(stream.getTracks()[0], stream);

        // Turn incoming tracks into readable streams of frames:
        const mediaStreamPromise = Promise.all([remoteConn, localConn].map((conn) => {
            return new Promise<ReadableStream<VideoFrame>>((resolve) => {
                conn.addEventListener('track', ({ track }) => {
                    const streamProcessor = new MediaStreamTrackProcessor({
                        track: track as MediaStreamVideoTrack
                    });
                    resolve(streamProcessor.readable);
                });
            });
        }));

        // Set up the connection
        const localOffer = await localConn.createOffer(); // Hooked
        localConn.setLocalDescription(localOffer); // Hooked
        remoteConn.setRemoteDescription(localOffer);
        const remoteAnswer = await remoteConn.createAnswer();
        remoteConn.setLocalDescription(remoteAnswer);
        localConn.setRemoteDescription(remoteAnswer); // Hooked

        await waitForState(remoteConn, 'connected');

        // Extract the first frame from each, once they arrive:
        const [remoteMedia, localMedia] = await mediaStreamPromise;
        const { value: remoteFrame } = await remoteMedia!.getReader().read();
        const { value: localFrame } = await localMedia!.getReader().read();

        // Check both peers receive video - using sizes from fake media when running headlessly:
        expect(localFrame!.displayHeight).to.be.greaterThanOrEqual(240);
        expect(localFrame!.displayWidth).to.be.greaterThanOrEqual(320);
        expect(remoteFrame!.displayHeight).to.be.greaterThanOrEqual(240);
        expect(remoteFrame!.displayWidth).to.be.greaterThanOrEqual(320);
    });

    it("should be able to transparently forward answered media through a hooked connection", async () => {
        const mockPeer = await mockRTC.buildPeer()
            .thenForwardDynamically();

        const stream = await navigator.mediaDevices.getUserMedia({ video: true });

        // One real peer:
        const remoteConn = new RTCPeerConnection();

        // One hooked peer:
        const localConn = new RTCPeerConnection();
        MockRTC.hookWebRTCPeer(localConn, mockPeer);

        // Both connections offer to send media:
        remoteConn.addTrack(stream.getTracks()[0], stream);
        localConn.addTrack(stream.getTracks()[0], stream);

        // Turn incoming tracks into readable streams of frames:
        const mediaStreamPromise = Promise.all([remoteConn, localConn].map((conn) => {
            return new Promise<ReadableStream<VideoFrame>>((resolve) => {
                conn.addEventListener('track', ({ track }) => {
                    const streamProcessor = new MediaStreamTrackProcessor({
                        track: track as MediaStreamVideoTrack
                    });
                    resolve(streamProcessor.readable);
                });
            });
        }));

        // Set up the connection
        const remoteOffer = await remoteConn.createOffer();
        remoteConn.setLocalDescription(remoteOffer);
        localConn.setRemoteDescription(remoteOffer); // Hooked
        const localAnswer = await localConn.createAnswer(); // Hooked
        localConn.setLocalDescription(localAnswer); // Hooked
        remoteConn.setRemoteDescription(localAnswer);

        await waitForState(remoteConn, 'connected');

        // Extract the first frame from each, once they arrive:
        const [remoteMedia, localMedia] = await mediaStreamPromise;
        const { value: remoteFrame } = await remoteMedia!.getReader().read();
        const { value: localFrame } = await localMedia!.getReader().read();

        // Check both peers receive video - using sizes from fake media when running headlessly:
        expect(localFrame!.displayHeight).to.be.greaterThanOrEqual(240);
        expect(localFrame!.displayWidth).to.be.greaterThanOrEqual(320);
        expect(remoteFrame!.displayHeight).to.be.greaterThanOrEqual(240);
        expect(remoteFrame!.displayWidth).to.be.greaterThanOrEqual(320);
    });

});