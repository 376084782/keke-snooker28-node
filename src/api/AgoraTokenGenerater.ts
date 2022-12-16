var {
  RtcTokenBuilder,
  RtmTokenBuilder,
  RtcRole,
  RtmRole
} = require("agora-access-token");
var expirationTimeInSeconds = 3600;

var appID = "9d81d2dca42740ba9748a56a3ff2b757";
var appCertificate = "b903a478903e4fd1b80040ff548c22ba";
var role = RtcRole.PUBLISHER;

export default class AgoraTokenGenerater {
  static getToken({ uid, channelName }) {
    var currentTimestamp = Math.floor(Date.now() / 1000);
    var privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;
    // use 0 if uid is not specified

    if (!channelName || !uid) {
      return false;
    }
    var key = RtcTokenBuilder.buildTokenWithUid(
      appID,
      appCertificate,
      "" + channelName,
      +uid,
      role,
      privilegeExpiredTs
    );
    return key;
  }
}
