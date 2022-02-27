import { expect } from "chai";

import * as mockrtc from "../..";

describe("MockRTC", () => {

    it("has a mockttp test", async () => {
        await mockrtc.mock()
    });
});