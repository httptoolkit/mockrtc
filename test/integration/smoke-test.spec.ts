import { expect } from "chai";

import * as mockrtc from "../..";

describe("MockRTC", () => {

    it("has a test", async () => {
        expect(mockrtc.mockrtc).to.equal(true);
    });
});