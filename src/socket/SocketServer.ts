import socketManager from ".";
import ModelUser from "../models/ModelUser";
import Util from "./Util";
import { Socket as ss } from "net";
import { setInterval } from "timers";
import { socketHost, socketPort } from "./config";
// 1 引入模块
const net = require("net");
const readline = require("readline");
interface DataServer {
  code?: Number;
  method: String;
  args?: any;
  kwargs?: Object;
  call?: Function;
}
interface Req {
  data?: Buffer;
  callName?: string;
  rsv?: any;
  rej?: any;
  sendTime?: number;
}
export default class SocketServer {
  static io: ss;

  static cwnd = 32;
  static cwndMax = 32;
  static waitQueue: Array<Req> = [];
  static RTTThresh = 250;
  static retryTimes = 10;
  static timer: NodeJS.Timeout;
  static init() {
    console.log('连接socketserver')
    if (this.retryTimes <= 0) {
      console.error("服务器连接失败");
      throw new Error("服务器连接失败");
    }
    this.retryTimes--;
    return new Promise(rsv => {
      // rsv(null)
      // return;
      if (this.timer) {
        clearInterval(this.timer);
      }
      this.io = new net.Socket();
      this.io.setEncoding("utf8");
      // 3 链接
      this.io.connect({ port: socketPort, host: socketHost });

      this.io.on("ready", async () => {
        this.timer = setInterval(_ => {
          this.ConsumeRequest();
        }, 100);
        setInterval(e => {
          this.doHeart();
        }, 5000);
        // this.getUserList(100, 1, '')
        // this.getAvatar('115')
        // this.setUserTag('2wR0NEBo', true)
        // this.setUserInfo({
        //   uid: '2wR0NEBo', type: 'add', gold: 1, diamond: 0, reason: '测试接口'
        // })
        // this.getUserInfo('115')
        rsv(null);
      });
      this.listen();
    });
  }
  static listen() {
    this.io.on("connect", chunk => {
      console.log("SocketServer连接成功");
      this.retryTimes = 10;
      this.sendMsg({
        method: "RegisterService",
        kwargs: { name: "Snooker28" }
      });
    });
    this.io.on("data", chunk => {
      let buffer = Buffer.alloc(chunk.length, chunk);
      this.bufferCache = Buffer.concat(
        [this.bufferCache, buffer],
        this.bufferCache.length + buffer.length
      );
      while (this.doCheckData()) {
        console.log("========数据包长度足够，解包========");
      }
      console.log("========单次解包完成========");
    });
    this.io.on("error", e => {
      console.log("SocketServer连接出错", e);
      setTimeout(() => {
        this.init();
      }, 1000);
    });
    this.io.on("drain", e => { });
    this.io.on("close", e => {
      console.log("SocketServer关闭, 尝试重连", e);
      setTimeout(() => {
        this.init();
      }, 1000);
    });
  }
  static bufferCache: Buffer = Buffer.alloc(0);
  static waitingLen: number = 0;
  static doCheckData() {
    if (this.bufferCache.length <= 8) {
      return false;
    }
    let bufferLen = Buffer.from(this.bufferCache.slice(0, 8).toString());
    // 得到两个byte数组
    let bufferSecret = Buffer.alloc(this.strSecret.length, this.strSecret);
    // 俩数组去异或
    for (let i = 0; i < bufferLen.length; i++) {
      bufferLen[i] ^= bufferSecret[i % bufferSecret.length];
    }
    let len = +bufferLen.toString() - 4;
    let bufferData = this.bufferCache.slice(8, this.bufferCache.length);
    console.log(len, bufferData.length, "长度");
    if (bufferData.length >= len) {
      // 数据包长度足够
      console.log("数据包长度足够");
      this.getMsg(this.bufferCache.slice(0, len + 8));
      // 解码后清空缓存的长度和数据
      this.bufferCache = this.bufferCache.slice(
        len + 8,
        this.bufferCache.length
      );
      return true;
    } else {
      return false;
    }
  }
  static getBytesLength(str) {
    var totalLength = 0;
    var charCode;
    for (var i = 0; i < str.length; i++) {
      charCode = str.charCodeAt(i);
      if (charCode < 0x007f) {
        totalLength++;
      } else if (0x0080 <= charCode && charCode <= 0x07ff) {
        totalLength += 2;
      } else if (0x0800 <= charCode && charCode <= 0xffff) {
        totalLength += 3;
      } else {
        totalLength += 4;
      }
    }
    return totalLength;
  }

