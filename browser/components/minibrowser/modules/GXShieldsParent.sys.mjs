/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { GXShields } from "moz-src:///browser/components/minibrowser/modules/GXShields.sys.mjs";

/**
 * Answers configuration queries from GXShieldsChild.
 */
export class GXShieldsParent extends JSWindowActorParent {
  receiveMessage(message) {
    if (message.name == "GXShields:Config") {
      return GXShields.configFor(message.data.host);
    }
    return null;
  }
}
