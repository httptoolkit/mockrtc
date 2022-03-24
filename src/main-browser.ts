/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    MockRTC,
    MockRTCOptions,
    MockRTCOfferParams,
    MockRTCExternalOfferParams,
    MockRTCExternalAnswerParams
} from "./mockrtc";
import { MockRTCClient, MockRTCClientOptions } from "./mockrtc-client";

export type {
    MockRTC,
    MockRTCOptions,
    MockRTCOfferParams,
    MockRTCExternalOfferParams,
    MockRTCExternalAnswerParams
};

export type { MockRTCPeer } from './mockrtc-peer';

export { MOCKRTC_CONTROL_CHANNEL } from './control-channel';

export function getRemote(options: MockRTCClientOptions = {}): MockRTC {
    return new MockRTCClient(options);
}