  static encode(data = {}, withLen = true) {
    let strJson = JSON.stringify(data);
    let strSecret = "billiards";
    // 得到两个byte数组
    let buffer = Buffer.alloc(this.getBytesLength(strJson), strJson);
    let bufferSecret = Buffer.alloc(this.getBytesLength(strSecret), strSecret);
    // 俩数组去异或
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] ^= bufferSecret[i % bufferSecret.length];
    }
    // 在最前面写入长度
    if (withLen) {
      let lenBuffer = Buffer.alloc(4);
      lenBuffer.writeUInt32LE(buffer.length);
      let finalBuff = Buffer.concat(
        [lenBuffer, buffer],
        lenBuffer.length + buffer.length
      );
      return finalBuff;
    } else {
      return buffer;
    }
  }

  static strSecret = "billiards";
  static decode(bufferData: Buffer, withLen = true) {
    // 得到两个byte数组
    let bufferSecret = Buffer.alloc(this.strSecret.length, this.strSecret);
    // 俩数组去异或
    for (let i = 0; i < bufferData.length; i++) {
      bufferData[i] ^= bufferSecret[i % bufferSecret.length];
    }
    let str = bufferData.slice(withLen ? 8 : 0, bufferData.length);
    let res = {};
    try {
      res = JSON.parse(str.toString());
      return res;
    } catch (e) {
      console.warn("============JSON parse err=========================");
      console.warn(str.toString());
      // console.warn(e)
      return {};
    }
  }
  static timeMap: Map<string, Req> = new Map();
  static callMap = {};
  static sendMsg(data: DataServer) {
    if (data.method != '_heartbeat') {
      console.log('发送数据', data)
    }
    return new Promise((rsv, rej) => {
      if (!this.io) {
        rsv({ code: -1 });
        return;
      }
      let callId = Util.getUniqId();
      let callName = `snooker28_${callId}`;

      data.kwargs["callback"] = callName;
      let temp = this.encode(data);
      if (data.method != "_heartbeat") {
        console.log(`请求SocketServer`, data,);
      }
      this.trySend(callName, temp, rsv, rej);
    });
  }
  static trySend(callName: string, data: Buffer, rsv, rej) {
    if (this.timeMap.size < this.cwnd) {
      // 小于窗口大小可以添加并发送
      let success = false;
      try {
        success = this.io.write(data);
      } catch { }
      if (!success) {
        console.log("写进缓冲区失败，加入等待队列重新发送", callName);
        this.waitQueue.unshift({
          callName: callName,
          data: data,
          rej: rej,
          rsv: rsv
        });
        return;
      }
      this.timeMap.set(callName, {
        callName: callName,
        data: data,
        rsv: rsv,
        rej: rej,
        sendTime: new Date().getTime()
      });
      this.callMap[callName] = e => {
        if (e.code == 0) {
          rsv(e.data || e);
        } else {
          rej(e);
        }
        this.callMap[callName] = [];
        delete this.callMap[callName];
      };
      console.log("CALLBAK", callName);
    } else {
      // 否则添加到等待队列中
      console.log("发送队列已满，进入等待队列", callName);
      this.waitQueue.push({
        callName: callName,
        data: data,
        rej: rej,
        rsv: rsv
      });
    }
  }
  static doLogin(data) {
    return this.sendMsg({
      method: "_H5DoLogin",
      args: [],
      kwargs: data
    });
  }
  static doHeart() {
    this.sendMsg({
      method: "_heartbeat",
      args: [],
      kwargs: {}
    });
  }
  static async setUserTag(uid, flag) {
    let data = await this.sendMsg({
      method: "_SetUserInfo",
      args: [],
      kwargs: {
        uid,
        flag
      }
    });
    return data;
  }
  static async getUserInfoAndFormat(uid) {
    let user: any = (await ModelUser.findOne({ uid })) || {};
    let data = {
      coin: user.coin,
      tagCheat: user.tagCheat,
      uid: user.uid,
      nickname: user.nickname,
      avatar: user.avatar
    };
    return data;
  }
  static async getUserInfo(uid) {
    let data = await this.sendMsg({
      method: "_GetUserInfo",
      args: [],
      kwargs: {
        uid
      }
    });
    return data;
  }
  static async setUserInfo({ uid, type, gold, diamond, reason, tag }) {
    if (!this.io) {
      let user = await ModelUser.findOne({ uid });
      let data = await ModelUser.updateOne(
        { uid },
        { coin: type == "add" ? user.coin + gold : user.coin - gold }
      );
      return data;
    }
    let data = await this.sendMsg({
      method: "_SetAssets",
      args: [],
      kwargs: { uid, type, golds: gold, diamond, reason, tag }
    });
    return data;
  }
  static async getAvatar(uid) {
    let data = await this.sendMsg({
      method: "_GetAvatar",
      args: [],
      kwargs: {
        uid
      }
    });
    return data;
  }
  static async getUserList(pageSize, page, userName) {
    if (!this.io) {
      let list = await ModelUser.find({});
      return { total: list.length, page: 1, data: list };
    }
    let data = await this.sendMsg({
      method: "_GetUsersInfo",
      args: [],
      kwargs: {
        pageSize,
        page,
        userName
      }
    });
    console.log(data, 'ddddddddd')
    return data;
  }
  static async getBanList() {
    let data = await this.sendMsg({
      method: 'GetBlacklist',
      args: [],
      kwargs: {
      }
    });
    return data;

  }
  static async doBanIp(ip: string, flag) {
    let data = await this.sendMsg({
      method: flag ? "BanIp" : 'UnBanIp',
      args: [],
      kwargs: {
        ip
      }
    });
    return data;

  }
  static async GetAssetRankList({
    tag, date, timeType }) {
    let data = await this.sendMsg({
      method: "GetAssetRank",
      args: [],
      kwargs: {
        tag, date, timeType
      }
    });
    return data;
  }
  static async GetAssetRank({ tag, startDate, endDate, page, pageSize }) {
    let data = await this.sendMsg({
      method: "getCurrentAccount",
      args: [],
      kwargs: {
        "mode": 1, //时间类型，默认为0, 则tags为内置定义类型，为1则可以自定义tag统计方案
        tag, //mode为1时填写为数组[0, 1000], mode为0时填写字符串，标签key值
        "timeType": "custom", //hours, days, months, years, custom, 为"custom"时需要自定义startDate和endDate
        // "date": "2022-04-11 14:30:00",// 2022 - 04 - 11 14: 30: 00 timeType不为"custom"时填写, 默认值为当前时间
        startDate,// timeType为"custom"时填写
        endDate,// timeType为"custom"时填写
        page, //默认分页数为1，
        pageSize, //默认每页200条数据
      }
    });
    return data;
  }

  static ConsumeRequest() {
    // 定时发送
    let timeNow = new Date().getTime();
    for (const key in this.timeMap) {
      if (timeNow - this.timeMap.get(key).sendTime > 15000) {
        let req = this.timeMap.get(key);
        console.log("TIMEOUT: 超时了", req.callName);
        // 重新加入发送队列的首部，直到收到回复为止，如果服务端已经处理过了会忽略并返回通知
        // 这里需要注意重连重发的情况，服务端会重复处理
        // TODO: 如果遇到了吞金币或其他情况请检查这里
        this.trySend(req.callName, req.data, req.rsv, req.rej);
      }
    }
    if (this.waitQueue.length || this.timeMap.size)
      // console.log(
      //   "等待队列",
      //   this.waitQueue.length,
      //   "发送队列",
      //   this.timeMap.size
      // );
      if (this.timeMap.size == 1) {
        console.log(this.timeMap.keys());
      }
    if (this.waitQueue.length) {
      while (this.waitQueue.length > 0 && this.timeMap.size < this.cwnd) {
        // 等待队列长度大于0且发送队列小于窗口大小
        let req = this.waitQueue.shift();
        console.log("重新进入发送队列", req.callName);
        this.trySend(req.callName, req.data, req.rsv, req.rej);
      }
    }
  }

  static getMsg(msg: Buffer) {
    try {
      let res: any = this.decode(msg);
      console.log("返回", JSON.stringify(res));
      if (!this.timeMap.has(res.method)) {
        console.log("METHOD_NOT_EXIST", res.method);
        return;
      }
      let timeNow = new Date().getTime();
      let rtt = timeNow - this.timeMap.get(res.method).sendTime;
      console.log("返回", rtt, res.method);
      if (rtt > this.RTTThresh) {
        // 拥塞控制
        this.cwnd = Math.max(Math.floor(this.cwnd / 2), 1);
        console.log("网络拥塞，触发拥塞控制，cwnd=", this.cwnd);
      } else {
        // 恢复大小，但是不能超过max
        this.cwnd = Math.min(this.cwnd + 1, this.cwndMax);
      }
      this.timeMap.delete(res.method);

      // console.log(`SocketServer返回,耗时${new Date().getTime() - timeStart}`, res);
      if (res.method) {
        let func = this.callMap[res.method];
        let data = res.kwargs;
        func && func(data);
        if (res.method == "_CheckUserInH5Game") {
          let { uid, client_id } = data;
          let roomId = socketManager.getInRoomByUid(uid);
          // 查询玩家是否在游戏中
          this.sendMsg({
            method: data.callback,
            kwargs: { name: roomId ? "Snooker28" : "" }
          });
        }
      } else {
      }
    } catch (e) {
      console.log("GETMSG_ERROR", e);
    }
  }
  static async onMessage(res, socket) { }
  static onDisconnect(socket) { }
  static onConnect(socket) { }
}
