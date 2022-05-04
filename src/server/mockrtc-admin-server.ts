/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import { PluggableAdmin } from 'mockttp';
import { MockRTCAdminPlugin } from './mockrtc-admin-plugin';

export class MockRTCAdminServer extends PluggableAdmin.AdminServer<{ webrtc: MockRTCAdminPlugin }> {

    constructor() {
        super({
            adminPlugins: { webrtc: MockRTCAdminPlugin }
        });
    }

}