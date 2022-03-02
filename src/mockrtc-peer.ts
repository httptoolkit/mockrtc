import { randomUUID } from 'crypto';
import * as NodeDataChannel from 'node-datachannel';

import { MockRTCConnectionParams } from "./mockrtc";

export class MockRTCPeer {

    readonly id = randomUUID();

    async getSessionDescription(offer: RTCSessionDescriptionInit): Promise<MockRTCConnectionParams> {
        const { type: offerType, sdp: offerSdp } = offer;
        if (!offerSdp) throw new Error("Cannot get MockRTC peer params without an offer SDP");

        const peer = new NodeDataChannel.PeerConnection("MockRTCPeer", { iceServers: [] });

        // Setting the remote description immediately ensures that we'll gather an 'answer'
        // localDescription, rather than an 'offer'.
        peer.setRemoteDescription(offerSdp, offerType[0].toUpperCase() + offerType.slice(1) as any);

        const gatheringCompletePromise = new Promise<void>((resolve) => {
            peer.onGatheringStateChange((state) => {
                if (state === 'complete') resolve();
            });

            // Handle race conditions where gathering has already completed
            if (peer.gatheringState() === 'complete') resolve();
        });

        peer.onDataChannel((channel) => {
            channel.onMessage((msg) => {
                console.log('Peer received', msg);
                channel.sendMessage("Goodbye");
            });
        });

        await gatheringCompletePromise;

        return {
            sessionDescription: peer.localDescription() as RTCSessionDescriptionInit
        };
    }

}