import RoomManager from "./controller/RoomManager";
import PROTOCLE from "./config/PROTOCLE";
import { PEOPLE_EACH_GAME_MAX } from "./config";
import Util from "./Util";
import ModelUser from "../models/ModelUser";


// function encode(str) {
//   // 对字符串进行编码
//   var encode = encodeURI(str);
//   // 对编码的字符串转化base64
//   var base64 = btoa(encode);
//   return base64;
// }

export default class socketManager {
  static isOpen = true;
  static io;
  static userSockets = {};
  static userPings = {};
  static aliveRoomList: RoomManager[] = [];
  static userMap = {};
  static getOnlineNum() {
    let num = 0;
    for (let uid in this.userSockets) {
      if (this.userSockets[uid]) {
        num++;
      }
    }
    return num;
  }
  static async getRoomCanJoin(level, roomId?) {
    let d = new Date().getTime();
    // 检查当前已存在的房间中 公开的，人未满的,未开始游戏的
    let list = this.aliveRoomList.filter((roomCtr: RoomManager) => {
      return (
        roomCtr.level == level &&
        roomCtr.uidList.length < PEOPLE_EACH_GAME_MAX &&
        roomCtr.step == 0 || roomCtr.step == 2
      );
    });
    if (!!roomId) {
      list = list.filter(e => e.roomId != roomId);
    }
    if (list.length == 0) {
      let roomNew = new RoomManager({ level });
      await roomNew.initConfig();
      this.aliveRoomList.push(roomNew);
      return roomNew;
    } else {
      let idx = Util.getRandomInt(0, list.length);
      return list[idx];
    }
  }
  static removeRoom(room: RoomManager) {
    this.aliveRoomList = this.aliveRoomList.filter(
      (ctr: RoomManager) => ctr != room
    );
  }
  static getCountByRoomLev(lev: number) {
    let roomList = this.aliveRoomList.filter(
      (ctr: RoomManager) => ctr.level == lev
    );
    let count = 0;
    roomList.forEach(e => {
      count += e.uidList.length;
      console.log(e.uidList);
    });
    return count;
  }

