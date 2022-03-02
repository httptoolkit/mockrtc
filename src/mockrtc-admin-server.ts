import { PluggableAdmin } from 'mockttp';
import { MockRTCAdminPlugin } from './mockrtc-admin-plugin';

export class MockRTCAdminServer extends PluggableAdmin.AdminServer<{ webrtc: MockRTCAdminPlugin }> {

    constructor() {
        super({
            adminPlugins: { webrtc: MockRTCAdminPlugin }
        });
    }

}