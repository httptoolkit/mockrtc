/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MockRTCExternalAnswerParams, MockRTCExternalOfferParams, MockRTCOfferParams } from "./mockrtc";
import type { MockRTCPeer } from "./mockrtc-peer";

import { MOCKRTC_CONTROL_CHANNEL } from "./control-channel";

export function hookWebRTCPeer(conn: RTCPeerConnection, mockPeer: MockRTCPeer) {
    // Anything that creates signalling data (createOffer/createAnswer) needs to be hooked to
    // return the params for the external mock peer.
    // Anything that sets params needs to be hooked to send to & set those params on the external
    // mock peer, create new params, signal those to the local mock peer.

    const _createOffer = conn.createOffer.bind(conn);
    const _createAnswer = conn.createAnswer.bind(conn);
    const _setLocalDescription = conn.setLocalDescription.bind(conn);
    const _setRemoteDescription = conn.setRemoteDescription.bind(conn);

    let externalOffers: {
        [sdp: string]: MockRTCExternalOfferParams
    } = {};
    let selectedExternalOffer: MockRTCExternalOfferParams | undefined;

    let externalAnswers: {
        [sdp: string]: MockRTCExternalAnswerParams
    } = {};
    let selectedExternalAnswer: MockRTCExternalAnswerParams | undefined;

    let mockOffer: MockRTCOfferParams | undefined;

    let internalAnswer: Promise<RTCSessionDescriptionInit> | undefined;
    let remoteOffer: RTCSessionDescriptionInit | undefined;

    conn.addEventListener('connectionstatechange', async () => {
        if (conn.connectionState === 'connected') {
            const controlChannel = conn.createDataChannel(MOCKRTC_CONTROL_CHANNEL);
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