  // 公共错误广播
  static sendErrByUidList(uidList: number[], protocle: string, data) {
    this.sendMsgByUidList(uidList, PROTOCLE.SERVER.ERROR, {
      protocle,
      data
    });
  }
  static sendMsgByUidList(userList: number[], type: string, data = {}) {
    userList.forEach(uid => {
      let socket = this.userSockets[uid];
      if (socket) {
        let res = JSON.stringify({
          type,
          data
        });
        socket.emit("message", res);
      }
    });
  }
  static async init(io) {
    this.io = io;
    this.listen();
  }
  static getInRoomByUid(uid) {
    let ctrRoom = this.aliveRoomList.find(ctr => ctr.uidList.indexOf(uid) > -1);
    return ctrRoom && ctrRoom.roomId;
  }
  static listen() {
    this.io.on("connect", this.onConnect);
  }
  static getRoomCtrByRoomId(roomId): RoomManager {
    if (!!roomId) {
      return this.aliveRoomList.find(roomCtr => roomCtr.roomId == roomId);
    }
  }
  static checkInGame(uid) {
    let roomId = this.getInRoomByUid(uid);
    let roomCtr = this.getRoomCtrByRoomId(roomId);
    let roomInfo = roomCtr.getRoomInfo();
    if (roomInfo && roomInfo.isInRoom) {
      return 1;
    } else {
      return 0;
    }
  }
  static async onMessage(res, socket) {
    // 公共头
    let uid = res.uid;
    if (!uid) {
      return;
    }
    uid = +uid;

    let data = res.data;
    let type = res.type;


    let modelUser = await ModelUser.findOne({ uid: uid })
    let userInfo = data.userInfo || {
      uid: uid,
      nickname: '测试玩家' + uid,
      avatar: '',
      coin: 0
    }
    if (modelUser) {
      if (data.userInfo) {
        // 同步一次数据
        modelUser = await ModelUser.findOneAndUpdate({ uid }, {
          nickname: userInfo.nickname,
          uid: userInfo.uid,
          avatar: userInfo.avatar,
          coin: userInfo.coin
        }, { new: true })
      }
      userInfo = {
        nickname: modelUser.nickname,
        uid: modelUser.uid,
        avatar: modelUser.avatar,
        coin: modelUser.coin
      }
    } else {
      await ModelUser.create(userInfo);
    }
    // 强制转数字类型
    userInfo.uid = +userInfo.uid;

    if (this.userSockets[uid] && this.userSockets[uid] != socket) {
      // 已存在正在连接中的，提示被顶
      socketManager.sendErrByUidList([uid], "connect", {
        msg: "賬號已被登錄，請刷新或退出遊戲"
      });
    }
    this.userSockets[uid] = socket;

    let roomId = this.getInRoomByUid(uid);
    let roomCtr = this.getRoomCtrByRoomId(roomId);

    if (roomCtr) {
      roomCtr.doConnect(uid);
    }

    switch (type) {
      case PROTOCLE.CLIENT.EXIT: {
        console.log('EXIT1111')
        if (roomCtr) {
          console.log('EXIT2')
          roomCtr.leave(uid);
        }
        break;
      }
      case 'READY': {
        if (roomCtr) {
          roomCtr.doReady(uid);
        }
        break
      }
      case PROTOCLE.CLIENT.RECONNECT: {
        console.log('RECONNECT')
        // 检测重连数据
        let dataGame: any = {
          isMatch: data.isMatch
        };
        if (roomCtr) {
          // 获取游戏数据并返回
          dataGame = roomCtr.getRoomInfo();
        }
        console.log("data" + uid, data);
        this.sendMsgByUidList([uid], PROTOCLE.SERVER.RECONNECT, {
          userInfo: userInfo,
          dataGame
        });

        break;
      }
      case PROTOCLE.CLIENT.MATCH: {
        // 参与或者取消匹配
        let { level, flag } = data;
        if (flag) {
          if (roomCtr && roomCtr.roomId != 0) {
            this.sendErrByUidList([uid], PROTOCLE.CLIENT.MATCH, {
              msg: "已經處於遊戲中，無法匹配"
            });
            return;
          }

          let targetRoom: RoomManager;
          targetRoom = await this.getRoomCanJoin(level);
          targetRoom.join(userInfo);
        } else {
          if (!roomCtr) {
            console.log('不存在roomCtr')
            return;
          }
          console.log('leaveleaveleaveleave')
          roomCtr.leave(uid);
        }
        break;
      }
      case "CHANGE_DESK": {
        if (!roomCtr) {
          return;
        }
        let { level, roomId } = data;
        let flagLeave = roomCtr.leave(uid, false);
        if (flagLeave != -1) {
          let targetRoom: RoomManager;
          targetRoom = await this.getRoomCanJoin(level, roomId);
          targetRoom.join(userInfo);
        }
        break;
      }
      case PROTOCLE.CLIENT.PING: {
        // 发回接收到的时间戳，计算ping
        this.sendMsgByUidList([uid], PROTOCLE.SERVER.PING, {
          timestamp: data.timestamp
        });
        this.userPings[uid] = data.timestamp;
        break;
      }
      case "ACTION": {
        if (!roomCtr) {
          return;
        }
        let { type, extraData } = data;
        roomCtr.doAction(uid, type, extraData);
        break;
      }
      case "SHOW_BALLS": {
        if (!roomCtr) {
          return;
        }
        roomCtr.showBalls(uid);
        break;
      }
      case "CHAT": {
        if (!roomCtr) {
          return;
        }
        roomCtr.showChat(uid, data.conf);
        break;
      }
    }
  }
  static async doKick(uid) {
    let roomId = this.getInRoomByUid(uid);
    let roomCtr = this.getRoomCtrByRoomId(roomId);
    if (roomCtr) {
      let res = roomCtr.leave(uid);
      if (res == -1) {
        return {
          code: -1,
          msg: "遊戲中，設為斷線"
        };
      } else {
        return {
          code: 0,
          msg: "踢出房間"
        };
      }
    } else {
      return {
        code: -1,
        msg: "未在房間內，無法踢出"
      };
    }
  }
  static autoCheckDisConnected() {
    let t = new Date().getTime();
    for (let uid in this.userPings) {
      // 3s没有收到ping就判定为断开连接，强制触发一次重连
      let tLast = this.userPings[uid];
      if (tLast && t - tLast > 5000) {
        if (this.userSockets[uid]) {
          console.log(`${uid}连接异常，5s未收到ping，服务器主动断开`);
          this.userSockets[uid].disconnect();
          this.userPings[uid] = 0;
        }
      }
    }
  }
  static onDisconnect(socket) {
    // 通过socket反查用户，将用户数据标记为断线
    for (let key in this.userSockets) {
      let uid = +key
      if (this.userSockets[uid] == socket) {
        // 踢出用户
        let roomId = this.getInRoomByUid(uid);
        console.log(roomId, "roomId", uid);
        let roomCtr = this.getRoomCtrByRoomId(roomId);
        if (roomCtr) {
          console.log("uid断开连接", uid);
          roomCtr.leave(uid);
        }
        this.userSockets[uid] = undefined;
        this.userPings[uid] = 0;
      }
    }
  }
  static onConnect(socket) {
    socket.on("disconnect", () => {
      socketManager.onDisconnect(socket);
    });
    socket.on("message", res => {
      socketManager.onMessage(res, socket);
    });
  }
}
