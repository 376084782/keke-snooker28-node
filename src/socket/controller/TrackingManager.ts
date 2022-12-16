import moment = require("moment");
import ModelConfigBasic from "../../models/ModelConfigBasic";
import ModelUser from "../../models/ModelUser";

export default class TrackingManager {
  static async checkClearGain(uid) {
    let tNow = new Date();
    let day = +moment(tNow).format("E");

    let day7 = moment(tNow).subtract(day - 1, "days");
    day7.second(0);
    day7.minute(0);
    day7.hour(0);
    day7.millisecond(0);
    let tClear = day7.unix();

    let db = await ModelUser.findOne({ uid });
    if (!db) {
      await ModelUser.create({ uid, gain: 0, lastClearTime: tClear });
    }else if (db.lastClearTime != tClear) {
      console.log(`超过清理时间，清理${uid}的每周收益`);
      await ModelUser.updateOne({ uid }, { gain: 0, lastClearTime: tClear });
    }
  }
  static async addtracking28(uid) {
    let db = await ModelUser.findOne({ uid });
    if (!db) {
      await ModelUser.create({ uid, count28: 1 });
    } else {
      await ModelUser.updateOne({ uid }, { count28: db.count28 + 1 });
    }
  }
  static async addtrackingCost(uid, cost) {
    if (cost < 0) {
      return;
    }
    await this.checkClearGain(uid);
    let db = await ModelUser.findOne({ uid });
    if (!db) {
      await ModelUser.create({ uid, gain: cost });
    } else {
      await ModelUser.updateOne({ uid }, { gain: db.gain + cost });
    }
  }
}
