import { ClientServerChannel, Serializable } from 'mockttp/dist/util/serialization';
import type { DataChannelStream } from '../webrtc/datachannel-stream';
import { MockRTCConnection } from '../webrtc/mockrtc-connection';
import { RTCConnection } from '../webrtc/rtc-connection';

export interface HandlerStep extends Serializable {
    readonly type: keyof typeof StepLookup;
    handle(connection: MockRTCConnection): Promise<void>;
}

export class WaitForDurationStep extends Serializable implements HandlerStep {

    readonly type = 'wait-for-duration';

    constructor(
        private durationMs: number
    ) {
        super();
    }

    async handle(connection: MockRTCConnection): Promise<void> {
        return new Promise<void>((resolve) => setTimeout(resolve, this.durationMs));
    }

}

export class WaitForChannelStep extends Serializable implements HandlerStep {

    readonly type = 'wait-for-channel';

    async handle(connection: MockRTCConnection): Promise<void> {
        return new Promise<void>((resolve) => {
            if (connection.remoteChannels.length > 0) resolve();
            connection.once('remote-channel-open', () => resolve());
        });
    }

}

export class WaitForMessageStep extends Serializable implements HandlerStep {

    readonly type = 'wait-for-message';

    async handle(connection: MockRTCConnection): Promise<void> {
        return new Promise<void>((resolve) => {
            const messageReceived = () => {
                connection.removeListener('channel-open', listenForMessage);
                connection.channels.forEach((channel) => {
                    channel.removeListener('data', messageReceived);
                    channel.pause();
                });

                resolve();
            };

            const listenForMessage = (channel: DataChannelStream) => {
                channel.once('data', messageReceived);
            }

            connection.on('channel-open', listenForMessage);
            connection.channels.forEach(listenForMessage);
        });
    }

}

export class SendStep extends Serializable implements HandlerStep {

    readonly type = 'send-all';

    constructor(
        private message: string | Buffer
    ) {
        super();
    }

    async handle({ channels }: MockRTCConnection): Promise<void> {
        await Promise.all(
            channels.map((channel) => {
                return new Promise<void>((resolve, reject) => {
                    channel.write(this.message, (error: Error | null | undefined) => {
                        if (error) reject(error);
                        else resolve();
                    });
                });
            })
        );
    }

}

export class CloseStep extends Serializable implements HandlerStep {

    readonly type = 'close-connection';

    async handle(connection: MockRTCConnection): Promise<void> {
        await connection.close();
    }

}

export class PeerProxyStep extends Serializable implements HandlerStep {

    readonly type = 'peer-proxy';

    private getAnswer: (offer: RTCSessionDescriptionInit) => Promise<RTCSessionDescriptionInit>;

    private externalConnections: RTCConnection[] = [];

    constructor(
        connectionTarget:
            | RTCPeerConnection
            | ((offer: RTCSessionDescriptionInit) => Promise<RTCSessionDescriptionInit>)
    ) {
        super();
        if (connectionTarget instanceof Function) {
            this.getAnswer = connectionTarget;
        } else {
            this.getAnswer = async (offer: RTCSessionDescriptionInit) => {
                await connectionTarget.setRemoteDescription(offer);
                const answer = await connectionTarget.createAnswer();
                await connectionTarget.setLocalDescription(answer);
                return answer;
            };
        }
    }

    async handle(connection: MockRTCConnection) {
        const externalConn = new RTCConnection();
        this.externalConnections.push(externalConn);

        const externalOffer = await externalConn.getLocalDescription();
        externalConn.setRemoteDescription(await this.getAnswer(externalOffer));

        connection.proxyTrafficTo(externalConn);

        // This step keeps running indefinitely, until the connection closes
        return new Promise<void>((resolve) => connection.on('connection-closed', resolve));
    }

    serialize(channel: ClientServerChannel): {} {
        channel.onRequest<
            { offer: RTCSessionDescriptionInit },
            { answer: RTCSessionDescriptionInit }
        >(async (msg) => {
            return { answer: await this.getAnswer(msg.offer) };
        });

        return { type: this.type };
    }

    static deserialize(_data: {}, channel: ClientServerChannel): PeerProxyStep {
        return new PeerProxyStep(async (offer: RTCSessionDescriptionInit) => {
            const response = await channel.request<
                { offer: RTCSessionDescriptionInit },
                { answer: RTCSessionDescriptionInit }
            >({ offer });
            return response.answer;
        });
    }

    dispose(): void {
        this.externalConnections.forEach(conn => conn.close());
    }

}

export class DynamicProxyStep extends Serializable implements HandlerStep {

    readonly type = 'dynamic-proxy';

    private externalConnections: RTCConnection[] = [];

    constructor() {
        super();
    }

    async handle(connection: MockRTCConnection) {
        await connection.proxyTrafficToExternalConnection();

        // This step keeps running indefinitely, until the connection closes
        return new Promise<void>((resolve) => connection.on('connection-closed', resolve));
    }

    dispose(): void {
        this.externalConnections.forEach(conn => conn.close());
    }

}

export const StepLookup = {
    'wait-for-duration': WaitForDurationStep,
    'wait-for-channel': WaitForChannelStep,
    'wait-for-message': WaitForMessageStep,
    'send-all': SendStep,
    'close-connection': CloseStep,
    'peer-proxy': PeerProxyStep,
    'dynamic-proxy': DynamicProxyStep
};