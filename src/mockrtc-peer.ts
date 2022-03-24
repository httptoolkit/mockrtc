/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    MockRTCOfferParams,
    MockRTCExternalOfferParams,
    MockRTCExternalAnswerParams
} from "./mockrtc";

export interface MockRTCPeerOptions {
    recordMessages?: boolean;
}

export interface MockRTCPeer {
    readonly id: string;

    // For direct usage:
    createOffer(): Promise<MockRTCOfferParams>;
    answerOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit>;

    // For proxy usage:
    createExternalOffer(): Promise<MockRTCExternalOfferParams>;
    answerExternalOffer(offer: RTCSessionDescriptionInit): Promise<MockRTCExternalAnswerParams>;

    // For querying seen data
    getAllMessages(): Promise<Array<string | Buffer>>;
    getMessagesOnChannel(channelName: string): Promise<Array<string | Buffer>>;
}