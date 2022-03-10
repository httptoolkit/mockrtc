import { ClientServerChannel, Serializable } from 'mockttp/dist/util/serialization';
import type { DataChannelStream } from '../webrtc/datachannel-stream';
import type { MockRTCPeerConnection } from '../webrtc/peer-connection';

export interface HandlerStep extends Serializable {
    readonly type: keyof typeof StepLookup;
    handle(connection: MockRTCPeerConnection): Promise<void>;
}

export class WaitStep extends Serializable implements HandlerStep {

    readonly type = 'wait-for-message';

    async handle(connection: MockRTCPeerConnection): Promise<void> {
        return new Promise<void>((resolve) => {
            const messageReceived = () => {
                connection.removeListener('channel-open', listenForMessage);
                connection.channels.forEach((channel) => {
                    channel.removeListener('data', messageReceived);
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

    async handle({ channels }: MockRTCPeerConnection): Promise<void> {
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

export const StepLookup = {
    'wait-for-message': WaitStep,
    'send-all': SendStep
};