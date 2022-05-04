/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    MockRTC,
    expect,
    waitForState,
    delay,
    waitForChannelOpen
} from '../test-setup';

describe("Wait steps", function () {

    const mockRTC = MockRTC.getRemote();

    beforeEach(() => mockRTC.start());
    afterEach(() => mockRTC.stop());

    it("should be able to wait for a duration before a step", async () => {
        const mockPeer = await mockRTC.buildPeer()
            .sleep(400)
            .thenSend('delayed message');

        const localConnection = new RTCPeerConnection();

        const receivedMessages: string[] = [];
        const testChannel = localConnection.createDataChannel('data-channel');
        testChannel.addEventListener('message', ({ data }) => { receivedMessages.push(data) });

        const localOffer = await localConnection.createOffer();
        await localConnection.setLocalDescription(localOffer);
        const { answer } = await mockPeer.answerOffer(localOffer);
        await localConnection.setRemoteDescription(answer);

        await waitForState(localConnection, 'connected');

        await delay(200);
        expect(receivedMessages).to.deep.equal([]);

        await delay(300);
        expect(receivedMessages).to.deep.equal(['delayed message']);
    });

    it("should be able to wait the existence of a channel", async () => {
        const mockPeer = await mockRTC.buildPeer()
            .waitForChannel()
            .thenSend('delayed message');

        const localConnection = new RTCPeerConnection();

        const { offer, setAnswer } = await mockPeer.createOffer();
        await localConnection.setRemoteDescription(offer);
        const localAnswer = await localConnection.createAnswer();
        await localConnection.setLocalDescription(localAnswer);
        await setAnswer(localAnswer);

        await waitForState(localConnection, 'connected');
        await delay(100);

        const receivedMessages: string[] = [];
        const testChannel = localConnection.createDataChannel('data-channel');
        testChannel.addEventListener('message', ({ data }) => { receivedMessages.push(data) });

        await delay(100);
        expect(receivedMessages).to.deep.equal(['delayed message']);
    });

    it("should be able to wait for the existence of a specific named channel", async () => {
        const mockPeer = await mockRTC.buildPeer()
            .waitForChannel('message-channel')
            .thenSend('delayed message');

        const localConnection = new RTCPeerConnection();

        const { offer, setAnswer } = await mockPeer.createOffer();
        await localConnection.setRemoteDescription(offer);
        const localAnswer = await localConnection.createAnswer();
        await localConnection.setLocalDescription(localAnswer);
        await setAnswer(localAnswer);

        await waitForState(localConnection, 'connected');
        await delay(100);

        const receivedIgnoredChannelMessages: string[] = [];
        const ignoredChannel = localConnection.createDataChannel('ignored-channel');
        ignoredChannel.addEventListener('message', ({ data }) => { receivedIgnoredChannelMessages.push(data) });

        await delay(100);
        expect(receivedIgnoredChannelMessages).to.deep.equal([]);

        const receivedRealChannelMessages: string[] = [];
        const testChannel = localConnection.createDataChannel('message-channel');
        testChannel.addEventListener('message', ({ data }) => { receivedRealChannelMessages.push(data) });

        await delay(100);
        expect(receivedRealChannelMessages).to.deep.equal(['delayed message']);
    });

    it("should be able to wait for the addition of a media track", async () => {
        const mockPeer = await mockRTC.buildPeer()
            .waitForTrack()
            .thenSend('after-track message');

        const localConnection = new RTCPeerConnection();

        const receivedMessages: string[] = [];
        localConnection.createDataChannel('message-channel')
            .addEventListener('message', ({ data }) => { receivedMessages.push(data) });

        const localOffer = await localConnection.createOffer();
        await localConnection.setLocalDescription(localOffer);
        const { answer, session } = await mockPeer.answerOffer(await localOffer);
        await localConnection.setRemoteDescription(answer);

        await waitForState(localConnection, 'connected');
        await delay(100);
        expect(receivedMessages).to.deep.equal([]);

        // Add (listen only) media tracks and renegotiate:
        const updatedOffer = await localConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        });
        localConnection.setLocalDescription(updatedOffer);
        const updatedAnswer = await session.answerOffer(updatedOffer);
        await localConnection.setRemoteDescription(updatedAnswer);

        await delay(100);
        expect(receivedMessages).to.deep.equal(['after-track message']);
    });

    it("should be able to wait for media data", async () => {
        const mockPeer = await mockRTC.buildPeer()
            .waitForNextMedia()
            .thenSend('after-track message');

        const localConnection = new RTCPeerConnection();

        const receivedMessages: string[] = [];
        localConnection.createDataChannel('message-channel')
            .addEventListener('message', ({ data }) => { receivedMessages.push(data) });

        const localOffer = await localConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        });
        await localConnection.setLocalDescription(localOffer);
        const { answer, session } = await mockPeer.answerOffer(await localOffer);
        await localConnection.setRemoteDescription(answer);

        await waitForState(localConnection, 'connected');
        await delay(100);
        expect(receivedMessages).to.deep.equal([]);

        // Add media tracks and renegotiate:
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        stream.getTracks().forEach((track) => localConnection.addTrack(track, stream));

        const updatedOffer = await localConnection.createOffer();
        localConnection.setLocalDescription(updatedOffer);
        const updatedAnswer = await session.answerOffer(updatedOffer);
        await localConnection.setRemoteDescription(updatedAnswer);

        await delay(1000);
        expect(receivedMessages).to.deep.equal(['after-track message']);
    });

    it("should be able to wait for a message on any channel", async () => {
        const mockPeer = await mockRTC.buildPeer()
            .waitForNextMessage()
            .thenSend('delayed message');

        const localConnection = new RTCPeerConnection();

        const receivedMessages: string[] = [];
        const testChannel = localConnection.createDataChannel('data-channel');
        testChannel.addEventListener('message', ({ data }) => { receivedMessages.push(data) });

        const localOffer = await localConnection.createOffer();
        await localConnection.setLocalDescription(localOffer);
        const { answer } = await mockPeer.answerOffer(localOffer);
        await localConnection.setRemoteDescription(answer);

        await waitForState(localConnection, 'connected');

        await delay(100);
        expect(receivedMessages).to.deep.equal([]);

        testChannel.send('test message');
        await delay(100);
        expect(receivedMessages).to.deep.equal(['delayed message']);
    });

    it("should be able to wait for a message on a specific named channel", async () => {
        const mockPeer = await mockRTC.buildPeer()
            .waitForNextMessageOnChannel("message-channel")
            .thenSend('delayed message');

        const localConnection = new RTCPeerConnection();

        const receivedMessages: string[] = [];
        const ignoredChannel = localConnection.createDataChannel('ignored-channel');
        const messageChannel = localConnection.createDataChannel('message-channel');
        messageChannel.addEventListener('message', ({ data }) => { receivedMessages.push(data) });

        const localOffer = await localConnection.createOffer();
        await localConnection.setLocalDescription(localOffer);
        const { answer } = await mockPeer.answerOffer(localOffer);
        await localConnection.setRemoteDescription(answer);

        await waitForState(localConnection, 'connected');

        await waitForChannelOpen(ignoredChannel);
        ignoredChannel.send('test message');
        await delay(100);
        expect(receivedMessages).to.deep.equal([]);

        messageChannel.send('test message');
        await delay(100);
        expect(receivedMessages).to.deep.equal(['delayed message']);
    });

});